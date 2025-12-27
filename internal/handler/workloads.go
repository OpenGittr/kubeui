package handler

import (
	"context"
	"fmt"
	"strings"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type WorkloadHandler struct {
	k8s *service.K8sManager
}

func NewWorkloadHandler(k8s *service.K8sManager) *WorkloadHandler {
	return &WorkloadHandler{k8s: k8s}
}

// DaemonSet info
type DaemonSetInfo struct {
	Name              string                   `json:"name"`
	Namespace         string                   `json:"namespace"`
	Desired           int32                    `json:"desired"`
	Current           int32                    `json:"current"`
	Ready             int32                    `json:"ready"`
	UpToDate          int32                    `json:"upToDate"`
	Available         int32                    `json:"available"`
	NodeSelector      string                   `json:"nodeSelector"`
	Age               string                   `json:"age"`
	Labels            map[string]string        `json:"labels,omitempty"`
	Selector          map[string]string        `json:"selector,omitempty"`
	ContainerDetails  []DaemonSetContainer     `json:"containerDetails,omitempty"`
	Conditions        []DaemonSetCondition     `json:"conditions,omitempty"`
	RunningContainers []DaemonSetRunningContainer `json:"runningContainers,omitempty"`
}

type DaemonSetContainer struct {
	Name   string        `json:"name"`
	Image  string        `json:"image"`
	CPU    ResourceUsage `json:"cpu"`
	Memory ResourceUsage `json:"memory"`
}

type DaemonSetCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
}

type DaemonSetRunningContainer struct {
	PodName       string        `json:"podName"`
	NodeName      string        `json:"nodeName"`
	ContainerName string        `json:"containerName"`
	Ready         bool          `json:"ready"`
	State         string        `json:"state"`
	Restarts      int32         `json:"restarts"`
	CPU           ResourceUsage `json:"cpu"`
	Memory        ResourceUsage `json:"memory"`
}

func (h *WorkloadHandler) ListDaemonSets(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	daemonsets, err := client.AppsV1().DaemonSets(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []DaemonSetInfo
	for _, ds := range daemonsets.Items {
		nodeSelector := ""
		for k, v := range ds.Spec.Template.Spec.NodeSelector {
			if nodeSelector != "" {
				nodeSelector += ", "
			}
			nodeSelector += fmt.Sprintf("%s=%s", k, v)
		}
		if nodeSelector == "" {
			nodeSelector = "<none>"
		}

		result = append(result, DaemonSetInfo{
			Name:         ds.Name,
			Namespace:    ds.Namespace,
			Desired:      ds.Status.DesiredNumberScheduled,
			Current:      ds.Status.CurrentNumberScheduled,
			Ready:        ds.Status.NumberReady,
			UpToDate:     ds.Status.UpdatedNumberScheduled,
			Available:    ds.Status.NumberAvailable,
			NodeSelector: nodeSelector,
			Age:          formatAge(ds.CreationTimestamp.Time),
		})
	}

	return result, nil
}

// GetDaemonSet returns details of a specific daemonset
func (h *WorkloadHandler) GetDaemonSet(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	ds, err := client.AppsV1().DaemonSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	nodeSelector := ""
	for k, v := range ds.Spec.Template.Spec.NodeSelector {
		if nodeSelector != "" {
			nodeSelector += ", "
		}
		nodeSelector += fmt.Sprintf("%s=%s", k, v)
	}
	if nodeSelector == "" {
		nodeSelector = "<none>"
	}

	info := DaemonSetInfo{
		Name:         ds.Name,
		Namespace:    ds.Namespace,
		Desired:      ds.Status.DesiredNumberScheduled,
		Current:      ds.Status.CurrentNumberScheduled,
		Ready:        ds.Status.NumberReady,
		UpToDate:     ds.Status.UpdatedNumberScheduled,
		Available:    ds.Status.NumberAvailable,
		NodeSelector: nodeSelector,
		Age:          formatAge(ds.CreationTimestamp.Time),
		Labels:       ds.Labels,
	}

	if ds.Spec.Selector != nil {
		info.Selector = ds.Spec.Selector.MatchLabels
	}

	// Container details from spec
	for _, c := range ds.Spec.Template.Spec.Containers {
		container := DaemonSetContainer{
			Name:  c.Name,
			Image: c.Image,
		}
		if c.Resources.Requests != nil {
			container.CPU.Request = c.Resources.Requests.Cpu().MilliValue()
			container.Memory.Request = c.Resources.Requests.Memory().Value()
		}
		if c.Resources.Limits != nil {
			container.CPU.Limit = c.Resources.Limits.Cpu().MilliValue()
			container.Memory.Limit = c.Resources.Limits.Memory().Value()
		}
		info.ContainerDetails = append(info.ContainerDetails, container)
	}

	// Conditions
	for _, cond := range ds.Status.Conditions {
		info.Conditions = append(info.Conditions, DaemonSetCondition{
			Type:    string(cond.Type),
			Status:  string(cond.Status),
			Reason:  cond.Reason,
			Message: cond.Message,
		})
	}

	// Fetch running containers
	if ds.Spec.Selector != nil {
		info.RunningContainers = h.fetchDaemonSetRunningContainers(namespace, ds.Spec.Selector.MatchLabels)
	}

	return info, nil
}

// fetchDaemonSetRunningContainers gets all running container instances from pods matching the selector
func (h *WorkloadHandler) fetchDaemonSetRunningContainers(namespace string, selector map[string]string) []DaemonSetRunningContainer {
	var parts []string
	for k, v := range selector {
		parts = append(parts, fmt.Sprintf("%s=%s", k, v))
	}
	labelSelector := strings.Join(parts, ",")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil
	}

	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil
	}

	// Get metrics if available
	metricsMap := make(map[string]map[string]ContainerResource)
	mc, err := h.k8s.GetMetricsClient()
	if err == nil {
		podMetrics, err := mc.MetricsV1beta1().PodMetricses(namespace).List(context.Background(), metav1.ListOptions{
			LabelSelector: labelSelector,
		})
		if err == nil {
			for _, pm := range podMetrics.Items {
				if metricsMap[pm.Name] == nil {
					metricsMap[pm.Name] = make(map[string]ContainerResource)
				}
				for _, cm := range pm.Containers {
					metricsMap[pm.Name][cm.Name] = ContainerResource{
						CPU:    ResourceUsage{Usage: cm.Usage.Cpu().MilliValue()},
						Memory: ResourceUsage{Usage: cm.Usage.Memory().Value()},
					}
				}
			}
		}
	}

	var result []DaemonSetRunningContainer
	for _, pod := range pods.Items {
		for _, cs := range pod.Status.ContainerStatuses {
			state := "unknown"
			if cs.State.Running != nil {
				state = "running"
			} else if cs.State.Waiting != nil {
				state = cs.State.Waiting.Reason
			} else if cs.State.Terminated != nil {
				state = cs.State.Terminated.Reason
			}

			rc := DaemonSetRunningContainer{
				PodName:       pod.Name,
				NodeName:      pod.Spec.NodeName,
				ContainerName: cs.Name,
				Ready:         cs.Ready,
				State:         state,
				Restarts:      cs.RestartCount,
			}

			// Add metrics if available
			if podMetrics, ok := metricsMap[pod.Name]; ok {
				if cm, ok := podMetrics[cs.Name]; ok {
					rc.CPU.Usage = cm.CPU.Usage
					rc.Memory.Usage = cm.Memory.Usage
				}
			}

			// Get request/limit from pod spec
			for _, c := range pod.Spec.Containers {
				if c.Name == cs.Name {
					if c.Resources.Requests != nil {
						rc.CPU.Request = c.Resources.Requests.Cpu().MilliValue()
						rc.Memory.Request = c.Resources.Requests.Memory().Value()
					}
					if c.Resources.Limits != nil {
						rc.CPU.Limit = c.Resources.Limits.Cpu().MilliValue()
						rc.Memory.Limit = c.Resources.Limits.Memory().Value()
					}
					break
				}
			}

			result = append(result, rc)
		}
	}

	return result
}

// DaemonSetEvents returns events for a specific daemonset
func (h *WorkloadHandler) DaemonSetEvents(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=DaemonSet", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type DaemonSetEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []DaemonSetEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, DaemonSetEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}

// StatefulSet info
type StatefulSetInfo struct {
	Name              string                      `json:"name"`
	Namespace         string                      `json:"namespace"`
	Ready             string                      `json:"ready"`
	Replicas          int32                       `json:"replicas"`
	ReadyReplicas     int32                       `json:"readyReplicas"`
	CurrentReplicas   int32                       `json:"currentReplicas"`
	UpdatedReplicas   int32                       `json:"updatedReplicas"`
	Age               string                      `json:"age"`
	ServiceName       string                      `json:"serviceName,omitempty"`
	Labels            map[string]string           `json:"labels,omitempty"`
	Selector          map[string]string           `json:"selector,omitempty"`
	ContainerDetails  []StatefulSetContainer      `json:"containerDetails,omitempty"`
	Conditions        []StatefulSetCondition      `json:"conditions,omitempty"`
	RunningContainers []StatefulSetRunningContainer `json:"runningContainers,omitempty"`
}

type StatefulSetContainer struct {
	Name   string        `json:"name"`
	Image  string        `json:"image"`
	CPU    ResourceUsage `json:"cpu"`
	Memory ResourceUsage `json:"memory"`
}

type StatefulSetCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
}

type StatefulSetRunningContainer struct {
	PodName       string        `json:"podName"`
	ContainerName string        `json:"containerName"`
	Ready         bool          `json:"ready"`
	State         string        `json:"state"`
	Restarts      int32         `json:"restarts"`
	CPU           ResourceUsage `json:"cpu"`
	Memory        ResourceUsage `json:"memory"`
}

func (h *WorkloadHandler) ListStatefulSets(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	statefulsets, err := client.AppsV1().StatefulSets(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []StatefulSetInfo
	for _, ss := range statefulsets.Items {
		replicas := int32(0)
		if ss.Spec.Replicas != nil {
			replicas = *ss.Spec.Replicas
		}

		result = append(result, StatefulSetInfo{
			Name:      ss.Name,
			Namespace: ss.Namespace,
			Ready:     fmt.Sprintf("%d/%d", ss.Status.ReadyReplicas, replicas),
			Replicas:  replicas,
			Age:       formatAge(ss.CreationTimestamp.Time),
		})
	}

	return result, nil
}

// GetStatefulSet returns details of a specific statefulset
func (h *WorkloadHandler) GetStatefulSet(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	ss, err := client.AppsV1().StatefulSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	replicas := int32(0)
	if ss.Spec.Replicas != nil {
		replicas = *ss.Spec.Replicas
	}

	info := StatefulSetInfo{
		Name:            ss.Name,
		Namespace:       ss.Namespace,
		Ready:           fmt.Sprintf("%d/%d", ss.Status.ReadyReplicas, replicas),
		Replicas:        replicas,
		ReadyReplicas:   ss.Status.ReadyReplicas,
		CurrentReplicas: ss.Status.CurrentReplicas,
		UpdatedReplicas: ss.Status.UpdatedReplicas,
		Age:             formatAge(ss.CreationTimestamp.Time),
		ServiceName:     ss.Spec.ServiceName,
		Labels:          ss.Labels,
	}

	if ss.Spec.Selector != nil {
		info.Selector = ss.Spec.Selector.MatchLabels
	}

	// Container details from spec
	for _, c := range ss.Spec.Template.Spec.Containers {
		container := StatefulSetContainer{
			Name:  c.Name,
			Image: c.Image,
		}
		if c.Resources.Requests != nil {
			container.CPU.Request = c.Resources.Requests.Cpu().MilliValue()
			container.Memory.Request = c.Resources.Requests.Memory().Value()
		}
		if c.Resources.Limits != nil {
			container.CPU.Limit = c.Resources.Limits.Cpu().MilliValue()
			container.Memory.Limit = c.Resources.Limits.Memory().Value()
		}
		info.ContainerDetails = append(info.ContainerDetails, container)
	}

	// Conditions
	for _, cond := range ss.Status.Conditions {
		info.Conditions = append(info.Conditions, StatefulSetCondition{
			Type:    string(cond.Type),
			Status:  string(cond.Status),
			Reason:  cond.Reason,
			Message: cond.Message,
		})
	}

	// Fetch running containers
	if ss.Spec.Selector != nil {
		info.RunningContainers = h.fetchStatefulSetRunningContainers(namespace, ss.Spec.Selector.MatchLabels)
	}

	return info, nil
}

// fetchStatefulSetRunningContainers gets all running container instances from pods matching the selector
func (h *WorkloadHandler) fetchStatefulSetRunningContainers(namespace string, selector map[string]string) []StatefulSetRunningContainer {
	var parts []string
	for k, v := range selector {
		parts = append(parts, fmt.Sprintf("%s=%s", k, v))
	}
	labelSelector := strings.Join(parts, ",")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil
	}

	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil
	}

	// Get metrics if available
	metricsMap := make(map[string]map[string]ContainerResource)
	mc, err := h.k8s.GetMetricsClient()
	if err == nil {
		podMetrics, err := mc.MetricsV1beta1().PodMetricses(namespace).List(context.Background(), metav1.ListOptions{
			LabelSelector: labelSelector,
		})
		if err == nil {
			for _, pm := range podMetrics.Items {
				if metricsMap[pm.Name] == nil {
					metricsMap[pm.Name] = make(map[string]ContainerResource)
				}
				for _, cm := range pm.Containers {
					metricsMap[pm.Name][cm.Name] = ContainerResource{
						CPU:    ResourceUsage{Usage: cm.Usage.Cpu().MilliValue()},
						Memory: ResourceUsage{Usage: cm.Usage.Memory().Value()},
					}
				}
			}
		}
	}

	var result []StatefulSetRunningContainer
	for _, pod := range pods.Items {
		for _, cs := range pod.Status.ContainerStatuses {
			state := "unknown"
			if cs.State.Running != nil {
				state = "running"
			} else if cs.State.Waiting != nil {
				state = cs.State.Waiting.Reason
			} else if cs.State.Terminated != nil {
				state = cs.State.Terminated.Reason
			}

			rc := StatefulSetRunningContainer{
				PodName:       pod.Name,
				ContainerName: cs.Name,
				Ready:         cs.Ready,
				State:         state,
				Restarts:      cs.RestartCount,
			}

			// Add metrics if available
			if podMetrics, ok := metricsMap[pod.Name]; ok {
				if cm, ok := podMetrics[cs.Name]; ok {
					rc.CPU.Usage = cm.CPU.Usage
					rc.Memory.Usage = cm.Memory.Usage
				}
			}

			// Get request/limit from pod spec
			for _, c := range pod.Spec.Containers {
				if c.Name == cs.Name {
					if c.Resources.Requests != nil {
						rc.CPU.Request = c.Resources.Requests.Cpu().MilliValue()
						rc.Memory.Request = c.Resources.Requests.Memory().Value()
					}
					if c.Resources.Limits != nil {
						rc.CPU.Limit = c.Resources.Limits.Cpu().MilliValue()
						rc.Memory.Limit = c.Resources.Limits.Memory().Value()
					}
					break
				}
			}

			result = append(result, rc)
		}
	}

	return result
}

// StatefulSetEvents returns events for a specific statefulset
func (h *WorkloadHandler) StatefulSetEvents(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=StatefulSet", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type StatefulSetEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []StatefulSetEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, StatefulSetEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}

// ReplicaSet info
type ReplicaSetInfo struct {
	Name              string                     `json:"name"`
	Namespace         string                     `json:"namespace"`
	Desired           int32                      `json:"desired"`
	Current           int32                      `json:"current"`
	Ready             int32                      `json:"ready"`
	Available         int32                      `json:"available"`
	Age               string                     `json:"age"`
	OwnerReferences   []string                   `json:"ownerReferences,omitempty"`
	Labels            map[string]string          `json:"labels,omitempty"`
	Selector          map[string]string          `json:"selector,omitempty"`
	ContainerDetails  []ReplicaSetContainer      `json:"containerDetails,omitempty"`
	Conditions        []ReplicaSetCondition      `json:"conditions,omitempty"`
	RunningContainers []ReplicaSetRunningContainer `json:"runningContainers,omitempty"`
}

type ReplicaSetContainer struct {
	Name   string        `json:"name"`
	Image  string        `json:"image"`
	CPU    ResourceUsage `json:"cpu"`
	Memory ResourceUsage `json:"memory"`
}

type ReplicaSetCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
}

type ReplicaSetRunningContainer struct {
	PodName       string        `json:"podName"`
	ContainerName string        `json:"containerName"`
	Ready         bool          `json:"ready"`
	State         string        `json:"state"`
	Restarts      int32         `json:"restarts"`
	CPU           ResourceUsage `json:"cpu"`
	Memory        ResourceUsage `json:"memory"`
}

func (h *WorkloadHandler) ListReplicaSets(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	replicasets, err := client.AppsV1().ReplicaSets(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ReplicaSetInfo
	for _, rs := range replicasets.Items {
		desired := int32(0)
		if rs.Spec.Replicas != nil {
			desired = *rs.Spec.Replicas
		}

		result = append(result, ReplicaSetInfo{
			Name:      rs.Name,
			Namespace: rs.Namespace,
			Desired:   desired,
			Current:   rs.Status.Replicas,
			Ready:     rs.Status.ReadyReplicas,
			Age:       formatAge(rs.CreationTimestamp.Time),
		})
	}

	return result, nil
}

// GetReplicaSet returns details of a specific replicaset
func (h *WorkloadHandler) GetReplicaSet(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	rs, err := client.AppsV1().ReplicaSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	desired := int32(0)
	if rs.Spec.Replicas != nil {
		desired = *rs.Spec.Replicas
	}

	info := ReplicaSetInfo{
		Name:      rs.Name,
		Namespace: rs.Namespace,
		Desired:   desired,
		Current:   rs.Status.Replicas,
		Ready:     rs.Status.ReadyReplicas,
		Available: rs.Status.AvailableReplicas,
		Age:       formatAge(rs.CreationTimestamp.Time),
		Labels:    rs.Labels,
	}

	// Owner references
	for _, ref := range rs.OwnerReferences {
		info.OwnerReferences = append(info.OwnerReferences, fmt.Sprintf("%s/%s", ref.Kind, ref.Name))
	}

	if rs.Spec.Selector != nil {
		info.Selector = rs.Spec.Selector.MatchLabels
	}

	// Container details from spec
	for _, c := range rs.Spec.Template.Spec.Containers {
		container := ReplicaSetContainer{
			Name:  c.Name,
			Image: c.Image,
		}
		if c.Resources.Requests != nil {
			container.CPU.Request = c.Resources.Requests.Cpu().MilliValue()
			container.Memory.Request = c.Resources.Requests.Memory().Value()
		}
		if c.Resources.Limits != nil {
			container.CPU.Limit = c.Resources.Limits.Cpu().MilliValue()
			container.Memory.Limit = c.Resources.Limits.Memory().Value()
		}
		info.ContainerDetails = append(info.ContainerDetails, container)
	}

	// Conditions
	for _, cond := range rs.Status.Conditions {
		info.Conditions = append(info.Conditions, ReplicaSetCondition{
			Type:    string(cond.Type),
			Status:  string(cond.Status),
			Reason:  cond.Reason,
			Message: cond.Message,
		})
	}

	// Fetch running containers
	if rs.Spec.Selector != nil {
		info.RunningContainers = h.fetchReplicaSetRunningContainers(namespace, rs.Spec.Selector.MatchLabels)
	}

	return info, nil
}

// fetchReplicaSetRunningContainers gets all running container instances from pods matching the selector
func (h *WorkloadHandler) fetchReplicaSetRunningContainers(namespace string, selector map[string]string) []ReplicaSetRunningContainer {
	var parts []string
	for k, v := range selector {
		parts = append(parts, fmt.Sprintf("%s=%s", k, v))
	}
	labelSelector := strings.Join(parts, ",")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil
	}

	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil
	}

	// Get metrics if available
	metricsMap := make(map[string]map[string]ContainerResource)
	mc, err := h.k8s.GetMetricsClient()
	if err == nil {
		podMetrics, err := mc.MetricsV1beta1().PodMetricses(namespace).List(context.Background(), metav1.ListOptions{
			LabelSelector: labelSelector,
		})
		if err == nil {
			for _, pm := range podMetrics.Items {
				if metricsMap[pm.Name] == nil {
					metricsMap[pm.Name] = make(map[string]ContainerResource)
				}
				for _, cm := range pm.Containers {
					metricsMap[pm.Name][cm.Name] = ContainerResource{
						CPU:    ResourceUsage{Usage: cm.Usage.Cpu().MilliValue()},
						Memory: ResourceUsage{Usage: cm.Usage.Memory().Value()},
					}
				}
			}
		}
	}

	var result []ReplicaSetRunningContainer
	for _, pod := range pods.Items {
		for _, cs := range pod.Status.ContainerStatuses {
			state := "unknown"
			if cs.State.Running != nil {
				state = "running"
			} else if cs.State.Waiting != nil {
				state = cs.State.Waiting.Reason
			} else if cs.State.Terminated != nil {
				state = cs.State.Terminated.Reason
			}

			rc := ReplicaSetRunningContainer{
				PodName:       pod.Name,
				ContainerName: cs.Name,
				Ready:         cs.Ready,
				State:         state,
				Restarts:      cs.RestartCount,
			}

			// Add metrics if available
			if podMetrics, ok := metricsMap[pod.Name]; ok {
				if cm, ok := podMetrics[cs.Name]; ok {
					rc.CPU.Usage = cm.CPU.Usage
					rc.Memory.Usage = cm.Memory.Usage
				}
			}

			// Get request/limit from pod spec
			for _, c := range pod.Spec.Containers {
				if c.Name == cs.Name {
					if c.Resources.Requests != nil {
						rc.CPU.Request = c.Resources.Requests.Cpu().MilliValue()
						rc.Memory.Request = c.Resources.Requests.Memory().Value()
					}
					if c.Resources.Limits != nil {
						rc.CPU.Limit = c.Resources.Limits.Cpu().MilliValue()
						rc.Memory.Limit = c.Resources.Limits.Memory().Value()
					}
					break
				}
			}

			result = append(result, rc)
		}
	}

	return result
}

// ReplicaSetEvents returns events for a specific replicaset
func (h *WorkloadHandler) ReplicaSetEvents(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=ReplicaSet", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type ReplicaSetEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []ReplicaSetEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, ReplicaSetEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}

func (h *WorkloadHandler) DeleteDaemonSet(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.AppsV1().DaemonSets(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("DaemonSet %s deleted", name)}, nil
}

func (h *WorkloadHandler) DeleteStatefulSet(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.AppsV1().StatefulSets(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("StatefulSet %s deleted", name)}, nil
}

func (h *WorkloadHandler) DeleteReplicaSet(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.AppsV1().ReplicaSets(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("ReplicaSet %s deleted", name)}, nil
}
