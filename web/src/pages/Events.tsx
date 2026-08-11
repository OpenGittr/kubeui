import { useMemo, useState } from 'react';
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  );
}

export function Events({ namespace, isConnected = true }: EventsProps) {
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['events', namespace],
    queryFn: () => api.events.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const allTypes = useMemo(
    () => Array.from(new Set((events || []).map((e) => e.type))).sort(),
    [events]
  );
  const allKinds = useMemo(
    () => Array.from(new Set((events || []).map((e) => e.object.split('/')[0]).filter(Boolean))).sort(),
    [events]
  );
  const allReasons = useMemo(
    () => Array.from(new Set((events || []).map((e) => e.reason))).sort(),
    [events]
  );

  const filtered = useMemo(() => {
    return (events || []).filter((e) => {
      if (typeFilter && e.type !== typeFilter) return false;
      if (kindFilter && e.object.split('/')[0] !== kindFilter) return false;
      if (reasonFilter && e.reason !== reasonFilter) return false;
      return true;
    });
  }, [events, typeFilter, kindFilter, reasonFilter]);

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  const hasFilter = typeFilter || kindFilter || reasonFilter;
  const total = events?.length ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <FilterSelect label="Type" value={typeFilter} options={allTypes} onChange={setTypeFilter} />
        <FilterSelect label="Kind" value={kindFilter} options={allKinds} onChange={setKindFilter} />
        <FilterSelect label="Reason" value={reasonFilter} options={allReasons} onChange={setReasonFilter} />
        {hasFilter && (
          <>
            <button
              onClick={() => {
                setTypeFilter('');
                setKindFilter('');
                setReasonFilter('');
              }}
              className="text-xs text-blue-600 hover:underline"
            >
              Clear filters
            </button>
            <span className="text-xs text-gray-500">
              {filtered.length} of {total} events
            </span>
          </>
        )}
      </div>

      <ResourceTable
        title="Events"
        data={filtered}
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
    </div>
  );
}
