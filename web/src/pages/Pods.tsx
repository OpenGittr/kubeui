import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { PodInfo, ContainerResource } from '../services/api';
import { Trash2, RefreshCw, FileText, FileCode, X, ChevronRight, Info, Download, Play, Pause } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';

// Container resource usage bar with request/limit/usage visualization
function ContainerResourceBar({
  label,
  usage,
  request,
  limit,
  formatValue
}: {
  label: string;
  usage: number;
  request: number;
  limit: number;
  formatValue: (v: number) => string;
}) {
  // Scale bar to limit (if set), otherwise request, otherwise usage
  const maxValue = limit > 0 ? limit : (request > 0 ? request * 1.5 : usage * 1.5);
  const usagePercent = maxValue > 0 ? (usage / maxValue) * 100 : 0;
  const requestPercent = maxValue > 0 && request > 0 ? (request / maxValue) * 100 : 0;

  // Color based on usage vs request
  const getColor = () => {
    if (limit > 0 && usage > limit * 0.9) return 'bg-red-500';
    if (request > 0 && usage > request) return 'bg-orange-500';
    if (request > 0 && usage > request * 0.8) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium text-gray-600">{label}</div>
      <div className="h-3 bg-gray-200 rounded relative">
        {/* Usage bar */}
        <div
          className={`h-full ${getColor()} rounded-l transition-all flex items-center justify-end`}
          style={{ width: `${Math.max(Math.min(usagePercent, 100), 2)}%` }}
        >
          {usagePercent >= 15 && (
            <span className="text-[10px] text-white font-medium pr-1">{formatValue(usage)}</span>
          )}
        </div>
        {/* Usage label outside bar if bar is too small */}
        {usagePercent < 15 && (
          <span
            className="absolute top-0 h-full flex items-center text-[10px] text-gray-600 font-medium pl-1"
            style={{ left: `${Math.max(Math.min(usagePercent, 100), 2)}%` }}
          >
            {formatValue(usage)}
          </span>
        )}
        {/* Request marker (blue line with label) */}
        {request > 0 && requestPercent <= 100 && (
          <div
            className="absolute top-0 h-full flex flex-col items-center"
            style={{ left: `${requestPercent}%` }}
          >
            <div className="w-0.5 h-full bg-blue-600"></div>
            <span className="absolute -bottom-3.5 text-[9px] text-blue-600 font-medium whitespace-nowrap -translate-x-1/2">
              req {formatValue(request)}
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-3">
        <span>0</span>
        {limit > 0 && <span>limit {formatValue(limit)}</span>}
      </div>
      {/* Legend */}
      <div className="flex gap-3 text-[9px] text-gray-400 mt-1">
        <span><span className="inline-block w-2 h-2 bg-green-500 rounded-sm mr-0.5"></span>current</span>
        {request > 0 && <span><span className="inline-block w-2 h-0.5 bg-blue-600 mr-0.5"></span>request</span>}
        {limit > 0 && <span className="text-gray-400">|→ limit</span>}
      </div>
    </div>
  );
}

function ContainerResources({ resources }: { resources?: ContainerResource }) {
  if (!resources) return null;

  const formatCPU = (m: number) => m >= 1000 ? `${(m/1000).toFixed(1)}` : `${m}m`;
  const formatMem = (b: number) => {
    if (b >= 1024*1024*1024) return `${(b/(1024*1024*1024)).toFixed(1)}Gi`;
    if (b >= 1024*1024) return `${(b/(1024*1024)).toFixed(0)}Mi`;
    return `${(b/1024).toFixed(0)}Ki`;
  };

  const hasCPU = resources.cpu.usage > 0 || resources.cpu.request > 0;
  const hasMem = resources.memory.usage > 0 || resources.memory.request > 0;

  if (!hasCPU && !hasMem) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
      {hasCPU && (
        <ContainerResourceBar
          label="CPU"
          usage={resources.cpu.usage}
          request={resources.cpu.request}
          limit={resources.cpu.limit}
          formatValue={formatCPU}
        />
      )}
      {hasMem && (
        <ContainerResourceBar
          label="Memory"
          usage={resources.memory.usage}
          request={resources.memory.request}
          limit={resources.memory.limit}
          formatValue={formatMem}
        />
      )}
    </div>
  );
}

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
  const [tailLines, setTailLines] = useState<number>(500);
  const [follow, setFollow] = useState(false);

  // Fetch pod details to get container list
  const { data: podDetails } = useQuery({
    queryKey: ['pod-details', pod.namespace, pod.name],
    queryFn: () => api.pods.get(pod.namespace, pod.name),
  });

  const containers = podDetails?.containers || [];
  const activeContainer = selectedContainer || containers[0]?.name || '';

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['pod-logs', pod.namespace, pod.name, activeContainer, tailLines],
    queryFn: () => api.pods.logs(pod.namespace, pod.name, activeContainer || undefined, tailLines || undefined),
    refetchInterval: follow ? 2000 : false,
  });

  const handleDownload = () => {
    if (!data?.logs) return;
    const blob = new Blob([data.logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pod.name}${activeContainer ? `-${activeContainer}` : ''}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-4/5 h-4/5 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">
              Logs: {pod.name}
            </h2>
            <p className="text-sm text-gray-500">{pod.namespace}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 p-3 border-b bg-gray-50 flex-wrap">
          {/* Container selector */}
          {containers.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Container:</label>
              <select
                value={activeContainer}
                onChange={(e) => setSelectedContainer(e.target.value)}
                className="px-2 py-1 text-sm border rounded bg-white"
              >
                {containers.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {containers.length === 1 && (
            <div className="text-sm text-gray-600">
              Container: <span className="font-medium">{containers[0].name}</span>
            </div>
          )}

          {/* Tail lines */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Lines:</label>
            <select
              value={tailLines}
              onChange={(e) => setTailLines(Number(e.target.value))}
              className="px-2 py-1 text-sm border rounded bg-white"
            >
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
              <option value={0}>All</option>
            </select>
          </div>

          {/* Follow toggle */}
          <button
            onClick={() => setFollow(!follow)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded ${
              follow
                ? 'bg-green-100 text-green-700 border border-green-300'
                : 'bg-gray-100 text-gray-700 border border-gray-300'
            }`}
          >
            {follow ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {follow ? 'Following' : 'Follow'}
          </button>

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={!data?.logs}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Download
          </button>

          {/* Loading indicator */}
          {isFetching && !isLoading && (
            <span className="text-xs text-gray-400">Refreshing...</span>
          )}
        </div>

        {/* Log content */}
        <div className="flex-1 overflow-auto p-4 bg-gray-900 text-gray-100 font-mono text-sm">
          {isLoading ? (
            <p className="text-gray-400">Loading logs...</p>
          ) : (
            <pre className="whitespace-pre-wrap">{data?.logs || 'No logs available'}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function PodDetailsPanel({ pod, onClose, onViewLogs, onViewYaml }: {
  pod: PodInfo;
  onClose: () => void;
  onViewLogs: () => void;
  onViewYaml: () => void;
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
                <div key={container.name} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{container.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      container.ready ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {container.state}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono truncate" title={container.image}>
                    {container.image}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Restarts: {container.restartCount}
                  </div>
                  <ContainerResources resources={container.resources} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No container info available</p>
          )}
        </div>

        {/* Labels */}
        {podDetails?.labels && Object.keys(podDetails.labels).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Labels</h3>
            <div className="flex flex-wrap gap-1">
              {Object.entries(podDetails.labels).map(([key, value]) => (
                <span key={key} className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
                  {key}={value}
                </span>
              ))}
            </div>
          </div>
        )}

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

  const { data: pods, isLoading, error } = useQuery({
    queryKey: ['pods', namespace],
    queryFn: () => api.pods.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Namespace</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Ready</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Restarts</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Age</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Node</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pods?.map((pod) => (
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
    </div>
  );
}
