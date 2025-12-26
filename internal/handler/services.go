package handler

import (
	"context"
	"fmt"
	"strings"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type ServiceHandler struct {
	k8s *service.K8sManager
}

func NewServiceHandler(k8s *service.K8sManager) *ServiceHandler {
	return &ServiceHandler{k8s: k8s}
}

type ServiceInfo struct {
	Name       string   `json:"name"`
	Namespace  string   `json:"namespace"`
	Type       string   `json:"type"`
	ClusterIP  string   `json:"clusterIP"`
	ExternalIP string   `json:"externalIP,omitempty"`
	Ports      []string `json:"ports"`
	Age        string   `json:"age"`
}

func (h *ServiceHandler) List(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	services, err := client.CoreV1().Services(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ServiceInfo
	for _, svc := range services.Items {
		var ports []string
		for _, p := range svc.Spec.Ports {
			port := fmt.Sprintf("%d/%s", p.Port, p.Protocol)
			if p.NodePort > 0 {
				port = fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, p.Protocol)
			}
			ports = append(ports, port)
		}

		externalIP := ""
		if len(svc.Status.LoadBalancer.Ingress) > 0 {
			ips := []string{}
			for _, ing := range svc.Status.LoadBalancer.Ingress {
				if ing.IP != "" {
					ips = append(ips, ing.IP)
				} else if ing.Hostname != "" {
					ips = append(ips, ing.Hostname)
				}
			}
			externalIP = strings.Join(ips, ",")
		} else if len(svc.Spec.ExternalIPs) > 0 {
			externalIP = strings.Join(svc.Spec.ExternalIPs, ",")
		}

		result = append(result, ServiceInfo{
			Name:       svc.Name,
			Namespace:  svc.Namespace,
			Type:       string(svc.Spec.Type),
			ClusterIP:  svc.Spec.ClusterIP,
			ExternalIP: externalIP,
			Ports:      ports,
			Age:        formatAge(svc.CreationTimestamp.Time),
		})
	}

	return result, nil
}

func (h *ServiceHandler) Delete(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	err = client.CoreV1().Services(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	if err != nil {
		return nil, err
	}

	return map[string]string{"message": fmt.Sprintf("Service %s deleted", name)}, nil
}
