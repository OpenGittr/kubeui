package handler

import (
	"context"
	"fmt"
	"sort"
	"sync"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type NamespaceHandler struct {
	k8s *service.K8sManager
}

func NewNamespaceHandler(k8s *service.K8sManager) *NamespaceHandler {
	return &NamespaceHandler{k8s: k8s}
}

type NamespaceInfo struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Age    string `json:"age"`
}

// List returns all namespaces in the current cluster
func (h *NamespaceHandler) List(ctx *gofr.Context) (interface{}, error) {
	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	namespaces, err := client.CoreV1().Namespaces().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []NamespaceInfo
	for _, ns := range namespaces.Items {
		result = append(result, NamespaceInfo{
			Name:   ns.Name,
			Status: string(ns.Status.Phase),
			Age:    formatAge(ns.CreationTimestamp.Time),
		})
	}

	return result, nil
}

// protectedNamespaces can't be deleted from the UI. The API server already
// refuses default/kube-system/kube-public; kube-node-lease is allowed by the
// API but deleting it breaks node heartbeats.
var protectedNamespaces = map[string]bool{
	"default":         true,
	"kube-system":     true,
	"kube-public":     true,
	"kube-node-lease": true,
}

// NamespaceContentGroup is one resource kind found inside a namespace.
// Error is set when the kind couldn't be listed (usually RBAC), so the UI can
// say the inventory is incomplete instead of implying the kind is empty.
type NamespaceContentGroup struct {
	Kind  string   `json:"kind"`
	Count int      `json:"count"`
	Names []string `json:"names"`
	Error string   `json:"error,omitempty"`
}

type NamespaceContents struct {
	Namespace string                  `json:"namespace"`
	Status    string                  `json:"status"`
	Protected bool                    `json:"protected"`
	Groups    []NamespaceContentGroup `json:"groups"`
}

// objectNames returns the names of a typed list's items, dropping skip.
func objectNames[T any, PT interface {
	*T
	GetName() string
}](items []T, skip string) []string {
	out := make([]string, 0, len(items))
	for i := range items {
		if n := PT(&items[i]).GetName(); n != skip {
			out = append(out, n)
		}
	}
	return out
}

// Contents inventories the built-in resources inside a namespace so the UI can
// show what a delete would take down. Custom resources are not enumerated.
func (h *NamespaceHandler) Contents(ctx *gofr.Context) (interface{}, error) {
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	ns, err := client.CoreV1().Namespaces().Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	c := context.Background()
	opts := metav1.ListOptions{}
	// Each lister returns the object names for one kind. Objects Kubernetes
	// creates in every namespace (default SA, kube-root-ca.crt) are skipped
	// since they say nothing about what the user has deployed there.
	listers := []struct {
		kind string
		list func() ([]string, error)
	}{
		{"Deployment", func() ([]string, error) {
			l, err := client.AppsV1().Deployments(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"StatefulSet", func() ([]string, error) {
			l, err := client.AppsV1().StatefulSets(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"DaemonSet", func() ([]string, error) {
			l, err := client.AppsV1().DaemonSets(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"CronJob", func() ([]string, error) {
			l, err := client.BatchV1().CronJobs(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"Job", func() ([]string, error) {
			l, err := client.BatchV1().Jobs(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"Pod", func() ([]string, error) {
			l, err := client.CoreV1().Pods(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"PersistentVolumeClaim", func() ([]string, error) {
			l, err := client.CoreV1().PersistentVolumeClaims(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"Service", func() ([]string, error) {
			l, err := client.CoreV1().Services(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"Ingress", func() ([]string, error) {
			l, err := client.NetworkingV1().Ingresses(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"ConfigMap", func() ([]string, error) {
			l, err := client.CoreV1().ConfigMaps(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, "kube-root-ca.crt"), nil
		}},
		{"Secret", func() ([]string, error) {
			l, err := client.CoreV1().Secrets(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"ServiceAccount", func() ([]string, error) {
			l, err := client.CoreV1().ServiceAccounts(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, "default"), nil
		}},
		{"HorizontalPodAutoscaler", func() ([]string, error) {
			l, err := client.AutoscalingV2().HorizontalPodAutoscalers(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"NetworkPolicy", func() ([]string, error) {
			l, err := client.NetworkingV1().NetworkPolicies(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"Role", func() ([]string, error) {
			l, err := client.RbacV1().Roles(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"RoleBinding", func() ([]string, error) {
			l, err := client.RbacV1().RoleBindings(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"ResourceQuota", func() ([]string, error) {
			l, err := client.CoreV1().ResourceQuotas(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
		{"LimitRange", func() ([]string, error) {
			l, err := client.CoreV1().LimitRanges(name).List(c, opts)
			if err != nil {
				return nil, err
			}
			return objectNames(l.Items, ""), nil
		}},
	}

	// Fan out: listing ~18 kinds serially is noticeably slow on remote clusters.
	groups := make([]NamespaceContentGroup, len(listers))
	var wg sync.WaitGroup
	for idx, l := range listers {
		wg.Add(1)
		go func(idx int, kind string, list func() ([]string, error)) {
			defer wg.Done()
			names, err := list()
			g := NamespaceContentGroup{Kind: kind}
			if err != nil {
				g.Error = err.Error()
			} else {
				sort.Strings(names)
				g.Count = len(names)
				g.Names = names
			}
			groups[idx] = g
		}(idx, l.kind, l.list)
	}
	wg.Wait()

	// Keep only non-empty kinds and kinds we couldn't read; order is preserved
	// so workloads come first, matching how people think about blast radius.
	result := make([]NamespaceContentGroup, 0, len(groups))
	for _, g := range groups {
		if g.Count > 0 || g.Error != "" {
			result = append(result, g)
		}
	}

	return NamespaceContents{
		Namespace: ns.Name,
		Status:    string(ns.Status.Phase),
		Protected: protectedNamespaces[ns.Name],
		Groups:    result,
	}, nil
}

// Delete removes a namespace and, via Kubernetes garbage collection, everything in it.
func (h *NamespaceHandler) Delete(ctx *gofr.Context) (interface{}, error) {
	name := ctx.PathParam("name")
	if protectedNamespaces[name] {
		return nil, fmt.Errorf("namespace %s is a system namespace and cannot be deleted from kubeui", name)
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.CoreV1().Namespaces().Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("Namespace %s deletion started", name)}, nil
}
