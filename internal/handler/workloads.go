package handler

import (
	"context"
	"fmt"

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
	Name            string `json:"name"`
	Namespace       string `json:"namespace"`
	Desired         int32  `json:"desired"`
	Current         int32  `json:"current"`
	Ready           int32  `json:"ready"`
	UpToDate        int32  `json:"upToDate"`
	Available       int32  `json:"available"`
	NodeSelector    string `json:"nodeSelector"`
	Age             string `json:"age"`
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

// StatefulSet info
type StatefulSetInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Ready     string `json:"ready"`
	Replicas  int32  `json:"replicas"`
	Age       string `json:"age"`
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

// ReplicaSet info
type ReplicaSetInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Desired   int32  `json:"desired"`
	Current   int32  `json:"current"`
	Ready     int32  `json:"ready"`
	Age       string `json:"age"`
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
