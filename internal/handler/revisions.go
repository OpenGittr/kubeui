package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"

	"gofr.dev/pkg/gofr"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"

	"github.com/opengittr/kubeui/internal/service"
)

type RevisionsHandler struct {
	k8s *service.K8sManager
}

func NewRevisionsHandler(k8s *service.K8sManager) *RevisionsHandler {
	return &RevisionsHandler{k8s: k8s}
}

// RevisionInfo is the shape returned for one rollout entry. We keep this
// small — UI just wants "what was deployed when, by which image".
type RevisionInfo struct {
	Revision    int64    `json:"revision"`
	Name        string   `json:"name,omitempty"` // ControllerRevision name; empty for Deployments
	CreatedAt   string   `json:"createdAt"`
	Age         string   `json:"age"`
	Images      []string `json:"images"`
	ChangeCause string   `json:"changeCause,omitempty"`
	Current     bool     `json:"current"`
}

func containerImages(cs []corev1.Container) []string {
	out := make([]string, 0, len(cs))
	for _, c := range cs {
		out = append(out, c.Image)
	}
	return out
}

// imagesFromControllerRevision decodes only the container images from a
// ControllerRevision's serialized template-patch payload. The full schema
// is large; we walk the JSON map to keep the dependency surface minimal.
func imagesFromControllerRevision(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var doc map[string]interface{}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil
	}
	// spec.template.spec.containers[*].image
	get := func(m map[string]interface{}, key string) map[string]interface{} {
		if v, ok := m[key].(map[string]interface{}); ok {
			return v
		}
		return nil
	}
	tmpl := get(get(doc, "spec"), "template")
	if tmpl == nil {
		return nil
	}
	spec := get(tmpl, "spec")
	if spec == nil {
		return nil
	}
	cs, ok := spec["containers"].([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(cs))
	for _, c := range cs {
		if cm, ok := c.(map[string]interface{}); ok {
			if img, ok := cm["image"].(string); ok {
				out = append(out, img)
			}
		}
	}
	return out
}

func ownedByUID(refs []metav1.OwnerReference, uid types.UID) bool {
	for _, r := range refs {
		if r.UID == uid {
			return true
		}
	}
	return false
}

// DeploymentRevisions returns history derived from the owned ReplicaSets —
// same data kubectl rollout history reads.
func (h *RevisionsHandler) DeploymentRevisions(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	deploy, err := client.AppsV1().Deployments(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	rsList, err := client.AppsV1().ReplicaSets(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	currentRev := deploy.Annotations["deployment.kubernetes.io/revision"]
	revs := []RevisionInfo{}
	for _, rs := range rsList.Items {
		if !ownedByUID(rs.OwnerReferences, deploy.UID) {
			continue
		}
		revStr := rs.Annotations["deployment.kubernetes.io/revision"]
		revNum, _ := strconv.ParseInt(revStr, 10, 64)
		revs = append(revs, RevisionInfo{
			Revision:    revNum,
			CreatedAt:   rs.CreationTimestamp.UTC().Format("2006-01-02T15:04:05Z"),
			Age:         formatAge(rs.CreationTimestamp.Time),
			Images:      containerImages(rs.Spec.Template.Spec.Containers),
			ChangeCause: rs.Annotations["kubernetes.io/change-cause"],
			Current:     revStr == currentRev,
		})
	}
	sort.Slice(revs, func(i, j int) bool { return revs[i].Revision > revs[j].Revision })
	return revs, nil
}

// StatefulSetRevisions returns history from ControllerRevisions owned by
// the StatefulSet.
func (h *RevisionsHandler) StatefulSetRevisions(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	sts, err := client.AppsV1().StatefulSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	return controllerRevisionsFor(client, namespace, sts.UID, sts.Status.CurrentRevision)
}

// DaemonSetRevisions: same as StatefulSet but DaemonSet doesn't expose a
// CurrentRevision field, so the active one is identified by the live
// pod-template-hash on the DaemonSet's spec.template.
func (h *RevisionsHandler) DaemonSetRevisions(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	ds, err := client.AppsV1().DaemonSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	current := ds.Spec.Template.Labels["controller-revision-hash"]
	return controllerRevisionsFor(client, namespace, ds.UID, current)
}

// RollbackDeployment reverts a Deployment to the pod template captured by
// an owned ReplicaSet. Same mechanism kubectl rollout undo uses since the
// deployments/rollback subresource was removed in k8s 1.16: strip the
// pod-template-hash label from the target RS's template and strategic-merge
// patch that back onto the Deployment.
func (h *RevisionsHandler) RollbackDeployment(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	var req struct {
		Revision int64 `json:"revision"`
	}
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}
	if req.Revision <= 0 {
		return nil, errors.New("revision must be positive")
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	deploy, err := client.AppsV1().Deployments(namespace).Get(context.Background(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	rsList, err := client.AppsV1().ReplicaSets(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var targetTemplate *corev1.PodTemplateSpec
	for i := range rsList.Items {
		rs := &rsList.Items[i]
		if !ownedByUID(rs.OwnerReferences, deploy.UID) {
			continue
		}
		revStr := rs.Annotations["deployment.kubernetes.io/revision"]
		rev, _ := strconv.ParseInt(revStr, 10, 64)
		if rev == req.Revision {
			targetTemplate = rs.Spec.Template.DeepCopy()
			break
		}
	}
	if targetTemplate == nil {
		return nil, fmt.Errorf("revision %d not found for deployment %s/%s", req.Revision, namespace, name)
	}
	delete(targetTemplate.Labels, "pod-template-hash")

	patch := map[string]interface{}{
		"spec": map[string]interface{}{
			"template": targetTemplate,
		},
	}
	patchBytes, err := json.Marshal(patch)
	if err != nil {
		return nil, err
	}

	if _, err := client.AppsV1().Deployments(namespace).Patch(context.Background(), name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{}); err != nil {
		return nil, err
	}
	return map[string]interface{}{"status": "rolled back", "toRevision": req.Revision}, nil
}

// RollbackStatefulSet applies a ControllerRevision's serialized template
// patch back onto the live StatefulSet. cr.Data.Raw is already a strategic
// merge patch of the form {"spec":{"template":{...}}}.
func (h *RevisionsHandler) RollbackStatefulSet(ctx *gofr.Context) (interface{}, error) {
	return h.rollbackViaControllerRevision(ctx, "statefulset")
}

// RollbackDaemonSet: same mechanism as StatefulSet.
func (h *RevisionsHandler) RollbackDaemonSet(ctx *gofr.Context) (interface{}, error) {
	return h.rollbackViaControllerRevision(ctx, "daemonset")
}

func (h *RevisionsHandler) rollbackViaControllerRevision(ctx *gofr.Context, kind string) (interface{}, error) {
	namespace := ctx.PathParam("namespace")
	name := ctx.PathParam("name")

	var req struct {
		RevisionName string `json:"revisionName"`
	}
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}
	if req.RevisionName == "" {
		return nil, errors.New("revisionName is required")
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	cr, err := client.AppsV1().ControllerRevisions(namespace).Get(context.Background(), req.RevisionName, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	var ownerUID types.UID
	switch kind {
	case "statefulset":
		sts, err := client.AppsV1().StatefulSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		ownerUID = sts.UID
	case "daemonset":
		ds, err := client.AppsV1().DaemonSets(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		ownerUID = ds.UID
	default:
		return nil, fmt.Errorf("unsupported kind: %s", kind)
	}
	if !ownedByUID(cr.OwnerReferences, ownerUID) {
		return nil, fmt.Errorf("revision %s does not belong to %s %s/%s", req.RevisionName, kind, namespace, name)
	}

	switch kind {
	case "statefulset":
		if _, err := client.AppsV1().StatefulSets(namespace).Patch(context.Background(), name, types.StrategicMergePatchType, cr.Data.Raw, metav1.PatchOptions{}); err != nil {
			return nil, err
		}
	case "daemonset":
		if _, err := client.AppsV1().DaemonSets(namespace).Patch(context.Background(), name, types.StrategicMergePatchType, cr.Data.Raw, metav1.PatchOptions{}); err != nil {
			return nil, err
		}
	}
	return map[string]interface{}{"status": "rolled back", "toRevision": req.RevisionName}, nil
}

// controllerRevisionsFor lists ControllerRevisions in the namespace and
// returns the ones owned by ownerUID, sorted newest-first. currentMatchName
// is the ControllerRevision.Name that should be tagged Current.
func controllerRevisionsFor(client *kubernetes.Clientset, namespace string, ownerUID types.UID, currentMatchName string) ([]RevisionInfo, error) {
	crList, err := client.AppsV1().ControllerRevisions(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	revs := []RevisionInfo{}
	for _, cr := range crList.Items {
		if !ownedByUID(cr.OwnerReferences, ownerUID) {
			continue
		}
		revs = append(revs, RevisionInfo{
			Revision:    cr.Revision,
			Name:        cr.Name,
			CreatedAt:   cr.CreationTimestamp.UTC().Format("2006-01-02T15:04:05Z"),
			Age:         formatAge(cr.CreationTimestamp.Time),
			Images:      imagesFromControllerRevision(cr.Data.Raw),
			ChangeCause: cr.Annotations["kubernetes.io/change-cause"],
			Current:     cr.Name == currentMatchName,
		})
	}
	sort.Slice(revs, func(i, j int) bool { return revs[i].Revision > revs[j].Revision })
	return revs, nil
}
