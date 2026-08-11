package service

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/tools/clientcmd/api"
)

func execAuthInfo(command string, args ...string) *api.AuthInfo {
	return &api.AuthInfo{Exec: &api.ExecConfig{Command: command, Args: args}}
}

func TestDetectProvider(t *testing.T) {
	tests := []struct {
		name     string
		authInfo *api.AuthInfo
		want     Provider
	}{
		{"gke plugin", execAuthInfo(gkeGcloudAuthPlugin), ProviderGKE},
		{"gke plugin absolute path", execAuthInfo("/usr/local/bin/gke-gcloud-auth-plugin"), ProviderGKE},
		{"eks", execAuthInfo("aws", "--region", "us-east-1", "eks", "get-token"), ProviderEKS},
		{"eks legacy authenticator", execAuthInfo("aws-iam-authenticator", "token"), ProviderEKS},
		{"aks kubelogin", execAuthInfo("kubelogin", "get-token"), ProviderAKS},
		{"unknown plugin", execAuthInfo("my-custom-plugin"), ProviderExec},
		{"legacy gcp auth provider", &api.AuthInfo{AuthProvider: &api.AuthProviderConfig{Name: "gcp"}}, ProviderGKE},
		{"oidc auth provider", &api.AuthInfo{AuthProvider: &api.AuthProviderConfig{Name: "oidc"}}, ProviderOIDC},
		{"client certs", &api.AuthInfo{ClientCertificate: "/tmp/cert.pem"}, ProviderStatic},
		{"nil", nil, ProviderStatic},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := detectProvider(tt.authInfo); got != tt.want {
				t.Errorf("detectProvider() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestIsAuthError(t *testing.T) {
	unauthorized := apierrors.NewUnauthorized("token expired")
	notFound := apierrors.NewNotFound(schema.GroupResource{Resource: "pods"}, "web-0")
	forbidden := &apierrors.StatusError{ErrStatus: metav1.Status{Code: 403, Message: "forbidden"}}

	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"dead exec plugin", errors.New(`getting credentials: exec: executable gke-gcloud-auth-plugin failed with exit code 1`), true},
		{"expired refresh token", errors.New(`oauth2: "invalid_grant" "reauth related error (rapt_required)"`), true},
		{"expired aws sso session", errors.New("the SSO session associated with this profile has expired"), true},
		{"401", unauthorized, true},
		// Not credential problems: these must not offer a login button.
		{"404", notFound, false},
		{"403", forbidden, false},
		{"network", errors.New("dial tcp 10.0.0.1:443: i/o timeout"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsAuthError(tt.err); got != tt.want {
				t.Errorf("IsAuthError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestLoginCommand(t *testing.T) {
	tests := []struct {
		name     string
		provider Provider
		account  string
		profile  string
		want     string
		wantOK   bool
	}{
		{"gke with account", ProviderGKE, "dev@example.com", "", "gcloud auth login --quiet dev@example.com", true},
		{"eks with profile", ProviderEKS, "", "prod", "aws sso login --profile prod", true},
		{"aks", ProviderAKS, "", "", "az login", true},
		{"static has no login", ProviderStatic, "", "", "", false},
		{"unknown exec plugin has no login", ProviderExec, "", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			argv, ok := loginCommand(tt.provider, tt.account, tt.profile)
			if ok != tt.wantOK {
				t.Fatalf("loginCommand() ok = %v, want %v", ok, tt.wantOK)
			}
			if got := joinArgs(argv); got != tt.want {
				t.Errorf("loginCommand() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestAWSProfile(t *testing.T) {
	tests := []struct {
		name     string
		authInfo *api.AuthInfo
		want     string
	}{
		{"separate arg", execAuthInfo("aws", "eks", "get-token", "--profile", "prod"), "prod"},
		{"equals form", execAuthInfo("aws", "eks", "get-token", "--profile=staging"), "staging"},
		{"from env", &api.AuthInfo{Exec: &api.ExecConfig{
			Command: "aws",
			Env:     []api.ExecEnvVar{{Name: "AWS_PROFILE", Value: "sandbox"}},
		}}, "sandbox"},
		{"absent", execAuthInfo("aws", "eks", "get-token"), ""},
		{"nil", nil, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := awsProfile(tt.authInfo); got != tt.want {
				t.Errorf("awsProfile() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseGKEProject(t *testing.T) {
	tests := map[string]string{
		"gke_my-project_us-central1_cluster": "my-project",
		"gke_my-project_us-central1":         "my-project",
		"minikube":                           "",
		"gke_incomplete":                     "",
	}

	for contextName, want := range tests {
		if got := parseGKEProject(contextName); got != want {
			t.Errorf("parseGKEProject(%q) = %q, want %q", contextName, got, want)
		}
	}
}

func TestINIValue(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config_default")
	content := "[core]\naccount = dev@example.com\nproject = my-project\n\n[compute]\nregion = us-central1\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	if got := iniValue(path, "account"); got != "dev@example.com" {
		t.Errorf("iniValue(account) = %q, want dev@example.com", got)
	}
	if got := iniValue(path, "missing"); got != "" {
		t.Errorf("iniValue(missing) = %q, want empty", got)
	}
	if got := iniValue(filepath.Join(dir, "absent"), "account"); got != "" {
		t.Errorf("iniValue on missing file = %q, want empty", got)
	}
}

func joinArgs(argv []string) string {
	out := ""
	for i, a := range argv {
		if i > 0 {
			out += " "
		}
		out += a
	}
	return out
}
