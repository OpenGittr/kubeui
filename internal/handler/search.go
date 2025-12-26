package handler

import (
	"context"
	"strings"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type SearchHandler struct {
	k8s *service.K8sManager
}

func NewSearchHandler(k8s *service.K8sManager) *SearchHandler {
	return &SearchHandler{k8s: k8s}
}

type SearchResult struct {
	Type      string `json:"type"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Status    string `json:"status,omitempty"`
	Age       string `json:"age"`
}

// Search searches across multiple resource types
func (h *SearchHandler) Search(ctx *gofr.Context) (interface{}, error) {
	query := strings.ToLower(ctx.Param("q"))
	namespace := ctx.Param("namespace")

	if query == "" {
		return []SearchResult{}, nil
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	var results []SearchResult

	// Search Pods
	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{})
	if err == nil {
		for _, pod := range pods.Items {
			if strings.Contains(strings.ToLower(pod.Name), query) {
				results = append(results, SearchResult{
					Type:      "Pod",
					Name:      pod.Name,
					Namespace: pod.Namespace,
					Status:    string(pod.Status.Phase),
					Age:       formatAge(pod.CreationTimestamp.Time),
				})
			}
			if len(results) >= 50 {
				break
			}
		}
	}

	// Search Deployments
	deployments, err := client.AppsV1().Deployments(namespace).List(context.Background(), metav1.ListOptions{})
	if err == nil {
		for _, dep := range deployments.Items {
			if strings.Contains(strings.ToLower(dep.Name), query) {
				results = append(results, SearchResult{
					Type:      "Deployment",
					Name:      dep.Name,
					Namespace: dep.Namespace,
					Age:       formatAge(dep.CreationTimestamp.Time),
				})
			}
			if len(results) >= 50 {
				break
			}
		}
	}

	// Search Services
	services, err := client.CoreV1().Services(namespace).List(context.Background(), metav1.ListOptions{})
	if err == nil {
		for _, svc := range services.Items {
			if strings.Contains(strings.ToLower(svc.Name), query) {
				results = append(results, SearchResult{
					Type:      "Service",
					Name:      svc.Name,
					Namespace: svc.Namespace,
					Age:       formatAge(svc.CreationTimestamp.Time),
				})
			}
			if len(results) >= 50 {
				break
			}
		}
	}

	// Search ConfigMaps
	configmaps, err := client.CoreV1().ConfigMaps(namespace).List(context.Background(), metav1.ListOptions{})
	if err == nil {
		for _, cm := range configmaps.Items {
			if strings.Contains(strings.ToLower(cm.Name), query) {
				results = append(results, SearchResult{
					Type:      "ConfigMap",
					Name:      cm.Name,
					Namespace: cm.Namespace,
					Age:       formatAge(cm.CreationTimestamp.Time),
				})
			}
			if len(results) >= 50 {
				break
			}
		}
	}

	// Search Secrets
	secrets, err := client.CoreV1().Secrets(namespace).List(context.Background(), metav1.ListOptions{})
	if err == nil {
		for _, sec := range secrets.Items {
			if strings.Contains(strings.ToLower(sec.Name), query) {
				results = append(results, SearchResult{
					Type:      "Secret",
					Name:      sec.Name,
					Namespace: sec.Namespace,
					Age:       formatAge(sec.CreationTimestamp.Time),
				})
			}
			if len(results) >= 50 {
				break
			}
		}
	}

	// Search Ingresses
	ingresses, err := client.NetworkingV1().Ingresses(namespace).List(context.Background(), metav1.ListOptions{})
	if err == nil {
		for _, ing := range ingresses.Items {
			if strings.Contains(strings.ToLower(ing.Name), query) {
				results = append(results, SearchResult{
					Type:      "Ingress",
					Name:      ing.Name,
					Namespace: ing.Namespace,
					Age:       formatAge(ing.CreationTimestamp.Time),
				})
			}
			if len(results) >= 50 {
				break
			}
		}
	}

	// Search DaemonSets
	daemonsets, err := client.AppsV1().DaemonSets(namespace).List(context.Background(), metav1.ListOptions{})
	if err == nil {
		for _, ds := range daemonsets.Items {
			if strings.Contains(strings.ToLower(ds.Name), query) {
				results = append(results, SearchResult{
					Type:      "DaemonSet",
					Name:      ds.Name,
					Namespace: ds.Namespace,
					Age:       formatAge(ds.CreationTimestamp.Time),
				})
			}
			if len(results) >= 50 {
				break
			}
		}
	}

	// Search StatefulSets
	statefulsets, err := client.AppsV1().StatefulSets(namespace).List(context.Background(), metav1.ListOptions{})
	if err == nil {
		for _, ss := range statefulsets.Items {
			if strings.Contains(strings.ToLower(ss.Name), query) {
				results = append(results, SearchResult{
					Type:      "StatefulSet",
					Name:      ss.Name,
					Namespace: ss.Namespace,
					Age:       formatAge(ss.CreationTimestamp.Time),
				})
			}
			if len(results) >= 50 {
				break
			}
		}
	}

	// Limit total results
	if len(results) > 50 {
		results = results[:50]
	}

	return results, nil
}
