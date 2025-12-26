package handler

import (
	"context"
	"fmt"
	"io"
	"strconv"
	"time"

	"gofr.dev/pkg/gofr"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsv "k8s.io/metrics/pkg/client/clientset/versioned"

	"github.com/opengittr/kubeui/internal/service"
)

type PodHandler struct {
	k8s *service.K8sManager
}

func NewPodHandler(k8s *service.K8sManager) *PodHandler {
	return &PodHandler{k8s: k8s}
}

type PodInfo struct {
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Status     string            `json:"status"`
	Ready      string            `json:"ready"`
	Restarts   int32             `json:"restarts"`
	Age        string            `json:"age"`
	Node       string            `json:"node"`
	IP         string            `json:"ip"`
	Containers []ContainerInfo   `json:"containers,omitempty"`
	Labels     map[string]string `json:"labels,omitempty"`
}

type ContainerInfo struct {
	Name         string            `json:"name"`
	Image        string            `json:"image"`
	Ready        bool              `json:"ready"`
	RestartCount int32             `json:"restartCount"`
	State        string            `json:"state"`
	Resources    ContainerResource `json:"resources,omitempty"`
}

type ContainerResource struct {
	CPU    ResourceUsage `json:"cpu"`
	Memory ResourceUsage `json:"memory"`
}

type ResourceUsage struct {
	Request int64 `json:"request"` // CPU in millicores, Memory in bytes
	Limit   int64 `json:"limit"`
	Usage   int64 `json:"usage"`
}

// List returns all pods, optionally filtered by namespace
func (h *PodHandler) List(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")
	if namespace == "" {
		namespace = "" // empty means all namespaces
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PodInfo
	for _, pod := range pods.Items {
		result = append(result, podToInfo(&pod, false))
	}

	return result, nil
}

// Get returns details of a specific pod
func (h *PodHandler) Get(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	pod, err := client.CoreV1().Pods(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// Try to get metrics (may fail if metrics-server not available)
	var containerMetrics map[string]ContainerResource
	metricsClient, err := h.k8s.GetMetricsClient()
	if err == nil {
		containerMetrics = fetchPodMetrics(metricsClient, namespace, name)
	}

	return podToInfoWithMetrics(pod, containerMetrics), nil
}

// Logs returns logs from a pod
func (h *PodHandler) Logs(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")
	container := ctx.Param("container")

	tailLines := int64(500)
	if tailParam := ctx.Param("tail"); tailParam != "" {
		if n, err := strconv.ParseInt(tailParam, 10, 64); err == nil {
			tailLines = n
		}
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	opts := &corev1.PodLogOptions{
		Container: container,
		TailLines: &tailLines,
	}

	req := client.CoreV1().Pods(namespace).GetLogs(name, opts)
	stream, err := req.Stream(context.Background())
	if err != nil {
		return nil, err
	}
	defer stream.Close()

	logs, err := io.ReadAll(stream)
	if err != nil {
		return nil, err
	}

	return map[string]string{"logs": string(logs)}, nil
}

// Delete deletes a pod (effectively restarting it if managed by a controller)
func (h *PodHandler) Delete(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.CoreV1().Pods(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("Pod %s deleted", name)}, nil
}

func podToInfo(pod *corev1.Pod, detailed bool) PodInfo {
	ready := 0
	total := len(pod.Spec.Containers)
	var restarts int32

	var containers []ContainerInfo
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.Ready {
			ready++
		}
		restarts += cs.RestartCount

		if detailed {
			state := "unknown"
			if cs.State.Running != nil {
				state = "running"
			} else if cs.State.Waiting != nil {
				state = cs.State.Waiting.Reason
			} else if cs.State.Terminated != nil {
				state = cs.State.Terminated.Reason
			}

			containers = append(containers, ContainerInfo{
				Name:         cs.Name,
				Image:        cs.Image,
				Ready:        cs.Ready,
				RestartCount: cs.RestartCount,
				State:        state,
			})
		}
	}

	info := PodInfo{
		Name:      pod.Name,
		Namespace: pod.Namespace,
		Status:    string(pod.Status.Phase),
		Ready:     fmt.Sprintf("%d/%d", ready, total),
		Restarts:  restarts,
		Age:       formatAge(pod.CreationTimestamp.Time),
		Node:      pod.Spec.NodeName,
		IP:        pod.Status.PodIP,
	}

	if detailed {
		info.Containers = containers
		info.Labels = pod.Labels
	}

	return info
}

// Events returns events for a specific pod
func (h *PodHandler) Events(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	// Get events filtered by the pod
	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=Pod", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type PodEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []PodEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, PodEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}

func formatAge(t time.Time) string {
	d := time.Since(t)
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

// fetchPodMetrics retrieves metrics for a specific pod
func fetchPodMetrics(metricsClient *metricsv.Clientset, namespace, name string) map[string]ContainerResource {
	metrics, err := metricsClient.MetricsV1beta1().PodMetricses(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil
	}

	result := make(map[string]ContainerResource)
	for _, container := range metrics.Containers {
		result[container.Name] = ContainerResource{
			CPU: ResourceUsage{
				Usage: container.Usage.Cpu().MilliValue(),
			},
			Memory: ResourceUsage{
				Usage: container.Usage.Memory().Value(),
			},
		}
	}
	return result
}

// podToInfoWithMetrics converts a pod to PodInfo with metrics data
func podToInfoWithMetrics(pod *corev1.Pod, metrics map[string]ContainerResource) PodInfo {
	ready := 0
	total := len(pod.Spec.Containers)
	var restarts int32

	// Build container spec map for requests/limits
	containerSpecs := make(map[string]corev1.Container)
	for _, c := range pod.Spec.Containers {
		containerSpecs[c.Name] = c
	}

	var containers []ContainerInfo
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.Ready {
			ready++
		}
		restarts += cs.RestartCount

		state := "unknown"
		if cs.State.Running != nil {
			state = "running"
		} else if cs.State.Waiting != nil {
			state = cs.State.Waiting.Reason
		} else if cs.State.Terminated != nil {
			state = cs.State.Terminated.Reason
		}

		// Get resource requests and limits from spec
		spec := containerSpecs[cs.Name]
		resources := ContainerResource{
			CPU: ResourceUsage{
				Request: spec.Resources.Requests.Cpu().MilliValue(),
				Limit:   spec.Resources.Limits.Cpu().MilliValue(),
			},
			Memory: ResourceUsage{
				Request: spec.Resources.Requests.Memory().Value(),
				Limit:   spec.Resources.Limits.Memory().Value(),
			},
		}

		// Add usage from metrics if available
		if metrics != nil {
			if m, ok := metrics[cs.Name]; ok {
				resources.CPU.Usage = m.CPU.Usage
				resources.Memory.Usage = m.Memory.Usage
			}
		}

		containers = append(containers, ContainerInfo{
			Name:         cs.Name,
			Image:        cs.Image,
			Ready:        cs.Ready,
			RestartCount: cs.RestartCount,
			State:        state,
			Resources:    resources,
		})
	}

	return PodInfo{
		Name:       pod.Name,
		Namespace:  pod.Namespace,
		Status:     string(pod.Status.Phase),
		Ready:      fmt.Sprintf("%d/%d", ready, total),
		Restarts:   restarts,
		Age:        formatAge(pod.CreationTimestamp.Time),
		Node:       pod.Spec.NodeName,
		IP:         pod.Status.PodIP,
		Containers: containers,
		Labels:     pod.Labels,
	}
}
