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
	Name                      string            `json:"name"`
	Namespace                 string            `json:"namespace"`
	Reference                 string            `json:"reference"`
	ReferenceKind             string            `json:"referenceKind,omitempty"`
	ReferenceName             string            `json:"referenceName,omitempty"`
	Targets                   string            `json:"targets"`
	MinPods                   int32             `json:"minPods"`
	MaxPods                   int32             `json:"maxPods"`
	Replicas                  int32             `json:"replicas"`
	DesiredReplicas           int32             `json:"desiredReplicas,omitempty"`
	Age                       string            `json:"age"`
	Labels                    map[string]string `json:"labels,omitempty"`
	Annotations               map[string]string `json:"annotations,omitempty"`
	Metrics                   []HPAMetric       `json:"metrics,omitempty"`
	Conditions                []HPACondition    `json:"conditions,omitempty"`
	LastScaleTime             string            `json:"lastScaleTime,omitempty"`
	ScaleUpBehavior           *HPAScalingRules  `json:"scaleUpBehavior,omitempty"`
	ScaleDownBehavior         *HPAScalingRules  `json:"scaleDownBehavior,omitempty"`
}

type HPAMetric struct {
	Type           string `json:"type"`
	Name           string `json:"name"`
	CurrentValue   string `json:"currentValue"`
	TargetValue    string `json:"targetValue"`
	CurrentPercent *int32 `json:"currentPercent,omitempty"`
	TargetPercent  *int32 `json:"targetPercent,omitempty"`
}

type HPACondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
}

type HPAScalingRules struct {
	StabilizationWindowSeconds int32  `json:"stabilizationWindowSeconds,omitempty"`
	SelectPolicy               string `json:"selectPolicy,omitempty"`
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

// Get returns details of a specific HPA
func (h *HPAHandler) Get(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	hpa, err := client.AutoscalingV2().HorizontalPodAutoscalers(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// Get reference
	reference := fmt.Sprintf("%s/%s", hpa.Spec.ScaleTargetRef.Kind, hpa.Spec.ScaleTargetRef.Name)

	// Get targets summary
	var targets []string
	var metrics []HPAMetric
	for _, metric := range hpa.Spec.Metrics {
		if metric.Resource != nil {
			target := ""
			var targetPercent *int32
			if metric.Resource.Target.AverageUtilization != nil {
				target = fmt.Sprintf("%d%%", *metric.Resource.Target.AverageUtilization)
				targetPercent = metric.Resource.Target.AverageUtilization
			} else if metric.Resource.Target.AverageValue != nil {
				target = metric.Resource.Target.AverageValue.String()
			}

			// Find current value
			current := "<unknown>"
			var currentPercent *int32
			for _, status := range hpa.Status.CurrentMetrics {
				if status.Resource != nil && status.Resource.Name == metric.Resource.Name {
					if status.Resource.Current.AverageUtilization != nil {
						current = fmt.Sprintf("%d%%", *status.Resource.Current.AverageUtilization)
						currentPercent = status.Resource.Current.AverageUtilization
					} else if status.Resource.Current.AverageValue != nil {
						current = status.Resource.Current.AverageValue.String()
					}
				}
			}
			targets = append(targets, fmt.Sprintf("%s: %s/%s", metric.Resource.Name, current, target))

			metrics = append(metrics, HPAMetric{
				Type:           "Resource",
				Name:           string(metric.Resource.Name),
				CurrentValue:   current,
				TargetValue:    target,
				CurrentPercent: currentPercent,
				TargetPercent:  targetPercent,
			})
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

	// Get conditions
	var conditions []HPACondition
	for _, c := range hpa.Status.Conditions {
		conditions = append(conditions, HPACondition{
			Type:    string(c.Type),
			Status:  string(c.Status),
			Reason:  c.Reason,
			Message: c.Message,
		})
	}

	// Get scaling behavior
	var scaleUpBehavior, scaleDownBehavior *HPAScalingRules
	if hpa.Spec.Behavior != nil {
		if hpa.Spec.Behavior.ScaleUp != nil {
			scaleUpBehavior = &HPAScalingRules{
				SelectPolicy: string(*hpa.Spec.Behavior.ScaleUp.SelectPolicy),
			}
			if hpa.Spec.Behavior.ScaleUp.StabilizationWindowSeconds != nil {
				scaleUpBehavior.StabilizationWindowSeconds = *hpa.Spec.Behavior.ScaleUp.StabilizationWindowSeconds
			}
		}
		if hpa.Spec.Behavior.ScaleDown != nil {
			scaleDownBehavior = &HPAScalingRules{
				SelectPolicy: string(*hpa.Spec.Behavior.ScaleDown.SelectPolicy),
			}
			if hpa.Spec.Behavior.ScaleDown.StabilizationWindowSeconds != nil {
				scaleDownBehavior.StabilizationWindowSeconds = *hpa.Spec.Behavior.ScaleDown.StabilizationWindowSeconds
			}
		}
	}

	lastScaleTime := ""
	if hpa.Status.LastScaleTime != nil {
		lastScaleTime = formatAge(hpa.Status.LastScaleTime.Time)
	}

	return HPAInfo{
		Name:              hpa.Name,
		Namespace:         hpa.Namespace,
		Reference:         reference,
		ReferenceKind:     hpa.Spec.ScaleTargetRef.Kind,
		ReferenceName:     hpa.Spec.ScaleTargetRef.Name,
		Targets:           targetsStr,
		MinPods:           minPods,
		MaxPods:           hpa.Spec.MaxReplicas,
		Replicas:          hpa.Status.CurrentReplicas,
		DesiredReplicas:   hpa.Status.DesiredReplicas,
		Age:               formatAge(hpa.CreationTimestamp.Time),
		Labels:            hpa.Labels,
		Annotations:       hpa.Annotations,
		Metrics:           metrics,
		Conditions:        conditions,
		LastScaleTime:     lastScaleTime,
		ScaleUpBehavior:   scaleUpBehavior,
		ScaleDownBehavior: scaleDownBehavior,
	}, nil
}

// Events returns events for a specific HPA
func (h *HPAHandler) Events(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=HorizontalPodAutoscaler", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type HPAEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []HPAEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, HPAEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}
