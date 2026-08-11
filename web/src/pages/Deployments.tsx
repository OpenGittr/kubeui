import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { DeploymentInfo } from '../services/api';
import { RefreshCw, RotateCcw, Scale, FileCode, Trash2, X, ChevronRight, Info, Box, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import type { ActionMenuItem } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContainerCard, PodContainersGroup } from '../components/ContainerCard';
import { MetadataTabs } from '../components/MetadataTabs';
import { RevisionsPanel } from '../components/RevisionsPanel';
import { SetImageModal } from '../components/SetImageModal';
import { TailLogsModal } from '../components/MultiPodLogModal';
import type { PodTarget } from '../components/MultiPodLogModal';
import { MiniReplicasBar } from './HPA';
import { Link } from 'react-router-dom';
import { selectedHref } from '../hooks/useSelectedResource';
import { ExternalLink, Activity } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { useSelectedResource } from '../hooks/useSelectedResource';
import { useTableSort, ageSeconds } from '../hooks/useTableSort';
import { SortableTh } from '../components/SortableTh';

const DEPLOYMENT_SORTERS = {
  name: (d: DeploymentInfo) => d.name,
  namespace: (d: DeploymentInfo) => d.namespace,
  ready: (d: DeploymentInfo) => parseInt(d.ready.split('/')[0] || '0', 10),
  // Sort by max-bound when HPA-managed (gives "biggest scaler first") else
  // by current replicas. Mixed lists put HPA-managed workloads next to each
  // other, ordered by their ceiling.
  replicas: (d: DeploymentInfo) => d.hpa ? d.hpa.maxReplicas : d.replicas,
  lastRollout: (d: DeploymentInfo) => -ageSeconds(d.lastRollout || d.age),
  age: (d: DeploymentInfo) => -ageSeconds(d.age),
};

/**
 * Small dot next to ready/desired showing rollout-state at a glance:
 *   green  = ready == desired AND uptodate == desired (steady state)
 *   amber  = otherwise (rollout / scaling in progress)
 * Hover shows the absolute counts so up-to-date and available aren't lost.
 */
function ReadyCell({ ready, replicas, upToDate, available }: {
  ready: string; replicas: number; upToDate: number; available: number;
}) {
  const readyCount = parseInt(ready.split('/')[0] || '0', 10);
  const steady = readyCount === replicas && upToDate === replicas && available === replicas;
  return (
    <span
      className="inline-flex items-center gap-2 font-mono"
      title={`ready ${readyCount}/${replicas} · up-to-date ${upToDate} · available ${available}`}
    >
      <span>{ready}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${steady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
    </span>
  );
}

const DEPLOYMENT_CHECKS = [
  { verb: 'patch', group: 'apps', resource: 'deployments' },
  { verb: 'delete', group: 'apps', resource: 'deployments' },
];

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
  actions,
}: {
  deployment: DeploymentInfo;
  onClose: () => void;
  onViewYaml: () => void;
  /** Same items the row's ActionMenu uses, so the panel is a self-contained
   *  workspace and the user doesn't have to close it to find the action. */
  actions?: ActionMenuItem[];
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

        {/* Autoscaling — present whenever an HPA targets this Deployment.
            Shows the bounds + current position alongside a click-through to
            the HPA's own detail page so users don't lose the relationship. */}
        {details.hpa && (
          <div className="bg-blue-50 border border-blue-200 p-3 rounded">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-blue-700" />
              <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Autoscaled by HPA</span>
              <Link
                to={selectedHref('/hpa', deployment.namespace, details.hpa.name)}
                className="text-sm font-mono text-blue-700 hover:underline inline-flex items-center gap-1"
                title="Open the HorizontalPodAutoscaler detail"
              >
                {details.hpa.name}
                <ExternalLink className="w-3 h-3 opacity-70" />
              </Link>
            </div>
            <MiniReplicasBar
              min={details.hpa.minReplicas}
              max={details.hpa.maxReplicas}
              current={deployment.replicas}
            />
          </div>
        )}

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
                  namespace={deployment.namespace}
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

        <MetadataTabs
          tabs={[
            { key: 'env', label: 'Environment', envData: details.containerDetails?.map(c => ({ name: c.name, env: c.env || [] })) },
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

        <MetadataTabs
          tabs={[
            {
              key: 'events',
              label: 'Events',
              content: (
                eventsLoading ? (
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
                )
              ),
            },
            {
              key: 'rollouts',
              label: 'Rollouts',
              content: <RevisionsPanel kind="deployment" namespace={details.namespace} name={details.name} />,
            },
          ]}
        />
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
  const [imageTarget, setImageTarget] = useState<DeploymentInfo | null>(null);
  const [tailTarget, setTailTarget] = useState<DeploymentInfo | null>(null);
  const { can } = usePermissions(namespace, DEPLOYMENT_CHECKS);
  const canPatch = can('patch', 'apps', 'deployments');
  const canDelete = can('delete', 'apps', 'deployments');
  const patchTitle = canPatch ? undefined : 'Requires patch on deployments';
  const deleteTitle = canDelete ? undefined : 'Requires delete on deployments';

  const { data: deployments, isLoading, error } = useQuery({
    queryKey: ['deployments', namespace],
    queryFn: () => api.deployments.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });
  useSelectedResource(deployments, selectedDeployment, setSelectedDeployment);
  const sort = useTableSort(deployments, DEPLOYMENT_SORTERS);

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

  // Single source of truth for the menu items, used by both the row's
  // ActionMenu and the detail panel's header so the same actions appear in
  // both places without duplicating the per-action state hooks.
  const actionsFor = (dep: DeploymentInfo): ActionMenuItem[] => [
    {
      label: 'Scale',
      icon: <Scale className="w-4 h-4" />,
      disabled: !canPatch,
      title: patchTitle,
      onClick: () => setScaleDeployment(dep),
    },
    {
      label: 'Set image',
      icon: <Box className="w-4 h-4" />,
      disabled: !canPatch,
      title: patchTitle,
      onClick: () => setImageTarget(dep),
    },
    {
      label: 'Tail logs',
      icon: <ScrollText className="w-4 h-4" />,
      onClick: () => setTailTarget(dep),
    },
    {
      label: 'Restart',
      icon: <RotateCcw className="w-4 h-4" />,
      disabled: !canPatch,
      title: patchTitle,
      onClick: () => setRestartTarget(dep),
    },
    {
      label: 'Delete',
      icon: <Trash2 className="w-4 h-4" />,
      variant: 'danger',
      disabled: !canDelete,
      title: deleteTitle,
      onClick: () => setDeleteTarget(dep),
    },
  ];

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
              <SortableTh sortKey="name" label="Name" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="namespace" label="Namespace" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="ready" label="Ready" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="replicas" label="Replicas / HPA" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="lastRollout" label="Last Rollout" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="age" label="Age" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sort.sorted.map((dep) => (
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
                <td className="px-4 py-3 text-sm">
                  <ReadyCell ready={dep.ready} replicas={dep.replicas} upToDate={dep.upToDate} available={dep.available} />
                </td>
                <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                  {dep.hpa ? (
                    <Link
                      to={selectedHref('/hpa', dep.namespace, dep.hpa.name)}
                      className="inline-flex items-center gap-2 px-1 -mx-1 py-0.5 rounded hover:bg-blue-50"
                      title={`Autoscaled by HPA ${dep.hpa.name} (min ${dep.hpa.minReplicas} · max ${dep.hpa.maxReplicas}). Click to open.`}
                    >
                      <MiniReplicasBar min={dep.hpa.minReplicas} max={dep.hpa.maxReplicas} current={dep.replicas} />
                      <ExternalLink className="w-3 h-3 text-gray-400 opacity-60" />
                    </Link>
                  ) : (
                    <span className="font-mono">{dep.replicas}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{dep.lastRollout || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{dep.age}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      {
                        label: 'Details',
                        icon: <Info className="w-4 h-4" />,
                        onClick: () => setSelectedDeployment(dep),
                      },
                      ...actionsFor(dep),
                      {
                        label: 'View YAML',
                        icon: <FileCode className="w-4 h-4" />,
                        onClick: () => setYamlDeployment(dep),
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
      {imageTarget && (
        <SetImageModal
          kind="deployment"
          namespace={imageTarget.namespace}
          name={imageTarget.name}
          onClose={() => setImageTarget(null)}
          onSaved={() => setImageTarget(null)}
          fetchContainers={async () => {
            const d = await api.deployments.get(imageTarget.namespace, imageTarget.name);
            return (d.containerDetails || []).map(c => ({ name: c.name, image: c.image }));
          }}
          setImage={api.deployments.setImage}
          invalidateKeys={[['deployments'], ['deployment-details', imageTarget.namespace, imageTarget.name]]}
        />
      )}
      {tailTarget && (
        <TailLogsModal
          title={`Logs · ${tailTarget.namespace}/${tailTarget.name}`}
          queryKey={['tail-pods', 'deployment', tailTarget.namespace, tailTarget.name]}
          fetchPods={async () => {
            const d = await api.deployments.get(tailTarget.namespace, tailTarget.name);
            const seen = new Set<string>();
            const pods: PodTarget[] = [];
            for (const c of d.runningContainers || []) {
              if (seen.has(c.podName)) continue;
              seen.add(c.podName);
              pods.push({ namespace: tailTarget.namespace, name: c.podName });
            }
            return pods;
          }}
          onClose={() => setTailTarget(null)}
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
          actions={actionsFor(selectedDeployment)}
        />
      )}
    </div>
  );
}
