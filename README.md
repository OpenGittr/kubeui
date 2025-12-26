# KubeUI - Kubernetes Dashboard

A lightweight, local-first Kubernetes monitoring and management UI. Single binary, no installation hassle.

## Features

- **Multi-cluster Support** - Switch between kubeconfig contexts seamlessly
- **Real-time Updates** - Live resource status via WebSocket
- **Comprehensive Views** - Pods, Deployments, Services, ConfigMaps, Secrets, and 20+ resource types
- **YAML Editor** - View and edit any Kubernetes resource
- **Pod Logs** - Real-time log streaming with follow mode
- **Resource Metrics** - CPU/Memory usage for nodes and containers
- **Single Binary** - No dependencies, just download and run

## Installation

### Homebrew (macOS/Linux)

```bash
brew install opengittr/tap/kubeui
```

### Install Script

```bash
curl -sSL https://raw.githubusercontent.com/opengittr/kubeui/main/scripts/install.sh | sh
```

### Manual Download

Download the latest release from [GitHub Releases](https://github.com/opengittr/kubeui/releases).

## Quick Start

```bash
# Start KubeUI (opens browser automatically)
kubeui

# Start on a specific port
kubeui --port 9090

# Start without opening browser
kubeui --no-browser
```

KubeUI uses your existing `~/.kube/config` for authentication. No additional configuration required.

## Configuration

| Flag | Environment | Default | Description |
|------|-------------|---------|-------------|
| `--port` | `HTTP_PORT` | 8080 | Server port |
| `--no-browser` | - | false | Don't auto-open browser |

## Development

### Prerequisites

- Go 1.21+
- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/opengittr/kubeui.git
cd kubeui

# Install frontend dependencies
cd web && npm install && cd ..

# Run in development mode (two terminals)
make dev-frontend  # Terminal 1: Frontend dev server
make dev-backend   # Terminal 2: Go backend
```

### Build

```bash
# Build single binary with embedded frontend
make build

# Run the built binary
./bin/kubeui
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│  (TailwindCSS, React Query, WebSocket)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/WebSocket
┌─────────────────────▼───────────────────────────────────────┐
│                    GoFr Backend                             │
│  (REST API, WebSocket Hub, K8s Client Manager)             │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Kubernetes API Server(s)                        │
│  (via kubeconfig contexts)                                  │
└─────────────────────────────────────────────────────────────┘
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
