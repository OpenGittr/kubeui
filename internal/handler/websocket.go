package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"gofr.dev/pkg/gofr"

	"github.com/opengittr/kubeui/internal/service"
)

// SSEHandler handles Server-Sent Events for real-time updates
type SSEHandler struct {
	k8sManager *service.K8sManager
}

// SSEMessage represents a message sent via SSE
type SSEMessage struct {
	Type      string      `json:"type"`      // "update", "error"
	Resource  string      `json:"resource"`  // Resource type: pods, deployments, etc.
	Namespace string      `json:"namespace"` // Namespace filter
	Data      interface{} `json:"data,omitempty"`
}

// ResourceSummary provides a compact summary for real-time updates
type ResourceSummary struct {
	Total   int            `json:"total"`
	Healthy int            `json:"healthy"`
	Warning int            `json:"warning"`
	Error   int            `json:"error"`
	Items   []ResourceItem `json:"items,omitempty"`
}

type ResourceItem struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Status    string `json:"status"`
	Ready     string `json:"ready,omitempty"`
	Age       string `json:"age,omitempty"`
}

// NewSSEHandler creates a new SSE handler
func NewSSEHandler(k8sManager *service.K8sManager) *SSEHandler {
	return &SSEHandler{
		k8sManager: k8sManager,
	}
}

// Stream handles SSE streaming of resource updates
func (h *SSEHandler) Stream(ctx *gofr.Context) (interface{}, error) {
	resource := ctx.Param("resource")
	namespace := ctx.Param("namespace")

	if resource == "" {
		resource = "pods" // Default to pods
	}

	// Get initial data
	data, err := h.fetchResource(resource, namespace)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"resource":  resource,
		"namespace": namespace,
		"data":      data,
	}, nil
}

// Summary returns a summary of all resources for the dashboard
func (h *SSEHandler) Summary(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")
	apiCtx := context.Background()

	client, err := h.k8sManager.GetClient()
	if err != nil {
		return nil, err
	}

	// Fetch all summaries in parallel
	type result struct {
		name string
		data *ResourceSummary
		err  error
	}

	resources := []string{"pods", "deployments", "services", "nodes"}
	resultChan := make(chan result, len(resources))

	for _, res := range resources {
		go func(r string) {
			var data *ResourceSummary
			var err error

			switch r {
			case "pods":
				data, err = fetchPodsSummary(client, namespace, apiCtx)
			case "deployments":
				data, err = fetchDeploymentsSummary(client, namespace, apiCtx)
			case "services":
				data, err = fetchServicesSummary(client, namespace, apiCtx)
			case "nodes":
				data, err = fetchNodesSummary(client, apiCtx)
			}

			resultChan <- result{name: r, data: data, err: err}
		}(res)
	}

	summary := make(map[string]*ResourceSummary)
	for range resources {
		r := <-resultChan
		if r.err == nil {
			summary[r.name] = r.data
		}
	}

	return summary, nil
}

func (h *SSEHandler) fetchResource(resource, namespace string) (interface{}, error) {
	client, err := h.k8sManager.GetClient()
	if err != nil {
		return nil, err
	}

	apiCtx := context.Background()

	switch resource {
	case "pods":
		return fetchPodsSummary(client, namespace, apiCtx)
	case "deployments":
		return fetchDeploymentsSummary(client, namespace, apiCtx)
	case "services":
		return fetchServicesSummary(client, namespace, apiCtx)
	case "nodes":
		return fetchNodesSummary(client, apiCtx)
	case "events":
		return fetchEventsSummary(client, namespace, apiCtx)
	default:
		return nil, fmt.Errorf("unknown resource type: %s", resource)
	}
}

// SSEMiddleware creates an HTTP handler for SSE streaming
func (h *SSEHandler) SSEMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check if this is an SSE request
		if r.URL.Path != "/api/events/stream" {
			next.ServeHTTP(w, r)
			return
		}

		// Set SSE headers
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "SSE not supported", http.StatusInternalServerError)
			return
		}

		resource := r.URL.Query().Get("resource")
		namespace := r.URL.Query().Get("namespace")

		if resource == "" {
			resource = "pods"
		}

		// Send updates every 3 seconds
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()

		// Send initial data immediately
		h.sendUpdate(w, flusher, resource, namespace)

		for {
			select {
			case <-r.Context().Done():
				return
			case <-ticker.C:
				h.sendUpdate(w, flusher, resource, namespace)
			}
		}
	})
}

func (h *SSEHandler) sendUpdate(w http.ResponseWriter, flusher http.Flusher, resource, namespace string) {
	data, err := h.fetchResource(resource, namespace)
	if err != nil {
		msg := SSEMessage{
			Type:     "error",
			Resource: resource,
			Data:     err.Error(),
		}
		jsonData, _ := json.Marshal(msg)
		fmt.Fprintf(w, "data: %s\n\n", jsonData)
		flusher.Flush()
		return
	}

	msg := SSEMessage{
		Type:      "update",
		Resource:  resource,
		Namespace: namespace,
		Data:      data,
	}
	jsonData, _ := json.Marshal(msg)
	fmt.Fprintf(w, "data: %s\n\n", jsonData)
	flusher.Flush()
}

// WebSocketHandler is an alias for backward compatibility
type WebSocketHandler = SSEHandler

// NewWebSocketHandler creates a new handler (uses SSE instead of WebSocket)
func NewWebSocketHandler(k8sManager *service.K8sManager) *SSEHandler {
	return NewSSEHandler(k8sManager)
}

// Handle is an alias for Summary for the /ws endpoint
func (h *SSEHandler) Handle(ctx *gofr.Context) (interface{}, error) {
	return h.Summary(ctx)
}
