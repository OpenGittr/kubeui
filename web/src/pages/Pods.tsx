import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { PodInfo } from '../services/api';
import { Trash2, RefreshCw, FileText, FileCode, X, ChevronRight, Info, Terminal, Plug } from 'lucide-react';
import { useRef, useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import type { ActionMenuItem } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MultiTerminal } from '../components/MultiTerminal';
import type { TerminalSession } from '../components/MultiTerminal';
import { PortForwardModal } from '../components/PortForwardModal';
import { MultiPodLogModal } from '../components/MultiPodLogModal';
import type { PodTarget } from '../components/MultiPodLogModal';
import { ContainerCard } from '../components/ContainerCard';
import { MetadataTabs } from '../components/MetadataTabs';
import { usePermissions } from '../hooks/usePermissions';
import { useTableSort, ageSeconds } from '../hooks/useTableSort';
import { SortableTh } from '../components/SortableTh';
import { useSelectedResource } from '../hooks/useSelectedResource';

const POD_CHECKS = [
  { verb: 'delete', group: '', resource: 'pods' },
];

const POD_SORTERS = {
  name: (p: PodInfo) => p.name,
  namespace: (p: PodInfo) => p.namespace,
  status: (p: PodInfo) => p.status,
  ready: (p: PodInfo) => p.ready,
  restarts: (p: PodInfo) => p.restarts,
  age: (p: PodInfo) => -ageSeconds(p.age), // newest first
  node: (p: PodInfo) => p.node ?? '',
};

interface PodsProps {
  namespace?: string;
  isConnected?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Running: 'bg-green-100 text-green-800',
    Pending: 'bg-yellow-100 text-yellow-800',
    Succeeded: 'bg-blue-100 text-blue-800',
    Failed: 'bg-red-100 text-red-800',
    Unknown: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.Unknown}`}>
      {status}
    </span>
  );
}

function LogModal({ pod, onClose }: { pod: PodInfo; onClose: () => void }) {
  const [selectedContainer, setSelectedContainer] = useState<string>('');

  const { data: podDetails, isLoading } = useQuery({
    queryKey: ['pod-details', pod.namespace, pod.name],
    queryFn: () => api.pods.get(pod.namespace, pod.name),
  });

  const containers = podDetails?.containers || [];
  const activeContainer = selectedContainer || containers[0]?.name || '';

  if (isLoading || !podDetails) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <div className="bg-[#1e1e1e] text-gray-100 rounded-lg px-6 py-4 text-sm">Loading containers...</div>
      </div>
    );
  }

  const targets: PodTarget[] = [{
    namespace: pod.namespace,
    name: pod.name,
    container: activeContainer || undefined,
  }];

  const containerSelector = containers.length > 1 ? (
    <select
      value={activeContainer}
      onChange={(e) => setSelectedContainer(e.target.value)}
      className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
      title="Select container"
    >
      {containers.map((c) => (
        <option key={c.name} value={c.name}>{c.name}</option>
      ))}
    </select>
  ) : null;

  return (
    <MultiPodLogModal
      key={activeContainer}
      title={`Logs · ${pod.namespace}/${pod.name}${activeContainer && containers.length === 1 ? ` · ${activeContainer}` : ''}`}
      pods={targets}
      headerExtra={containerSelector}
      onClose={onClose}
    />
  );
}

function PodDetailsPanel({ pod, onClose, onViewLogs, onViewYaml, actions }: {
  pod: PodInfo;
  onClose: () => void;
  onViewLogs: () => void;
  onViewYaml: () => void;
  actions?: ActionMenuItem[];
}) {
  const { data: podDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['pod-details', pod.namespace, pod.name],
    queryFn: () => api.pods.get(pod.namespace, pod.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['pod-events', pod.namespace, pod.name],
    queryFn: () => api.pods.events(pod.namespace, pod.name),
  });

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold">{pod.name}</h2>
          <p className="text-sm text-gray-500">{pod.namespace}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewLogs}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            <FileText className="w-4 h-4" />
            Logs
          </button>
          <button
            onClick={onViewYaml}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            <FileCode className="w-4 h-4" />
            YAML
          </button>
          {actions && actions.length > 0 && <ActionMenu items={actions} />}
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Status Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Status</div>
            <div className="font-medium"><StatusBadge status={pod.status} /></div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Ready</div>
            <div className="font-medium">{pod.ready}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Restarts</div>
            <div className="font-medium">{pod.restarts}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{pod.age}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Node</div>
            <div className="font-medium text-sm truncate">{pod.node || '-'}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">IP</div>
            <div className="font-medium font-mono text-sm">{pod.ip || '-'}</div>
          </div>
        </div>

        {/* Containers */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Containers</h3>
          {detailsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : podDetails?.containers && podDetails.containers.length > 0 ? (
            <div className="space-y-2">
              {podDetails.containers.map((container) => (
                <ContainerCard
                  key={container.name}
                  name={container.name}
                  image={container.image}
                  ready={container.ready}
                  state={container.state}
                  restarts={container.restartCount}
                  resources={{
                    cpu: container.resources?.cpu || { request: 0, limit: 0, usage: 0 },
                    memory: container.resources?.memory || { request: 0, limit: 0, usage: 0 },
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No container info available</p>
          )}
        </div>

        {/* Tabbed Metadata Section */}
        <MetadataTabs
          tabs={[
            { key: 'env', label: 'Environment', envData: podDetails?.containers?.map(c => ({ name: c.name, env: c.env || [] })) },
            { key: 'labels', label: 'Labels', data: podDetails?.labels },
          ]}
        />

        {/* Events */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Events</h3>
          {eventsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : events && events.length > 0 ? (
            <div className="space-y-2">
              {events.map((event, idx) => (
                <div key={idx} className={`border-l-2 pl-3 py-1 ${
                  event.type === 'Warning' ? 'border-yellow-400' : 'border-green-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      event.type === 'Warning' ? 'text-yellow-700' : 'text-green-700'
                    }`}>
                      {event.reason}
                    </span>
                    {event.count > 1 && (
                      <span className="text-xs text-gray-400">x{event.count}</span>
                    )}
                    <span className="text-xs text-gray-400">{event.age}</span>
                  </div>
                  <p className="text-sm text-gray-600">{event.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No events</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function Pods({ namespace, isConnected = true }: PodsProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [logPod, setLogPod] = useState<PodInfo | null>(null);
  const [yamlPod, setYamlPod] = useState<PodInfo | null>(null);
  const [selectedPod, setSelectedPod] = useState<PodInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PodInfo | null>(null);
  const { can } = usePermissions(namespace, POD_CHECKS);
  const canDelete = can('delete', '', 'pods');
  const deleteTitle = canDelete ? undefined : 'Requires delete on pods';
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([]);
  const [terminalMinimized, setTerminalMinimized] = useState(false);
  const [portForwardPod, setPortForwardPod] = useState<PodInfo | null>(null);
  // Monotonic counter for unique session ids (Date.now in render trips the
  // react-hooks/purity lint; useRef keeps it stable + lint-clean).
  const sessionCounter = useRef(0);

  const openTerminal = (pod: PodInfo, containerName?: string) => {
    sessionCounter.current += 1;
    const sessionId = `${pod.namespace}/${pod.name}${containerName ? `/${containerName}` : ''}-${sessionCounter.current}`;
    setTerminalSessions((prev) => [
      ...prev,
      {
        id: sessionId,
        namespace: pod.namespace,
        podName: pod.name,
        containerName,
      },
    ]);
    setTerminalMinimized(false); // Expand terminal when adding new session
  };

  const closeTerminal = (sessionId: string) => {
    setTerminalSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const reconnectTerminal = (sessionId: string) => {
    setTerminalSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, reconnectKey: (s.reconnectKey || 0) + 1 } : s
      )
    );
  };

  const closeAllTerminals = () => {
    setTerminalSessions([]);
  };

  const { data: pods, isLoading, error } = useQuery({
    queryKey: ['pods', namespace],
    queryFn: () => api.pods.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });
  useSelectedResource(pods, selectedPod, setSelectedPod);
  const sort = useTableSort(pods, POD_SORTERS);

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.pods.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['pods'] });
      addToast(`Deleted pod ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading pods...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  const actionsFor = (pod: PodInfo): ActionMenuItem[] => [
    {
      label: 'Shell',
      icon: <Terminal className="w-4 h-4" />,
      onClick: () => openTerminal(pod),
    },
    {
      label: 'Port Forward',
      icon: <Plug className="w-4 h-4" />,
      onClick: () => setPortForwardPod(pod),
    },
    {
      label: 'Delete',
      icon: <Trash2 className="w-4 h-4" />,
      variant: 'danger',
      disabled: !canDelete,
      title: deleteTitle,
      onClick: () => setDeleteTarget(pod),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Pods</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['pods'] })}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <SortableTh sortKey="name" label="Name" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="namespace" label="Namespace" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="status" label="Status" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="ready" label="Ready" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="restarts" label="Restarts" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="age" label="Age" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="node" label="Node" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sort.sorted.map((pod) => (
              <tr
                key={`${pod.namespace}/${pod.name}`}
                className={`hover:bg-gray-50 cursor-pointer ${selectedPod?.name === pod.name && selectedPod?.namespace === pod.namespace ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedPod(pod)}
              >
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-1">
                    {pod.name}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{pod.namespace}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={pod.status} />
                </td>
                <td className="px-4 py-3 text-sm">{pod.ready}</td>
                <td className="px-4 py-3 text-sm">{pod.restarts}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{pod.age}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{pod.node}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      {
                        label: 'Details',
                        icon: <Info className="w-4 h-4" />,
                        onClick: () => setSelectedPod(pod),
                      },
                      {
                        label: 'Shell',
                        icon: <Terminal className="w-4 h-4" />,
                        onClick: () => openTerminal(pod),
                      },
                      {
                        label: 'Port Forward',
                        icon: <Plug className="w-4 h-4" />,
                        onClick: () => setPortForwardPod(pod),
                      },
                      {
                        label: 'Logs',
                        icon: <FileText className="w-4 h-4" />,
                        onClick: () => setLogPod(pod),
                      },
                      {
                        label: 'View YAML',
                        icon: <FileCode className="w-4 h-4" />,
                        onClick: () => setYamlPod(pod),
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 className="w-4 h-4" />,
                        variant: 'danger',
                        disabled: !canDelete,
                        title: deleteTitle,
                        onClick: () => setDeleteTarget(pod),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!pods || pods.length === 0) && (
          <div className="text-center py-8 text-gray-500">No pods found</div>
        )}
      </div>

      {logPod && <LogModal pod={logPod} onClose={() => setLogPod(null)} />}
      {yamlPod && (
        <YamlModal
          resourceType="pods"
          namespace={yamlPod.namespace}
          name={yamlPod.name}
          onClose={() => setYamlPod(null)}
        />
      )}
      {selectedPod && (
        <PodDetailsPanel
          pod={selectedPod}
          actions={actionsFor(selectedPod)}
          onClose={() => setSelectedPod(null)}
          onViewLogs={() => {
            setLogPod(selectedPod);
          }}
          onViewYaml={() => {
            setYamlPod(selectedPod);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Pod"
        message={`Are you sure you want to delete pod "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(
              { ns: deleteTarget.namespace, name: deleteTarget.name },
              { onSettled: () => setDeleteTarget(null) }
            );
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {terminalSessions.length > 0 && (
        <MultiTerminal
          sessions={terminalSessions}
          onRemoveSession={closeTerminal}
          onReconnectSession={reconnectTerminal}
          onClose={closeAllTerminals}
          isMinimized={terminalMinimized}
          onToggleMinimize={() => setTerminalMinimized((m) => !m)}
        />
      )}

      {portForwardPod && (
        <PortForwardModal
          pod={portForwardPod}
          onClose={() => setPortForwardPod(null)}
        />
      )}
    </div>
  );
}
