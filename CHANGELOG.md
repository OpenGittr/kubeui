# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-12-26

### Added

- Initial release
- **Multi-cluster support** - Switch between kubeconfig contexts
- **Real-time updates** - WebSocket-based live resource status
- **Resource views** for 24+ Kubernetes resource types:
  - Workloads: Pods, Deployments, DaemonSets, StatefulSets, ReplicaSets, Jobs, CronJobs
  - Config: ConfigMaps, Secrets
  - Network: Services, Ingresses, Endpoints, NetworkPolicies
  - Storage: PersistentVolumes, PersistentVolumeClaims, StorageClasses
  - RBAC: ServiceAccounts
  - Cluster: Nodes, Namespaces, Events
  - Policy: ResourceQuotas, LimitRanges, HPA
  - Custom: CRDs and Custom Resources
- **YAML editor** - View and edit any Kubernetes resource
- **Pod log viewer** - Real-time log streaming with follow mode and download
- **Resource metrics** - CPU/Memory usage for nodes and containers
- **Search and filter** - Quick filtering across all resource tables
- **Sortable columns** - Click headers to sort resources
- **Single binary** - Embedded frontend, no dependencies
- **Cross-platform** - macOS (Intel/Apple Silicon), Linux, Windows

### Technical

- Go backend using GoFr framework
- React frontend with TailwindCSS
- Kubernetes client-go for API access
- WebSocket for real-time updates
- Embedded frontend via Go embed

[Unreleased]: https://github.com/opengittr/kubeui/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/opengittr/kubeui/releases/tag/v0.1.0
