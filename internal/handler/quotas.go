package handler

import (
	"context"
	"fmt"
	"strings"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type QuotaHandler struct {
	k8s *service.K8sManager
}

func NewQuotaHandler(k8s *service.K8sManager) *QuotaHandler {
	return &QuotaHandler{k8s: k8s}
}

type ResourceQuotaInfo struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Hard      map[string]string `json:"hard"`
	Used      map[string]string `json:"used"`
	Age       string            `json:"age"`
}

func (h *QuotaHandler) ListResourceQuotas(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	quotas, err := client.CoreV1().ResourceQuotas(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ResourceQuotaInfo
	for _, quota := range quotas.Items {
		hard := make(map[string]string)
		for k, v := range quota.Status.Hard {
			hard[string(k)] = v.String()
		}

		used := make(map[string]string)
		for k, v := range quota.Status.Used {
			used[string(k)] = v.String()
		}

		result = append(result, ResourceQuotaInfo{
			Name:      quota.Name,
			Namespace: quota.Namespace,
			Hard:      hard,
			Used:      used,
			Age:       formatAge(quota.CreationTimestamp.Time),
		})
	}

	return result, nil
}

type LimitRangeInfo struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Limits    []string `json:"limits"`
	Age       string   `json:"age"`
}

func (h *QuotaHandler) ListLimitRanges(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	limitRanges, err := client.CoreV1().LimitRanges(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []LimitRangeInfo
	for _, lr := range limitRanges.Items {
		var limits []string
		for _, item := range lr.Spec.Limits {
			var parts []string
			if item.Type != "" {
				parts = append(parts, fmt.Sprintf("Type: %s", item.Type))
			}
			if len(item.Default) > 0 {
				var defaults []string
				for k, v := range item.Default {
					defaults = append(defaults, fmt.Sprintf("%s=%s", k, v.String()))
				}
				parts = append(parts, fmt.Sprintf("Default: %s", strings.Join(defaults, ", ")))
			}
			if len(item.Max) > 0 {
				var maxes []string
				for k, v := range item.Max {
					maxes = append(maxes, fmt.Sprintf("%s=%s", k, v.String()))
				}
				parts = append(parts, fmt.Sprintf("Max: %s", strings.Join(maxes, ", ")))
			}
			if len(item.Min) > 0 {
				var mins []string
				for k, v := range item.Min {
					mins = append(mins, fmt.Sprintf("%s=%s", k, v.String()))
				}
				parts = append(parts, fmt.Sprintf("Min: %s", strings.Join(mins, ", ")))
			}
			limits = append(limits, strings.Join(parts, " | "))
		}

		result = append(result, LimitRangeInfo{
			Name:      lr.Name,
			Namespace: lr.Namespace,
			Limits:    limits,
			Age:       formatAge(lr.CreationTimestamp.Time),
		})
	}

	return result, nil
}
