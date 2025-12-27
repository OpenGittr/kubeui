import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { DeploymentInfo } from '../services/api';
import { RefreshCw, RotateCcw, Scale, FileCode, Trash2, X, ChevronRight, Info } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContainerCard, PodContainersGroup } from '../components/ContainerCard';

interface DeploymentsProps {
  namespace?: string;
  isConnected?: boolean;
}

function ScaleModal({
  deployment,
  onClose,
}: {
  deployment: DeploymentInfo;
  onClose: () => void;
}) {
  const [replicas, setReplicas] = useState(deployment.replicas);
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const scaleMutation = useMutation({
    mutationFn: () => api.deployments.scale(deployment.namespace, deployment.name, replicas),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      addToast(`Scaled ${deployment.name} to ${replicas} replicas`, 'success');
      onClose();
    },
    onError: (error: Error) => {
      addToast(`Failed to scale: ${error.message}`, 'error');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-96 p-6">
        <h2 className="text-lg font-semibold mb-4">
          Scale: {deployment.name}
        </h2>
        <div className="mb-4">
          <label className="block text-sm text-gray-600 mb-1">Replicas</label>
          <input
            type="number"
            min="0"
            value={replicas}
            onChange={(e) => setReplicas(parseInt(e.target.value) || 0)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => scaleMutation.mutate()}
            disabled={scaleMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {scaleMutation.isPending ? 'Scaling...' : 'Scale'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeploymentDetailsPanel({
  deployment,
  onClose,
  onViewYaml,
}: {
  deployment: DeploymentInfo;
  onClose: () => void;
  onViewYaml: () => void;
}) {
  const { data: deploymentDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['deployment-details', deployment.namespace, deployment.name],
    queryFn: () => api.deployments.get(deployment.namespace, deployment.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['deployment-events', deployment.namespace, deployment.name],
    queryFn: () => api.deployments.events(deployment.namespace, deployment.name),
  });

  const details = deploymentDetails || deployment;

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold">{deployment.name}</h2>
          <p className="text-sm text-gray-500">{deployment.namespace}</p>
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
            <div className="font-medium">{deployment.ready}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Replicas</div>
            <div className="font-medium">{deployment.replicas}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Up-to-date</div>
            <div className="font-medium">{deployment.upToDate}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Available</div>
            <div className="font-medium">{deployment.available}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{deployment.age}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Strategy</div>
            <div className="font-medium">{details.strategy || '-'}</div>
          </div>
        </div>

        {/* Running Pods */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Running Pods</h3>
          {detailsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : details.runningContainers && details.runningContainers.length > 0 ? (
            <div className="space-y-3">
              {/* Group containers by pod */}
              {Object.entries(
                details.runningContainers.reduce((acc, container) => {
                  if (!acc[container.podName]) {
                    acc[container.podName] = [];
                  }
                  acc[container.podName].push(container);
                  return acc;
                }, {} as Record<string, typeof details.runningContainers>)
              ).map(([podName, containers]) => (
                <PodContainersGroup
                  key={podName}
                  podName={podName}
                  containers={containers}
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

export function Deployments({ namespace, isConnected = true }: DeploymentsProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [scaleDeployment, setScaleDeployment] = useState<DeploymentInfo | null>(null);
  const [yamlDeployment, setYamlDeployment] = useState<DeploymentInfo | null>(null);
  const [restartTarget, setRestartTarget] = useState<DeploymentInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeploymentInfo | null>(null);
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentInfo | null>(null);

  const { data: deployments, isLoading, error } = useQuery({
    queryKey: ['deployments', namespace],
    queryFn: () => api.deployments.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const restartMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) =>
      api.deployments.restart(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      addToast(`Restarting deployment ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to restart: ${error.message}`, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) =>
      api.deployments.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      addToast(`Deleted deployment ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading deployments...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Deployments</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['deployments'] })}
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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Up-to-date</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Available</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Age</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deployments?.map((dep) => (
              <tr
                key={`${dep.namespace}/${dep.name}`}
                className={`hover:bg-gray-50 cursor-pointer ${selectedDeployment?.name === dep.name && selectedDeployment?.namespace === dep.namespace ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedDeployment(dep)}
              >
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-1">
                    {dep.name}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{dep.namespace}</td>
                <td className="px-4 py-3 text-sm">{dep.ready}</td>
                <td className="px-4 py-3 text-sm">{dep.upToDate}</td>
                <td className="px-4 py-3 text-sm">{dep.available}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{dep.age}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      {
                        label: 'Details',
                        icon: <Info className="w-4 h-4" />,
                        onClick: () => setSelectedDeployment(dep),
                      },
                      {
                        label: 'Scale',
                        icon: <Scale className="w-4 h-4" />,
                        onClick: () => setScaleDeployment(dep),
                      },
                      {
                        label: 'Restart',
                        icon: <RotateCcw className="w-4 h-4" />,
                        onClick: () => setRestartTarget(dep),
                      },
                      {
                        label: 'View YAML',
                        icon: <FileCode className="w-4 h-4" />,
                        onClick: () => setYamlDeployment(dep),
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 className="w-4 h-4" />,
                        variant: 'danger',
                        onClick: () => setDeleteTarget(dep),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!deployments || deployments.length === 0) && (
          <div className="text-center py-8 text-gray-500">No deployments found</div>
        )}
      </div>

      {scaleDeployment && (
        <ScaleModal
          deployment={scaleDeployment}
          onClose={() => setScaleDeployment(null)}
        />
      )}
      {yamlDeployment && (
        <YamlModal
          resourceType="deployments"
          namespace={yamlDeployment.namespace}
          name={yamlDeployment.name}
          onClose={() => setYamlDeployment(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!restartTarget}
        title="Restart Deployment"
        message={`Are you sure you want to restart deployment "${restartTarget?.name}"? This will trigger a rolling update.`}
        confirmLabel="Restart"
        variant="warning"
        isLoading={restartMutation.isPending}
        onConfirm={() => {
          if (restartTarget) {
            restartMutation.mutate(
              { ns: restartTarget.namespace, name: restartTarget.name },
              { onSettled: () => setRestartTarget(null) }
            );
          }
        }}
        onCancel={() => setRestartTarget(null)}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Deployment"
        message={`Are you sure you want to delete deployment "${deleteTarget?.name}"? This will also delete all associated pods.`}
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

      {selectedDeployment && (
        <DeploymentDetailsPanel
          deployment={selectedDeployment}
          onClose={() => setSelectedDeployment(null)}
          onViewYaml={() => {
            setYamlDeployment(selectedDeployment);
          }}
        />
      )}
    </div>
  );
}
