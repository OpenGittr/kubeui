package handler

import (
	"context"
	"encoding/json"
	"fmt"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	"github.com/opengittr/kubeui/internal/service"
)

type ConfigMapHandler struct {
	k8s *service.K8sManager
}

func NewConfigMapHandler(k8s *service.K8sManager) *ConfigMapHandler {
	return &ConfigMapHandler{k8s: k8s}
}

type ConfigMapInfo struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Keys        []string          `json:"keys"`
	Age         string            `json:"age"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	Data        map[string]string `json:"data,omitempty"`
	BinaryKeys  []string          `json:"binaryKeys,omitempty"`
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

	binaryKeys := make([]string, 0, len(cm.BinaryData))
	for k := range cm.BinaryData {
		binaryKeys = append(binaryKeys, k)
	}

	return ConfigMapInfo{
		Name:        cm.Name,
		Namespace:   cm.Namespace,
		Keys:        keys,
		Age:         formatAge(cm.CreationTimestamp.Time),
		Labels:      cm.Labels,
		Annotations: cm.Annotations,
		Data:        cm.Data,
		BinaryKeys:  binaryKeys,
	}, nil
}

// Events returns events for a specific configmap
func (h *ConfigMapHandler) Events(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=ConfigMap", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type ConfigMapEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []ConfigMapEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, ConfigMapEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}

type upsertCMKeyRequest struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// UpsertKey adds or updates a data key in a ConfigMap via strategic-merge-patch.
func (h *ConfigMapHandler) UpsertKey(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	var req upsertCMKeyRequest
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}
	if req.Key == "" {
		return nil, fmt.Errorf("key is required")
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	patch := map[string]interface{}{
		"data": map[string]string{req.Key: req.Value},
	}
	body, err := json.Marshal(patch)
	if err != nil {
		return nil, err
	}

	if _, err := client.CoreV1().ConfigMaps(namespace).Patch(
		context.Background(), name, types.StrategicMergePatchType, body, metav1.PatchOptions{},
	); err != nil {
		return nil, err
	}
	return map[string]string{"message": fmt.Sprintf("Key %q saved", req.Key)}, nil
}

// DeleteKey removes a data key from a ConfigMap via json-merge-patch.
func (h *ConfigMapHandler) DeleteKey(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")
	key := ctx.PathParam("key")
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	patch := map[string]interface{}{
		"data": map[string]interface{}{key: nil},
	}
	body, err := json.Marshal(patch)
	if err != nil {
		return nil, err
	}

	if _, err := client.CoreV1().ConfigMaps(namespace).Patch(
		context.Background(), name, types.MergePatchType, body, metav1.PatchOptions{},
	); err != nil {
		return nil, err
	}
	return map[string]string{"message": fmt.Sprintf("Key %q removed", key)}, nil
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
