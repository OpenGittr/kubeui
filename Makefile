.PHONY: build dev clean frontend backend all

# Build frontend
frontend:
	cd web && npm install && npm run build

# Copy frontend to cmd for embedding
prepare-embed: frontend
	rm -rf cmd/dist
	cp -r web/dist cmd/dist

# Build backend (requires frontend to be built first)
backend: prepare-embed
	go build -o bin/kubeui ./cmd/main.go

# Build everything
build: backend

# Development mode - run frontend and backend separately
dev-frontend:
	cd web && npm run dev

dev-backend:
	go run ./cmd/main.go --no-browser

# Clean build artifacts
clean:
	rm -rf bin/
	rm -rf cmd/dist
	rm -rf web/dist
	rm -rf web/node_modules

# Run the built binary
run: build
	./bin/kubeui

# Build for all platforms (for release)
release: prepare-embed
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/kubeui-darwin-arm64 ./cmd/main.go
	GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o bin/kubeui-darwin-amd64 ./cmd/main.go
	GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/kubeui-linux-amd64 ./cmd/main.go
	GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o bin/kubeui-linux-arm64 ./cmd/main.go
	GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/kubeui-windows-amd64.exe ./cmd/main.go
