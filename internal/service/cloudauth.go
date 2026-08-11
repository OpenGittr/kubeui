package service

import (
	"path/filepath"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/tools/clientcmd/api"
)

// Provider identifies how a kubeconfig context obtains its credentials.
type Provider string

const (
	ProviderGKE     Provider = "gke"
	ProviderEKS     Provider = "eks"
	ProviderAKS     Provider = "aks"
	ProviderOIDC    Provider = "oidc"
	ProviderExec    Provider = "exec"   // some other exec plugin we don't know how to drive
	ProviderStatic  Provider = "static" // client certs / static token, nothing to refresh
	ProviderUnknown Provider = "unknown"
)

// AuthStatus is the credential state of a context, as reported to the UI.
type AuthStatus struct {
	Context string   `json:"context"`
	Cluster string   `json:"cluster,omitempty"`
	Provider   Provider `json:"provider"`
	Account    string   `json:"account,omitempty"`
	Project    string   `json:"project,omitempty"`
	AWSProfile string   `json:"awsProfile,omitempty"`
	// Native is true when kubeui mints tokens in-process instead of shelling
	// out to the kubeconfig exec plugin.
	Native     bool   `json:"native"`
	Connected  bool   `json:"connected"`
	NeedsLogin bool   `json:"needsLogin"`
	Error      string `json:"error,omitempty"`
	// LoginCommand is the command kubeui would run for this provider, shown to
	// the user so nothing happens behind their back.
	LoginCommand string `json:"loginCommand,omitempty"`
	CanLogin     bool   `json:"canLogin"`
}

// detectProvider inspects an authInfo and classifies its credential mechanism.
func detectProvider(authInfo *api.AuthInfo) Provider {
	if authInfo == nil {
		return ProviderStatic
	}

	if authInfo.Exec != nil {
		cmd := filepath.Base(authInfo.Exec.Command)
		args := strings.Join(authInfo.Exec.Args, " ")

		switch {
		case cmd == gkeGcloudAuthPlugin || strings.Contains(cmd, "gke-gcloud"):
			return ProviderGKE
		case cmd == "gcloud":
			return ProviderGKE
		case cmd == "aws-iam-authenticator", cmd == "aws" && strings.Contains(args, "get-token"):
			return ProviderEKS
		case cmd == "kubelogin", strings.Contains(cmd, "azure"), cmd == "az":
			return ProviderAKS
		case strings.Contains(cmd, "oidc"):
			return ProviderOIDC
		}
		return ProviderExec
	}

	if authInfo.AuthProvider != nil {
		switch authInfo.AuthProvider.Name {
		case "gcp":
			return ProviderGKE
		case "azure":
			return ProviderAKS
		case "oidc":
			return ProviderOIDC
		}
		return ProviderUnknown
	}

	return ProviderStatic
}

// loginCommand returns the argv kubeui would run to refresh credentials for a
// provider, plus whether we know how to drive it at all. Args come from the
// kubeconfig and from our own detection — never from an HTTP request body —
// so there is no injection surface here.
func loginCommand(p Provider, account, profile string) ([]string, bool) {
	switch p {
	case ProviderGKE:
		argv := []string{"gcloud", "auth", "login", "--quiet"}
		if account != "" {
			argv = append(argv, account)
		}
		return argv, true
	case ProviderEKS:
		argv := []string{"aws", "sso", "login"}
		if profile != "" {
			argv = append(argv, "--profile", profile)
		}
		return argv, true
	case ProviderAKS:
		return []string{"az", "login"}, true
	}
	return nil, false
}

// awsProfile extracts the AWS profile an EKS context authenticates with, from
// either the exec args (--profile X) or the exec env (AWS_PROFILE).
func awsProfile(authInfo *api.AuthInfo) string {
	if authInfo == nil || authInfo.Exec == nil {
		return ""
	}
	for i, a := range authInfo.Exec.Args {
		if a == "--profile" && i+1 < len(authInfo.Exec.Args) {
			return authInfo.Exec.Args[i+1]
		}
		if strings.HasPrefix(a, "--profile=") {
			return strings.TrimPrefix(a, "--profile=")
		}
	}
	for _, e := range authInfo.Exec.Env {
		if e.Name == "AWS_PROFILE" {
			return e.Value
		}
	}
	return ""
}

// authErrorMarkers are substrings that identify a credential failure rather
// than a genuine API error. The exec-plugin ones matter most: a dead
// gke-gcloud-auth-plugin surfaces only as "exit code 1" wrapped in
// "getting credentials".
var authErrorMarkers = []string{
	"getting credentials",
	"gke-gcloud-auth-plugin",
	"failed with exit code",
	"executable file not found",
	"no credentials",
	"invalid_grant",
	"token has been expired or revoked",
	"reauthentication",
	"reauth",
	"oauth2:",
	"unauthorized",
	"credentials are no longer valid",
	"expired credentials",
	"sso session",
	"the security token included in the request is expired",
}

// IsAuthError reports whether an error means "your credentials need
// refreshing" as opposed to "the cluster said no" or "the network is down".
func IsAuthError(err error) bool {
	if err == nil {
		return false
	}
	if apierrors.IsUnauthorized(err) {
		return true
	}

	msg := strings.ToLower(err.Error())
	for _, marker := range authErrorMarkers {
		if strings.Contains(msg, marker) {
			return true
		}
	}
	return false
}
