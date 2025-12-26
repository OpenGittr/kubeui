import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useState } from 'react';

interface WorkloadsProps {
  namespace?: string;
  isConnected?: boolean;
}

function ReadyBadge({ ready, total }: { ready: number; total: number }) {
  const isHealthy = ready === total;
  return (
    <span className={`font-medium ${isHealthy ? 'text-green-600' : 'text-yellow-600'}`}>
      {ready}/{total}
    </span>
  );
}

export function Workloads({ namespace, isConnected = true }: WorkloadsProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'daemonsets' | 'statefulsets' | 'replicasets'>('daemonsets');

  const { data: daemonsets, isLoading: dsLoading, error: dsError } = useQuery({
    queryKey: ['daemonsets', namespace],
    queryFn: () => api.workloads.listDaemonSets(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'daemonsets',
  });

  const { data: statefulsets, isLoading: ssLoading, error: ssError } = useQuery({
    queryKey: ['statefulsets', namespace],
    queryFn: () => api.workloads.listStatefulSets(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'statefulsets',
  });

  const { data: replicasets, isLoading: rsLoading, error: rsError } = useQuery({
    queryKey: ['replicasets', namespace],
    queryFn: () => api.workloads.listReplicaSets(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'replicasets',
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('daemonsets')}
          className={`px-4 py-2 rounded ${view === 'daemonsets' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          DaemonSets
        </button>
        <button
          onClick={() => setView('statefulsets')}
          className={`px-4 py-2 rounded ${view === 'statefulsets' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          StatefulSets
        </button>
        <button
          onClick={() => setView('replicasets')}
          className={`px-4 py-2 rounded ${view === 'replicasets' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          ReplicaSets
        </button>
      </div>

      {view === 'daemonsets' && (
        <ResourceTable
          title="DaemonSets"
          data={daemonsets}
          isLoading={dsLoading}
          error={dsError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['daemonsets'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="daemonsets"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'desired', header: 'Desired' },
            { key: 'current', header: 'Current' },
            { key: 'ready', header: 'Ready', render: (item) => <ReadyBadge ready={item.ready} total={item.desired} /> },
            { key: 'upToDate', header: 'Up-to-date' },
            { key: 'available', header: 'Available' },
            { key: 'nodeSelector', header: 'Node Selector', className: 'text-gray-600 font-mono text-xs' },
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}

      {view === 'statefulsets' && (
        <ResourceTable
          title="StatefulSets"
          data={statefulsets}
          isLoading={ssLoading}
          error={ssError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['statefulsets'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="statefulsets"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'ready', header: 'Ready', render: (item) => {
              const [ready, total] = item.ready.split('/').map(Number);
              return <ReadyBadge ready={ready} total={total} />;
            }},
            { key: 'replicas', header: 'Replicas' },
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}

      {view === 'replicasets' && (
        <ResourceTable
          title="ReplicaSets"
          data={replicasets}
          isLoading={rsLoading}
          error={rsError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['replicasets'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="replicasets"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'desired', header: 'Desired' },
            { key: 'current', header: 'Current' },
            { key: 'ready', header: 'Ready', render: (item) => <ReadyBadge ready={item.ready} total={item.desired} /> },
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}
    </div>
  );
}
