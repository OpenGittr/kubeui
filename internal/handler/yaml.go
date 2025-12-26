package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"gopkg.in/yaml.v3"

	"gofr.dev/pkg/gofr"
	appsv1 "k8s.io/api/apps/v1"
	authv1 "k8s.io/api/authorization/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	k8syaml "sigs.k8s.io/yaml"

	"github.com/opengittr/kubeui/internal/service"
)

var errInvalidResourceType = errors.New("invalid resource type")

type YAMLHandler struct {
	k8s *service.K8sManager
}

func NewYAMLHandler(k8s *service.K8sManager) *YAMLHandler {
	return &YAMLHandler{k8s: k8s}
}

// resourceMeta holds API version, kind, and resource info for permission checks
type resourceMeta struct {
	apiVersion string
	kind       string
	group      string
	resource   string
}

var resourceMetaMap = map[string]resourceMeta{
	"pods":            {apiVersion: "v1", kind: "Pod", group: "", resource: "pods"},
	"deployments":     {apiVersion: "apps/v1", kind: "Deployment", group: "apps", resource: "deployments"},
	"services":        {apiVersion: "v1", kind: "Service", group: "", resource: "services"},
	"configmaps":      {apiVersion: "v1", kind: "ConfigMap", group: "", resource: "configmaps"},
	"secrets":         {apiVersion: "v1", kind: "Secret", group: "", resource: "secrets"},
	"jobs":            {apiVersion: "batch/v1", kind: "Job", group: "batch", resource: "jobs"},
	"cronjobs":        {apiVersion: "batch/v1", kind: "CronJob", group: "batch", resource: "cronjobs"},
	"pvcs":            {apiVersion: "v1", kind: "PersistentVolumeClaim", group: "", resource: "persistentvolumeclaims"},
	"pvs":             {apiVersion: "v1", kind: "PersistentVolume", group: "", resource: "persistentvolumes"},
	"statefulsets":    {apiVersion: "apps/v1", kind: "StatefulSet", group: "apps", resource: "statefulsets"},
	"daemonsets":      {apiVersion: "apps/v1", kind: "DaemonSet", group: "apps", resource: "daemonsets"},
	"replicasets":     {apiVersion: "apps/v1", kind: "ReplicaSet", group: "apps", resource: "replicasets"},
	"namespaces":      {apiVersion: "v1", kind: "Namespace", group: "", resource: "namespaces"},
	"nodes":           {apiVersion: "v1", kind: "Node", group: "", resource: "nodes"},
	"ingresses":       {apiVersion: "networking.k8s.io/v1", kind: "Ingress", group: "networking.k8s.io", resource: "ingresses"},
	"endpoints":       {apiVersion: "v1", kind: "Endpoints", group: "", resource: "endpoints"},
	"networkpolicies": {apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", group: "networking.k8s.io", resource: "networkpolicies"},
	"hpas":            {apiVersion: "autoscaling/v2", kind: "HorizontalPodAutoscaler", group: "autoscaling", resource: "horizontalpodautoscalers"},
	"events":          {apiVersion: "v1", kind: "Event", group: "", resource: "events"},
	"storageclasses":  {apiVersion: "storage.k8s.io/v1", kind: "StorageClass", group: "storage.k8s.io", resource: "storageclasses"},
	"serviceaccounts": {apiVersion: "v1", kind: "ServiceAccount", group: "", resource: "serviceaccounts"},
	"resourcequotas":  {apiVersion: "v1", kind: "ResourceQuota", group: "", resource: "resourcequotas"},
	"limitranges":     {apiVersion: "v1", kind: "LimitRange", group: "", resource: "limitranges"},
}

// YAMLResponse includes the YAML and edit permission
type YAMLResponse struct {
	YAML    string `json:"yaml"`
	CanEdit bool   `json:"canEdit"`
}

// Get returns the YAML representation of a Kubernetes resource
func (h *YAMLHandler) Get(ctx *gofr.Context) (interface{}, error) {
	resourceType := ctx.PathParam("type")
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	meta, ok := resourceMetaMap[resourceType]
	if !ok {
		return nil, errInvalidResourceType
	}

	var obj interface{}

	switch resourceType {
	case "pods":
		pod, e := client.CoreV1().Pods(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		pod.APIVersion = meta.apiVersion
		pod.Kind = meta.kind
		obj = pod
	case "deployments":
		deploy, e := client.AppsV1().Deployments(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		deploy.APIVersion = meta.apiVersion
		deploy.Kind = meta.kind
		obj = deploy
	case "services":
		svc, e := client.CoreV1().Services(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		svc.APIVersion = meta.apiVersion
		svc.Kind = meta.kind
		obj = svc
	case "configmaps":
		cm, e := client.CoreV1().ConfigMaps(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		cm.APIVersion = meta.apiVersion
		cm.Kind = meta.kind
		obj = cm
	case "secrets":
		secret, e := client.CoreV1().Secrets(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		secret.APIVersion = meta.apiVersion
		secret.Kind = meta.kind
		// Secrets need special ordering (type before data)
		yamlStr, marshalErr := h.marshalWithOrder(secret, []string{"apiVersion", "kind", "metadata", "type", "immutable"}, []string{"stringData", "data"})
		if marshalErr != nil {
			return nil, marshalErr
		}
		canEdit := h.checkUpdatePermission(client, meta, namespace, name)
		return YAMLResponse{YAML: yamlStr, CanEdit: canEdit}, nil
	case "jobs":
		job, e := client.BatchV1().Jobs(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		job.APIVersion = meta.apiVersion
		job.Kind = meta.kind
		obj = job
	case "cronjobs":
		cj, e := client.BatchV1().CronJobs(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		cj.APIVersion = meta.apiVersion
		cj.Kind = meta.kind
		obj = cj
	case "pvcs":
		pvc, e := client.CoreV1().PersistentVolumeClaims(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		pvc.APIVersion = meta.apiVersion
		pvc.Kind = meta.kind
		obj = pvc
	case "statefulsets":
		ss, e := client.AppsV1().StatefulSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		ss.APIVersion = meta.apiVersion
		ss.Kind = meta.kind
		obj = ss
	case "daemonsets":
		ds, e := client.AppsV1().DaemonSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		ds.APIVersion = meta.apiVersion
		ds.Kind = meta.kind
		obj = ds
	case "replicasets":
		rs, e := client.AppsV1().ReplicaSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		rs.APIVersion = meta.apiVersion
		rs.Kind = meta.kind
		obj = rs
	case "ingresses":
		ing, e := client.NetworkingV1().Ingresses(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		ing.APIVersion = meta.apiVersion
		ing.Kind = meta.kind
		obj = ing
	case "endpoints":
		ep, e := client.CoreV1().Endpoints(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		ep.APIVersion = meta.apiVersion
		ep.Kind = meta.kind
		obj = ep
	case "networkpolicies":
		np, e := client.NetworkingV1().NetworkPolicies(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		np.APIVersion = meta.apiVersion
		np.Kind = meta.kind
		obj = np
	case "hpas":
		hpa, e := client.AutoscalingV2().HorizontalPodAutoscalers(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		hpa.APIVersion = meta.apiVersion
		hpa.Kind = meta.kind
		obj = hpa
	case "events":
		event, e := client.CoreV1().Events(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		event.APIVersion = meta.apiVersion
		event.Kind = meta.kind
		obj = event
	case "serviceaccounts":
		sa, e := client.CoreV1().ServiceAccounts(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		sa.APIVersion = meta.apiVersion
		sa.Kind = meta.kind
		obj = sa
	case "resourcequotas":
		rq, e := client.CoreV1().ResourceQuotas(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		rq.APIVersion = meta.apiVersion
		rq.Kind = meta.kind
		obj = rq
	case "limitranges":
		lr, e := client.CoreV1().LimitRanges(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		lr.APIVersion = meta.apiVersion
		lr.Kind = meta.kind
		obj = lr
	default:
		return nil, errInvalidResourceType
	}

	// Standard ordering for most resources
	yamlStr, marshalErr := h.marshalWithOrder(obj, []string{"apiVersion", "kind", "metadata", "spec"}, []string{"status"})
	if marshalErr != nil {
		return nil, marshalErr
	}

	canEdit := h.checkUpdatePermission(client, meta, namespace, name)
	return YAMLResponse{YAML: yamlStr, CanEdit: canEdit}, nil
}

// GetClusterScoped returns YAML for cluster-scoped resources
func (h *YAMLHandler) GetClusterScoped(ctx *gofr.Context) (interface{}, error) {
	resourceType := ctx.PathParam("type")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	meta, ok := resourceMetaMap[resourceType]
	if !ok {
		return nil, errInvalidResourceType
	}

	var obj interface{}

	switch resourceType {
	case "pvs":
		pv, e := client.CoreV1().PersistentVolumes().Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		pv.APIVersion = meta.apiVersion
		pv.Kind = meta.kind
		obj = pv
	case "namespaces":
		ns, e := client.CoreV1().Namespaces().Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		ns.APIVersion = meta.apiVersion
		ns.Kind = meta.kind
		obj = ns
	case "nodes":
		node, e := client.CoreV1().Nodes().Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		node.APIVersion = meta.apiVersion
		node.Kind = meta.kind
		obj = node
	case "storageclasses":
		sc, e := client.StorageV1().StorageClasses().Get(context.Background(), name, metav1.GetOptions{})
		if e != nil {
			return nil, e
		}
		sc.APIVersion = meta.apiVersion
		sc.Kind = meta.kind
		obj = sc
	default:
		return nil, errInvalidResourceType
	}

	yamlStr, marshalErr := h.marshalWithOrder(obj, []string{"apiVersion", "kind", "metadata", "spec"}, []string{"status"})
	if marshalErr != nil {
		return nil, marshalErr
	}

	canEdit := h.checkUpdatePermission(client, meta, "", name)
	return YAMLResponse{YAML: yamlStr, CanEdit: canEdit}, nil
}

// marshalWithOrder marshals an object with specific field ordering
// topKeys are added first in order, bottomKeys are added last in order
// All other keys are added in between in their natural order
func (h *YAMLHandler) marshalWithOrder(obj interface{}, topKeys, bottomKeys []string) (string, error) {
	yamlBytes, err := k8syaml.Marshal(obj)
	if err != nil {
		return "", err
	}

	var raw map[string]interface{}
	if err := yaml.Unmarshal(yamlBytes, &raw); err != nil {
		return "", err
	}

	root := &yaml.Node{Kind: yaml.MappingNode}

	addKeyValue := func(key string, val interface{}) {
		keyNode := &yaml.Node{Kind: yaml.ScalarNode, Value: key}
		valNode := &yaml.Node{}
		valBytes, _ := yaml.Marshal(val)
		var docNode yaml.Node
		_ = yaml.Unmarshal(valBytes, &docNode)
		if len(docNode.Content) > 0 {
			*valNode = *docNode.Content[0]
		}
		root.Content = append(root.Content, keyNode, valNode)
	}

	// Track which keys we've added
	added := make(map[string]bool)

	// Add top keys first
	for _, key := range topKeys {
		if val, ok := raw[key]; ok {
			addKeyValue(key, val)
			added[key] = true
		}
	}

	// Mark bottom keys as handled (will be added later)
	for _, key := range bottomKeys {
		added[key] = true
	}

	// Add remaining keys in natural order
	for key, val := range raw {
		if !added[key] {
			addKeyValue(key, val)
		}
	}

	// Add bottom keys last
	for _, key := range bottomKeys {
		if val, ok := raw[key]; ok {
			addKeyValue(key, val)
		}
	}

	result, err := yaml.Marshal(root)
	if err != nil {
		return "", err
	}

	return string(result), nil
}

// Update applies YAML changes to a namespaced resource
func (h *YAMLHandler) Update(ctx *gofr.Context) (interface{}, error) {
	resourceType := ctx.PathParam("type")
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	var req struct {
		YAML string `json:"yaml"`
	}
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	meta, ok := resourceMetaMap[resourceType]
	if !ok {
		return nil, errInvalidResourceType
	}

	// Check permission first
	if !h.checkUpdatePermission(client, meta, namespace, name) {
		return nil, errors.New("permission denied: cannot update this resource")
	}

	// Parse the YAML and apply it
	return h.applyResource(client, resourceType, namespace, name, req.YAML)
}

// UpdateClusterScoped applies YAML changes to a cluster-scoped resource
func (h *YAMLHandler) UpdateClusterScoped(ctx *gofr.Context) (interface{}, error) {
	resourceType := ctx.PathParam("type")
	name := ctx.PathParam("name")

	var req struct {
		YAML string `json:"yaml"`
	}
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	meta, ok := resourceMetaMap[resourceType]
	if !ok {
		return nil, errInvalidResourceType
	}

	// Check permission first
	if !h.checkUpdatePermission(client, meta, "", name) {
		return nil, errors.New("permission denied: cannot update this resource")
	}

	// Parse the YAML and apply it
	return h.applyResource(client, resourceType, "", name, req.YAML)
}

// applyResource applies YAML to a Kubernetes resource
func (h *YAMLHandler) applyResource(client *kubernetes.Clientset, resourceType, namespace, name, yamlContent string) (interface{}, error) {
	// Convert YAML to JSON for the Kubernetes API
	jsonBytes, err := k8syaml.YAMLToJSON([]byte(yamlContent))
	if err != nil {
		return nil, fmt.Errorf("invalid YAML: %w", err)
	}

	switch resourceType {
	case "pods":
		var pod corev1.Pod
		if err := json.Unmarshal(jsonBytes, &pod); err != nil {
			return nil, err
		}
		_, err = client.CoreV1().Pods(namespace).Update(context.Background(), &pod, metav1.UpdateOptions{})
	case "deployments":
		var deploy appsv1.Deployment
		if err := json.Unmarshal(jsonBytes, &deploy); err != nil {
			return nil, err
		}
		_, err = client.AppsV1().Deployments(namespace).Update(context.Background(), &deploy, metav1.UpdateOptions{})
	case "services":
		var svc corev1.Service
		if err := json.Unmarshal(jsonBytes, &svc); err != nil {
			return nil, err
		}
		_, err = client.CoreV1().Services(namespace).Update(context.Background(), &svc, metav1.UpdateOptions{})
	case "configmaps":
		var cm corev1.ConfigMap
		if err := json.Unmarshal(jsonBytes, &cm); err != nil {
			return nil, err
		}
		_, err = client.CoreV1().ConfigMaps(namespace).Update(context.Background(), &cm, metav1.UpdateOptions{})
	case "secrets":
		var secret corev1.Secret
		if err := json.Unmarshal(jsonBytes, &secret); err != nil {
			return nil, err
		}
		_, err = client.CoreV1().Secrets(namespace).Update(context.Background(), &secret, metav1.UpdateOptions{})
	case "jobs":
		var job batchv1.Job
		if err := json.Unmarshal(jsonBytes, &job); err != nil {
			return nil, err
		}
		_, err = client.BatchV1().Jobs(namespace).Update(context.Background(), &job, metav1.UpdateOptions{})
	case "cronjobs":
		var cj batchv1.CronJob
		if err := json.Unmarshal(jsonBytes, &cj); err != nil {
			return nil, err
		}
		_, err = client.BatchV1().CronJobs(namespace).Update(context.Background(), &cj, metav1.UpdateOptions{})
	case "pvcs":
		var pvc corev1.PersistentVolumeClaim
		if err := json.Unmarshal(jsonBytes, &pvc); err != nil {
			return nil, err
		}
		_, err = client.CoreV1().PersistentVolumeClaims(namespace).Update(context.Background(), &pvc, metav1.UpdateOptions{})
	case "pvs":
		var pv corev1.PersistentVolume
		if err := json.Unmarshal(jsonBytes, &pv); err != nil {
			return nil, err
		}
		_, err = client.CoreV1().PersistentVolumes().Update(context.Background(), &pv, metav1.UpdateOptions{})
	case "statefulsets":
		var ss appsv1.StatefulSet
		if err := json.Unmarshal(jsonBytes, &ss); err != nil {
			return nil, err
		}
		_, err = client.AppsV1().StatefulSets(namespace).Update(context.Background(), &ss, metav1.UpdateOptions{})
	case "daemonsets":
		var ds appsv1.DaemonSet
		if err := json.Unmarshal(jsonBytes, &ds); err != nil {
			return nil, err
		}
		_, err = client.AppsV1().DaemonSets(namespace).Update(context.Background(), &ds, metav1.UpdateOptions{})
	case "namespaces":
		var ns corev1.Namespace
		if err := json.Unmarshal(jsonBytes, &ns); err != nil {
			return nil, err
		}
		_, err = client.CoreV1().Namespaces().Update(context.Background(), &ns, metav1.UpdateOptions{})
	case "nodes":
		var node corev1.Node
		if err := json.Unmarshal(jsonBytes, &node); err != nil {
			return nil, err
		}
		_, err = client.CoreV1().Nodes().Update(context.Background(), &node, metav1.UpdateOptions{})
	case "replicasets":
		var rs appsv1.ReplicaSet
		if err := json.Unmarshal(jsonBytes, &rs); err != nil {
			return nil, err
		}
		_, err = client.AppsV1().ReplicaSets(namespace).Update(context.Background(), &rs, metav1.UpdateOptions{})
	case "ingresses":
		var ing networkingv1.Ingress
		if err := json.Unmarshal(jsonBytes, &ing); err != nil {
			return nil, err
		}
		_, err = client.NetworkingV1().Ingresses(namespace).Update(context.Background(), &ing, metav1.UpdateOptions{})
	case "endpoints":
		var ep corev1.Endpoints
		if err := json.Unmarshal(jsonBytes, &ep); err != nil {
			return nil, err
		}
		_, err = client.CoreV1().Endpoints(namespace).Update(context.Background(), &ep, metav1.UpdateOptions{})
	case "networkpolicies":
		var np networkingv1.NetworkPolicy
		if err := json.Unmarshal(jsonBytes, &np); err != nil {
			return nil, err
		}
		_, err = client.NetworkingV1().NetworkPolicies(namespace).Update(context.Background(), &np, metav1.UpdateOptions{})
	case "hpas":
		var hpa autoscalingv2.HorizontalPodAutoscaler
		if err := json.Unmarshal(jsonBytes, &hpa); err != nil {
			return nil, err
		}
		_, err = client.AutoscalingV2().HorizontalPodAutoscalers(namespace).Update(context.Background(), &hpa, metav1.UpdateOptions{})
	default:
		return nil, errInvalidResourceType
	}

	if err != nil {
		return nil, err
	}

	return map[string]string{"status": "updated"}, nil
}

// checkUpdatePermission checks if the current user can update the resource
func (h *YAMLHandler) checkUpdatePermission(client interface{}, meta resourceMeta, namespace, name string) bool {
	k8sClient, ok := h.k8s.GetClientset()
	if !ok {
		return false
	}

	sar := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Namespace: namespace,
				Verb:      "update",
				Group:     meta.group,
				Resource:  meta.resource,
				Name:      name,
			},
		},
	}

	result, err := k8sClient.AuthorizationV1().SelfSubjectAccessReviews().Create(
		context.Background(),
		sar,
		metav1.CreateOptions{},
	)
	if err != nil {
		return false
	}

	return result.Status.Allowed
}
