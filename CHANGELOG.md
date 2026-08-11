# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-08-11

### Added

- **Cloud re-authentication** - Detect expired cloud credentials and re-login
  via `gcloud` without leaving the UI
- **Cluster topology** - Node view grouped by nodepool, with pod placement
- **Revision history** - View rollout history and roll back Deployments,
  StatefulSets, and DaemonSets

### Fixed

- GKE auth now prioritizes the active `gcloud` account over the first match (#1)
- Dark mode: amber surfaces and health-card count badges rendered
  light-on-light and were effectively unreadable

### Changed

- Local dev ports moved into the project's assigned range (UI 4600, API 4610)

## [0.3.0] - 2026-04-28

### Added

- Multi-pod log tailing
- HPA cross-references on workload views
- Morning-check overview dashboard

## [0.2.0] - 2026-04-27

### Added

- Edit actions for resources
- Dark mode
- Deep-linkable resource routes
- Column sorting
- Permission-based gating of destructive actions

## [0.1.4] - 2025-12-27

### Added

- Detail panels across all resource pages
- Unified MetadataTabs component with secret value protection
- Deployment and DaemonSet detail panels with container resource metrics

### Fixed

- Unused variable errors in MetadataTabs and ConfigMaps

## [0.1.3] - 2025-12-26

### Added

- Pod exec/shell terminal
- Pod port-forwarding
- Styled confirmation dialogs for destructive actions

### Fixed

- CI: build frontend before `go vet`

## [0.1.2] - 2025-12-26

### Changed

- Rebranded to KubeUI, with new logo and UI improvements

## [0.1.1] - 2025-12-26

### Fixed

- Port detection for the standalone binary

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

[Unreleased]: https://github.com/opengittr/kubeui/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/opengittr/kubeui/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/opengittr/kubeui/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/opengittr/kubeui/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/opengittr/kubeui/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/opengittr/kubeui/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/opengittr/kubeui/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/opengittr/kubeui/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/opengittr/kubeui/releases/tag/v0.1.0
