package handler

import (
	"context"
	"fmt"
	"sort"
	"time"

	"gofr.dev/pkg/gofr"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

// HealthHandler aggregates "what's broken right now" into a single response
// so the dashboard can render fast without firing one query per category.
type HealthHandler struct {
	k8s *service.K8sManager
}

func NewHealthHandler(k8s *service.K8sManager) *HealthHandler {
	return &HealthHandler{k8s: k8s}
}

type HealthPodIssue struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Container string `json:"container,omitempty"`
	Reason    string `json:"reason"`
	Message   string `json:"message,omitempty"`
	Restarts  int32  `json:"restarts,omitempty"`
	Age       string `json:"age,omitempty"`
}

type HealthWorkloadIssue struct {
	Kind      string `json:"kind"` // Deployment | StatefulSet | DaemonSet
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Ready     int32  `json:"ready"`
	Desired   int32  `json:"desired"`
	Age       string `json:"age,omitempty"`
}

type HealthEvent struct {
	Namespace string `json:"namespace"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Object    string `json:"object"` // kind/name
	Count     int32  `json:"count"`
	Age       string `json:"age"`
}

// HealthResourcePressure flags containers running close to their CPU or
// memory limit. Computed as a heuristic from metrics-server usage vs
// limits — actual CFS throttling needs cAdvisor counters we don't read.
type HealthResourcePressure struct {
	Namespace    string `json:"namespace"`
	PodName      string `json:"podName"`
	Container    string `json:"container"`
	Kind         string `json:"kind"` // "CPU" or "Memory"
	UsagePercent int    `json:"usagePercent"`
	Usage        string `json:"usage"` // human readable (e.g. "180m", "256Mi")
	Limit        string `json:"limit"`
}

type HealthResponse struct {
	Namespace          string                   `json:"namespace"`
	CrashLooping       []HealthPodIssue         `json:"crashLooping"`
	OOMKilled          []HealthPodIssue         `json:"oomKilled"`
	Pending            []HealthPodIssue         `json:"pending"`
	UnhealthyWorkloads []HealthWorkloadIssue    `json:"unhealthyWorkloads"`
	RecentWarnings     []HealthEvent            `json:"recentWarnings"`
	ResourcePressure   []HealthResourcePressure `json:"resourcePressure"`
	MetricsAvailable   bool                     `json:"metricsAvailable"`
}

const pendingThreshold = 5 * time.Minute
const warningWindow = 1 * time.Hour

// Get returns a categorized snapshot of unhealthy resources in the namespace.
func (h *HealthHandler) Get(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	resp := HealthResponse{
		Namespace:          namespace,
		CrashLooping:       []HealthPodIssue{},
		OOMKilled:          []HealthPodIssue{},
		Pending:            []HealthPodIssue{},
		UnhealthyWorkloads: []HealthWorkloadIssue{},
		RecentWarnings:     []HealthEvent{},
		ResourcePressure:   []HealthResourcePressure{},
	}
	now := time.Now()

	// Pods: scan container statuses for crashloops, OOM kills, and prolonged
	// pending phase.
	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{})
	if err == nil {
		for _, pod := range pods.Items {
			// Pending too long.
			if pod.Status.Phase == corev1.PodPending && now.Sub(pod.CreationTimestamp.Time) > pendingThreshold {
				resp.Pending = append(resp.Pending, HealthPodIssue{
					Namespace: pod.Namespace,
					Name:      pod.Name,
					Reason:    "Pending",
					Message:   pendingMessage(pod),
					Age:       formatAge(pod.CreationTimestamp.Time),
				})
			}
			// Container-level signals. Init containers crashloop too — kubelet
			// reports the same Waiting.Reason on InitContainerStatuses.
			allStatuses := append([]corev1.ContainerStatus{}, pod.Status.ContainerStatuses...)
			allStatuses = append(allStatuses, pod.Status.InitContainerStatuses...)
			for _, cs := range allStatuses {
				if cs.State.Waiting != nil {
					reason := cs.State.Waiting.Reason
					if reason == "CrashLoopBackOff" {
						resp.CrashLooping = append(resp.CrashLooping, HealthPodIssue{
							Namespace: pod.Namespace,
							Name:      pod.Name,
							Container: cs.Name,
							Reason:    reason,
							Message:   cs.State.Waiting.Message,
							Restarts:  cs.RestartCount,
							Age:       formatAge(pod.CreationTimestamp.Time),
						})
					}
				}
				if cs.LastTerminationState.Terminated != nil {
					tr := cs.LastTerminationState.Terminated
					if tr.Reason == "OOMKilled" && now.Sub(tr.FinishedAt.Time) < warningWindow {
						resp.OOMKilled = append(resp.OOMKilled, HealthPodIssue{
							Namespace: pod.Namespace,
							Name:      pod.Name,
							Container: cs.Name,
							Reason:    "OOMKilled",
							Message:   tr.Message,
							Restarts:  cs.RestartCount,
							Age:       formatAge(tr.FinishedAt.Time),
						})
					}
				}
			}
		}
	}

	// Workloads where ready < desired for > 5 minutes (treat creation time as
	// the start; controllers usually converge much faster than that).
	if deps, err := client.AppsV1().Deployments(namespace).List(context.Background(), metav1.ListOptions{}); err == nil {
		for _, d := range deps.Items {
			desired := int32(0)
			if d.Spec.Replicas != nil {
				desired = *d.Spec.Replicas
			}
			ready := d.Status.ReadyReplicas
			if ready < desired && now.Sub(d.CreationTimestamp.Time) > pendingThreshold {
				resp.UnhealthyWorkloads = append(resp.UnhealthyWorkloads, HealthWorkloadIssue{
					Kind: "Deployment", Namespace: d.Namespace, Name: d.Name,
					Ready: ready, Desired: desired, Age: formatAge(d.CreationTimestamp.Time),
				})
			}
		}
	}
	if sts, err := client.AppsV1().StatefulSets(namespace).List(context.Background(), metav1.ListOptions{}); err == nil {
		for _, s := range sts.Items {
			desired := int32(0)
			if s.Spec.Replicas != nil {
				desired = *s.Spec.Replicas
			}
			if s.Status.ReadyReplicas < desired && now.Sub(s.CreationTimestamp.Time) > pendingThreshold {
				resp.UnhealthyWorkloads = append(resp.UnhealthyWorkloads, HealthWorkloadIssue{
					Kind: "StatefulSet", Namespace: s.Namespace, Name: s.Name,
					Ready: s.Status.ReadyReplicas, Desired: desired, Age: formatAge(s.CreationTimestamp.Time),
				})
			}
		}
	}
	if dss, err := client.AppsV1().DaemonSets(namespace).List(context.Background(), metav1.ListOptions{}); err == nil {
		for _, d := range dss.Items {
			desired := d.Status.DesiredNumberScheduled
			if d.Status.NumberReady < desired && now.Sub(d.CreationTimestamp.Time) > pendingThreshold {
				resp.UnhealthyWorkloads = append(resp.UnhealthyWorkloads, HealthWorkloadIssue{
					Kind: "DaemonSet", Namespace: d.Namespace, Name: d.Name,
					Ready: d.Status.NumberReady, Desired: desired, Age: formatAge(d.CreationTimestamp.Time),
				})
			}
		}
	}

	// Recent warning events. The List endpoint already filters by namespace
	// at the API level when one is provided.
	if events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: "type=Warning",
	}); err == nil {
		for _, ev := range events.Items {
			at := ev.LastTimestamp.Time
			if at.IsZero() {
				at = ev.EventTime.Time
			}
			if at.IsZero() || now.Sub(at) > warningWindow {
				continue
			}
			resp.RecentWarnings = append(resp.RecentWarnings, HealthEvent{
				Namespace: ev.Namespace,
				Reason:    ev.Reason,
				Message:   ev.Message,
				Object:    ev.InvolvedObject.Kind + "/" + ev.InvolvedObject.Name,
				Count:     ev.Count,
				Age:       formatAge(at),
			})
		}
		sort.SliceStable(resp.RecentWarnings, func(i, j int) bool {
			return warningScore(resp.RecentWarnings[i]) > warningScore(resp.RecentWarnings[j])
		})
	}

	// Resource pressure: pods running near CPU or memory limit. Best-effort —
	// silently skip if metrics-server isn't reachable.
	if mc, err := h.k8s.GetMetricsClient(); err == nil {
		if pmList, err := mc.MetricsV1beta1().PodMetricses(namespace).List(context.Background(), metav1.ListOptions{}); err == nil {
			resp.MetricsAvailable = true
			// Index usage by ns/pod/container.
			type usage struct{ cpu, mem int64 }
			usageMap := map[string]usage{}
			for _, pm := range pmList.Items {
				for _, c := range pm.Containers {
					key := pm.Namespace + "/" + pm.Name + "/" + c.Name
					usageMap[key] = usage{
						cpu: c.Usage.Cpu().MilliValue(),
						mem: c.Usage.Memory().Value(),
					}
				}
			}
			for _, pod := range pods.Items {
				if pod.Status.Phase != corev1.PodRunning {
					continue
				}
				for _, c := range pod.Spec.Containers {
					limits := c.Resources.Limits
					u, ok := usageMap[pod.Namespace+"/"+pod.Name+"/"+c.Name]
					if !ok {
						continue
					}
					if cpuLim := limits.Cpu().MilliValue(); cpuLim >= 10 && u.cpu*100/cpuLim >= 95 {
						resp.ResourcePressure = append(resp.ResourcePressure, HealthResourcePressure{
							Namespace:    pod.Namespace,
							PodName:      pod.Name,
							Container:    c.Name,
							Kind:         "CPU",
							UsagePercent: int(u.cpu * 100 / cpuLim),
							Usage:        fmt.Sprintf("%dm", u.cpu),
							Limit:        fmt.Sprintf("%dm", cpuLim),
						})
					}
					if memLim := limits.Memory().Value(); memLim >= 64*1024*1024 && u.mem*100/memLim >= 90 {
						resp.ResourcePressure = append(resp.ResourcePressure, HealthResourcePressure{
							Namespace:    pod.Namespace,
							PodName:      pod.Name,
							Container:    c.Name,
							Kind:         "Memory",
							UsagePercent: int(u.mem * 100 / memLim),
							Usage:        humanBytes(u.mem),
							Limit:        humanBytes(memLim),
						})
					}
				}
			}
			sort.SliceStable(resp.ResourcePressure, func(i, j int) bool {
				return resp.ResourcePressure[i].UsagePercent > resp.ResourcePressure[j].UsagePercent
			})
		}
	}

	return resp, nil
}

func humanBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%dB", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f%ci", float64(b)/float64(div), "KMGTPE"[exp])
}

// pendingMessage extracts the most useful "why is this pod pending" message
// from container/init container waiting states. Falls back to the pod's own
// status.Message.
func pendingMessage(pod corev1.Pod) string {
	for _, cs := range pod.Status.InitContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Message != "" {
			return cs.State.Waiting.Reason + ": " + cs.State.Waiting.Message
		}
	}
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Message != "" {
			return cs.State.Waiting.Reason + ": " + cs.State.Waiting.Message
		}
	}
	if pod.Status.Message != "" {
		return pod.Status.Message
	}
	return ""
}

// warningScore ranks warning events by severity × repetition so the morning
// dashboard surfaces "OOMKilled x12" above "Pulling x1". Weights are coarse on
// purpose — we just need critical reasons to outrank chatter.
func warningScore(ev HealthEvent) int {
	weight := 1
	switch ev.Reason {
	case "OOMKilling", "OOMKilled",
		"BackOff", "CrashLoopBackOff",
		"FailedScheduling", "FailedMount", "FailedAttachVolume",
		"NodeNotReady", "Evicted":
		weight = 5
	case "Unhealthy",
		"FailedCreatePodSandBox", "FailedSync", "FailedKillPod",
		"FailedCreate", "FailedDelete", "FailedUpdate":
		weight = 4
	case "Failed", "NetworkNotReady", "EvictionThresholdMet", "ProbeWarning":
		weight = 3
	}
	count := int(ev.Count)
	if count < 1 {
		count = 1
	}
	return weight * count
}
