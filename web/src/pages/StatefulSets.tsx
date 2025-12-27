import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { StatefulSetInfo } from '../services/api';
import { RefreshCw, FileCode, Trash2, X, ChevronRight, Info } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContainerCard } from '../components/ContainerCard';
import { MetadataTabs } from '../components/MetadataTabs';

interface StatefulSetsProps {
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

function StatefulSetDetailsPanel({
  statefulset,
  onClose,
  onViewYaml,
}: {
  statefulset: StatefulSetInfo;
  onClose: () => void;
  onViewYaml: () => void;
}) {
  const { data: statefulsetDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['statefulset-details', statefulset.namespace, statefulset.name],
    queryFn: () => api.workloads.getStatefulSet(statefulset.namespace, statefulset.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['statefulset-events', statefulset.namespace, statefulset.name],
    queryFn: () => api.workloads.statefulSetEvents(statefulset.namespace, statefulset.name),
  });

  const details = statefulsetDetails || statefulset;

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold">{statefulset.name}</h2>
          <p className="text-sm text-gray-500">{statefulset.namespace}</p>
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
            <div className="font-medium">{statefulset.ready}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Replicas</div>
            <div className="font-medium">{statefulset.replicas}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Current</div>
            <div className="font-medium">{details.currentReplicas ?? 0}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Updated</div>
            <div className="font-medium">{details.updatedReplicas ?? 0}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{statefulset.age}</div>
          </div>
          {details.serviceName && (
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-xs text-gray-500 uppercase">Service</div>
              <div className="font-medium font-mono text-sm">{details.serviceName}</div>
            </div>
          )}
        </div>

        {/* Running Pods */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Running Pods</h3>
          {detailsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : details.runningContainers && details.runningContainers.length > 0 ? (
            <div className="space-y-2">
              {details.runningContainers.map((container, idx) => (
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

        {/* Selector & Labels */}
        <MetadataTabs
          tabs={[
            { key: 'selector', label: 'Selector', data: details.selector },
            { key: 'labels', label: 'Labels', data: details.labels },
          ]}
        />

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

export function StatefulSets({ namespace, isConnected = true }: StatefulSetsProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [yamlStatefulSet, setYamlStatefulSet] = useState<StatefulSetInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StatefulSetInfo | null>(null);
  const [selectedStatefulSet, setSelectedStatefulSet] = useState<StatefulSetInfo | null>(null);

  const { data: statefulsets, isLoading, error } = useQuery({
    queryKey: ['statefulsets', namespace],
    queryFn: () => api.workloads.listStatefulSets(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.workloads.deleteStatefulSet(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['statefulsets'] });
      addToast(`Deleted statefulset ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading statefulsets...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">StatefulSets</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['statefulsets'] })}
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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Ready</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Replicas</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Age</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {statefulsets?.map((ss) => {
              const [ready, total] = ss.ready.split('/').map(Number);
              return (
                <tr
                  key={`${ss.namespace}/${ss.name}`}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedStatefulSet?.name === ss.name && selectedStatefulSet?.namespace === ss.namespace ? 'bg-blue-50' : ''}`}
                  onClick={() => setSelectedStatefulSet(ss)}
                >
                  <td className="px-4 py-3 text-sm font-medium">
                    <div className="flex items-center gap-1">
                      {ss.name}
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{ss.namespace}</td>
                  <td className="px-4 py-3 text-sm">
                    <ReadyBadge ready={ready} total={total} />
                  </td>
                  <td className="px-4 py-3 text-sm">{ss.replicas}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{ss.age}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                      items={[
                        {
                          label: 'Details',
                          icon: <Info className="w-4 h-4" />,
                          onClick: () => setSelectedStatefulSet(ss),
                        },
                        {
                          label: 'View YAML',
                          icon: <FileCode className="w-4 h-4" />,
                          onClick: () => setYamlStatefulSet(ss),
                        },
                        {
                          label: 'Delete',
                          icon: <Trash2 className="w-4 h-4" />,
                          variant: 'danger',
                          onClick: () => setDeleteTarget(ss),
                        },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(!statefulsets || statefulsets.length === 0) && (
          <div className="text-center py-8 text-gray-500">No statefulsets found</div>
        )}
      </div>

      {yamlStatefulSet && (
        <YamlModal
          resourceType="statefulsets"
          namespace={yamlStatefulSet.namespace}
          name={yamlStatefulSet.name}
          onClose={() => setYamlStatefulSet(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete StatefulSet"
        message={`Are you sure you want to delete statefulset "${deleteTarget?.name}"? This will delete all pods managed by this statefulset.`}
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

      {selectedStatefulSet && (
        <StatefulSetDetailsPanel
          statefulset={selectedStatefulSet}
          onClose={() => setSelectedStatefulSet(null)}
          onViewYaml={() => {
            setYamlStatefulSet(selectedStatefulSet);
          }}
        />
      )}
    </div>
  );
}
