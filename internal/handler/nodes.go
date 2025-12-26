package handler

import (
	"context"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

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
		})
	}

	return result, nil
}
