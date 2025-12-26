import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useState } from 'react';

interface QuotasProps {
  namespace?: string;
  isConnected?: boolean;
}

export function Quotas({ namespace, isConnected = true }: QuotasProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'resourcequotas' | 'limitranges'>('resourcequotas');

  const { data: resourceQuotas, isLoading: rqLoading, error: rqError } = useQuery({
    queryKey: ['resourcequotas', namespace],
    queryFn: () => api.quotas.listResourceQuotas(namespace),
    refetchInterval: isConnected ? 10000 : false,
    enabled: isConnected && view === 'resourcequotas',
  });

  const { data: limitRanges, isLoading: lrLoading, error: lrError } = useQuery({
    queryKey: ['limitranges', namespace],
    queryFn: () => api.quotas.listLimitRanges(namespace),
    refetchInterval: isConnected ? 10000 : false,
    enabled: isConnected && view === 'limitranges',
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('resourcequotas')}
          className={`px-4 py-2 rounded ${view === 'resourcequotas' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          Resource Quotas
        </button>
        <button
          onClick={() => setView('limitranges')}
          className={`px-4 py-2 rounded ${view === 'limitranges' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
        >
          Limit Ranges
        </button>
      </div>

      {view === 'resourcequotas' && (
        <ResourceTable
          title="Resource Quotas"
          data={resourceQuotas}
          isLoading={rqLoading}
          error={rqError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['resourcequotas'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="resourcequotas"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'hard', header: 'Hard Limits', render: (item) => (
              <div className="flex flex-wrap gap-1">
                {Object.entries(item.hard).slice(0, 3).map(([key, value]) => (
                  <span key={key} className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
                    {key}: {value}
                  </span>
                ))}
                {Object.keys(item.hard).length > 3 && (
                  <span className="text-gray-500 text-xs">+{Object.keys(item.hard).length - 3} more</span>
                )}
              </div>
            )},
            { key: 'used', header: 'Used', render: (item) => (
              <div className="flex flex-wrap gap-1">
                {Object.entries(item.used).slice(0, 3).map(([key, value]) => (
                  <span key={key} className="px-2 py-0.5 bg-blue-50 rounded text-xs font-mono">
                    {key}: {value}
                  </span>
                ))}
              </div>
            )},
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}

      {view === 'limitranges' && (
        <ResourceTable
          title="Limit Ranges"
          data={limitRanges}
          isLoading={lrLoading}
          error={lrError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['limitranges'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="limitranges"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'limits', header: 'Limits', render: (item) => (
              <div className="space-y-1">
                {item.limits.slice(0, 2).map((limit, idx) => (
                  <div key={idx} className="text-xs text-gray-600 truncate max-w-md">{limit}</div>
                ))}
                {item.limits.length > 2 && (
                  <span className="text-gray-500 text-xs">+{item.limits.length - 2} more</span>
                )}
              </div>
            )},
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}
    </div>
  );
}
