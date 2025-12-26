package handler

import (
	"context"
	"fmt"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type ConfigMapHandler struct {
	k8s *service.K8sManager
}

func NewConfigMapHandler(k8s *service.K8sManager) *ConfigMapHandler {
	return &ConfigMapHandler{k8s: k8s}
}

type ConfigMapInfo struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Keys      []string `json:"keys"`
	Age       string   `json:"age"`
}

type ConfigMapDetail struct {
	ConfigMapInfo
	Data map[string]string `json:"data"`
}

func (h *ConfigMapHandler) List(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	cms, err := client.CoreV1().ConfigMaps(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ConfigMapInfo
	for _, cm := range cms.Items {
		keys := make([]string, 0, len(cm.Data))
		for k := range cm.Data {
			keys = append(keys, k)
		}

		result = append(result, ConfigMapInfo{
			Name:      cm.Name,
			Namespace: cm.Namespace,
			Keys:      keys,
			Age:       formatAge(cm.CreationTimestamp.Time),
		})
	}

	return result, nil
}

func (h *ConfigMapHandler) Get(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	cm, err := client.CoreV1().ConfigMaps(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(cm.Data))
	for k := range cm.Data {
		keys = append(keys, k)
	}

	return ConfigMapDetail{
		ConfigMapInfo: ConfigMapInfo{
			Name:      cm.Name,
			Namespace: cm.Namespace,
			Keys:      keys,
			Age:       formatAge(cm.CreationTimestamp.Time),
		},
		Data: cm.Data,
	}, nil
}

func (h *ConfigMapHandler) Delete(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.CoreV1().ConfigMaps(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("ConfigMap %s deleted", name)}, nil
}
