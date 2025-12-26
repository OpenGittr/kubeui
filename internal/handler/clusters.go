package handler

import (
	"gofr.dev/pkg/gofr"

	"github.com/opengittr/kubeui/internal/service"
)

type ClusterHandler struct {
	k8s *service.K8sManager
}

func NewClusterHandler(k8s *service.K8sManager) *ClusterHandler {
	return &ClusterHandler{k8s: k8s}
}

// List returns all available Kubernetes contexts
func (h *ClusterHandler) List(ctx *gofr.Context) (interface{}, error) {
	return h.k8s.ListContexts(), nil
}

// Current returns the current active context
func (h *ClusterHandler) Current(ctx *gofr.Context) (interface{}, error) {
	return map[string]string{
		"context":   h.k8s.CurrentContext(),
		"namespace": h.k8s.GetDefaultNamespace(),
	}, nil
}

type switchRequest struct {
	Context string `json:"context"`
}

// Switch changes the active Kubernetes context
func (h *ClusterHandler) Switch(ctx *gofr.Context) (interface{}, error) {
	var req switchRequest
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}

	if err := h.k8s.SwitchContext(req.Context); err != nil {
		return nil, err
	}

	return map[string]string{
		"context":   h.k8s.CurrentContext(),
		"namespace": h.k8s.GetDefaultNamespace(),
	}, nil
}
