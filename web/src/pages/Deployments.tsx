import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { DeploymentInfo } from '../services/api';
import { RefreshCw, RotateCcw, Scale, FileCode, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { useToast } from '../components/Toast';

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

export function Deployments({ namespace, isConnected = true }: DeploymentsProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [scaleDeployment, setScaleDeployment] = useState<DeploymentInfo | null>(null);
  const [yamlDeployment, setYamlDeployment] = useState<DeploymentInfo | null>(null);

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
              <tr key={`${dep.namespace}/${dep.name}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{dep.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{dep.namespace}</td>
                <td className="px-4 py-3 text-sm">{dep.ready}</td>
                <td className="px-4 py-3 text-sm">{dep.upToDate}</td>
                <td className="px-4 py-3 text-sm">{dep.available}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{dep.age}</td>
                <td className="px-4 py-3 text-right">
                  <ActionMenu
                    items={[
                      {
                        label: 'Scale',
                        icon: <Scale className="w-4 h-4" />,
                        onClick: () => setScaleDeployment(dep),
                      },
                      {
                        label: 'Restart',
                        icon: <RotateCcw className="w-4 h-4" />,
                        onClick: () => {
                          if (confirm(`Restart deployment ${dep.name}?`)) {
                            restartMutation.mutate({ ns: dep.namespace, name: dep.name });
                          }
                        },
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
                        onClick: () => {
                          if (confirm(`Delete deployment ${dep.name}?`)) {
                            deleteMutation.mutate({ ns: dep.namespace, name: dep.name });
                          }
                        },
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
    </div>
  );
}
