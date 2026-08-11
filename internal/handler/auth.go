package handler

import (
	"fmt"

	"gofr.dev/pkg/gofr"

	"github.com/opengittr/kubeui/internal/service"
)

type AuthHandler struct {
	k8s   *service.K8sManager
	login *service.LoginManager
}

func NewAuthHandler(k8s *service.K8sManager, login *service.LoginManager) *AuthHandler {
	return &AuthHandler{k8s: k8s, login: login}
}

// Status probes the current context and reports whether its credentials need
// refreshing, which provider they come from, and what login would run.
func (h *AuthHandler) Status(ctx *gofr.Context) (interface{}, error) {
	return h.k8s.AuthStatus(ctx.Context), nil
}

// Login starts the provider's CLI login in the background and returns a
// session the UI can poll. It runs asynchronously because the user has to
// complete a browser flow, which can take minutes.
func (h *AuthHandler) Login(ctx *gofr.Context) (interface{}, error) {
	status := h.k8s.AuthStatus(ctx.Context)
	if !status.CanLogin {
		return nil, fmt.Errorf("kubeui cannot refresh credentials for provider %q automatically", status.Provider)
	}

	return h.login.Start(status)
}

// LoginStatus returns progress and captured output for a login session.
func (h *AuthHandler) LoginStatus(ctx *gofr.Context) (interface{}, error) {
	id := ctx.PathParam("id")

	session, ok := h.login.Get(id)
	if !ok {
		return nil, fmt.Errorf("login session %q not found", id)
	}
	return session, nil
}
