# Contributing to KubeUI

Thank you for your interest in contributing to KubeUI! This document provides guidelines and information for contributors.

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all backgrounds and experience levels.

## Getting Started

### Prerequisites

- Go 1.21 or later
- Node.js 18 or later
- npm
- Access to a Kubernetes cluster (for testing)

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/kubeui.git
   cd kubeui
   ```

2. **Install frontend dependencies**
   ```bash
   cd web
   npm install
   cd ..
   ```

3. **Run in development mode**
   ```bash
   # Terminal 1: Frontend dev server (hot reload)
   make dev-frontend

   # Terminal 2: Backend server
   make dev-backend
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:9090

### Building

```bash
# Full build (frontend + backend)
make build

# Just frontend
make frontend

# Just backend (requires frontend built first)
make backend
```

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists in [GitHub Issues](https://github.com/opengittr/kubeui/issues)
2. Create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Go version, K8s version)

### Suggesting Features

1. Open a [GitHub Discussion](https://github.com/opengittr/kubeui/discussions) or Issue
2. Describe the use case and proposed solution
3. Be open to feedback and alternatives

### Pull Requests

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow existing code style
   - Add tests if applicable
   - Update documentation if needed

3. **Test your changes**
   ```bash
   # Build and run
   make build
   ./bin/kubeui

   # Verify functionality against a real cluster
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "Add feature: brief description"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **PR Guidelines**
   - Reference any related issues
   - Describe what changed and why
   - Include screenshots for UI changes

## Project Structure

```
kubeui/
├── cmd/                    # Application entry point
│   └── main.go
├── internal/
│   ├── handler/           # HTTP/WebSocket handlers
│   └── service/           # Business logic, K8s client
├── web/                   # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Route pages
│   │   └── services/      # API client
│   └── package.json
├── configs/               # Configuration files
├── Makefile              # Build commands
└── .goreleaser.yml       # Release configuration
```

## Style Guidelines

### Go

- Follow standard Go conventions
- Use `gofmt` for formatting
- Keep functions focused and small
- Handle errors explicitly

### TypeScript/React

- Use TypeScript for all new code
- Follow existing component patterns
- Use Tailwind CSS for styling
- Prefer functional components with hooks

### Commits

- Use present tense ("Add feature" not "Added feature")
- Keep commits focused on single changes
- Reference issues when relevant (#123)

## Testing

Currently, testing is primarily manual against real Kubernetes clusters. We welcome contributions to add automated tests:

- Backend: Go testing framework
- Frontend: Vitest + React Testing Library

## Questions?

- Open a [GitHub Discussion](https://github.com/opengittr/kubeui/discussions)
- Check existing issues and PRs

Thank you for contributing!
