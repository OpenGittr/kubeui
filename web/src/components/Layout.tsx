import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ClusterStatus } from '../App';
import { ClusterSelect } from './ClusterSelect';
import { NamespaceSelect } from './NamespaceSelect';
import { api } from '../services/api';
import {
  Box,
  Server,
  Network,
  Settings,
  Layers,
  Play,
  HardDrive,
  AlertCircle,
  CheckCircle,
  Loader2,
  Lock,
  Puzzle,
  Monitor,
  Activity,
  Globe,
  Clock,
  Folder,
  User,
  Gauge,
  Search,
  X,
  Github,
  Bug,
  Star,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: '',
    items: [
      { path: '/', label: 'Overview', icon: Box },
      { path: '/nodes', label: 'Nodes', icon: Monitor },
      { path: '/namespaces', label: 'Namespaces', icon: Folder },
      { path: '/events', label: 'Events', icon: Clock },
    ],
  },
  {
    title: 'Workloads',
    items: [
      { path: '/pods', label: 'Pods', icon: Server },
      { path: '/deployments', label: 'Deployments', icon: Layers },
      { path: '/daemonsets', label: 'DaemonSets', icon: Layers },
      { path: '/statefulsets', label: 'StatefulSets', icon: Layers },
      { path: '/replicasets', label: 'ReplicaSets', icon: Layers },
      { path: '/jobs', label: 'Jobs', icon: Play },
    ],
  },
  {
    title: 'Config',
    items: [
      { path: '/configmaps', label: 'ConfigMaps', icon: Settings },
      { path: '/secrets', label: 'Secrets', icon: Lock },
      { path: '/quotas', label: 'Quotas/Limits', icon: Gauge },
      { path: '/hpa', label: 'HPA', icon: Activity },
    ],
  },
  {
    title: 'Network',
    items: [
      { path: '/services', label: 'Services', icon: Network },
      { path: '/ingresses', label: 'Ingresses', icon: Globe },
      { path: '/endpoints', label: 'Endpoints', icon: Globe },
      { path: '/networkpolicies', label: 'Network Policies', icon: Globe },
    ],
  },
  {
    title: 'Storage',
    items: [
      { path: '/storage', label: 'PV/PVC', icon: HardDrive },
      { path: '/storageclasses', label: 'Storage Classes', icon: HardDrive },
    ],
  },
  {
    title: 'Access Control',
    items: [
      { path: '/serviceaccounts', label: 'Service Accounts', icon: User },
    ],
  },
  {
    title: 'Custom Resources',
    items: [
      { path: '/crds', label: 'CRDs', icon: Puzzle },
    ],
  },
];

interface LayoutProps {
  children: React.ReactNode;
  currentCluster?: string;
  currentNamespace?: string;
  clusters?: { name: string; isCurrent: boolean }[];
  namespaces?: { name: string }[];
  clusterStatuses?: Record<string, ClusterStatus>;
  onClusterChange?: (cluster: string) => void;
  onNamespaceChange?: (namespace: string) => void;
  connectionStatus?: 'connected' | 'error' | 'loading';
  connectionError?: string;
  isSwitching?: boolean;
  namespacesLoading?: boolean;
}

// Resource type to route mapping
const resourceTypeRoutes: Record<string, string> = {
  Pod: '/pods',
  Deployment: '/deployments',
  Service: '/services',
  ConfigMap: '/configmaps',
  Secret: '/secrets',
  Ingress: '/ingresses',
  DaemonSet: '/daemonsets',
  StatefulSet: '/statefulsets',
};

// Resource type to icon mapping
const resourceTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Pod: Server,
  Deployment: Layers,
  Service: Network,
  ConfigMap: Settings,
  Secret: Lock,
  Ingress: Globe,
  DaemonSet: Layers,
  StatefulSet: Layers,
};

// Nav items for quick navigation (when no search query)
const navSearchItems = navGroups.flatMap(group =>
  group.items.map(item => ({
    ...item,
    group: group.title || 'General',
  }))
);

export function Layout({
  children,
  currentCluster,
  currentNamespace,
  clusters = [],
  namespaces = [],
  clusterStatuses = {},
  onClusterChange,
  onNamespaceChange,
  connectionStatus = 'connected',
  connectionError,
  isSwitching = false,
  namespacesLoading = false,
}: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Query K8s resources when we have a search query
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['search', debouncedQuery, currentNamespace],
    queryFn: () => api.search.query(debouncedQuery, currentNamespace || undefined),
    enabled: searchOpen && debouncedQuery.length >= 2,
  });

  // Fetch version info
  const { data: versionInfo } = useQuery({
    queryKey: ['version'],
    queryFn: api.version.check,
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  // Fetch GitHub stars
  const { data: starCount } = useQuery({
    queryKey: ['github-stars'],
    queryFn: api.github.getStars,
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  // Filter nav items for quick navigation
  const filteredNavItems = useMemo(() => {
    if (!searchQuery) return navSearchItems;
    return navSearchItems.filter(item =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Keyboard shortcut for search (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      setSearchQuery('');
    }
  }, [searchOpen]);

  const handleSearchSelect = (path: string) => {
    navigate(path);
    setSearchOpen(false);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col">
        <div className="h-14 px-4 border-b border-gray-800 flex items-center">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <img src="/kubeui.svg" alt="KubeUI" className="w-7 h-7" />
            KubeUI
          </h1>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto">
          {navGroups.map((group, groupIndex) => (
            <div key={groupIndex} className={group.title ? 'mt-4' : ''}>
              {group.title && (
                <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {group.title}
                </div>
              )}
              {group.items.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm">{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Sidebar Footer - inside scroll area */}
          <div className="mt-6 pt-3 border-t border-gray-800 text-xs">
            <div className="flex items-center justify-between text-gray-500 px-1">
              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/opengittr/kubeui"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                >
                  <Github className="w-3.5 h-3.5" />
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 text-yellow-500" />
                    {starCount ?? '—'}
                  </span>
                </a>
                <a
                  href="https://github.com/opengittr/kubeui/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-300 transition-colors"
                  title="Report Issue"
                >
                  <Bug className="w-3.5 h-3.5" />
                </a>
              </div>
              {versionInfo && (
                <span className="text-gray-600">
                  v{versionInfo.current}
                  {versionInfo.updateAvailable && (
                    <a
                      href={versionInfo.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-blue-400 hover:text-blue-300"
                    >
                      ↑
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Cluster:</label>
            <ClusterSelect
              clusters={clusters}
              currentCluster={currentCluster}
              clusterStatuses={clusterStatuses}
              onChange={(cluster) => onClusterChange?.(cluster)}
              disabled={isSwitching}
            />

            {/* Connection status indicator */}
            {isSwitching ? (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            ) : connectionStatus === 'connected' ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : connectionStatus === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Namespace:</label>
            <NamespaceSelect
              namespaces={namespaces.map((ns) => ns.name)}
              value={currentNamespace || ''}
              onChange={(ns) => onNamespaceChange?.(ns)}
              disabled={isSwitching || connectionStatus === 'error'}
              isLoading={namespacesLoading}
            />
          </div>

          {/* Search button */}
          <div className="flex-1" />
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200"
          >
            <Search className="w-4 h-4" />
            <span>Search...</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-xs bg-gray-200 rounded">⌘K</kbd>
          </button>
        </header>

        {/* Connection error banner */}
        {connectionStatus === 'error' && connectionError && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="text-sm text-red-700">
              <span className="font-medium">Connection failed:</span>{' '}
              {connectionError}
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6 bg-gray-50">{children}</main>
      </div>

      {/* Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50" onClick={() => setSearchOpen(false)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-4 border-b">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search pods, deployments, services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 outline-none text-lg"
              />
              {searchLoading && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
              <button onClick={() => setSearchOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-96 overflow-auto">
              {/* K8s Resource Results */}
              {debouncedQuery.length >= 2 && searchResults && searchResults.length > 0 && (
                <div className="py-2 border-b">
                  <div className="px-4 py-1 text-xs font-medium text-gray-500 uppercase">Resources</div>
                  {searchResults.map((result, idx) => {
                    const Icon = resourceTypeIcons[result.type] || Box;
                    const route = resourceTypeRoutes[result.type] || '/';
                    return (
                      <button
                        key={`${result.type}-${result.namespace}-${result.name}-${idx}`}
                        onClick={() => {
                          navigate(route);
                          setSearchOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-100"
                      >
                        <Icon className="w-5 h-5 text-gray-400" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{result.name}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-2">
                            <span>{result.type}</span>
                            {result.namespace && <span className="text-gray-300">•</span>}
                            {result.namespace && <span>{result.namespace}</span>}
                            {result.status && <span className="text-gray-300">•</span>}
                            {result.status && (
                              <span className={result.status === 'Running' ? 'text-green-600' : result.status === 'Failed' ? 'text-red-600' : ''}>
                                {result.status}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">{result.age}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* No K8s results message */}
              {debouncedQuery.length >= 2 && searchResults && searchResults.length === 0 && !searchLoading && (
                <div className="p-4 text-center text-gray-500 border-b">
                  No resources found for "{debouncedQuery}"
                </div>
              )}

              {/* Navigation Items */}
              {filteredNavItems.length > 0 && (
                <div className="py-2">
                  <div className="px-4 py-1 text-xs font-medium text-gray-500 uppercase">Pages</div>
                  {filteredNavItems.slice(0, 8).map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => handleSearchSelect(item.path)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-100 ${isActive ? 'bg-blue-50 text-blue-600' : ''}`}
                      >
                        <Icon className="w-5 h-5 text-gray-400" />
                        <div>
                          <div className="font-medium">{item.label}</div>
                          <div className="text-xs text-gray-400">{item.group}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500 flex items-center gap-4">
              <span><kbd className="px-1 py-0.5 bg-gray-200 rounded">↵</kbd> to select</span>
              <span><kbd className="px-1 py-0.5 bg-gray-200 rounded">esc</kbd> to close</span>
              {debouncedQuery.length < 2 && searchQuery.length > 0 && (
                <span className="text-gray-400">Type at least 2 characters to search resources</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
