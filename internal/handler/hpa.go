package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"gofr.dev/pkg/gofr"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"

	"github.com/opengittr/kubeui/internal/service"
)

type HPAHandler struct {
	k8s *service.K8sManager
}

// hpaTargetMap returns a map keyed by `<namespace>/<kind>/<name>` ->
// WorkloadHPA for every HPA in the given namespace (or cluster-wide when
// namespace is ""). Used by workload list handlers (Deployments,
// StatefulSets) to attach scaling bounds without an N+1 fetch.
//
// Returns nil on error so callers can fall through to "no HPA info" rather
// than failing the whole list response.
func hpaTargetMap(ctx context.Context, client kubernetes.Interface, namespace string) map[string]*WorkloadHPA {
	list, err := client.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil
	}
	out := make(map[string]*WorkloadHPA, len(list.Items))
	for _, hpa := range list.Items {
		ref := hpa.Spec.ScaleTargetRef
		min := int32(1)
		if hpa.Spec.MinReplicas != nil {
			min = *hpa.Spec.MinReplicas
		}
		key := hpa.Namespace + "/" + ref.Kind + "/" + ref.Name
		out[key] = &WorkloadHPA{
			Name:        hpa.Name,
			MinReplicas: min,
			MaxReplicas: hpa.Spec.MaxReplicas,
		}
	}
	return out
}

// buildHPAMetrics extracts the (targetsString, structuredMetrics) pair from an
// HPA's spec + status. Used by both List and Get so the list table can render
// per-metric chips with bars instead of the bare kubectl-style string.
func buildHPAMetrics(spec autoscalingv2.HorizontalPodAutoscalerSpec, status autoscalingv2.HorizontalPodAutoscalerStatus) (string, []HPAMetric) {
	var targets []string
	var metrics []HPAMetric
	for _, metric := range spec.Metrics {
		if metric.Resource == nil {
			continue
		}
		target := ""
		var targetPercent *int32
		if metric.Resource.Target.AverageUtilization != nil {
			target = fmt.Sprintf("%d%%", *metric.Resource.Target.AverageUtilization)
			targetPercent = metric.Resource.Target.AverageUtilization
		} else if metric.Resource.Target.AverageValue != nil {
			target = metric.Resource.Target.AverageValue.String()
		}

		current := "<unknown>"
		var currentPercent *int32
		for _, st := range status.CurrentMetrics {
			if st.Resource != nil && st.Resource.Name == metric.Resource.Name {
				if st.Resource.Current.AverageUtilization != nil {
					current = fmt.Sprintf("%d%%", *st.Resource.Current.AverageUtilization)
					currentPercent = st.Resource.Current.AverageUtilization
				} else if st.Resource.Current.AverageValue != nil {
					current = st.Resource.Current.AverageValue.String()
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
	targetsStr := "<none>"
	if len(targets) > 0 {
		targetsStr = strings.Join(targets, ", ")
	}
	return targetsStr, metrics
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

		targetsStr, metrics := buildHPAMetrics(hpa.Spec, hpa.Status)

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
			Metrics:   metrics,
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

	targetsStr, metrics := buildHPAMetrics(hpa.Spec, hpa.Status)

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

type updateHPARequest struct {
	MinReplicas *int32 `json:"minReplicas,omitempty"`
	MaxReplicas *int32 `json:"maxReplicas,omitempty"`
}

// Update edits the HPA spec.minReplicas and/or spec.maxReplicas fields.
// Target-utilization edits require touching metrics[] which varies by metric
// type — intentionally out of scope for the quick-edit; use YAML for that.
func (h *HPAHandler) Update(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	var req updateHPARequest
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}
	if req.MinReplicas == nil && req.MaxReplicas == nil {
		return nil, fmt.Errorf("minReplicas or maxReplicas must be provided")
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	spec := map[string]interface{}{}
	if req.MinReplicas != nil {
		spec["minReplicas"] = *req.MinReplicas
	}
	if req.MaxReplicas != nil {
		spec["maxReplicas"] = *req.MaxReplicas
	}
	body, err := json.Marshal(map[string]interface{}{"spec": spec})
	if err != nil {
		return nil, err
	}

	if _, err := client.AutoscalingV2().HorizontalPodAutoscalers(namespace).Patch(
		context.Background(), name, types.MergePatchType, body, metav1.PatchOptions{},
	); err != nil {
		return nil, err
	}
	return map[string]string{"message": fmt.Sprintf("HPA %s updated", name)}, nil
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
