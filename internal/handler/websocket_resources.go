package handler

import (
	"context"
	"fmt"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func fetchPodsSummary(client *kubernetes.Clientset, namespace string, ctx context.Context) (*ResourceSummary, error) {
	opts := metav1.ListOptions{}
	var pods *corev1.PodList
	var err error

	if namespace != "" {
		pods, err = client.CoreV1().Pods(namespace).List(ctx, opts)
	} else {
		pods, err = client.CoreV1().Pods("").List(ctx, opts)
	}
	if err != nil {
		return nil, err
	}

	summary := &ResourceSummary{
		Total: len(pods.Items),
		Items: make([]ResourceItem, 0, minInt(len(pods.Items), 50)),
	}

	for i, pod := range pods.Items {
		status := string(pod.Status.Phase)

		switch status {
		case "Running", "Succeeded":
			summary.Healthy++
		case "Pending":
			summary.Warning++
		default:
			summary.Error++
		}

		if i < 50 {
			ready := "0/0"
			readyCount := 0
			totalContainers := len(pod.Spec.Containers)
			for _, cs := range pod.Status.ContainerStatuses {
				if cs.Ready {
					readyCount++
				}
			}
			ready = fmt.Sprintf("%d/%d", readyCount, totalContainers)

			summary.Items = append(summary.Items, ResourceItem{
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Status:    status,
				Ready:     ready,
				Age:       formatAgeDuration(pod.CreationTimestamp.Time),
			})
		}
	}

	return summary, nil
}

func fetchDeploymentsSummary(client *kubernetes.Clientset, namespace string, ctx context.Context) (*ResourceSummary, error) {
	opts := metav1.ListOptions{}
	var deployments *appsv1.DeploymentList
	var err error

	if namespace != "" {
		deployments, err = client.AppsV1().Deployments(namespace).List(ctx, opts)
	} else {
		deployments, err = client.AppsV1().Deployments("").List(ctx, opts)
	}
	if err != nil {
		return nil, err
	}

	summary := &ResourceSummary{
		Total: len(deployments.Items),
		Items: make([]ResourceItem, 0, minInt(len(deployments.Items), 50)),
	}

	for i, deploy := range deployments.Items {
		ready := deploy.Status.ReadyReplicas
		desired := deploy.Status.Replicas
		if deploy.Spec.Replicas != nil {
			desired = *deploy.Spec.Replicas
		}

		var status string
		if ready == desired && desired > 0 {
			summary.Healthy++
			status = "Available"
		} else if ready > 0 {
			summary.Warning++
			status = "Progressing"
		} else {
			summary.Error++
			status = "Unavailable"
		}

		if i < 50 {
			summary.Items = append(summary.Items, ResourceItem{
				Name:      deploy.Name,
				Namespace: deploy.Namespace,
				Status:    status,
				Ready:     fmt.Sprintf("%d/%d", ready, desired),
				Age:       formatAgeDuration(deploy.CreationTimestamp.Time),
			})
		}
	}

	return summary, nil
}

func fetchServicesSummary(client *kubernetes.Clientset, namespace string, ctx context.Context) (*ResourceSummary, error) {
	opts := metav1.ListOptions{}
	var services *corev1.ServiceList
	var err error

	if namespace != "" {
		services, err = client.CoreV1().Services(namespace).List(ctx, opts)
	} else {
		services, err = client.CoreV1().Services("").List(ctx, opts)
	}
	if err != nil {
		return nil, err
	}

	summary := &ResourceSummary{
		Total:   len(services.Items),
		Healthy: len(services.Items),
		Items:   make([]ResourceItem, 0, minInt(len(services.Items), 50)),
	}

	for i, svc := range services.Items {
		if i < 50 {
			summary.Items = append(summary.Items, ResourceItem{
				Name:      svc.Name,
				Namespace: svc.Namespace,
				Status:    string(svc.Spec.Type),
				Age:       formatAgeDuration(svc.CreationTimestamp.Time),
			})
		}
	}

	return summary, nil
}

func fetchNodesSummary(client *kubernetes.Clientset, ctx context.Context) (*ResourceSummary, error) {
	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	summary := &ResourceSummary{
		Total: len(nodes.Items),
		Items: make([]ResourceItem, 0, len(nodes.Items)),
	}

	for _, node := range nodes.Items {
		status := "Unknown"
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady {
				if condition.Status == corev1.ConditionTrue {
					status = "Ready"
					summary.Healthy++
				} else {
					status = "NotReady"
					summary.Error++
				}
				break
			}
		}

		summary.Items = append(summary.Items, ResourceItem{
			Name:   node.Name,
			Status: status,
			Age:    formatAgeDuration(node.CreationTimestamp.Time),
		})
	}

	return summary, nil
}

func fetchEventsSummary(client *kubernetes.Clientset, namespace string, ctx context.Context) (*ResourceSummary, error) {
	opts := metav1.ListOptions{}
	var events *corev1.EventList
	var err error

	if namespace != "" {
		events, err = client.CoreV1().Events(namespace).List(ctx, opts)
	} else {
		events, err = client.CoreV1().Events("").List(ctx, opts)
	}
	if err != nil {
		return nil, err
	}

	cutoff := time.Now().Add(-5 * time.Minute)
	summary := &ResourceSummary{
		Items: make([]ResourceItem, 0, 20),
	}

	for _, event := range events.Items {
		eventTime := event.LastTimestamp.Time
		if eventTime.IsZero() {
			eventTime = event.CreationTimestamp.Time
		}

		if eventTime.After(cutoff) {
			summary.Total++
			if event.Type == "Warning" {
				summary.Warning++
			} else {
				summary.Healthy++
			}

			if len(summary.Items) < 20 {
				summary.Items = append(summary.Items, ResourceItem{
					Name:      event.InvolvedObject.Name,
					Namespace: event.Namespace,
					Status:    event.Type + ": " + event.Reason,
					Age:       formatAgeDuration(eventTime),
				})
			}
		}
	}

	return summary, nil
}

func formatAgeDuration(t time.Time) string {
	d := time.Since(t)
	if d < time.Minute {
		return "just now"
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
