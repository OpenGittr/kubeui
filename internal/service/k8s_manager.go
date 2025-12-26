package service

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
	metricsv "k8s.io/metrics/pkg/client/clientset/versioned"
)

// K8sManager manages multiple Kubernetes cluster connections
type K8sManager struct {
	kubeconfig     string
	config         *api.Config
	currentContext string
	clients        map[string]*kubernetes.Clientset
	metricsClients map[string]*metricsv.Clientset
	mu             sync.RWMutex
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
		kubeconfig:     kubeconfig,
		config:         config,
		currentContext: config.CurrentContext,
		clients:        make(map[string]*kubernetes.Clientset),
		metricsClients: make(map[string]*metricsv.Clientset),
	}, nil
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
	if _, exists := m.config.Contexts[contextName]; !exists {
		m.mu.Unlock()
		return fmt.Errorf("context %q not found", contextName)
	}
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

	// Create new client
	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after acquiring write lock
	if client, exists = m.clients[context]; exists {
		return client, nil
	}

	restConfig, err := m.buildConfig(context)
	if err != nil {
		return nil, err
	}

	client, err = kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create client for context %q: %w", context, err)
	}

	m.clients[context] = client
	return client, nil
}

// buildConfig creates a rest.Config for the specified context
func (m *K8sManager) buildConfig(contextName string) (*rest.Config, error) {
	configOverrides := &clientcmd.ConfigOverrides{
		CurrentContext: contextName,
	}

	clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfig},
		configOverrides,
	)

	return clientConfig.ClientConfig()
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

	// Create new metrics client
	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after acquiring write lock
	if client, exists = m.metricsClients[context]; exists {
		return client, nil
	}

	restConfig, err := m.buildConfig(context)
	if err != nil {
		return nil, err
	}

	client, err = metricsv.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create metrics client for context %q: %w", context, err)
	}

	m.metricsClients[context] = client
	return client, nil
}
