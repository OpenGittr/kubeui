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
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace"`
	Type            string            `json:"type"`
	ClusterIP       string            `json:"clusterIP"`
	ExternalIP      string            `json:"externalIP,omitempty"`
	Ports           []string          `json:"ports"`
	Age             string            `json:"age"`
	Labels          map[string]string `json:"labels,omitempty"`
	Selector        map[string]string `json:"selector,omitempty"`
	SessionAffinity string            `json:"sessionAffinity,omitempty"`
	PortDetails     []ServicePort     `json:"portDetails,omitempty"`
	Endpoints       []ServiceEndpoint `json:"endpoints,omitempty"`
}

type ServicePort struct {
	Name       string `json:"name"`
	Port       int32  `json:"port"`
	TargetPort string `json:"targetPort"`
	NodePort   int32  `json:"nodePort,omitempty"`
	Protocol   string `json:"protocol"`
}

type ServiceEndpoint struct {
	IP       string `json:"ip"`
	NodeName string `json:"nodeName,omitempty"`
	Ready    bool   `json:"ready"`
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

// Get returns details of a specific service
func (h *ServiceHandler) Get(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	svc, err := client.CoreV1().Services(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	var ports []string
	var portDetails []ServicePort
	for _, p := range svc.Spec.Ports {
		port := fmt.Sprintf("%d/%s", p.Port, p.Protocol)
		if p.NodePort > 0 {
			port = fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, p.Protocol)
		}
		ports = append(ports, port)

		portDetails = append(portDetails, ServicePort{
			Name:       p.Name,
			Port:       p.Port,
			TargetPort: p.TargetPort.String(),
			NodePort:   p.NodePort,
			Protocol:   string(p.Protocol),
		})
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

	info := ServiceInfo{
		Name:            svc.Name,
		Namespace:       svc.Namespace,
		Type:            string(svc.Spec.Type),
		ClusterIP:       svc.Spec.ClusterIP,
		ExternalIP:      externalIP,
		Ports:           ports,
		Age:             formatAge(svc.CreationTimestamp.Time),
		Labels:          svc.Labels,
		Selector:        svc.Spec.Selector,
		SessionAffinity: string(svc.Spec.SessionAffinity),
		PortDetails:     portDetails,
	}

	// Get endpoints
	endpoints, err := client.CoreV1().Endpoints(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err == nil {
		for _, subset := range endpoints.Subsets {
			for _, addr := range subset.Addresses {
				nodeName := ""
				if addr.NodeName != nil {
					nodeName = *addr.NodeName
				}
				info.Endpoints = append(info.Endpoints, ServiceEndpoint{
					IP:       addr.IP,
					NodeName: nodeName,
					Ready:    true,
				})
			}
			for _, addr := range subset.NotReadyAddresses {
				nodeName := ""
				if addr.NodeName != nil {
					nodeName = *addr.NodeName
				}
				info.Endpoints = append(info.Endpoints, ServiceEndpoint{
					IP:       addr.IP,
					NodeName: nodeName,
					Ready:    false,
				})
			}
		}
	}

	return info, nil
}

// Events returns events for a specific service
func (h *ServiceHandler) Events(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	fieldSelector := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s,involvedObject.kind=Service", name, namespace)
	events, err := client.CoreV1().Events(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return nil, err
	}

	type ServiceEvent struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
		Age     string `json:"age"`
	}

	var result []ServiceEvent
	for _, event := range events.Items {
		age := ""
		if !event.LastTimestamp.IsZero() {
			age = formatAge(event.LastTimestamp.Time)
		} else if !event.EventTime.IsZero() {
			age = formatAge(event.EventTime.Time)
		}

		result = append(result, ServiceEvent{
			Type:    event.Type,
			Reason:  event.Reason,
			Message: event.Message,
			Count:   event.Count,
			Age:     age,
		})
	}

	return result, nil
}
