package service

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
	metricsv "k8s.io/metrics/pkg/client/clientset/versioned"
)

const gkeGcloudAuthPlugin = "gke-gcloud-auth-plugin"

// K8sManager manages multiple Kubernetes cluster connections
type K8sManager struct {
	kubeconfig     string
	config         *api.Config
	currentContext string
	clients        map[string]*kubernetes.Clientset
	metricsClients map[string]*metricsv.Clientset
	// accountByProject caches the resolved gcloud account per GCP project,
	// used when a GKE context's auth plugin has no explicit --account arg.
	accountByProject map[string]string
	// tokenSources holds self-refreshing OAuth token sources keyed by cloud
	// account, so kubeui can authenticate without the exec plugin.
	tokenSources map[string]oauth2.TokenSource
	mu           sync.RWMutex
}

// ClusterInfo represents a Kubernetes cluster context
type ClusterInfo struct {
	Name      string `json:"name"`
	Cluster   string `json:"cluster"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

// NewK8sManager creates a new Kubernetes client manager
func NewK8sManager() (*K8sManager, error) {
	kubeconfig := os.Getenv("KUBECONFIG")
	if kubeconfig == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to get home directory: %w", err)
		}
		kubeconfig = filepath.Join(home, ".kube", "config")
	}

	config, err := clientcmd.LoadFromFile(kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	return &K8sManager{
		kubeconfig:       kubeconfig,
		config:           config,
		currentContext:   config.CurrentContext,
		clients:          make(map[string]*kubernetes.Clientset),
		metricsClients:   make(map[string]*metricsv.Clientset),
		accountByProject: make(map[string]string),
		tokenSources:     make(map[string]oauth2.TokenSource),
	}, nil
}

// reloadLocked re-reads the kubeconfig from disk. Caller must hold m.mu (write).
func (m *K8sManager) reloadLocked() error {
	config, err := clientcmd.LoadFromFile(m.kubeconfig)
	if err != nil {
		return fmt.Errorf("failed to reload kubeconfig: %w", err)
	}
	m.config = config
	return nil
}

// ListContexts returns all available contexts from kubeconfig
func (m *K8sManager) ListContexts() []ClusterInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var contexts []ClusterInfo
	for name, ctx := range m.config.Contexts {
		contexts = append(contexts, ClusterInfo{
			Name:      name,
			Cluster:   ctx.Cluster,
			Namespace: ctx.Namespace,
			IsCurrent: name == m.currentContext,
		})
	}
	return contexts
}

// CurrentContext returns the current active context name
func (m *K8sManager) CurrentContext() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentContext
}

// SwitchContext switches to a different context and pre-warms the client
func (m *K8sManager) SwitchContext(contextName string) error {
	m.mu.Lock()
	// Re-read kubeconfig so externally applied edits (e.g., added --account
	// args) are picked up without needing to restart kubeui.
	if err := m.reloadLocked(); err != nil {
		m.mu.Unlock()
		return err
	}
	if _, exists := m.config.Contexts[contextName]; !exists {
		m.mu.Unlock()
		return fmt.Errorf("context %q not found", contextName)
	}
	// Invalidate cached clients for the target context so they are rebuilt
	// against the fresh config (and any auto-resolved account).
	delete(m.clients, contextName)
	delete(m.metricsClients, contextName)
	m.currentContext = contextName
	m.mu.Unlock()

	// Pre-warm the client synchronously so subsequent calls are fast
	// This makes the switch take longer but all following API calls instant
	_, err := m.GetClient()
	return err
}

// GetClient returns the Kubernetes clientset for the current context
func (m *K8sManager) GetClient() (*kubernetes.Clientset, error) {
	m.mu.RLock()
	context := m.currentContext
	client, exists := m.clients[context]
	m.mu.RUnlock()

	if exists {
		return client, nil
	}

	// Build config outside any manager lock. buildConfig -> authInfoOverride
	// takes its own RLock (and may shell out to gcloud), so holding the
	// writer here would stall every other reader including ListContexts.
	restConfig, err := m.buildConfig(context)
	if err != nil {
		return nil, err
	}

	newClient, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create client for context %q: %w", context, err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.clients[context]; ok {
		return existing, nil
	}
	m.clients[context] = newClient
	return newClient, nil
}

// buildConfig creates a rest.Config for the specified context
func (m *K8sManager) buildConfig(contextName string) (*rest.Config, error) {
	// Resolve the account once: both the exec fallback and the native token
	// source need it, and resolution can involve gcloud subprocesses.
	account := m.gkeAccount(contextName)

	configOverrides := &clientcmd.ConfigOverrides{
		CurrentContext: contextName,
	}

	if override := m.authInfoOverride(contextName, account); override != nil {
		configOverrides.AuthInfo = *override
	}

	clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfig},
		configOverrides,
	)

	restConfig, err := clientConfig.ClientConfig()
	if err != nil {
		return nil, err
	}

	m.applyNativeAuth(contextName, account, restConfig)

	return restConfig, nil
}

// applyNativeAuth replaces the kubeconfig exec plugin with an in-process OAuth
// token source when kubeui can mint tokens itself. Two things this buys us:
// the gke-gcloud-auth-plugin binary no longer has to exist on PATH, and token
// expiry becomes invisible because the token source refreshes silently instead
// of a subprocess exiting 1 mid-session.
//
// Anything we can't handle natively is left on the exec plugin untouched.
func (m *K8sManager) applyNativeAuth(contextName, account string, cfg *rest.Config) {
	if cfg.ExecProvider == nil || account == "" {
		return
	}
	if m.providerFor(contextName) != ProviderGKE {
		return
	}

	ts, err := m.tokenSourceFor(account)
	if err != nil {
		return // no stored credential — fall back to the exec plugin
	}

	// ExecProvider and WrapTransport are mutually exclusive in client-go, and
	// the wrapper is what SPDY (exec, port-forward) picks up too.
	cfg.ExecProvider = nil
	cfg.AuthProvider = nil
	cfg.Wrap(func(rt http.RoundTripper) http.RoundTripper {
		return &oauth2.Transport{Source: ts, Base: rt}
	})
}

// tokenSourceFor returns a cached, self-refreshing token source for a Google
// account.
func (m *K8sManager) tokenSourceFor(account string) (oauth2.TokenSource, error) {
	m.mu.RLock()
	ts, exists := m.tokenSources[account]
	m.mu.RUnlock()
	if exists {
		return ts, nil
	}

	ts, err := gcloudTokenSource(context.Background(), account)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.tokenSources[account]; ok {
		return existing, nil
	}
	m.tokenSources[account] = ts
	return ts, nil
}

// providerFor classifies the credential mechanism behind a context.
func (m *K8sManager) providerFor(contextName string) Provider {
	return detectProvider(m.authInfoFor(contextName))
}

func (m *K8sManager) authInfoFor(contextName string) *api.AuthInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ctx, ok := m.config.Contexts[contextName]
	if !ok {
		return nil
	}
	return m.config.AuthInfos[ctx.AuthInfo]
}

// gkeAccount resolves which Google account a GKE context should authenticate
// as, and returns "" for every other kind of context. Explicit config wins,
// then a sibling context in the same project, then gcloud's own probing, and
// finally gcloud's active account — which is what the auth plugin would have
// used anyway, and is readable from disk even when the credential is expired.
func (m *K8sManager) gkeAccount(contextName string) string {
	authInfo := m.authInfoFor(contextName)
	if detectProvider(authInfo) != ProviderGKE {
		return ""
	}

	if authInfo.Exec != nil {
		for _, a := range authInfo.Exec.Args {
			if strings.HasPrefix(a, "--account=") {
				return strings.TrimPrefix(a, "--account=")
			}
		}
	}

	if project := parseGKEProject(contextName); project != "" {
		if account := m.resolveAccount(project); account != "" {
			return account
		}
	}

	return gcloudConfigAccount()
}

// authInfoOverride injects --account for GKE contexts whose gke-gcloud-auth-plugin
// exec config has no --account arg. Without this, the plugin uses gcloud's
// globally-active account, which often doesn't match the project's intended user
// and produces 403 errors on listing cluster-scoped resources. Only matters on
// the fallback path — applyNativeAuth drops the exec plugin when it can.
func (m *K8sManager) authInfoOverride(contextName, account string) *api.AuthInfo {
	if account == "" {
		return nil
	}

	m.mu.RLock()
	ctx, ok := m.config.Contexts[contextName]
	if !ok {
		m.mu.RUnlock()
		return nil
	}
	authInfo, ok := m.config.AuthInfos[ctx.AuthInfo]
	if !ok || authInfo == nil || authInfo.Exec == nil || authInfo.Exec.Command != gkeGcloudAuthPlugin {
		m.mu.RUnlock()
		return nil
	}
	for _, a := range authInfo.Exec.Args {
		if strings.HasPrefix(a, "--account=") {
			m.mu.RUnlock()
			return nil
		}
	}
	originalExec := *authInfo.Exec
	m.mu.RUnlock()

	newArgs := append([]string{}, originalExec.Args...)
	newArgs = append(newArgs, "--account="+account)
	originalExec.Args = newArgs

	return &api.AuthInfo{Exec: &originalExec}
}

func (m *K8sManager) resolveAccount(project string) string {
	m.mu.RLock()
	cached, ok := m.accountByProject[project]
	m.mu.RUnlock()
	if ok {
		return cached
	}

	account := m.findSiblingAccount(project)
	if account == "" {
		account = gcloudAccountForProject(project)
	}

	m.mu.Lock()
	m.accountByProject[project] = account
	m.mu.Unlock()
	return account
}

// findSiblingAccount scans other contexts in the same GCP project for an
// explicit --account arg and reuses it. Fast, offline, and usually correct.
func (m *K8sManager) findSiblingAccount(project string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	prefix := "gke_" + project + "_"
	for name, ctx := range m.config.Contexts {
		if !strings.HasPrefix(name, prefix) {
			continue
		}
		ai, ok := m.config.AuthInfos[ctx.AuthInfo]
		if !ok || ai == nil || ai.Exec == nil {
			continue
		}
		for _, a := range ai.Exec.Args {
			if strings.HasPrefix(a, "--account=") {
				return strings.TrimPrefix(a, "--account=")
			}
		}
	}
	return ""
}

// parseGKEProject extracts the GCP project from a context of the form
// "gke_<project>_<region>_<cluster>". Returns "" if the name doesn't match.
func parseGKEProject(contextName string) string {
	if !strings.HasPrefix(contextName, "gke_") {
		return ""
	}
	parts := strings.SplitN(strings.TrimPrefix(contextName, "gke_"), "_", 2)
	if len(parts) < 2 {
		return ""
	}
	return parts[0]
}

// gcloudAccountForProject returns a credentialed gcloud account that can
// access the given project. It checks the currently active account first
// so that it matches what kubectl would use, then falls back to other
// credentialed accounts.
func gcloudAccountForProject(project string) string {
	active := gcloudActiveAccount()
	if active != "" && gcloudAccountHasProjectAccess(active, project) {
		return active
	}

	accounts, err := gcloudListAccounts()
	if err != nil || len(accounts) == 0 {
		return ""
	}
	for _, acc := range accounts {
		if acc == active {
			continue // already checked
		}
		if gcloudAccountHasProjectAccess(acc, project) {
			return acc
		}
	}
	return ""
}

// gcloudActiveAccount returns the currently active gcloud account.
func gcloudActiveAccount() string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "gcloud", "auth", "list",
		"--filter=status:ACTIVE", "--format=value(account)")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return ""
	}
	return strings.TrimSpace(out.String())
}

func gcloudListAccounts() ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "gcloud", "auth", "list", "--format=value(account)")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	var accounts []string
	for _, line := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			accounts = append(accounts, line)
		}
	}
	return accounts, nil
}

func gcloudAccountHasProjectAccess(account, project string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "gcloud", "projects", "describe", project,
		"--account="+account, "--format=value(projectId)")
	return cmd.Run() == nil
}

// Probe makes a cheap authenticated request against the current context so
// credential problems surface as a classifiable error instead of hiding inside
// a failed resource listing.
func (m *K8sManager) Probe(ctx context.Context) error {
	client, err := m.GetClient()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	_, err = client.Discovery().RESTClient().Get().AbsPath("/version").DoRaw(ctx)
	return err
}

// AuthStatus reports the credential state of the current context, including
// whether a re-login would fix it and what command that would run.
func (m *K8sManager) AuthStatus(ctx context.Context) AuthStatus {
	contextName := m.CurrentContext()

	m.mu.RLock()
	clusterName := ""
	if kctx, ok := m.config.Contexts[contextName]; ok {
		clusterName = kctx.Cluster
	}
	m.mu.RUnlock()

	authInfo := m.authInfoFor(contextName)
	provider := detectProvider(authInfo)

	status := AuthStatus{
		Context:  contextName,
		Cluster:  clusterName,
		Provider: provider,
		Project:  parseGKEProject(contextName),
	}

	if provider == ProviderGKE {
		status.Account = m.gkeAccount(contextName)
		if status.Account != "" {
			if _, err := m.tokenSourceFor(status.Account); err == nil {
				status.Native = true
			}
		}
	}

	status.AWSProfile = awsProfile(authInfo)

	argv, canLogin := loginCommand(provider, status.Account, status.AWSProfile)
	status.CanLogin = canLogin
	if canLogin {
		status.LoginCommand = strings.Join(argv, " ")
	}

	if err := m.Probe(ctx); err != nil {
		status.Error = err.Error()
		status.NeedsLogin = IsAuthError(err)
	} else {
		status.Connected = true
	}

	return status
}

// InvalidateCredentials drops cached clients and token sources so the next
// request picks up freshly written credentials. Called after a login completes.
func (m *K8sManager) InvalidateCredentials() error {
	m.mu.Lock()
	m.clients = make(map[string]*kubernetes.Clientset)
	m.metricsClients = make(map[string]*metricsv.Clientset)
	m.tokenSources = make(map[string]oauth2.TokenSource)
	m.accountByProject = make(map[string]string)
	err := m.reloadLocked()
	m.mu.Unlock()

	return err
}

// GetDefaultNamespace returns the default namespace for the current context
func (m *K8sManager) GetDefaultNamespace() string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if ctx, exists := m.config.Contexts[m.currentContext]; exists && ctx.Namespace != "" {
		return ctx.Namespace
	}
	return "default"
}

// GetConfig returns the rest.Config for the current context
func (m *K8sManager) GetConfig() (*rest.Config, error) {
	m.mu.RLock()
	context := m.currentContext
	m.mu.RUnlock()

	return m.buildConfig(context)
}

// GetClientset returns the clientset for authorization checks
func (m *K8sManager) GetClientset() (*kubernetes.Clientset, bool) {
	client, err := m.GetClient()
	if err != nil {
		return nil, false
	}
	return client, true
}

// GetMetricsClient returns the metrics clientset for the current context
func (m *K8sManager) GetMetricsClient() (*metricsv.Clientset, error) {
	m.mu.RLock()
	context := m.currentContext
	client, exists := m.metricsClients[context]
	m.mu.RUnlock()

	if exists {
		return client, nil
	}

	// Build outside the lock — see GetClient for why.
	restConfig, err := m.buildConfig(context)
	if err != nil {
		return nil, err
	}

	newClient, err := metricsv.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create metrics client for context %q: %w", context, err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.metricsClients[context]; ok {
		return existing, nil
	}
	m.metricsClients[context] = newClient
	return newClient, nil
}
