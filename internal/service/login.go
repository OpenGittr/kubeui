package service

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// loginTimeout bounds how long we wait for the user to finish the browser
// dance before giving up and killing the CLI.
const loginTimeout = 5 * time.Minute

// authURLPattern finds the verification URL cloud CLIs print when they cannot
// open a browser themselves, so the UI can offer it as a link.
var authURLPattern = regexp.MustCompile(`https://\S+`)

// LoginSession is one in-flight (or finished) provider login.
type LoginSession struct {
	ID       string `json:"id"`
	Command  string `json:"command"`
	Provider string `json:"provider"`
	Running  bool   `json:"running"`
	Output   string `json:"output"`
	Error    string `json:"error,omitempty"`
	AuthURL  string `json:"authUrl,omitempty"`
	Started  string `json:"startedAt"`
	Finished string `json:"finishedAt,omitempty"`
}

// LoginManager runs cloud-CLI logins on behalf of the UI. The commands come
// from a fixed per-provider allowlist with arguments derived from kubeconfig —
// never from a request body — so there is no injection surface.
type LoginManager struct {
	k8s      *K8sManager
	mu       sync.Mutex
	sessions map[string]*LoginSession
	buffers  map[string]*syncBuffer
	active   string
	counter  int
}

func NewLoginManager(k8s *K8sManager) *LoginManager {
	return &LoginManager{
		k8s:      k8s,
		sessions: make(map[string]*LoginSession),
		buffers:  make(map[string]*syncBuffer),
	}
}

// Start launches the login command for the current context's provider.
func (l *LoginManager) Start(status AuthStatus) (*LoginSession, error) {
	argv, ok := loginCommand(status.Provider, status.Account, status.AWSProfile)
	if !ok {
		return nil, fmt.Errorf("no known login command for provider %q", status.Provider)
	}

	if _, err := exec.LookPath(argv[0]); err != nil {
		return nil, fmt.Errorf("%s is not installed or not on PATH", argv[0])
	}

	l.mu.Lock()
	if l.active != "" && l.sessions[l.active].Running {
		existing := *l.sessions[l.active]
		l.mu.Unlock()
		return &existing, nil // one login at a time; return the one in flight
	}

	l.counter++
	id := strconv.Itoa(l.counter)
	buf := &syncBuffer{}
	session := &LoginSession{
		ID:       id,
		Command:  strings.Join(argv, " "),
		Provider: string(status.Provider),
		Running:  true,
		Started:  time.Now().Format(time.RFC3339),
	}
	l.sessions[id] = session
	l.buffers[id] = buf
	l.active = id
	l.mu.Unlock()

	go l.run(id, argv, buf)

	snapshot := *session
	return &snapshot, nil
}

func (l *LoginManager) run(id string, argv []string, buf *syncBuffer) {
	ctx, cancel := context.WithTimeout(context.Background(), loginTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Stdout = buf
	cmd.Stderr = buf
	err := cmd.Run()

	// Whether or not the CLI succeeded, credentials on disk may have changed.
	invalidateErr := l.k8s.InvalidateCredentials()

	l.mu.Lock()
	defer l.mu.Unlock()

	session := l.sessions[id]
	session.Running = false
	session.Finished = time.Now().Format(time.RFC3339)
	switch {
	case ctx.Err() == context.DeadlineExceeded:
		session.Error = "login timed out after 5 minutes"
	case err != nil:
		session.Error = fmt.Sprintf("%s: %v", session.Command, err)
	case invalidateErr != nil:
		session.Error = invalidateErr.Error()
	}
	if l.active == id {
		l.active = ""
	}
}

// Get returns a snapshot of a session, with output captured so far.
func (l *LoginManager) Get(id string) (*LoginSession, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	session, ok := l.sessions[id]
	if !ok {
		return nil, false
	}

	snapshot := *session
	snapshot.Output = l.buffers[id].String()
	if url := authURLPattern.FindString(snapshot.Output); url != "" {
		snapshot.AuthURL = strings.TrimRight(url, ".,)")
	}
	return &snapshot, true
}

// syncBuffer is a concurrency-safe sink for command output, since the command
// writes from its own goroutine while HTTP handlers poll for progress.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.buf.Write(p)
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.buf.String()
}
