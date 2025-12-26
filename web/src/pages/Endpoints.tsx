import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';

interface EndpointsProps {
  namespace?: string;
  isConnected?: boolean;
}

export function Endpoints({ namespace, isConnected = true }: EndpointsProps) {
  const queryClient = useQueryClient();

  const { data: endpoints, isLoading, error } = useQuery({
    queryKey: ['endpoints', namespace],
    queryFn: () => api.network.listEndpoints(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <ResourceTable
      title="Endpoints"
      data={endpoints}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['endpoints'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="endpoints"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        { key: 'endpoints', header: 'Endpoints', render: (item) => (
          <span className={item.endpoints === '<none>' ? 'text-gray-400' : 'font-mono text-xs'}>{item.endpoints}</span>
        )},
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
