import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileCode, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { ActionMenu } from '../components/ActionMenu';
import { YamlModal } from '../components/YamlModal';
import { NamespaceDeleteDialog } from '../components/NamespaceDeleteDialog';
import { useToast } from '../components/Toast';
import { usePermissions } from '../hooks/usePermissions';

const NS_CHECKS = [
  { verb: 'delete', group: '', resource: 'namespaces' },
];

// Mirrors the server's protectedNamespaces so the menu item is disabled up front.
const PROTECTED_NAMESPACES = new Set(['default', 'kube-system', 'kube-public', 'kube-node-lease']);

interface NamespacesProps {
  isConnected?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Active: 'bg-green-100 text-green-800',
    Terminating: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export function Namespaces({ isConnected = true }: NamespacesProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [yamlName, setYamlName] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const { can } = usePermissions(undefined, NS_CHECKS);
  const canDelete = can('delete', '', 'namespaces');

  const { data: namespaces, isLoading, error } = useQuery({
    queryKey: ['namespaces-page'],
    queryFn: () => api.namespaces.list(),
    refetchInterval: isConnected ? 10000 : false,
    enabled: isConnected,
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.namespaces.delete(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['namespaces-page'] });
      queryClient.invalidateQueries({ queryKey: ['namespaces'] });
      addToast(`Deleting namespace ${name}`, 'success');
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  const deleteTitleFor = (name: string, status: string) => {
    if (PROTECTED_NAMESPACES.has(name)) return 'System namespace';
    if (status === 'Terminating') return 'Already terminating';
    if (!canDelete) return 'Requires delete on namespaces';
    return undefined;
  };

  return (
    <>
      <ResourceTable
        title="Namespaces"
        data={namespaces}
        isLoading={isLoading}
        error={error as Error | null}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['namespaces-page'] })}
        getRowKey={(item) => item.name}
        resourceType="namespaces"
        getResourceInfo={(item) => ({ name: item.name })}
        actions={(item) => {
          const deleteTitle = deleteTitleFor(item.name, item.status);
          return (
            <ActionMenu
              items={[
                {
                  label: 'View YAML',
                  icon: <FileCode className="w-4 h-4" />,
                  onClick: () => setYamlName(item.name),
                },
                {
                  label: 'Delete',
                  icon: <Trash2 className="w-4 h-4" />,
                  variant: 'danger',
                  disabled: !!deleteTitle,
                  title: deleteTitle,
                  onClick: () => setDeleteTarget(item.name),
                },
              ]}
            />
          );
        }}
        columns={[
          { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
          { key: 'status', header: 'Status', render: (item) => <StatusBadge status={item.status} /> },
          { key: 'age', header: 'Age', className: 'text-gray-600' },
        ]}
      />

      {yamlName && (
        <YamlModal resourceType="namespaces" name={yamlName} onClose={() => setYamlName(null)} />
      )}

      {deleteTarget && (
        <NamespaceDeleteDialog
          namespace={deleteTarget}
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
