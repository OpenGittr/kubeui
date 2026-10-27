import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';
import { usePermissions } from '../hooks/usePermissions';

const SC_CHECKS = [
  { verb: 'delete', group: 'storage.k8s.io', resource: 'storageclasses' },
];

interface StorageClassesProps {
  isConnected?: boolean;
}

export function StorageClasses({ isConnected = true }: StorageClassesProps) {
  const queryClient = useQueryClient();

  const { data: storageClasses, isLoading, error } = useQuery({
    queryKey: ['storageclasses'],
    queryFn: () => api.storageClasses.list(),
    refetchInterval: isConnected ? 10000 : false,
    enabled: isConnected,
  });

  const { addToast } = useToast();
  const { can } = usePermissions(undefined, SC_CHECKS);
  const canDelete = can('delete', 'storage.k8s.io', 'storageclasses');
  const deleteTitle = canDelete ? undefined : 'Requires delete on storageclasses';

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.storageClasses.delete(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['storageclasses'] });
      addToast(`Deleted storage class ${name}`, 'success');
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
      title="Storage Classes"
      data={storageClasses}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['storageclasses'] })}
      getRowKey={(item) => item.name}
      resourceType="storageclasses"
      getResourceInfo={(item) => ({ name: item.name })}
      kindLabel="StorageClass"
      onDelete={(item) => deleteMutation.mutate(item.name)}
      canDelete={canDelete}
      deleteTitle={deleteTitle}
      columns={[
        { key: 'name', header: 'Name', render: (item) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{item.name}</span>
            {item.isDefault && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">default</span>
            )}
          </div>
        )},
        { key: 'provisioner', header: 'Provisioner', className: 'font-mono text-sm text-gray-600' },
        { key: 'reclaimPolicy', header: 'Reclaim Policy', render: (item) => (
          <span className={item.reclaimPolicy === 'Delete' ? 'text-red-600' : 'text-green-600'}>
            {item.reclaimPolicy}
          </span>
        )},
        { key: 'volumeBindingMode', header: 'Binding Mode', className: 'text-gray-600' },
        { key: 'allowExpansion', header: 'Allow Expansion', render: (item) => (
          <span className={item.allowExpansion ? 'text-green-600' : 'text-gray-400'}>
            {item.allowExpansion ? 'Yes' : 'No'}
          </span>
        )},
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
