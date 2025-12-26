import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ServiceInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';

interface ServicesProps {
  namespace?: string;
  isConnected?: boolean;
}

export function Services({ namespace, isConnected = true }: ServicesProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['services', namespace],
    queryFn: () => api.services.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { addToast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.services.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      addToast(`Deleted service ${name}`, 'success');
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
      title="Services"
      data={data}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['services'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="services"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      onDelete={(item: ServiceInfo) => deleteMutation.mutate({ ns: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        {
          key: 'type',
          header: 'Type',
          render: (item) => (
            <span className={`px-2 py-1 rounded text-xs ${
              item.type === 'LoadBalancer' ? 'bg-blue-100 text-blue-800' :
              item.type === 'NodePort' ? 'bg-green-100 text-green-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {item.type}
            </span>
          ),
        },
        { key: 'clusterIP', header: 'Cluster IP' },
        { key: 'externalIP', header: 'External IP', render: (item) => item.externalIP || '-' },
        { key: 'ports', header: 'Ports', render: (item) => item.ports.join(', ') || '-' },
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
