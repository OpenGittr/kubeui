import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ReplicaSetInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';

interface ReplicaSetsProps {
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

export function ReplicaSets({ namespace, isConnected = true }: ReplicaSetsProps) {
  const queryClient = useQueryClient();

  const { data: replicasets, isLoading, error } = useQuery({
    queryKey: ['replicasets', namespace],
    queryFn: () => api.workloads.listReplicaSets(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { addToast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.workloads.deleteReplicaSet(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['replicasets'] });
      addToast(`Deleted replicaset ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <ResourceTable
      title="ReplicaSets"
      data={replicasets}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['replicasets'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="replicasets"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      onDelete={(item: ReplicaSetInfo) => deleteMutation.mutate({ ns: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        { key: 'desired', header: 'Desired' },
        { key: 'current', header: 'Current' },
        { key: 'ready', header: 'Ready', render: (item) => <ReadyBadge ready={item.ready} total={item.desired} /> },
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
