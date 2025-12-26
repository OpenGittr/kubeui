import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { StatefulSetInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';

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

export function StatefulSets({ namespace, isConnected = true }: StatefulSetsProps) {
  const queryClient = useQueryClient();

  const { data: statefulsets, isLoading, error } = useQuery({
    queryKey: ['statefulsets', namespace],
    queryFn: () => api.workloads.listStatefulSets(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { addToast } = useToast();

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

  return (
    <ResourceTable
      title="StatefulSets"
      data={statefulsets}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['statefulsets'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="statefulsets"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      onDelete={(item: StatefulSetInfo) => deleteMutation.mutate({ ns: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        { key: 'ready', header: 'Ready', render: (item) => {
          const [ready, total] = item.ready.split('/').map(Number);
          return <ReadyBadge ready={ready} total={total} />;
        }},
        { key: 'replicas', header: 'Replicas' },
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
