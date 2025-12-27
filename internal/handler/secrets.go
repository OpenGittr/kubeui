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
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Type        string            `json:"type"`
	Keys        []string          `json:"keys"`
	Age         string            `json:"age"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	KeySizes    map[string]int    `json:"keySizes,omitempty"`
	Data        map[string]string `json:"data,omitempty"` // Decoded secret values
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

func (h *SecretHandler) Get(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	secret, err := client.CoreV1().Secrets(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(secret.Data))
	keySizes := make(map[string]int)
	data := make(map[string]string)
	for k, v := range secret.Data {
		keys = append(keys, k)
		keySizes[k] = len(v)
		data[k] = string(v) // Decode from bytes to string
	}

	return SecretInfo{
		Name:        secret.Name,
		Namespace:   secret.Namespace,
		Type:        string(secret.Type),
		Keys:        keys,
		Age:         formatAge(secret.CreationTimestamp.Time),
		Labels:      secret.Labels,
		Annotations: secret.Annotations,
		KeySizes:    keySizes,
		Data:        data,
	}, nil
}

// Events returns events for a specific secret
func (h *SecretHandler) Events(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=Secret", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type SecretEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []SecretEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, SecretEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
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
