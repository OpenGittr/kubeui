package handler

import (
	"context"
	"fmt"
	"time"

	"gofr.dev/pkg/gofr"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	"github.com/opengittr/kubeui/internal/service"
)

type DeploymentHandler struct {
	k8s *service.K8sManager
}

func NewDeploymentHandler(k8s *service.K8sManager) *DeploymentHandler {
	return &DeploymentHandler{k8s: k8s}
}

type DeploymentInfo struct {
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Ready      string            `json:"ready"`
	UpToDate   int32             `json:"upToDate"`
	Available  int32             `json:"available"`
	Age        string            `json:"age"`
	Replicas   int32             `json:"replicas"`
	Labels     map[string]string `json:"labels,omitempty"`
	Containers []string          `json:"containers,omitempty"`
}

// List returns all deployments, optionally filtered by namespace
func (h *DeploymentHandler) List(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")
	if namespace == "" {
		namespace = "" // empty means all namespaces
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	deployments, err := client.AppsV1().Deployments(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []DeploymentInfo
	for _, d := range deployments.Items {
		result = append(result, deploymentToInfo(&d, false))
	}

	return result, nil
}

// Get returns details of a specific deployment
func (h *DeploymentHandler) Get(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	deployment, err := client.AppsV1().Deployments(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	return deploymentToInfo(deployment, true), nil
}

type scaleRequest struct {
	Replicas int32 `json:"replicas"`
}

// Scale changes the number of replicas for a deployment
func (h *DeploymentHandler) Scale(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	var req scaleRequest
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	scale, err := client.AppsV1().Deployments(namespace).GetScale(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	scale.Spec.Replicas = req.Replicas
	_, err = client.AppsV1().Deployments(namespace).UpdateScale(context.Background(), name, scale, metav1.UpdateOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"message":  fmt.Sprintf("Deployment %s scaled to %d replicas", name, req.Replicas),
		"replicas": req.Replicas,
	}, nil
}

// Restart triggers a rolling restart of a deployment
func (h *DeploymentHandler) Restart(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	// Add a restart annotation to trigger rolling update
	patch := fmt.Sprintf(`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		time.Now().Format(time.RFC3339))

	_, err = client.AppsV1().Deployments(namespace).Patch(
		context.Background(),
		name,
		types.StrategicMergePatchType,
		[]byte(patch),
		metav1.PatchOptions{},
	)
	if err != nil {
		return nil, err
	}

	return map[string]string{
		"message": fmt.Sprintf("Deployment %s restarting", name),
	}, nil
}

// Delete removes a deployment
func (h *DeploymentHandler) Delete(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.AppsV1().Deployments(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("Deployment %s deleted", name)}, nil
}

func deploymentToInfo(d *appsv1.Deployment, detailed bool) DeploymentInfo {
	replicas := int32(0)
	if d.Spec.Replicas != nil {
		replicas = *d.Spec.Replicas
	}

	info := DeploymentInfo{
		Name:      d.Name,
		Namespace: d.Namespace,
		Ready:     fmt.Sprintf("%d/%d", d.Status.ReadyReplicas, replicas),
		UpToDate:  d.Status.UpdatedReplicas,
		Available: d.Status.AvailableReplicas,
		Age:       formatAge(d.CreationTimestamp.Time),
		Replicas:  replicas,
	}

	if detailed {
		info.Labels = d.Labels
		for _, c := range d.Spec.Template.Spec.Containers {
			info.Containers = append(info.Containers, c.Name)
		}
	}

	return info
}
