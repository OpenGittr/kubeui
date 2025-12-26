package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/opengittr/kubeui/internal/service"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// ExecHandler handles pod exec WebSocket connections
type ExecHandler struct {
	k8sManager *service.K8sManager
	upgrader   websocket.Upgrader
}

// NewExecHandler creates a new exec handler
func NewExecHandler(k8sManager *service.K8sManager) *ExecHandler {
	return &ExecHandler{
		k8sManager: k8sManager,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins for local development
			},
		},
	}
}

// TerminalMessage represents a message between frontend and backend
type TerminalMessage struct {
	Type string `json:"type"` // "input", "output", "resize", "error"
	Data string `json:"data,omitempty"`
	Rows uint16 `json:"rows,omitempty"`
	Cols uint16 `json:"cols,omitempty"`
}

// wsWriter implements io.Writer for WebSocket
type wsWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (w *wsWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	msg := TerminalMessage{
		Type: "output",
		Data: string(p),
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return 0, err
	}

	if err := w.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		return 0, err
	}
	return len(p), nil
}

// TerminalSize implements remotecommand.TerminalSizeQueue
type TerminalSize struct {
	sizeChan chan remotecommand.TerminalSize
}

func (t *TerminalSize) Next() *remotecommand.TerminalSize {
	size, ok := <-t.sizeChan
	if !ok {
		return nil
	}
	return &size
}

// HandleExec handles WebSocket connections for pod exec
func (h *ExecHandler) HandleExec(w http.ResponseWriter, r *http.Request) {
	namespace := r.PathValue("namespace")
	name := r.PathValue("name")
	container := r.URL.Query().Get("container")
	shell := r.URL.Query().Get("shell")

	if shell == "" {
		shell = "/bin/sh"
	}

	// Upgrade to WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to upgrade: %v", err), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	// Get K8s config and client
	config, err := h.k8sManager.GetConfig()
	if err != nil {
		h.sendError(conn, fmt.Sprintf("Failed to get config: %v", err))
		return
	}

	client, err := h.k8sManager.GetClient()
	if err != nil {
		h.sendError(conn, fmt.Sprintf("Failed to get client: %v", err))
		return
	}

	// If no container specified, get the first one
	if container == "" {
		pod, err := client.CoreV1().Pods(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if err != nil {
			h.sendError(conn, fmt.Sprintf("Failed to get pod: %v", err))
			return
		}
		if len(pod.Spec.Containers) > 0 {
			container = pod.Spec.Containers[0].Name
		}
	}

	// Create exec request
	req := client.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(name).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: container,
			Command:   []string{shell},
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       true,
		}, scheme.ParameterCodec)

	// Create SPDY executor
	exec, err := remotecommand.NewSPDYExecutor(config, "POST", req.URL())
	if err != nil {
		h.sendError(conn, fmt.Sprintf("Failed to create executor: %v", err))
		return
	}

	// Create writer for output
	writer := &wsWriter{conn: conn}

	// Create terminal size queue
	termSize := &TerminalSize{
		sizeChan: make(chan remotecommand.TerminalSize, 1),
	}

	// Create stdin pipe
	stdinReader, stdinWriter := io.Pipe()

	// Create context for cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start goroutine to read from WebSocket and write to stdin
	go func() {
		defer stdinWriter.Close()
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				cancel()
				return
			}

			var msg TerminalMessage
			if err := json.Unmarshal(message, &msg); err != nil {
				continue
			}

			switch msg.Type {
			case "input":
				stdinWriter.Write([]byte(msg.Data))
			case "resize":
				select {
				case termSize.sizeChan <- remotecommand.TerminalSize{
					Width:  msg.Cols,
					Height: msg.Rows,
				}:
				default:
				}
			}
		}
	}()

	// Stream exec
	err = exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:             stdinReader,
		Stdout:            writer,
		Stderr:            writer,
		Tty:               true,
		TerminalSizeQueue: termSize,
	})

	if err != nil {
		h.sendError(conn, fmt.Sprintf("Exec error: %v", err))
	}
}

func (h *ExecHandler) sendError(conn *websocket.Conn, message string) {
	msg := TerminalMessage{
		Type: "error",
		Data: message,
	}
	data, _ := json.Marshal(msg)
	conn.WriteMessage(websocket.TextMessage, data)
}

// Middleware creates an HTTP middleware for handling exec WebSocket connections
func (h *ExecHandler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check if this is an exec request - matches /api/pods/{namespace}/{name}/exec
		if r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/pods/") && strings.HasSuffix(r.URL.Path, "/exec") {
			// Parse namespace and name from path
			parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/pods/"), "/")
			if len(parts) >= 3 && parts[len(parts)-1] == "exec" {
				namespace := parts[0]
				name := parts[1]

				// Create a new request with path values
				r.SetPathValue("namespace", namespace)
				r.SetPathValue("name", name)

				h.HandleExec(w, r)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
