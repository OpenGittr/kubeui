import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ConfigMapInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';

interface ConfigMapsProps {
  namespace?: string;
  isConnected?: boolean;
}

export function ConfigMaps({ namespace, isConnected = true }: ConfigMapsProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['configmaps', namespace],
    queryFn: () => api.configmaps.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { addToast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.configmaps.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['configmaps'] });
      addToast(`Deleted configmap ${name}`, 'success');
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
      title="ConfigMaps"
      data={data}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['configmaps'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="configmaps"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      onDelete={(item: ConfigMapInfo) => deleteMutation.mutate({ ns: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        {
          key: 'keys',
          header: 'Keys',
          render: (item) => (
            <span className="text-gray-600">
              {item.keys.length} key{item.keys.length !== 1 ? 's' : ''}
            </span>
          ),
        },
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
