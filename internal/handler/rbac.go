package handler

import (
	"context"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type RBACHandler struct {
	k8s *service.K8sManager
}

func NewRBACHandler(k8s *service.K8sManager) *RBACHandler {
	return &RBACHandler{k8s: k8s}
}

type ServiceAccountInfo struct {
	Name           string   `json:"name"`
	Namespace      string   `json:"namespace"`
	Secrets        int      `json:"secrets"`
	Age            string   `json:"age"`
}

func (h *RBACHandler) ListServiceAccounts(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	sas, err := client.CoreV1().ServiceAccounts(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ServiceAccountInfo
	for _, sa := range sas.Items {
		result = append(result, ServiceAccountInfo{
			Name:      sa.Name,
			Namespace: sa.Namespace,
			Secrets:   len(sa.Secrets),
			Age:       formatAge(sa.CreationTimestamp.Time),
		})
	}

	return result, nil
}
