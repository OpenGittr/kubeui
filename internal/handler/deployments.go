package handler

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gofr.dev/pkg/gofr"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"

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
	// Detailed fields
	Strategy          string                    `json:"strategy,omitempty"`
	Selector          map[string]string         `json:"selector,omitempty"`
	Images            []string                  `json:"images,omitempty"`
	ContainerDetails  []DeploymentContainer     `json:"containerDetails,omitempty"`
	Conditions        []DeploymentCondition     `json:"conditions,omitempty"`
	RunningContainers []RunningContainer        `json:"runningContainers,omitempty"`
}

// RunningContainer represents a container instance running in a pod
type RunningContainer struct {
	PodName       string        `json:"podName"`
	ContainerName string        `json:"containerName"`
	Ready         bool          `json:"ready"`
	State         string        `json:"state"`
	Restarts      int32         `json:"restarts"`
	CPU           ResourceUsage `json:"cpu"`
	Memory        ResourceUsage `json:"memory"`
}

type DeploymentContainer struct {
	Name   string                    `json:"name"`
	Image  string                    `json:"image"`
	CPU    ResourceUsage             `json:"cpu"`
	Memory ResourceUsage             `json:"memory"`
	Ports  []DeploymentContainerPort `json:"ports,omitempty"`
	Env    []EnvVar                  `json:"env,omitempty"`
}

// ResourceUsage is defined in pods.go

type DeploymentContainerPort struct {
	Name          string `json:"name,omitempty"`
	ContainerPort int32  `json:"containerPort"`
	Protocol      string `json:"protocol"`
}

type DeploymentCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
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

	// Fetch running containers from pods belonging to this deployment
	var runningContainers []RunningContainer
	if deployment.Spec.Selector != nil {
		runningContainers = h.fetchRunningContainers(namespace, deployment.Spec.Selector.MatchLabels)
	}

	return deploymentToInfoWithRunningContainers(deployment, runningContainers, client, namespace), nil
}

// fetchRunningContainers gets all running container instances from pods matching the selector
func (h *DeploymentHandler) fetchRunningContainers(namespace string, selector map[string]string) []RunningContainer {
	// Build label selector string
	var parts []string
	for k, v := range selector {
		parts = append(parts, fmt.Sprintf("%s=%s", k, v))
	}
	labelSelector := strings.Join(parts, ",")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil
	}

	// List pods matching the selector
	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil
	}

	// Get metrics if available
	metricsMap := make(map[string]map[string]ContainerResource) // podName -> containerName -> metrics
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

	var result []RunningContainer
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

			rc := RunningContainer{
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

// Events returns events for a specific deployment
func (h *DeploymentHandler) Events(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	// Get events filtered by the deployment
	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=Deployment", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type DeploymentEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []DeploymentEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, DeploymentEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}

func deploymentToInfo(d *appsv1.Deployment, detailed bool) DeploymentInfo {
	return deploymentToInfoWithRunningContainers(d, nil, nil, "")
}

func deploymentToInfoWithRunningContainers(d *appsv1.Deployment, runningContainers []RunningContainer, client kubernetes.Interface, namespace string) DeploymentInfo {
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

	info.Labels = d.Labels
	info.Strategy = string(d.Spec.Strategy.Type)
	if d.Spec.Selector != nil {
		info.Selector = d.Spec.Selector.MatchLabels
	}

	for _, c := range d.Spec.Template.Spec.Containers {
		info.Containers = append(info.Containers, c.Name)
		info.Images = append(info.Images, c.Image)

		container := DeploymentContainer{
			Name:  c.Name,
			Image: c.Image,
		}

		// Parse resource requests/limits
		if c.Resources.Requests != nil {
			if cpu := c.Resources.Requests.Cpu(); cpu != nil {
				container.CPU.Request = cpu.MilliValue()
			}
			if mem := c.Resources.Requests.Memory(); mem != nil {
				container.Memory.Request = mem.Value()
			}
		}
		if c.Resources.Limits != nil {
			if cpu := c.Resources.Limits.Cpu(); cpu != nil {
				container.CPU.Limit = cpu.MilliValue()
			}
			if mem := c.Resources.Limits.Memory(); mem != nil {
				container.Memory.Limit = mem.Value()
			}
		}

		// Parse ports
		for _, p := range c.Ports {
			container.Ports = append(container.Ports, DeploymentContainerPort{
				Name:          p.Name,
				ContainerPort: p.ContainerPort,
				Protocol:      string(p.Protocol),
			})
		}

		// Parse envFrom (configmaps and secrets loaded in bulk)
		for _, ef := range c.EnvFrom {
			if ef.ConfigMapRef != nil {
				prefix := ef.Prefix
				cmName := ef.ConfigMapRef.Name
				// Try to fetch the ConfigMap and expand keys with values
				if client != nil && namespace != "" {
					cm, err := client.CoreV1().ConfigMaps(namespace).Get(context.Background(), cmName, metav1.GetOptions{})
					if err == nil {
						for key, value := range cm.Data {
							container.Env = append(container.Env, EnvVar{
								Name:      prefix + key,
								Value:     value,
								ValueFrom: fmt.Sprintf("configmap:%s/%s", cmName, key),
							})
						}
						continue
					}
				}
				// Fallback if can't fetch ConfigMap
				container.Env = append(container.Env, EnvVar{
					Name:      fmt.Sprintf("%s* (all keys)", prefix),
					ValueFrom: fmt.Sprintf("configmap:%s", cmName),
				})
			} else if ef.SecretRef != nil {
				prefix := ef.Prefix
				secretName := ef.SecretRef.Name
				// Try to fetch the Secret and expand keys with values
				if client != nil && namespace != "" {
					secret, err := client.CoreV1().Secrets(namespace).Get(context.Background(), secretName, metav1.GetOptions{})
					if err == nil {
						for key, value := range secret.Data {
							container.Env = append(container.Env, EnvVar{
								Name:      prefix + key,
								Value:     string(value),
								ValueFrom: fmt.Sprintf("secret:%s/%s", secretName, key),
							})
						}
						continue
					}
				}
				// Fallback if can't fetch Secret
				container.Env = append(container.Env, EnvVar{
					Name:      fmt.Sprintf("%s* (all keys)", prefix),
					ValueFrom: fmt.Sprintf("secret:%s", secretName),
				})
			}
		}

		// Parse environment variables
		for _, e := range c.Env {
			ev := EnvVar{Name: e.Name}
			if e.Value != "" {
				ev.Value = e.Value
			} else if e.ValueFrom != nil {
				if e.ValueFrom.ConfigMapKeyRef != nil {
					cmName := e.ValueFrom.ConfigMapKeyRef.Name
					cmKey := e.ValueFrom.ConfigMapKeyRef.Key
					ev.ValueFrom = fmt.Sprintf("configmap:%s/%s", cmName, cmKey)
					// Fetch actual value from ConfigMap
					if client != nil && namespace != "" {
						cm, err := client.CoreV1().ConfigMaps(namespace).Get(context.Background(), cmName, metav1.GetOptions{})
						if err == nil {
							if val, ok := cm.Data[cmKey]; ok {
								ev.Value = val
							}
						}
					}
				} else if e.ValueFrom.SecretKeyRef != nil {
					secretName := e.ValueFrom.SecretKeyRef.Name
					secretKey := e.ValueFrom.SecretKeyRef.Key
					ev.ValueFrom = fmt.Sprintf("secret:%s/%s", secretName, secretKey)
					// Fetch actual value from Secret
					if client != nil && namespace != "" {
						secret, err := client.CoreV1().Secrets(namespace).Get(context.Background(), secretName, metav1.GetOptions{})
						if err == nil {
							if val, ok := secret.Data[secretKey]; ok {
								ev.Value = string(val)
							}
						}
					}
				} else if e.ValueFrom.FieldRef != nil {
					ev.ValueFrom = fmt.Sprintf("field:%s", e.ValueFrom.FieldRef.FieldPath)
				} else if e.ValueFrom.ResourceFieldRef != nil {
					ev.ValueFrom = fmt.Sprintf("resource:%s", e.ValueFrom.ResourceFieldRef.Resource)
				}
			}
			container.Env = append(container.Env, ev)
		}

		info.ContainerDetails = append(info.ContainerDetails, container)
	}

	// Parse conditions
	for _, cond := range d.Status.Conditions {
		info.Conditions = append(info.Conditions, DeploymentCondition{
			Type:    string(cond.Type),
			Status:  string(cond.Status),
			Reason:  cond.Reason,
			Message: cond.Message,
		})
	}

	// Add running containers
	info.RunningContainers = runningContainers

	return info
}
