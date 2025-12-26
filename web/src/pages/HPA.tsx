import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';

interface HPAProps {
  namespace?: string;
  isConnected?: boolean;
}

export function HPA({ namespace, isConnected = true }: HPAProps) {
  const queryClient = useQueryClient();

  const { data: hpas, isLoading, error } = useQuery({
    queryKey: ['hpas', namespace],
    queryFn: () => api.hpas.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <div>
      <ResourceTable
        title="Horizontal Pod Autoscalers"
        data={hpas}
        isLoading={isLoading}
        error={error as Error | null}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['hpas'] })}
        getRowKey={(item) => `${item.namespace}/${item.name}`}
        resourceType="hpas"
        getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
        columns={[
          { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
          { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
          { key: 'reference', header: 'Reference', render: (item) => (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-mono">{item.reference}</span>
          )},
          { key: 'targets', header: 'Targets', render: (item) => (
            <span className={item.targets === '<none>' ? 'text-gray-400' : 'text-sm'}>{item.targets}</span>
          )},
          { key: 'minPods', header: 'Min' },
          { key: 'maxPods', header: 'Max' },
          { key: 'replicas', header: 'Replicas', render: (item) => (
            <span className="font-medium text-blue-600">{item.replicas}</span>
          )},
          { key: 'age', header: 'Age', className: 'text-gray-600' },
        ]}
      />
    </div>
  );
}
