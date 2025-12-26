package handler

import (
	"context"
	"fmt"
	"strings"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type NetworkHandler struct {
	k8s *service.K8sManager
}

func NewNetworkHandler(k8s *service.K8sManager) *NetworkHandler {
	return &NetworkHandler{k8s: k8s}
}

// Ingress info
type IngressInfo struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Class     string   `json:"class"`
	Hosts     []string `json:"hosts"`
	Address   string   `json:"address"`
	Ports     string   `json:"ports"`
	Age       string   `json:"age"`
}

func (h *NetworkHandler) ListIngresses(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	ingresses, err := client.NetworkingV1().Ingresses(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []IngressInfo
	for _, ing := range ingresses.Items {
		// Get class
		class := "<none>"
		if ing.Spec.IngressClassName != nil {
			class = *ing.Spec.IngressClassName
		}

		// Get hosts
		var hosts []string
		for _, rule := range ing.Spec.Rules {
			if rule.Host != "" {
				hosts = append(hosts, rule.Host)
			}
		}
		if len(hosts) == 0 {
			hosts = []string{"*"}
		}

		// Get address
		var addresses []string
		for _, lb := range ing.Status.LoadBalancer.Ingress {
			if lb.IP != "" {
				addresses = append(addresses, lb.IP)
			} else if lb.Hostname != "" {
				addresses = append(addresses, lb.Hostname)
			}
		}
		address := strings.Join(addresses, ", ")
		if address == "" {
			address = "<pending>"
		}

		// Get ports
		ports := "80"
		for _, tls := range ing.Spec.TLS {
			if len(tls.Hosts) > 0 {
				ports = "80, 443"
				break
			}
		}

		result = append(result, IngressInfo{
			Name:      ing.Name,
			Namespace: ing.Namespace,
			Class:     class,
			Hosts:     hosts,
			Address:   address,
			Ports:     ports,
			Age:       formatAge(ing.CreationTimestamp.Time),
		})
	}

	return result, nil
}

// Endpoint info
type EndpointInfo struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Endpoints string   `json:"endpoints"`
	Age       string   `json:"age"`
}

func (h *NetworkHandler) ListEndpoints(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	endpoints, err := client.CoreV1().Endpoints(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []EndpointInfo
	for _, ep := range endpoints.Items {
		var addrs []string
		for _, subset := range ep.Subsets {
			for _, addr := range subset.Addresses {
				for _, port := range subset.Ports {
					addrs = append(addrs, fmt.Sprintf("%s:%d", addr.IP, port.Port))
				}
			}
		}

		epStr := strings.Join(addrs, ", ")
		if epStr == "" {
			epStr = "<none>"
		}
		if len(addrs) > 3 {
			epStr = fmt.Sprintf("%s + %d more...", strings.Join(addrs[:3], ", "), len(addrs)-3)
		}

		result = append(result, EndpointInfo{
			Name:      ep.Name,
			Namespace: ep.Namespace,
			Endpoints: epStr,
			Age:       formatAge(ep.CreationTimestamp.Time),
		})
	}

	return result, nil
}

// NetworkPolicy info
type NetworkPolicyInfo struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	PodSelector string `json:"podSelector"`
	PolicyTypes string `json:"policyTypes"`
	Age         string `json:"age"`
}

func (h *NetworkHandler) ListNetworkPolicies(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	policies, err := client.NetworkingV1().NetworkPolicies(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []NetworkPolicyInfo
	for _, np := range policies.Items {
		// Pod selector
		podSelector := "<all>"
		if len(np.Spec.PodSelector.MatchLabels) > 0 {
			var selectors []string
			for k, v := range np.Spec.PodSelector.MatchLabels {
				selectors = append(selectors, fmt.Sprintf("%s=%s", k, v))
			}
			podSelector = strings.Join(selectors, ", ")
		}

		// Policy types
		var types []string
		for _, pt := range np.Spec.PolicyTypes {
			types = append(types, string(pt))
		}
		policyTypes := strings.Join(types, ", ")
		if policyTypes == "" {
			policyTypes = "Ingress"
		}

		result = append(result, NetworkPolicyInfo{
			Name:        np.Name,
			Namespace:   np.Namespace,
			PodSelector: podSelector,
			PolicyTypes: policyTypes,
			Age:         formatAge(np.CreationTimestamp.Time),
		})
	}

	return result, nil
}

func (h *NetworkHandler) DeleteIngress(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.NetworkingV1().Ingresses(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("Ingress %s deleted", name)}, nil
}

func (h *NetworkHandler) DeleteNetworkPolicy(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.NetworkingV1().NetworkPolicies(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("NetworkPolicy %s deleted", name)}, nil
}
