import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { IngressInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';

interface IngressesProps {
  namespace?: string;
  isConnected?: boolean;
}

export function Ingresses({ namespace, isConnected = true }: IngressesProps) {
  const queryClient = useQueryClient();

  const { data: ingresses, isLoading, error } = useQuery({
    queryKey: ['ingresses', namespace],
    queryFn: () => api.network.listIngresses(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { addToast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.network.deleteIngress(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['ingresses'] });
      addToast(`Deleted ingress ${name}`, 'success');
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
      title="Ingresses"
      data={ingresses}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['ingresses'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="ingresses"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      onDelete={(item: IngressInfo) => deleteMutation.mutate({ ns: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        { key: 'class', header: 'Class', render: (item) => (
          <span className={item.class === '<none>' ? 'text-gray-400' : 'text-blue-600'}>{item.class}</span>
        )},
        { key: 'hosts', header: 'Hosts', render: (item) => (
          <div className="flex flex-wrap gap-1">
            {item.hosts.map((host) => (
              <span key={host} className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">{host}</span>
            ))}
          </div>
        )},
        { key: 'address', header: 'Address', render: (item) => (
          <span className={item.address === '<pending>' ? 'text-yellow-600' : 'font-mono text-sm'}>{item.address}</span>
        )},
        { key: 'ports', header: 'Ports', className: 'text-gray-600' },
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
