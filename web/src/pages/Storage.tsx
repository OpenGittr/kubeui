import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { PVCInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useState } from 'react';

function humanBytes(n: number): string {
  if (!n) return '0';
  const units = ['B', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${units[i]}`;
}

function PVCFill({ pvc }: { pvc: PVCInfo }) {
  if (pvc.fillPercent == null || !pvc.capacityBytes) {
    return <span className="text-gray-400 text-xs" title="Install metrics or grant nodes/proxy to read kubelet stats">—</span>;
  }
  const pct = pvc.fillPercent;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 min-w-[140px]" title={`${humanBytes(pvc.usedBytes ?? 0)} / ${humanBytes(pvc.capacityBytes)}`}>
      <div className="w-20 h-1.5 bg-gray-200 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-gray-600 font-mono">{pct}%</span>
    </div>
  );
}

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
            { key: 'fillPercent', header: 'Used', render: (item) => <PVCFill pvc={item} /> },
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
