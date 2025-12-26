import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useState } from 'react';

interface StorageProps {
  namespace?: string;
  isConnected?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Bound: 'bg-green-100 text-green-800',
    Available: 'bg-blue-100 text-blue-800',
    Pending: 'bg-yellow-100 text-yellow-800',
    Released: 'bg-gray-100 text-gray-800',
    Failed: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export function Storage({ namespace, isConnected = true }: StorageProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'pvcs' | 'pvs'>('pvcs');

  const { data: pvcs, isLoading: pvcsLoading, error: pvcsError } = useQuery({
    queryKey: ['pvcs', namespace],
    queryFn: () => api.storage.listPVCs(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'pvcs',
  });

  const { data: pvs, isLoading: pvsLoading, error: pvsError } = useQuery({
    queryKey: ['pvs'],
    queryFn: () => api.storage.listPVs(),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'pvs',
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('pvcs')}
          className={`px-4 py-2 rounded ${view === 'pvcs' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          PersistentVolumeClaims
        </button>
        <button
          onClick={() => setView('pvs')}
          className={`px-4 py-2 rounded ${view === 'pvs' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          PersistentVolumes
        </button>
      </div>

      {view === 'pvcs' ? (
        <ResourceTable
          title="PersistentVolumeClaims"
          data={pvcs}
          isLoading={pvcsLoading}
          error={pvcsError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['pvcs'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="pvcs"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'status', header: 'Status', render: (item) => <StatusBadge status={item.status} /> },
            { key: 'volume', header: 'Volume', render: (item) => item.volume || '-' },
            { key: 'capacity', header: 'Capacity' },
            { key: 'accessModes', header: 'Access Modes' },
            { key: 'storageClass', header: 'Storage Class' },
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      ) : (
        <ResourceTable
          title="PersistentVolumes"
          data={pvs}
          isLoading={pvsLoading}
          error={pvsError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['pvs'] })}
          getRowKey={(item) => item.name}
          resourceType="pvs"
          getResourceInfo={(item) => ({ name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'capacity', header: 'Capacity' },
            { key: 'accessModes', header: 'Access Modes' },
            { key: 'reclaimPolicy', header: 'Reclaim Policy' },
            { key: 'status', header: 'Status', render: (item) => <StatusBadge status={item.status} /> },
            { key: 'claim', header: 'Claim', render: (item) => item.claim || '-' },
            { key: 'storageClass', header: 'Storage Class' },
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}
    </div>
  );
}
