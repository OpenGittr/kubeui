package handler

import (
	"context"

	"gofr.dev/pkg/gofr"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/opengittr/kubeui/internal/service"
)

type PermissionHandler struct {
	k8s *service.K8sManager
}

func NewPermissionHandler(k8s *service.K8sManager) *PermissionHandler {
	return &PermissionHandler{k8s: k8s}
}

type ResourceRule struct {
	Verbs         []string `json:"verbs"`
	APIGroups     []string `json:"apiGroups"`
	Resources     []string `json:"resources"`
	ResourceNames []string `json:"resourceNames,omitempty"`
}

type PermissionsResponse struct {
	Namespace     string         `json:"namespace"`
	ResourceRules []ResourceRule `json:"resourceRules"`
	Incomplete    bool           `json:"incomplete"`
}

type PermCheck struct {
	Verb      string `json:"verb"`
	Group     string `json:"group"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace,omitempty"`
}

type PermCheckResult struct {
	PermCheck
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason,omitempty"`
}

type permCheckRequest struct {
	Checks []PermCheck `json:"checks"`
}

type permCheckResponse struct {
	Results []PermCheckResult `json:"results"`
}

// Get returns the RBAC rules allowed for the current user in the given
// namespace. Uses SelfSubjectRulesReview so it's a single round-trip regardless
// of how many (verb, resource) pairs the frontend wants to check.
func (h *PermissionHandler) Get(ctx *gofr.Context) (interface{}, error) {
	namespace := ctx.Param("namespace")
	if namespace == "" {
		namespace = "default"
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	review := &authorizationv1.SelfSubjectRulesReview{
		Spec: authorizationv1.SelfSubjectRulesReviewSpec{Namespace: namespace},
	}
	result, err := client.AuthorizationV1().SelfSubjectRulesReviews().Create(
		context.Background(), review, metav1.CreateOptions{},
	)
	if err != nil {
		return nil, err
	}

	rules := make([]ResourceRule, 0, len(result.Status.ResourceRules))
	for _, r := range result.Status.ResourceRules {
		rules = append(rules, ResourceRule{
			Verbs:         r.Verbs,
			APIGroups:     r.APIGroups,
			Resources:     r.Resources,
			ResourceNames: r.ResourceNames,
		})
	}

	return PermissionsResponse{
		Namespace:     namespace,
		ResourceRules: rules,
		Incomplete:    result.Status.Incomplete,
	}, nil
}

// Check runs a list of SelfSubjectAccessReview queries — one per requested
// (verb, group, resource, namespace) tuple — and returns whether each is
// allowed. Use this when SelfSubjectRulesReview returns Incomplete=true
// (typical for clusters where authorization is delegated to a webhook, e.g.
// GKE with IAM bindings) and we can't enumerate the user's effective rules.
func (h *PermissionHandler) Check(ctx *gofr.Context) (interface{}, error) {
	var req permCheckRequest
	if err := ctx.Bind(&req); err != nil {
		return nil, err
	}

	client, err := h.k8s.GetClient()
	if err != nil {
		return nil, err
	}

	results := make([]PermCheckResult, 0, len(req.Checks))
	for _, c := range req.Checks {
		ssar := &authorizationv1.SelfSubjectAccessReview{
			Spec: authorizationv1.SelfSubjectAccessReviewSpec{
				ResourceAttributes: &authorizationv1.ResourceAttributes{
					Namespace: c.Namespace,
					Verb:      c.Verb,
					Group:     c.Group,
					Resource:  c.Resource,
				},
			},
		}
		out, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(
			context.Background(), ssar, metav1.CreateOptions{},
		)
		if err != nil {
			// Conservative fallback on SSAR error: assume not allowed and
			// surface the error reason so the UI can show a tooltip.
			results = append(results, PermCheckResult{PermCheck: c, Allowed: false, Reason: err.Error()})
			continue
		}
		results = append(results, PermCheckResult{
			PermCheck: c,
			Allowed:   out.Status.Allowed,
			Reason:    out.Status.Reason,
		})
	}
	return permCheckResponse{Results: results}, nil
}
