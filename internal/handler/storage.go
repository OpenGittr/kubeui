package handler

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"gofr.dev/pkg/gofr"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

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
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	Status        string `json:"status"`
	Volume        string `json:"volume,omitempty"`
	Capacity      string `json:"capacity"`
	AccessModes   string `json:"accessModes"`
	StorageClass  string `json:"storageClass"`
	Age           string `json:"age"`
	UsedBytes     int64  `json:"usedBytes,omitempty"`
	CapacityBytes int64  `json:"capacityBytes,omitempty"`
	FillPercent   int    `json:"fillPercent,omitempty"`
}

// kubeletVolumeStats is the minimal slice of kubelet's
// /stats/summary response we read to pick up usedBytes/capacityBytes per
// PVC. Pulling the full schema would mean importing kubelet APIs.
type kubeletVolumeStats struct {
	Pods []struct {
		VolumeStats []struct {
			Name          string  `json:"name,omitempty"`
			UsedBytes     *uint64 `json:"usedBytes,omitempty"`
			CapacityBytes *uint64 `json:"capacityBytes,omitempty"`
			PVCRef        *struct {
				Name      string `json:"name,omitempty"`
				Namespace string `json:"namespace,omitempty"`
			} `json:"pvcRef,omitempty"`
		} `json:"volume,omitempty"`
	} `json:"pods,omitempty"`
}

// fetchPVCUsage scrapes kubelet's stats/summary API on each node that hosts
// pods mounting PVCs and returns a map keyed by "<ns>/<pvc>". Best-effort:
// requires nodes/proxy permission; silently returns an empty map on errors
// so the PVC list still renders without fill % data.
func fetchPVCUsage(client *kubernetes.Clientset, namespace string) map[string][2]int64 {
	result := map[string][2]int64{}

	pods, err := client.CoreV1().Pods("").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return result
	}

	// Collect target nodes (only ones with pods that mount a PVC in scope).
	nodes := map[string]bool{}
	for _, p := range pods.Items {
		if p.Spec.NodeName == "" {
			continue
		}
		for _, v := range p.Spec.Volumes {
			if v.PersistentVolumeClaim == nil {
				continue
			}
			if namespace != "" && p.Namespace != namespace {
				continue
			}
			nodes[p.Spec.NodeName] = true
			break
		}
	}

	if len(nodes) == 0 {
		return result
	}

	var mu sync.Mutex
	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	for node := range nodes {
		wg.Add(1)
		go func(node string) {
			defer wg.Done()
			data, err := client.CoreV1().RESTClient().Get().
				AbsPath("/api/v1/nodes", node, "proxy", "stats/summary").
				DoRaw(ctx)
			if err != nil {
				return
			}
			var s kubeletVolumeStats
			if err := json.Unmarshal(data, &s); err != nil {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			for _, p := range s.Pods {
				for _, vol := range p.VolumeStats {
					if vol.PVCRef == nil || vol.UsedBytes == nil || vol.CapacityBytes == nil {
						continue
					}
					key := vol.PVCRef.Namespace + "/" + vol.PVCRef.Name
					result[key] = [2]int64{int64(*vol.UsedBytes), int64(*vol.CapacityBytes)}
				}
			}
		}(node)
	}
	wg.Wait()
	return result
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

	usage := fetchPVCUsage(client, namespace)

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

		info := PVCInfo{
			Name:         pvc.Name,
			Namespace:    pvc.Namespace,
			Status:       string(pvc.Status.Phase),
			Volume:       pvc.Spec.VolumeName,
			Capacity:     capacity,
			AccessModes:  accessModes,
			StorageClass: storageClass,
			Age:          formatAge(pvc.CreationTimestamp.Time),
		}
		if u, ok := usage[pvc.Namespace+"/"+pvc.Name]; ok && u[1] > 0 {
			info.UsedBytes = u[0]
			info.CapacityBytes = u[1]
			info.FillPercent = int(u[0] * 100 / u[1])
		}
		result = append(result, info)
	}

	return result, nil
}
