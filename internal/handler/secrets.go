package handler

import (
	"context"
	"fmt"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type SecretHandler struct {
	k8s *service.K8sManager
}

func NewSecretHandler(k8s *service.K8sManager) *SecretHandler {
	return &SecretHandler{k8s: k8s}
}

type SecretInfo struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Type      string   `json:"type"`
	Keys      []string `json:"keys"`
	Age       string   `json:"age"`
}

func (h *SecretHandler) List(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	secrets, err := client.CoreV1().Secrets(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []SecretInfo
	for _, s := range secrets.Items {
		keys := make([]string, 0, len(s.Data))
		for k := range s.Data {
			keys = append(keys, k)
		}

		result = append(result, SecretInfo{
			Name:      s.Name,
			Namespace: s.Namespace,
			Type:      string(s.Type),
			Keys:      keys,
			Age:       formatAge(s.CreationTimestamp.Time),
		})
	}

	return result, nil
}

func (h *SecretHandler) Delete(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.CoreV1().Secrets(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("Secret %s deleted", name)}, nil
}
