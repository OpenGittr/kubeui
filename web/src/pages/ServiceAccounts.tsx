import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';
import { usePermissions } from '../hooks/usePermissions';

const SA_CHECKS = [
  { verb: 'delete', group: '', resource: 'serviceaccounts' },
];

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

  const { addToast } = useToast();
  const { can } = usePermissions(namespace, SA_CHECKS);
  const canDelete = can('delete', '', 'serviceaccounts');
  const deleteTitle = canDelete ? undefined : 'Requires delete on serviceaccounts';

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.serviceAccounts.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['serviceaccounts'] });
      addToast(`Deleted service account ${name}`, 'success');
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
      title="Service Accounts"
      data={serviceAccounts}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['serviceaccounts'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="serviceaccounts"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      kindLabel="ServiceAccount"
      onDelete={(item) => deleteMutation.mutate({ ns: item.namespace, name: item.name })}
      canDelete={canDelete}
      deleteTitle={deleteTitle}
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
