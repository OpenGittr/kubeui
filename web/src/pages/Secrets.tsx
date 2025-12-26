import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { SecretInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';

interface SecretsProps {
  namespace?: string;
  isConnected?: boolean;
}

export function Secrets({ namespace, isConnected = true }: SecretsProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['secrets', namespace],
    queryFn: () => api.secrets.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { addToast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.secrets.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      addToast(`Deleted secret ${name}`, 'success');
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
      title="Secrets"
      data={data}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['secrets'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="secrets"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      onDelete={(item: SecretInfo) => deleteMutation.mutate({ ns: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        {
          key: 'type',
          header: 'Type',
          render: (item) => (
            <span className="text-xs text-gray-600 font-mono">{item.type}</span>
          ),
        },
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
