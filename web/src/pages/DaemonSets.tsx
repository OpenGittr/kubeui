import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { DaemonSetInfo } from '../services/api';
import { RefreshCw, FileCode, Trash2, X, ChevronRight, Info } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContainerCard } from '../components/ContainerCard';

interface DaemonSetsProps {
  namespace?: string;
  isConnected?: boolean;
}

function ReadyBadge({ ready, total }: { ready: number; total: number }) {
  const isHealthy = ready === total;
  return (
    <span className={`font-medium ${isHealthy ? 'text-green-600' : 'text-yellow-600'}`}>
      {ready}/{total}
    </span>
  );
}

function DaemonSetDetailsPanel({
  daemonset,
  onClose,
  onViewYaml,
}: {
  daemonset: DaemonSetInfo;
  onClose: () => void;
  onViewYaml: () => void;
}) {
  const { data: daemonsetDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['daemonset-details', daemonset.namespace, daemonset.name],
    queryFn: () => api.workloads.getDaemonSet(daemonset.namespace, daemonset.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['daemonset-events', daemonset.namespace, daemonset.name],
    queryFn: () => api.workloads.daemonSetEvents(daemonset.namespace, daemonset.name),
  });

  const details = daemonsetDetails || daemonset;

  // Group running containers by node for DaemonSets
  const containersByNode = details.runningContainers?.reduce((acc, container) => {
    const key = container.nodeName || 'unknown';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(container);
    return acc;
  }, {} as Record<string, typeof details.runningContainers>);

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold">{daemonset.name}</h2>
          <p className="text-sm text-gray-500">{daemonset.namespace}</p>
        </div>
        <div className="flex items-center gap-2">
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
            <div className="text-xs text-gray-500 uppercase">Ready</div>
            <div className="font-medium">{daemonset.ready}/{daemonset.desired}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Desired</div>
            <div className="font-medium">{daemonset.desired}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Current</div>
            <div className="font-medium">{daemonset.current}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Up-to-date</div>
            <div className="font-medium">{daemonset.upToDate}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Available</div>
            <div className="font-medium">{daemonset.available}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{daemonset.age}</div>
          </div>
        </div>

        {/* Node Selector */}
        <div className="bg-gray-50 p-3 rounded">
          <div className="text-xs text-gray-500 uppercase">Node Selector</div>
          <div className="font-medium font-mono text-sm">{daemonset.nodeSelector}</div>
        </div>

        {/* Running Pods by Node */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Running Pods</h3>
          {detailsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : containersByNode && Object.keys(containersByNode).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(containersByNode).map(([nodeName, containers]) => (
                <div key={nodeName} className="border-l-2 border-gray-200 pl-3">
                  <div className="text-xs text-gray-500 font-mono mb-2 truncate" title={nodeName}>
                    Node: {nodeName}
                  </div>
                  <div className="space-y-2">
                    {containers?.map((container, idx) => (
                      <ContainerCard
                        key={`${container.podName}-${container.containerName}-${idx}`}
                        name={container.containerName}
                        ready={container.ready}
                        state={container.state}
                        restarts={container.restarts}
                        podName={container.podName}
                        resources={{
                          cpu: container.cpu,
                          memory: container.memory,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : details.containerDetails && details.containerDetails.length > 0 ? (
            <div className="space-y-2">
              {details.containerDetails.map((container) => (
                <ContainerCard
                  key={container.name}
                  name={container.name}
                  image={container.image}
                  ready={true}
                  state="spec"
                  restarts={0}
                  resources={{
                    cpu: container.cpu,
                    memory: container.memory,
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No running pods</p>
          )}
        </div>

        {/* Selector */}
        {details.selector && Object.keys(details.selector).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Selector</h3>
            <div className="flex flex-wrap gap-1">
              {Object.entries(details.selector).map(([key, value]) => (
                <span key={key} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-mono">
                  {key}={value}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Labels */}
        {details.labels && Object.keys(details.labels).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Labels</h3>
            <div className="flex flex-wrap gap-1">
              {Object.entries(details.labels).map(([key, value]) => (
                <span key={key} className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
                  {key}={value}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Conditions */}
        {details.conditions && details.conditions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Conditions</h3>
            <div className="space-y-2">
              {details.conditions.map((cond, idx) => (
                <div
                  key={idx}
                  className={`border-l-2 pl-3 py-1 ${
                    cond.status === 'True' ? 'border-green-400' : 'border-yellow-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      cond.status === 'True' ? 'text-green-700' : 'text-yellow-700'
                    }`}>
                      {cond.type}
                    </span>
                    <span className="text-xs text-gray-400">{cond.reason}</span>
                  </div>
                  <p className="text-sm text-gray-600">{cond.message}</p>
                </div>
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
                <div
                  key={idx}
                  className={`border-l-2 pl-3 py-1 ${
                    event.type === 'Warning' ? 'border-yellow-400' : 'border-green-400'
                  }`}
                >
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

export function DaemonSets({ namespace, isConnected = true }: DaemonSetsProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [yamlDaemonSet, setYamlDaemonSet] = useState<DaemonSetInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DaemonSetInfo | null>(null);
  const [selectedDaemonSet, setSelectedDaemonSet] = useState<DaemonSetInfo | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);

  const { data: daemonsets, isLoading, error } = useQuery({
    queryKey: ['daemonsets', namespace],
    queryFn: () => api.workloads.listDaemonSets(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.workloads.deleteDaemonSet(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['daemonsets'] });
      addToast(`Deleted daemonset ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading daemonsets...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  // Filter out DaemonSets with desired=0 unless showEmpty is true
  const filteredDaemonsets = daemonsets?.filter(ds => showEmpty || ds.desired > 0);
  const hiddenCount = (daemonsets?.length || 0) - (filteredDaemonsets?.length || 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">DaemonSets</h1>
        <div className="flex items-center gap-3">
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowEmpty(!showEmpty)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {showEmpty ? 'Hide' : 'Show'} {hiddenCount} empty
            </button>
          )}
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['daemonsets'] })}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Namespace</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Desired</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Current</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Ready</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Up-to-date</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Node Selector</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Age</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredDaemonsets?.map((ds) => (
              <tr
                key={`${ds.namespace}/${ds.name}`}
                className={`hover:bg-gray-50 cursor-pointer ${selectedDaemonSet?.name === ds.name && selectedDaemonSet?.namespace === ds.namespace ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedDaemonSet(ds)}
              >
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-1">
                    {ds.name}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{ds.namespace}</td>
                <td className="px-4 py-3 text-sm">{ds.desired}</td>
                <td className="px-4 py-3 text-sm">{ds.current}</td>
                <td className="px-4 py-3 text-sm">
                  <ReadyBadge ready={ds.ready} total={ds.desired} />
                </td>
                <td className="px-4 py-3 text-sm">{ds.upToDate}</td>
                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{ds.nodeSelector}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{ds.age}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      {
                        label: 'Details',
                        icon: <Info className="w-4 h-4" />,
                        onClick: () => setSelectedDaemonSet(ds),
                      },
                      {
                        label: 'View YAML',
                        icon: <FileCode className="w-4 h-4" />,
                        onClick: () => setYamlDaemonSet(ds),
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 className="w-4 h-4" />,
                        variant: 'danger',
                        onClick: () => setDeleteTarget(ds),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!filteredDaemonsets || filteredDaemonsets.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            {hiddenCount > 0 ? `${hiddenCount} daemonsets hidden (desired=0)` : 'No daemonsets found'}
          </div>
        )}
      </div>

      {yamlDaemonSet && (
        <YamlModal
          resourceType="daemonsets"
          namespace={yamlDaemonSet.namespace}
          name={yamlDaemonSet.name}
          onClose={() => setYamlDaemonSet(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete DaemonSet"
        message={`Are you sure you want to delete daemonset "${deleteTarget?.name}"? This will delete pods on all nodes.`}
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

      {selectedDaemonSet && (
        <DaemonSetDetailsPanel
          daemonset={selectedDaemonSet}
          onClose={() => setSelectedDaemonSet(null)}
          onViewYaml={() => {
            setYamlDaemonSet(selectedDaemonSet);
          }}
        />
      )}
    </div>
  );
}
