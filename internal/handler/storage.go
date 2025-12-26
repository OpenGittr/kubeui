package handler

import (
	"context"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type StorageHandler struct {
	k8s *service.K8sManager
}

func NewStorageHandler(k8s *service.K8sManager) *StorageHandler {
	return &StorageHandler{k8s: k8s}
}

type PVInfo struct {
	Name         string `json:"name"`
	Capacity     string `json:"capacity"`
	AccessModes  string `json:"accessModes"`
	ReclaimPolicy string `json:"reclaimPolicy"`
	Status       string `json:"status"`
	Claim        string `json:"claim,omitempty"`
	StorageClass string `json:"storageClass"`
	Age          string `json:"age"`
}

type PVCInfo struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Status       string `json:"status"`
	Volume       string `json:"volume,omitempty"`
	Capacity     string `json:"capacity"`
	AccessModes  string `json:"accessModes"`
	StorageClass string `json:"storageClass"`
	Age          string `json:"age"`
}

func (h *StorageHandler) ListPVs(ctx *gofr.Context) (interface{}, error) {
	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	pvs, err := client.CoreV1().PersistentVolumes().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PVInfo
	for _, pv := range pvs.Items {
		claim := ""
		if pv.Spec.ClaimRef != nil {
			claim = pv.Spec.ClaimRef.Namespace + "/" + pv.Spec.ClaimRef.Name
		}

		accessModes := ""
		for i, m := range pv.Spec.AccessModes {
			if i > 0 {
				accessModes += ","
			}
			accessModes += string(m)
		}

		capacity := ""
		if q, ok := pv.Spec.Capacity["storage"]; ok {
			capacity = q.String()
		}

		result = append(result, PVInfo{
			Name:          pv.Name,
			Capacity:      capacity,
			AccessModes:   accessModes,
			ReclaimPolicy: string(pv.Spec.PersistentVolumeReclaimPolicy),
			Status:        string(pv.Status.Phase),
			Claim:         claim,
			StorageClass:  pv.Spec.StorageClassName,
			Age:           formatAge(pv.CreationTimestamp.Time),
		})
	}

	return result, nil
}

type StorageClassInfo struct {
	Name              string `json:"name"`
	Provisioner       string `json:"provisioner"`
	ReclaimPolicy     string `json:"reclaimPolicy"`
	VolumeBindingMode string `json:"volumeBindingMode"`
	AllowExpansion    bool   `json:"allowExpansion"`
	IsDefault         bool   `json:"isDefault"`
	Age               string `json:"age"`
}

func (h *StorageHandler) ListStorageClasses(ctx *gofr.Context) (interface{}, error) {
	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	scs, err := client.StorageV1().StorageClasses().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []StorageClassInfo
	for _, sc := range scs.Items {
		reclaimPolicy := "Delete"
		if sc.ReclaimPolicy != nil {
			reclaimPolicy = string(*sc.ReclaimPolicy)
		}

		volumeBindingMode := "Immediate"
		if sc.VolumeBindingMode != nil {
			volumeBindingMode = string(*sc.VolumeBindingMode)
		}

		allowExpansion := false
		if sc.AllowVolumeExpansion != nil {
			allowExpansion = *sc.AllowVolumeExpansion
		}

		isDefault := false
		if val, ok := sc.Annotations["storageclass.kubernetes.io/is-default-class"]; ok && val == "true" {
			isDefault = true
		}

		result = append(result, StorageClassInfo{
			Name:              sc.Name,
			Provisioner:       sc.Provisioner,
			ReclaimPolicy:     reclaimPolicy,
			VolumeBindingMode: volumeBindingMode,
			AllowExpansion:    allowExpansion,
			IsDefault:         isDefault,
			Age:               formatAge(sc.CreationTimestamp.Time),
		})
	}

	return result, nil
}

func (h *StorageHandler) ListPVCs(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	pvcs, err := client.CoreV1().PersistentVolumeClaims(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PVCInfo
	for _, pvc := range pvcs.Items {
		accessModes := ""
		for i, m := range pvc.Spec.AccessModes {
			if i > 0 {
				accessModes += ","
			}
			accessModes += string(m)
		}

		capacity := ""
		if pvc.Status.Capacity != nil {
			if q, ok := pvc.Status.Capacity["storage"]; ok {
				capacity = q.String()
			}
		}

		storageClass := ""
		if pvc.Spec.StorageClassName != nil {
			storageClass = *pvc.Spec.StorageClassName
		}

		result = append(result, PVCInfo{
			Name:         pvc.Name,
			Namespace:    pvc.Namespace,
			Status:       string(pvc.Status.Phase),
			Volume:       pvc.Spec.VolumeName,
			Capacity:     capacity,
			AccessModes:  accessModes,
			StorageClass: storageClass,
			Age:          formatAge(pvc.CreationTimestamp.Time),
		})
	}

	return result, nil
}
