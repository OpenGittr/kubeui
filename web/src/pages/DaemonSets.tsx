import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { DaemonSetInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';

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

export function DaemonSets({ namespace, isConnected = true }: DaemonSetsProps) {
  const queryClient = useQueryClient();

  const { data: daemonsets, isLoading, error } = useQuery({
    queryKey: ['daemonsets', namespace],
    queryFn: () => api.workloads.listDaemonSets(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { addToast } = useToast();

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

  return (
    <ResourceTable
      title="DaemonSets"
      data={daemonsets}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['daemonsets'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="daemonsets"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      onDelete={(item: DaemonSetInfo) => deleteMutation.mutate({ ns: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        { key: 'desired', header: 'Desired' },
        { key: 'current', header: 'Current' },
        { key: 'ready', header: 'Ready', render: (item) => <ReadyBadge ready={item.ready} total={item.desired} /> },
        { key: 'upToDate', header: 'Up-to-date' },
        { key: 'available', header: 'Available' },
        { key: 'nodeSelector', header: 'Node Selector', className: 'text-gray-600 font-mono text-xs' },
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
