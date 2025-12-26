import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';

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

  const { data: namespaces, isLoading, error } = useQuery({
    queryKey: ['namespaces-page'],
    queryFn: () => api.namespaces.list(),
    refetchInterval: isConnected ? 10000 : false,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <ResourceTable
      title="Namespaces"
      data={namespaces}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['namespaces-page'] })}
      getRowKey={(item) => item.name}
      resourceType="namespaces"
      getResourceInfo={(item) => ({ name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'status', header: 'Status', render: (item) => <StatusBadge status={item.status} /> },
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
