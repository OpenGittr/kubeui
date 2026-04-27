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

type NodeHandler struct {
	k8s *service.K8sManager
}

func NewNodeHandler(k8s *service.K8sManager) *NodeHandler {
	return &NodeHandler{k8s: k8s}
}

type NodeInfo struct {
	Name             string            `json:"name"`
	Status           string            `json:"status"`
	Roles            string            `json:"roles"`
	Age              string            `json:"age"`
	Version          string            `json:"version"`
	InternalIP       string            `json:"internalIP"`
	ExternalIP       string            `json:"externalIP"`
	OS               string            `json:"os"`
	Kernel           string            `json:"kernel"`
	ContainerRuntime string            `json:"containerRuntime"`
	CPU              NodeResource      `json:"cpu"`
	Memory           NodeResource      `json:"memory"`
	Pods             NodeResource      `json:"pods"`
	Labels           map[string]string `json:"labels"`
	Conditions       []NodeCondition   `json:"conditions"`
	Unschedulable    bool              `json:"unschedulable"`
}

type NodeResource struct {
	Capacity  int64 `json:"capacity"`  // CPU in millicores, Memory in bytes, Pods as count
	Requested int64 `json:"requested"` // Currently requested/used
}

type NodeCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

func (h *NodeHandler) List(ctx *gofr.Context) (interface{}, error) {
	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Get all pods to count per node
	pods, err := client.CoreV1().Pods("").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Count pods and resource requests per node
	podCountByNode := make(map[string]int)
	cpuRequestsByNode := make(map[string]int64)    // millicores
	memoryRequestsByNode := make(map[string]int64) // bytes

	for _, pod := range pods.Items {
		if pod.Spec.NodeName != "" && pod.Status.Phase != "Succeeded" && pod.Status.Phase != "Failed" {
			podCountByNode[pod.Spec.NodeName]++

			// Sum up resource requests from all containers
			for _, container := range pod.Spec.Containers {
				if cpu := container.Resources.Requests.Cpu(); cpu != nil {
					cpuRequestsByNode[pod.Spec.NodeName] += cpu.MilliValue()
				}
				if mem := container.Resources.Requests.Memory(); mem != nil {
					memoryRequestsByNode[pod.Spec.NodeName] += mem.Value()
				}
			}
		}
	}

	var result []NodeInfo
	for _, node := range nodes.Items {
		// Determine status
		status := "Unknown"
		var conditions []NodeCondition
		for _, cond := range node.Status.Conditions {
			conditions = append(conditions, NodeCondition{
				Type:    string(cond.Type),
				Status:  string(cond.Status),
				Message: cond.Message,
			})
			if cond.Type == "Ready" {
				if cond.Status == "True" {
					status = "Ready"
				} else {
					status = "NotReady"
				}
			}
		}

		// Determine roles
		roles := ""
		for label := range node.Labels {
			if label == "node-role.kubernetes.io/control-plane" || label == "node-role.kubernetes.io/master" {
				if roles != "" {
					roles += ","
				}
				roles += "control-plane"
			} else if label == "node-role.kubernetes.io/worker" {
				if roles != "" {
					roles += ","
				}
				roles += "worker"
			}
		}
		if roles == "" {
			roles = "<none>"
		}

		// Get IPs
		internalIP := ""
		externalIP := ""
		for _, addr := range node.Status.Addresses {
			if addr.Type == "InternalIP" {
				internalIP = addr.Address
			} else if addr.Type == "ExternalIP" {
				externalIP = addr.Address
			}
		}

		// Raw resource data
		cpuCapacity := node.Status.Allocatable.Cpu().MilliValue()
		cpuRequested := cpuRequestsByNode[node.Name]

		memoryCapacity := node.Status.Allocatable.Memory().Value()
		memoryRequested := memoryRequestsByNode[node.Name]

		podsCapacity := node.Status.Allocatable.Pods().Value()
		currentPods := int64(podCountByNode[node.Name])

		result = append(result, NodeInfo{
			Name:             node.Name,
			Status:           status,
			Roles:            roles,
			Age:              formatAge(node.CreationTimestamp.Time),
			Version:          node.Status.NodeInfo.KubeletVersion,
			InternalIP:       internalIP,
			ExternalIP:       externalIP,
			OS:               node.Status.NodeInfo.OSImage,
			Kernel:           node.Status.NodeInfo.KernelVersion,
			ContainerRuntime: node.Status.NodeInfo.ContainerRuntimeVersion,
			CPU:              NodeResource{Capacity: cpuCapacity, Requested: cpuRequested},
			Memory:           NodeResource{Capacity: memoryCapacity, Requested: memoryRequested},
			Pods:             NodeResource{Capacity: podsCapacity, Requested: currentPods},
			Labels:           node.Labels,
			Conditions:       conditions,
			Unschedulable:    node.Spec.Unschedulable,
		})
	}

	return result, nil
}

type cordonRequest struct {
	Unschedulable bool `json:"unschedulable"`
}

// SetCordon sets node.spec.unschedulable. true = cordon (no new pods),
// false = uncordon. Draining existing pods is intentionally not implemented
// here — it requires orchestration (eviction loop) and is better done via
// kubectl or a dedicated tool.
func (h *NodeHandler) SetCordon(ctx *gofr.Context) (interface{}, error) {
	name := ctx.PathParam("name")

	var req cordonRequest
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	body, err := json.Marshal(map[string]interface{}{
		"spec": map[string]interface{}{"unschedulable": req.Unschedulable},
	})
	if err != nil {
		return nil, err
	}

	if _, err := client.CoreV1().Nodes().Patch(
		context.Background(), name, types.MergePatchType, body, metav1.PatchOptions{},
	); err != nil {
		return nil, err
	}

	action := "uncordoned"
	if req.Unschedulable {
		action = "cordoned"
	}
	return map[string]string{"message": fmt.Sprintf("Node %s %s", name, action)}, nil
}

type BinPackingNode struct {
	Name              string `json:"name"`
	AllocatableCPU    int64  `json:"allocatableCPU"`    // millicores
	AllocatableMemory int64  `json:"allocatableMemory"` // bytes
	AllocatablePods   int64  `json:"allocatablePods"`
	UsageCPU          int64  `json:"usageCPU"`    // 0 if metrics-server unavailable
	UsageMemory       int64  `json:"usageMemory"` // 0 if metrics-server unavailable
}

type BinPackingPod struct {
	Namespace     string `json:"namespace"`
	Name          string `json:"name"`
	Status        string `json:"status"`
	CPURequest    int64  `json:"cpuRequest"`    // millicores
	MemoryRequest int64  `json:"memoryRequest"` // bytes
	CPUUsage      int64  `json:"cpuUsage"`      // 0 if metrics-server unavailable for this pod
	MemoryUsage   int64  `json:"memoryUsage"`
}

type BinPackingResponse struct {
	Node             BinPackingNode  `json:"node"`
	Pods             []BinPackingPod `json:"pods"`
	MetricsAvailable bool            `json:"metricsAvailable"`
}

// BinPacking returns the per-pod CPU/memory request and actual-usage breakdown
// for a single node, alongside the node's allocatable capacity. Used by the
// frontend's bin-packing visualization to show who's eating the node and which
// pods are over-provisioned (large request, tiny actual usage).
func (h *NodeHandler) BinPacking(ctx *gofr.Context) (interface{}, error) {
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	node, err := client.CoreV1().Nodes().Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// All pods scheduled on this node (filter by spec.nodeName server-side).
	pods, err := client.CoreV1().Pods("").List(context.Background(), metav1.ListOptions{
		FieldSelector: fmt.Sprintf("spec.nodeName=%s", name),
	})
	if err != nil {
		return nil, err
	}

	// Best-effort metrics: if metrics-server isn't installed/reachable we
	// still return capacity + requests so the request bars work.
	usageByPod := map[string]struct{ cpu, mem int64 }{}
	var nodeCPUUsage, nodeMemUsage int64
	metricsAvailable := false
	if mc, err := h.k8s.GetMetricsClient(); err == nil {
		if nm, err := mc.MetricsV1beta1().NodeMetricses().Get(context.Background(), name, metav1.GetOptions{}); err == nil {
			nodeCPUUsage = nm.Usage.Cpu().MilliValue()
			nodeMemUsage = nm.Usage.Memory().Value()
			metricsAvailable = true
		}
		if pmList, err := mc.MetricsV1beta1().PodMetricses("").List(context.Background(), metav1.ListOptions{}); err == nil {
			for _, pm := range pmList.Items {
				var cpu, mem int64
				for _, c := range pm.Containers {
					cpu += c.Usage.Cpu().MilliValue()
					mem += c.Usage.Memory().Value()
				}
				usageByPod[pm.Namespace+"/"+pm.Name] = struct{ cpu, mem int64 }{cpu, mem}
			}
			metricsAvailable = true
		}
	}

	result := BinPackingResponse{
		Node: BinPackingNode{
			Name:              node.Name,
			AllocatableCPU:    node.Status.Allocatable.Cpu().MilliValue(),
			AllocatableMemory: node.Status.Allocatable.Memory().Value(),
			AllocatablePods:   node.Status.Allocatable.Pods().Value(),
			UsageCPU:          nodeCPUUsage,
			UsageMemory:       nodeMemUsage,
		},
		MetricsAvailable: metricsAvailable,
	}

	for _, pod := range pods.Items {
		// Skip terminated pods — they don't consume node capacity.
		if pod.Status.Phase == "Succeeded" || pod.Status.Phase == "Failed" {
			continue
		}
		var cpuReq, memReq int64
		for _, c := range pod.Spec.Containers {
			cpuReq += c.Resources.Requests.Cpu().MilliValue()
			memReq += c.Resources.Requests.Memory().Value()
		}
		usage := usageByPod[pod.Namespace+"/"+pod.Name]
		result.Pods = append(result.Pods, BinPackingPod{
			Namespace:     pod.Namespace,
			Name:          pod.Name,
			Status:        string(pod.Status.Phase),
			CPURequest:    cpuReq,
			MemoryRequest: memReq,
			CPUUsage:      usage.cpu,
			MemoryUsage:   usage.mem,
		})
	}

	return result, nil
}
