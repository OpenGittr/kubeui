package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"gofr.dev/pkg/gofr"

	"github.com/opengittr/kubeui/internal/handler"
	"github.com/opengittr/kubeui/internal/service"
)

//go:embed all:dist
var staticFiles embed.FS

var (
	version   = "0.1.3"
	port      = flag.String("port", "8080", "Port to run the server on")
	noBrowser = flag.Bool("no-browser", false, "Don't open browser on start")
)

func main() {
	flag.Parse()

	// Handle version flag
	if len(flag.Args()) > 0 && flag.Args()[0] == "version" {
		fmt.Printf("kubeui version %s\n", version)
		return
	}

	// Find available ports
	availablePort := findAvailablePort(*port)
	metricsPort := findAvailablePort("2121")

	// Set environment variables for GoFr
	os.Setenv("HTTP_PORT", availablePort)
	os.Setenv("METRICS_PORT", metricsPort)

	app := gofr.New()

	app.Logger().Infof("Starting KubeUI on http://localhost:%s", availablePort)

	// Initialize Kubernetes client manager
	k8sManager, err := service.NewK8sManager()
	if err != nil {
		app.Logger().Errorf("Failed to initialize K8s manager: %v", err)
		return
	}

	// Initialize static file server
	staticServer, err := handler.NewStaticFileServer(staticFiles, "dist")
	if err != nil {
		app.Logger().Errorf("Failed to initialize static file server: %v", err)
		return
	}

	// Initialize SSE handler early for middleware
	sseHandler := handler.NewSSEHandler(k8sManager)

	// Initialize exec handler for WebSocket
	execHandler := handler.NewExecHandler(k8sManager)

	// Add exec middleware for WebSocket terminal
	app.UseMiddleware(execHandler.Middleware)

	// Add SSE middleware for streaming
	app.UseMiddleware(sseHandler.SSEMiddleware)

	// Add static file middleware (serves frontend)
	app.UseMiddleware(staticServer.Middleware)

	// Initialize handlers
	clusterHandler := handler.NewClusterHandler(k8sManager)
	namespaceHandler := handler.NewNamespaceHandler(k8sManager)
	podHandler := handler.NewPodHandler(k8sManager)
	deploymentHandler := handler.NewDeploymentHandler(k8sManager)
	serviceHandler := handler.NewServiceHandler(k8sManager)
	configMapHandler := handler.NewConfigMapHandler(k8sManager)
	secretHandler := handler.NewSecretHandler(k8sManager)
	jobHandler := handler.NewJobHandler(k8sManager)
	storageHandler := handler.NewStorageHandler(k8sManager)
	yamlHandler := handler.NewYAMLHandler(k8sManager)
	crdHandler := handler.NewCRDHandler(k8sManager)
	nodeHandler := handler.NewNodeHandler(k8sManager)
	workloadHandler := handler.NewWorkloadHandler(k8sManager)
	networkHandler := handler.NewNetworkHandler(k8sManager)
	hpaHandler := handler.NewHPAHandler(k8sManager)
	eventHandler := handler.NewEventHandler(k8sManager)
	rbacHandler := handler.NewRBACHandler(k8sManager)
	quotaHandler := handler.NewQuotaHandler(k8sManager)
	searchHandler := handler.NewSearchHandler(k8sManager)
	portForwardHandler := handler.NewPortForwardHandler(k8sManager)

	// Cluster routes
	app.GET("/api/clusters", clusterHandler.List)
	app.GET("/api/clusters/current", clusterHandler.Current)
	app.POST("/api/clusters/switch", clusterHandler.Switch)

	// Namespace routes
	app.GET("/api/namespaces", namespaceHandler.List)

	// Pod routes
	app.GET("/api/pods", podHandler.List)
	app.GET("/api/pods/{namespace}/{name}", podHandler.Get)
	app.GET("/api/pods/{namespace}/{name}/logs", podHandler.Logs)
	app.GET("/api/pods/{namespace}/{name}/events", podHandler.Events)
	app.DELETE("/api/pods/{namespace}/{name}", podHandler.Delete)

	// Port forward routes
	app.GET("/api/portforwards", portForwardHandler.List)
	app.GET("/api/pods/{namespace}/{name}/portforwards", portForwardHandler.ListForPod)
	app.POST("/api/pods/{namespace}/{name}/portforward", portForwardHandler.Start)
	app.DELETE("/api/pods/{namespace}/{name}/portforward", portForwardHandler.Stop)

	// Deployment routes
	app.GET("/api/deployments", deploymentHandler.List)
	app.GET("/api/deployments/{namespace}/{name}", deploymentHandler.Get)
	app.PATCH("/api/deployments/{namespace}/{name}/scale", deploymentHandler.Scale)
	app.POST("/api/deployments/{namespace}/{name}/restart", deploymentHandler.Restart)
	app.DELETE("/api/deployments/{namespace}/{name}", deploymentHandler.Delete)

	// Service routes
	app.GET("/api/services", serviceHandler.List)
	app.DELETE("/api/services/{namespace}/{name}", serviceHandler.Delete)

	// ConfigMap routes
	app.GET("/api/configmaps", configMapHandler.List)
	app.GET("/api/configmaps/{namespace}/{name}", configMapHandler.Get)
	app.DELETE("/api/configmaps/{namespace}/{name}", configMapHandler.Delete)

	// Secret routes
	app.GET("/api/secrets", secretHandler.List)
	app.DELETE("/api/secrets/{namespace}/{name}", secretHandler.Delete)

	// Job routes
	app.GET("/api/jobs", jobHandler.ListJobs)
	app.GET("/api/cronjobs", jobHandler.ListCronJobs)
	app.DELETE("/api/jobs/{namespace}/{name}", jobHandler.DeleteJob)
	app.DELETE("/api/cronjobs/{namespace}/{name}", jobHandler.DeleteCronJob)

	// Storage routes
	app.GET("/api/pvs", storageHandler.ListPVs)
	app.GET("/api/pvcs", storageHandler.ListPVCs)

	// YAML routes
	app.GET("/api/yaml/{type}/{namespace}/{name}", yamlHandler.Get)
	app.GET("/api/yaml/{type}/{name}", yamlHandler.GetClusterScoped)
	app.PUT("/api/yaml/{type}/{namespace}/{name}", yamlHandler.Update)
	app.PUT("/api/yaml/{type}/{name}", yamlHandler.UpdateClusterScoped)

	// CRD routes
	app.GET("/api/crds", crdHandler.ListCRDs)
	app.GET("/api/crds/{group}/{version}/{resource}", crdHandler.ListCRInstances)
	app.GET("/api/crds/{group}/{version}/{resource}/{namespace}/{name}", crdHandler.GetCRInstance)

	// Node routes
	app.GET("/api/nodes", nodeHandler.List)

	// Workload routes (DaemonSets, StatefulSets, ReplicaSets)
	app.GET("/api/daemonsets", workloadHandler.ListDaemonSets)
	app.GET("/api/statefulsets", workloadHandler.ListStatefulSets)
	app.GET("/api/replicasets", workloadHandler.ListReplicaSets)
	app.DELETE("/api/daemonsets/{namespace}/{name}", workloadHandler.DeleteDaemonSet)
	app.DELETE("/api/statefulsets/{namespace}/{name}", workloadHandler.DeleteStatefulSet)
	app.DELETE("/api/replicasets/{namespace}/{name}", workloadHandler.DeleteReplicaSet)

	// Network routes (Ingresses, Endpoints, NetworkPolicies)
	app.GET("/api/ingresses", networkHandler.ListIngresses)
	app.GET("/api/endpoints", networkHandler.ListEndpoints)
	app.GET("/api/networkpolicies", networkHandler.ListNetworkPolicies)
	app.DELETE("/api/ingresses/{namespace}/{name}", networkHandler.DeleteIngress)
	app.DELETE("/api/networkpolicies/{namespace}/{name}", networkHandler.DeleteNetworkPolicy)

	// HPA routes
	app.GET("/api/hpas", hpaHandler.List)

	// Event routes
	app.GET("/api/events", eventHandler.List)
	app.GET("/api/events/warnings", eventHandler.ListWarnings)

	// Storage Class routes
	app.GET("/api/storageclasses", storageHandler.ListStorageClasses)

	// RBAC routes
	app.GET("/api/serviceaccounts", rbacHandler.ListServiceAccounts)

	// Quota routes
	app.GET("/api/resourcequotas", quotaHandler.ListResourceQuotas)
	app.GET("/api/limitranges", quotaHandler.ListLimitRanges)

	// Search route
	app.GET("/api/search", searchHandler.Search)

	// Version check route
	app.GET("/api/version", func(ctx *gofr.Context) (interface{}, error) {
		return getVersionInfo(), nil
	})

	// Real-time updates routes
	app.GET("/api/summary", sseHandler.Summary)
	app.GET("/api/stream", sseHandler.Stream)

	// Open browser if not disabled
	if !*noBrowser {
		go openBrowser(fmt.Sprintf("http://localhost:%s", availablePort))
	}

	app.Run()
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	}
	if cmd != nil {
		_ = cmd.Start()
	}
}

// VersionInfo contains current version and update availability
type VersionInfo struct {
	Current       string `json:"current"`
	Latest        string `json:"latest,omitempty"`
	UpdateAvail   bool   `json:"updateAvailable"`
	ReleaseURL    string `json:"releaseUrl,omitempty"`
	CheckedAt     string `json:"checkedAt,omitempty"`
}

var (
	cachedLatestVersion string
	lastVersionCheck    time.Time
	versionCheckCache   = 1 * time.Hour
)

func getVersionInfo() VersionInfo {
	info := VersionInfo{
		Current:     version,
		UpdateAvail: false,
	}

	// Check cache
	if time.Since(lastVersionCheck) < versionCheckCache && cachedLatestVersion != "" {
		info.Latest = cachedLatestVersion
		info.UpdateAvail = isNewerVersion(cachedLatestVersion, version)
		info.ReleaseURL = "https://github.com/opengittr/kubeui/releases/latest"
		info.CheckedAt = lastVersionCheck.Format(time.RFC3339)
		return info
	}

	// Fetch latest version from GitHub
	latest, err := fetchLatestVersion()
	if err == nil && latest != "" {
		cachedLatestVersion = latest
		lastVersionCheck = time.Now()
		info.Latest = latest
		info.UpdateAvail = isNewerVersion(latest, version)
		info.ReleaseURL = "https://github.com/opengittr/kubeui/releases/latest"
		info.CheckedAt = lastVersionCheck.Format(time.RFC3339)
	}

	return info
}

func fetchLatestVersion() (string, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("https://api.github.com/repos/opengittr/kubeui/releases/latest")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github API returned %d", resp.StatusCode)
	}

	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", err
	}

	// Remove 'v' prefix if present
	return strings.TrimPrefix(release.TagName, "v"), nil
}

func isNewerVersion(latest, current string) bool {
	// Simple version comparison - assumes semver format
	// For alpha releases, this handles cases like 0.1.0 > 0.1.0-alpha.1
	if latest == current {
		return false
	}

	// Normalize versions
	latest = strings.TrimPrefix(latest, "v")
	current = strings.TrimPrefix(current, "v")

	// If current has alpha/beta suffix and latest doesn't, latest is newer
	if strings.Contains(current, "-") && !strings.Contains(latest, "-") {
		currentBase := strings.Split(current, "-")[0]
		if latest >= currentBase {
			return true
		}
	}

	return latest > current
}

// findAvailablePort finds an available port starting from the given port
func findAvailablePort(startPort string) string {
	port, err := strconv.Atoi(startPort)
	if err != nil {
		port = 8080
	}

	for i := 0; i < 100; i++ {
		addr := fmt.Sprintf(":%d", port+i)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			listener.Close()
			return strconv.Itoa(port + i)
		}
	}

	return startPort
}
