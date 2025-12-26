package handler

import (
	"context"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type NamespaceHandler struct {
	k8s *service.K8sManager
}

func NewNamespaceHandler(k8s *service.K8sManager) *NamespaceHandler {
	return &NamespaceHandler{k8s: k8s}
}

type NamespaceInfo struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Age    string `json:"age"`
}

// List returns all namespaces in the current cluster
func (h *NamespaceHandler) List(ctx *gofr.Context) (interface{}, error) {
	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	namespaces, err := client.CoreV1().Namespaces().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []NamespaceInfo
	for _, ns := range namespaces.Items {
		result = append(result, NamespaceInfo{
			Name:   ns.Name,
			Status: string(ns.Status.Phase),
			Age:    formatAge(ns.CreationTimestamp.Time),
		})
	}

	return result, nil
}
