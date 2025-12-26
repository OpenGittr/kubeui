import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useState } from 'react';

interface NetworkProps {
  namespace?: string;
  isConnected?: boolean;
}

export function Network({ namespace, isConnected = true }: NetworkProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'ingresses' | 'endpoints' | 'networkpolicies'>('ingresses');

  const { data: ingresses, isLoading: ingLoading, error: ingError } = useQuery({
    queryKey: ['ingresses', namespace],
    queryFn: () => api.network.listIngresses(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'ingresses',
  });

  const { data: endpoints, isLoading: epLoading, error: epError } = useQuery({
    queryKey: ['endpoints', namespace],
    queryFn: () => api.network.listEndpoints(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'endpoints',
  });

  const { data: networkPolicies, isLoading: npLoading, error: npError } = useQuery({
    queryKey: ['networkpolicies', namespace],
    queryFn: () => api.network.listNetworkPolicies(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'networkpolicies',
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('ingresses')}
          className={`px-4 py-2 rounded ${view === 'ingresses' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          Ingresses
        </button>
        <button
          onClick={() => setView('endpoints')}
          className={`px-4 py-2 rounded ${view === 'endpoints' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          Endpoints
        </button>
        <button
          onClick={() => setView('networkpolicies')}
          className={`px-4 py-2 rounded ${view === 'networkpolicies' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          Network Policies
        </button>
      </div>

      {view === 'ingresses' && (
        <ResourceTable
          title="Ingresses"
          data={ingresses}
          isLoading={ingLoading}
          error={ingError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['ingresses'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="ingresses"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'class', header: 'Class', render: (item) => (
              <span className={item.class === '<none>' ? 'text-gray-400' : 'text-blue-600'}>{item.class}</span>
            )},
            { key: 'hosts', header: 'Hosts', render: (item) => (
              <div className="flex flex-wrap gap-1">
                {item.hosts.map((host) => (
                  <span key={host} className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">{host}</span>
                ))}
              </div>
            )},
            { key: 'address', header: 'Address', render: (item) => (
              <span className={item.address === '<pending>' ? 'text-yellow-600' : 'font-mono text-sm'}>{item.address}</span>
            )},
            { key: 'ports', header: 'Ports', className: 'text-gray-600' },
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}

      {view === 'endpoints' && (
        <ResourceTable
          title="Endpoints"
          data={endpoints}
          isLoading={epLoading}
          error={epError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['endpoints'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="endpoints"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'endpoints', header: 'Endpoints', render: (item) => (
              <span className={item.endpoints === '<none>' ? 'text-gray-400' : 'font-mono text-xs'}>{item.endpoints}</span>
            )},
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}

      {view === 'networkpolicies' && (
        <ResourceTable
          title="Network Policies"
          data={networkPolicies}
          isLoading={npLoading}
          error={npError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['networkpolicies'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="networkpolicies"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'podSelector', header: 'Pod Selector', render: (item) => (
              <span className={item.podSelector === '<all>' ? 'text-gray-400' : 'font-mono text-xs'}>{item.podSelector}</span>
            )},
            { key: 'policyTypes', header: 'Policy Types', render: (item) => (
              <div className="flex gap-1">
                {item.policyTypes.split(', ').map((type) => (
                  <span key={type} className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-medium">{type}</span>
                ))}
              </div>
            )},
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}
    </div>
  );
}
