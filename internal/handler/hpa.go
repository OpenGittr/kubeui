package handler

import (
	"context"
	"fmt"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type HPAHandler struct {
	k8s *service.K8sManager
}

func NewHPAHandler(k8s *service.K8sManager) *HPAHandler {
	return &HPAHandler{k8s: k8s}
}

type HPAInfo struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Reference   string `json:"reference"`
	Targets     string `json:"targets"`
	MinPods     int32  `json:"minPods"`
	MaxPods     int32  `json:"maxPods"`
	Replicas    int32  `json:"replicas"`
	Age         string `json:"age"`
}

func (h *HPAHandler) List(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	hpas, err := client.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []HPAInfo
	for _, hpa := range hpas.Items {
		// Get reference
		reference := fmt.Sprintf("%s/%s", hpa.Spec.ScaleTargetRef.Kind, hpa.Spec.ScaleTargetRef.Name)

		// Get targets
		var targets []string
		for _, metric := range hpa.Spec.Metrics {
			if metric.Resource != nil {
				target := ""
				if metric.Resource.Target.AverageUtilization != nil {
					target = fmt.Sprintf("%d%%", *metric.Resource.Target.AverageUtilization)
				} else if metric.Resource.Target.AverageValue != nil {
					target = metric.Resource.Target.AverageValue.String()
				}

				// Find current value
				current := "<unknown>"
				for _, status := range hpa.Status.CurrentMetrics {
					if status.Resource != nil && status.Resource.Name == metric.Resource.Name {
						if status.Resource.Current.AverageUtilization != nil {
							current = fmt.Sprintf("%d%%", *status.Resource.Current.AverageUtilization)
						} else if status.Resource.Current.AverageValue != nil {
							current = status.Resource.Current.AverageValue.String()
						}
					}
				}
				targets = append(targets, fmt.Sprintf("%s: %s/%s", metric.Resource.Name, current, target))
			}
		}

		targetsStr := "<none>"
		if len(targets) > 0 {
			targetsStr = ""
			for i, t := range targets {
				if i > 0 {
					targetsStr += ", "
				}
				targetsStr += t
			}
		}

		minPods := int32(1)
		if hpa.Spec.MinReplicas != nil {
			minPods = *hpa.Spec.MinReplicas
		}

		result = append(result, HPAInfo{
			Name:      hpa.Name,
			Namespace: hpa.Namespace,
			Reference: reference,
			Targets:   targetsStr,
			MinPods:   minPods,
			MaxPods:   hpa.Spec.MaxReplicas,
			Replicas:  hpa.Status.CurrentReplicas,
			Age:       formatAge(hpa.CreationTimestamp.Time),
		})
	}

	return result, nil
}
