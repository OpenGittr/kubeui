package handler

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"

	"github.com/opengittr/kubeui/internal/service"
)

// LogStreamHandler streams pod logs over WebSocket so the frontend can tail
// many pods at once (multi-pod log view). Pattern mirrors ExecHandler — a
// dedicated middleware intercepts the upgrade-handshake URL before Gofr's
// regular routing sees it, since gorilla/websocket needs the raw http
// ResponseWriter / Request.
type LogStreamHandler struct {
	k8sManager *service.K8sManager
	upgrader   websocket.Upgrader
}

func NewLogStreamHandler(k8sManager *service.K8sManager) *LogStreamHandler {
	return &LogStreamHandler{
		k8sManager: k8sManager,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

type logMessage struct {
	Type string `json:"type"` // "line" | "error" | "end"
	Data string `json:"data,omitempty"`
}

func (h *LogStreamHandler) handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.PathValue("namespace")
	name := r.PathValue("name")
	container := r.URL.Query().Get("container")

	tail := int64(200)
	if t := r.URL.Query().Get("tail"); t != "" {
		if n, err := strconv.ParseInt(t, 10, 64); err == nil && n >= 0 {
			tail = n
		}
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("upgrade failed: %v", err), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	client, err := h.k8sManager.GetClient()
	if err != nil {
		writeLogMsg(conn, logMessage{Type: "error", Data: err.Error()})
		return
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Cancel the stream if the client disconnects (closes the WS).
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	follow := true
	timestamps := false
	opts := &corev1.PodLogOptions{
		Container:  container,
		Follow:     follow,
		TailLines:  &tail,
		Timestamps: timestamps,
	}

	stream, err := client.CoreV1().Pods(namespace).GetLogs(name, opts).Stream(ctx)
	if err != nil {
		writeLogMsg(conn, logMessage{Type: "error", Data: err.Error()})
		return
	}
	defer stream.Close()

	// 1MB scan buffer so very long lines don't break the stream.
	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		if err := writeLogMsg(conn, logMessage{Type: "line", Data: scanner.Text()}); err != nil {
			return
		}
	}
	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		writeLogMsg(conn, logMessage{Type: "error", Data: err.Error()})
		return
	}
	writeLogMsg(conn, logMessage{Type: "end"})
}

func writeLogMsg(conn *websocket.Conn, msg logMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, data)
}

// Middleware intercepts /api/pods/{namespace}/{name}/logs/stream before Gofr
// routing so we can do the WebSocket upgrade with the raw response writer.
func (h *LogStreamHandler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/pods/") && strings.HasSuffix(r.URL.Path, "/logs/stream") {
			parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/pods/"), "/")
			if len(parts) == 4 && parts[2] == "logs" && parts[3] == "stream" {
				r.SetPathValue("namespace", parts[0])
				r.SetPathValue("name", parts[1])
				h.handle(w, r)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
