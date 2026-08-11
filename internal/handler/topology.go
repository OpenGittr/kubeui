package handler

import (
	"context"
	"sort"

	"gofr.dev/pkg/gofr"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type TopologyHandler struct {
	k8s *service.K8sManager
}

func NewTopologyHandler(k8s *service.K8sManager) *TopologyHandler {
	return &TopologyHandler{k8s: k8s}
}

type TopologyPod struct {
	Namespace   string `json:"namespace"`
	Name        string `json:"name"`
	Phase       string `json:"phase"`
	WorkloadKey string `json:"workloadKey"` // "<kind>/<ns>/<name>", stable across nodes
}

type TopologyNode struct {
	Name  string        `json:"name"`
	Zone  string        `json:"zone,omitempty"`
	Ready bool          `json:"ready"`
	Pods  []TopologyPod `json:"pods"`
}

type TopologyNodepool struct {
	Name  string         `json:"name"`
	Nodes []TopologyNode `json:"nodes"`
}

type TopologyWorkload struct {
	Kind      string `json:"kind"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Key       string `json:"key"`
	PodCount  int    `json:"podCount"`
}

type TopologyResponse struct {
	Nodepools []TopologyNodepool `json:"nodepools"`
	Workloads []TopologyWorkload `json:"workloads"`
}

// Common cloud-provider nodepool label keys, checked in priority order.
// If none of these are present a node is placed in "<default>".
var nodepoolLabelKeys = []string{
	"cloud.google.com/gke-nodepool",
	"eks.amazonaws.com/nodegroup",
	"karpenter.sh/nodepool",
	"kubernetes.azure.com/agentpool",
	"node-pool",
}

func nodepoolOf(node *corev1.Node) string {
	for _, k := range nodepoolLabelKeys {
		if v, ok := node.Labels[k]; ok && v != "" {
			return v
		}
	}
	return "<default>"
}

// Get returns the full cluster topology in one shot: nodepool → node → pod,
// with each pod tagged by its top-level workload key so the UI can
// highlight all pods for a selected Deployment/StatefulSet/etc.
func (h *TopologyHandler) Get(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	// Pass namespace through the list request so RBAC-scoped users work too.
	// Empty string = all namespaces.
	pods, err := client.CoreV1().Pods(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	// ReplicaSets are only needed to walk Pod → RS → Deployment. If listing
	// fails we degrade to grouping by RS instead of Deployment — not fatal.
	rsList, _ := client.AppsV1().ReplicaSets("").List(context.Background(), metav1.ListOptions{})

	// Index RS by namespace/name so we can look up the owning Deployment.
	rsOwner := map[string]struct{ kind, name string }{}
	if rsList != nil {
		for _, rs := range rsList.Items {
			for _, o := range rs.OwnerReferences {
				if o.Controller != nil && *o.Controller {
					rsOwner[rs.Namespace+"/"+rs.Name] = struct{ kind, name string }{o.Kind, o.Name}
					break
				}
			}
		}
	}

	// Bucket pods by nodeName. Skip pods without an assigned node.
	podsByNode := map[string][]TopologyPod{}
	workloadCount := map[string]TopologyWorkload{}
	for _, p := range pods.Items {
		if p.Spec.NodeName == "" {
			continue
		}
		wKind, wNs, wName := resolveWorkload(&p, rsOwner)
		key := wKind + "/" + wNs + "/" + wName
		podsByNode[p.Spec.NodeName] = append(podsByNode[p.Spec.NodeName], TopologyPod{
			Namespace:   p.Namespace,
			Name:        p.Name,
			Phase:       string(p.Status.Phase),
			WorkloadKey: key,
		})
		w, ok := workloadCount[key]
		if !ok {
			w = TopologyWorkload{Kind: wKind, Namespace: wNs, Name: wName, Key: key}
		}
		w.PodCount++
		workloadCount[key] = w
	}

	// Group nodes by nodepool.
	poolMap := map[string]*TopologyNodepool{}
	for i := range nodes.Items {
		n := &nodes.Items[i]
		pool := nodepoolOf(n)
		if _, ok := poolMap[pool]; !ok {
			poolMap[pool] = &TopologyNodepool{Name: pool}
		}
		pods := podsByNode[n.Name]
		if pods == nil {
			pods = []TopologyPod{}
		}
		poolMap[pool].Nodes = append(poolMap[pool].Nodes, TopologyNode{
			Name:  n.Name,
			Zone:  n.Labels["topology.kubernetes.io/zone"],
			Ready: nodeReady(n),
			Pods:  pods,
		})
	}

	pools := make([]TopologyNodepool, 0, len(poolMap))
	for _, p := range poolMap {
		sort.Slice(p.Nodes, func(i, j int) bool { return p.Nodes[i].Name < p.Nodes[j].Name })
		pools = append(pools, *p)
	}
	sort.Slice(pools, func(i, j int) bool { return pools[i].Name < pools[j].Name })

	workloads := make([]TopologyWorkload, 0, len(workloadCount))
	for _, w := range workloadCount {
		workloads = append(workloads, w)
	}
	sort.Slice(workloads, func(i, j int) bool {
		if workloads[i].Namespace != workloads[j].Namespace {
			return workloads[i].Namespace < workloads[j].Namespace
		}
		return workloads[i].Name < workloads[j].Name
	})

	return TopologyResponse{Nodepools: pools, Workloads: workloads}, nil
}

// resolveWorkload walks Pod → RS → Deployment (or shortcut for directly
// owned pods) and returns the top-level workload kind/ns/name. Bare pods
// return ("Pod", ns, pod-name).
func resolveWorkload(p *corev1.Pod, rsOwner map[string]struct{ kind, name string }) (string, string, string) {
	for _, o := range p.OwnerReferences {
		if o.Controller == nil || !*o.Controller {
			continue
		}
		switch o.Kind {
		case "ReplicaSet":
			if owner, ok := rsOwner[p.Namespace+"/"+o.Name]; ok {
				return owner.kind, p.Namespace, owner.name
			}
			return "ReplicaSet", p.Namespace, o.Name
		case "Job", "StatefulSet", "DaemonSet":
			return o.Kind, p.Namespace, o.Name
		default:
			return o.Kind, p.Namespace, o.Name
		}
	}
	return "Pod", p.Namespace, p.Name
}

func nodeReady(n *corev1.Node) bool {
	for _, c := range n.Status.Conditions {
		if c.Type == corev1.NodeReady {
			return c.Status == corev1.ConditionTrue
		}
	}
	return false
}
