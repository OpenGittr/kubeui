package handler

import (
	"embed"
	"io/fs"
	"net/http"
	"path/filepath"
	"strings"
)

// StaticFileServer serves embedded static files with SPA support
type StaticFileServer struct {
	fileSystem http.FileSystem
	indexHTML  []byte
}

// NewStaticFileServer creates a new static file server from embedded FS
func NewStaticFileServer(embeddedFS embed.FS, subDir string) (*StaticFileServer, error) {
	subFS, err := fs.Sub(embeddedFS, subDir)
	if err != nil {
		return nil, err
	}

	indexHTML, err := fs.ReadFile(subFS, "index.html")
	if err != nil {
		return nil, err
	}

	return &StaticFileServer{
		fileSystem: http.FS(subFS),
		indexHTML:  indexHTML,
	}, nil
}

// Middleware returns an http middleware that serves static files
// Non-matching requests are passed to the next handler (GoFr API)
func (s *StaticFileServer) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Let API requests pass through to GoFr
		if strings.HasPrefix(path, "/api/") ||
			strings.HasPrefix(path, "/.well-known/") {
			next.ServeHTTP(w, r)
			return
		}

		// Try to serve static file
		if path != "/" {
			cleanPath := strings.TrimPrefix(path, "/")
			if file, err := s.fileSystem.Open(cleanPath); err == nil {
				file.Close()

				// Set cache headers for assets
				ext := filepath.Ext(path)
				if strings.HasPrefix(path, "/assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}

				// Set content type for common extensions
				switch ext {
				case ".js":
					w.Header().Set("Content-Type", "application/javascript")
				case ".css":
					w.Header().Set("Content-Type", "text/css")
				case ".svg":
					w.Header().Set("Content-Type", "image/svg+xml")
				case ".png":
					w.Header().Set("Content-Type", "image/png")
				case ".ico":
					w.Header().Set("Content-Type", "image/x-icon")
				}

				http.FileServer(s.fileSystem).ServeHTTP(w, r)
				return
			}
		}

		// Serve index.html for SPA routes (fallback)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Write(s.indexHTML)
	})
}
