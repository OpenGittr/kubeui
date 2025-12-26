import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';

interface ServiceAccountsProps {
  namespace?: string;
  isConnected?: boolean;
}

export function ServiceAccounts({ namespace, isConnected = true }: ServiceAccountsProps) {
  const queryClient = useQueryClient();

  const { data: serviceAccounts, isLoading, error } = useQuery({
    queryKey: ['serviceaccounts', namespace],
    queryFn: () => api.serviceAccounts.list(namespace),
    refetchInterval: isConnected ? 10000 : false,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <ResourceTable
      title="Service Accounts"
      data={serviceAccounts}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['serviceaccounts'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="serviceaccounts"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        { key: 'secrets', header: 'Secrets', render: (item) => (
          <span className={item.secrets > 0 ? '' : 'text-gray-400'}>
            {item.secrets}
          </span>
        )},
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
