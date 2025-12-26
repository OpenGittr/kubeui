import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';

interface EventsProps {
  namespace?: string;
  isConnected?: boolean;
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    Normal: 'bg-green-100 text-green-800',
    Warning: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-800'}`}>
      {type}
    </span>
  );
}

export function Events({ namespace, isConnected = true }: EventsProps) {
  const queryClient = useQueryClient();

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['events', namespace],
    queryFn: () => api.events.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <ResourceTable
      title="Events"
      data={events}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['events'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="events"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      columns={[
        { key: 'type', header: 'Type', render: (item) => <TypeBadge type={item.type} /> },
        { key: 'reason', header: 'Reason', render: (item) => <span className="font-medium">{item.reason}</span> },
        { key: 'object', header: 'Object', render: (item) => (
          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">{item.object}</span>
        )},
        { key: 'message', header: 'Message', className: 'text-gray-600 max-w-md truncate' },
        { key: 'count', header: 'Count' },
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
