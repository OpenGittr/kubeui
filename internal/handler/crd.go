package handler

import (
	"context"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	"github.com/opengittr/kubeui/internal/service"
)

type CRDHandler struct {
	k8s *service.K8sManager
}

func NewCRDHandler(k8s *service.K8sManager) *CRDHandler {
	return &CRDHandler{k8s: k8s}
}

type CRDInfo struct {
	Name       string `json:"name"`
	Group      string `json:"group"`
	Version    string `json:"version"`
	Kind       string `json:"kind"`
	Scope      string `json:"scope"`
	ShortNames string `json:"shortNames"`
}

type CRInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Age       string `json:"age"`
}

// ListCRDs returns all Custom Resource Definitions in the cluster
func (h *CRDHandler) ListCRDs(ctx *gofr.Context) (interface{}, error) {
	config, err := h.k8s.GetConfig()
	if err != nil {
		return nil, err
	}

	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	crdGVR := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	list, err := dynClient.Resource(crdGVR).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var crds []CRDInfo
	for _, item := range list.Items {
		spec, _, _ := unstructured.NestedMap(item.Object, "spec")
		group, _, _ := unstructured.NestedString(spec, "group")
		scope, _, _ := unstructured.NestedString(spec, "scope")

		names, _, _ := unstructured.NestedMap(spec, "names")
		kind, _, _ := unstructured.NestedString(names, "kind")
		shortNamesSlice, _, _ := unstructured.NestedStringSlice(names, "shortNames")
		shortNames := ""
		if len(shortNamesSlice) > 0 {
			for i, sn := range shortNamesSlice {
				if i > 0 {
					shortNames += ", "
				}
				shortNames += sn
			}
		}

		// Get the served version
		versions, _, _ := unstructured.NestedSlice(spec, "versions")
		version := ""
		for _, v := range versions {
			vMap, ok := v.(map[string]interface{})
			if !ok {
				continue
			}
			served, _, _ := unstructured.NestedBool(vMap, "served")
			if served {
				version, _, _ = unstructured.NestedString(vMap, "name")
				break
			}
		}

		crds = append(crds, CRDInfo{
			Name:       item.GetName(),
			Group:      group,
			Version:    version,
			Kind:       kind,
			Scope:      scope,
			ShortNames: shortNames,
		})
	}

	return crds, nil
}

// ListCRInstances returns instances of a specific Custom Resource
func (h *CRDHandler) ListCRInstances(ctx *gofr.Context) (interface{}, error) {
	group := ctx.PathParam("group")
	version := ctx.PathParam("version")
	resource := ctx.PathParam("resource")
	namespace := ctx.Param("namespace")

	config, err := h.k8s.GetConfig()
	if err != nil {
		return nil, err
	}

	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	gvr := schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: resource,
	}

	var list *unstructured.UnstructuredList
	if namespace != "" {
		list, err = dynClient.Resource(gvr).Namespace(namespace).List(context.Background(), metav1.ListOptions{})
	} else {
		list, err = dynClient.Resource(gvr).List(context.Background(), metav1.ListOptions{})
	}

	if err != nil {
		return nil, err
	}

	var crs []CRInfo
	for _, item := range list.Items {
		crs = append(crs, CRInfo{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			Age:       formatAge(item.GetCreationTimestamp().Time),
		})
	}

	return crs, nil
}

// GetCRInstance returns a specific Custom Resource instance
func (h *CRDHandler) GetCRInstance(ctx *gofr.Context) (interface{}, error) {
	group := ctx.PathParam("group")
	version := ctx.PathParam("version")
	resource := ctx.PathParam("resource")
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	config, err := h.k8s.GetConfig()
	if err != nil {
		return nil, err
	}

	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	gvr := schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: resource,
	}

	var obj *unstructured.Unstructured
	if namespace != "" {
		obj, err = dynClient.Resource(gvr).Namespace(namespace).Get(context.Background(), name, metav1.GetOptions{})
	} else {
		obj, err = dynClient.Resource(gvr).Get(context.Background(), name, metav1.GetOptions{})
	}

	if err != nil {
		return nil, err
	}

	return obj.Object, nil
}
