package service

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

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
	mu               sync.RWMutex
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
	configOverrides := &clientcmd.ConfigOverrides{
		CurrentContext: contextName,
	}

	if override := m.authInfoOverride(contextName); override != nil {
		configOverrides.AuthInfo = *override
	}

	clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfig},
		configOverrides,
	)

	return clientConfig.ClientConfig()
}

// authInfoOverride injects --account for GKE contexts whose gke-gcloud-auth-plugin
// exec config has no --account arg. Without this, the plugin uses gcloud's
// globally-active account, which often doesn't match the project's intended user
// and produces 403 errors on listing cluster-scoped resources.
func (m *K8sManager) authInfoOverride(contextName string) *api.AuthInfo {
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

	project := parseGKEProject(contextName)
	if project == "" {
		return nil
	}

	account := m.resolveAccount(project)
	if account == "" {
		return nil
	}

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
