package service

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// gkeScopes match what gke-gcloud-auth-plugin requests for its access tokens.
var gkeScopes = []string{
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
}

// gcloudConfigDir locates gcloud's config directory the same way gcloud does.
func gcloudConfigDir() string {
	if dir := os.Getenv("CLOUDSDK_CONFIG"); dir != "" {
		return dir
	}
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "gcloud")
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".config", "gcloud")
}

// gcloudConfigAccount reads the active account straight from gcloud's config
// files. Same answer as `gcloud auth list --filter=status:ACTIVE`, without a
// 5-second subprocess — and it still works when the credentials themselves
// have expired, which is exactly when we need to know the account.
func gcloudConfigAccount() string {
	dir := gcloudConfigDir()
	if dir == "" {
		return ""
	}

	configName := "default"
	if data, err := os.ReadFile(filepath.Join(dir, "active_config")); err == nil {
		if name := strings.TrimSpace(string(data)); name != "" {
			configName = name
		}
	}

	return iniValue(filepath.Join(dir, "configurations", "config_"+configName), "account")
}

// iniValue pulls a single `key = value` out of a gcloud INI config file.
func iniValue(path, key string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		k, v, found := strings.Cut(line, "=")
		if !found || strings.TrimSpace(k) != key {
			continue
		}
		return strings.TrimSpace(v)
	}
	return ""
}

// gcloudCredentialFile returns the path to the credentials gcloud stored for
// an account, or "" when that account has never been logged in.
func gcloudCredentialFile(account string) string {
	dir := gcloudConfigDir()
	if dir == "" || account == "" {
		return ""
	}

	path := filepath.Join(dir, "legacy_credentials", account, "adc.json")
	if _, err := os.Stat(path); err != nil {
		return ""
	}
	return path
}

// gcloudTokenSource builds an in-process OAuth token source from the refresh
// token gcloud already holds for an account. This is what lets kubeui skip
// gke-gcloud-auth-plugin entirely: the token source refreshes silently on
// expiry instead of a subprocess exiting 1 in the middle of a session.
//
// Falls back to Application Default Credentials when the account has no
// stored credential (e.g. only `gcloud auth application-default login` was run).
func gcloudTokenSource(ctx context.Context, account string) (oauth2.TokenSource, error) {
	if path := gcloudCredentialFile(account); path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("reading gcloud credentials for %s: %w", account, err)
		}

		creds, err := google.CredentialsFromJSON(ctx, data, gkeScopes...)
		if err != nil {
			return nil, fmt.Errorf("parsing gcloud credentials for %s: %w", account, err)
		}
		return creds.TokenSource, nil
	}

	creds, err := google.FindDefaultCredentials(ctx, gkeScopes...)
	if err != nil {
		return nil, fmt.Errorf("no usable google credentials for %s: %w", account, err)
	}
	return creds.TokenSource, nil
}
