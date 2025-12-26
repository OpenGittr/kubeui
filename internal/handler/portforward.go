package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"gofr.dev/pkg/gofr"

	"github.com/opengittr/kubeui/internal/service"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

// PortForwardHandler handles port forwarding requests
type PortForwardHandler struct {
	k8sManager *service.K8sManager
	forwards   map[string]*activeForward
	mu         sync.RWMutex
}

type activeForward struct {
	ID          string   `json:"id"`
	Namespace   string   `json:"namespace"`
	PodName     string   `json:"podName"`
	LocalPort   int      `json:"localPort"`
	RemotePort  int      `json:"remotePort"`
	stopChan    chan struct{}
	readyChan   chan struct{}
}

// PortForwardInfo represents port forward info for API response
type PortForwardInfo struct {
	ID         string `json:"id"`
	Namespace  string `json:"namespace"`
	PodName    string `json:"podName"`
	LocalPort  int    `json:"localPort"`
	RemotePort int    `json:"remotePort"`
}

// NewPortForwardHandler creates a new port forward handler
func NewPortForwardHandler(k8sManager *service.K8sManager) *PortForwardHandler {
	return &PortForwardHandler{
		k8sManager: k8sManager,
		forwards:   make(map[string]*activeForward),
	}
}

// Start starts a port forward
func (h *PortForwardHandler) Start(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	var req struct {
		LocalPort  int `json:"localPort"`
		RemotePort int `json:"remotePort"`
	}

	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}

	if req.RemotePort == 0 {
		return nil, fmt.Errorf("remotePort is required")
	}

	// If local port is 0, use the same as remote
	if req.LocalPort == 0 {
		req.LocalPort = req.RemotePort
	}

	// Check if this forward already exists
	forwardID := fmt.Sprintf("%s/%s:%d:%d", namespace, name, req.LocalPort, req.RemotePort)

	h.mu.RLock()
	if _, exists := h.forwards[forwardID]; exists {
		h.mu.RUnlock()
		return nil, fmt.Errorf("port forward already active for %s", forwardID)
	}
	h.mu.RUnlock()

	// Get K8s config
	config, err := h.k8sManager.GetConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get config: %w", err)
	}

	client, err := h.k8sManager.GetClient()
	if err != nil {
		return nil, fmt.Errorf("failed to get client: %w", err)
	}

	// Verify pod exists
	_, err = client.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get pod: %w", err)
	}

	// Create port forward request
	reqURL := client.CoreV1().RESTClient().Post().
		Resource("pods").
		Namespace(namespace).
		Name(name).
		SubResource("portforward").
		URL()

	transport, upgrader, err := spdy.RoundTripperFor(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create round tripper: %w", err)
	}

	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, "POST", reqURL)

	stopChan := make(chan struct{})
	readyChan := make(chan struct{})

	ports := []string{fmt.Sprintf("%d:%d", req.LocalPort, req.RemotePort)}

	// Create port forwarder
	pf, err := portforward.New(dialer, ports, stopChan, readyChan, nil, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create port forwarder: %w", err)
	}

	// Store the forward
	forward := &activeForward{
		ID:         forwardID,
		Namespace:  namespace,
		PodName:    name,
		LocalPort:  req.LocalPort,
		RemotePort: req.RemotePort,
		stopChan:   stopChan,
		readyChan:  readyChan,
	}

	h.mu.Lock()
	h.forwards[forwardID] = forward
	h.mu.Unlock()

	// Channel to capture errors from the goroutine
	errChan := make(chan error, 1)

	// Start port forwarding in background
	go func() {
		if err := pf.ForwardPorts(); err != nil {
			ctx.Logger.Errorf("Port forward error: %v", err)
			errChan <- err
		}
		// Clean up when done
		h.mu.Lock()
		delete(h.forwards, forwardID)
		h.mu.Unlock()
	}()

	// Wait for ready with timeout
	select {
	case <-readyChan:
		// Port forward is ready
	case err := <-errChan:
		// Port forward failed immediately
		return nil, fmt.Errorf("port forward failed: %w", err)
	case <-time.After(10 * time.Second):
		// Timeout - clean up and return error
		close(stopChan)
		h.mu.Lock()
		delete(h.forwards, forwardID)
		h.mu.Unlock()
		return nil, fmt.Errorf("port forward timed out")
	}

	return PortForwardInfo{
		ID:         forwardID,
		Namespace:  namespace,
		PodName:    name,
		LocalPort:  req.LocalPort,
		RemotePort: req.RemotePort,
	}, nil
}

// Stop stops a port forward
func (h *PortForwardHandler) Stop(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")
	localPortStr := ctx.Param("localPort")
	remotePortStr := ctx.Param("remotePort")

	localPort, _ := strconv.Atoi(localPortStr)
	remotePort, _ := strconv.Atoi(remotePortStr)

	forwardID := fmt.Sprintf("%s/%s:%d:%d", namespace, name, localPort, remotePort)

	h.mu.Lock()
	forward, exists := h.forwards[forwardID]
	if !exists {
		h.mu.Unlock()
		return nil, fmt.Errorf("port forward not found: %s", forwardID)
	}

	close(forward.stopChan)
	delete(h.forwards, forwardID)
	h.mu.Unlock()

	return map[string]string{
		"message": fmt.Sprintf("Stopped port forward %s", forwardID),
	}, nil
}

// List lists all active port forwards
func (h *PortForwardHandler) List(ctx *gofr.Context) (interface{}, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var forwards []PortForwardInfo
	for _, f := range h.forwards {
		forwards = append(forwards, PortForwardInfo{
			ID:         f.ID,
			Namespace:  f.Namespace,
			PodName:    f.PodName,
			LocalPort:  f.LocalPort,
			RemotePort: f.RemotePort,
		})
	}

	return forwards, nil
}

// ListForPod lists port forwards for a specific pod
func (h *PortForwardHandler) ListForPod(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	h.mu.RLock()
	defer h.mu.RUnlock()

	var forwards []PortForwardInfo
	for _, f := range h.forwards {
		if f.Namespace == namespace && f.PodName == name {
			forwards = append(forwards, PortForwardInfo{
				ID:         f.ID,
				Namespace:  f.Namespace,
				PodName:    f.PodName,
				LocalPort:  f.LocalPort,
				RemotePort: f.RemotePort,
			})
		}
	}

	return forwards, nil
}
