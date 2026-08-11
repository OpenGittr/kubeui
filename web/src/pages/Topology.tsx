import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { TopologyResponse, TopologyWorkload, TopologyPod } from '../services/api';
import { RefreshCw, Search, X } from 'lucide-react';

interface TopologyProps {
  namespace?: string;
  isConnected?: boolean;
}

// Palette used to color highlighted workloads. Chosen to be distinguishable
// against the neutral dot background in both light and dark modes.
const HIGHLIGHT_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#d946ef', // fuchsia-500
  '#84cc16', // lime-500
  '#0ea5e9', // sky-500
];

function phaseDim(phase: string): boolean {
  return phase !== 'Running' && phase !== 'Succeeded';
}

function PodDot({
  pod,
  color,
  dim,
}: {
  pod: TopologyPod;
  color?: string;
  dim: boolean;
}) {
  const bg = color ?? (dim ? '#e5e7eb' : '#9ca3af');
  const ring = color ? 'ring-1 ring-white' : '';
  return (
    <div
      className={`w-2.5 h-2.5 rounded-sm ${ring} shrink-0 ${phaseDim(pod.phase) ? 'opacity-40' : ''}`}
      style={{ backgroundColor: bg }}
      title={`${pod.namespace}/${pod.name} · ${pod.phase}`}
    />
  );
}

function WorkloadPicker({
  workloads,
  selected,
  onToggle,
}: {
  workloads: TopologyWorkload[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!q) return workloads;
    const needle = q.toLowerCase();
    return workloads.filter(
      (w) =>
        w.name.toLowerCase().includes(needle) ||
        w.namespace.toLowerCase().includes(needle) ||
        w.kind.toLowerCase().includes(needle)
    );
  }, [q, workloads]);

  return (
    <div className="bg-white rounded shadow-sm border border-gray-200 w-72 shrink-0 flex flex-col max-h-[calc(100vh-13rem)]">
      <div className="p-2 border-b flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter workloads..."
          className="text-sm bg-transparent focus:outline-none flex-1 min-w-0"
        />
        {selected.size > 0 && (
          <span className="text-[10px] font-mono text-blue-600">{selected.size} on</span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.map((w) => {
          const isSel = selected.has(w.key);
          return (
            <button
              key={w.key}
              onClick={() => onToggle(w.key)}
              className={`w-full text-left px-3 py-1.5 text-xs border-b border-gray-50 hover:bg-gray-50 flex items-center gap-2 ${
                isSel ? 'bg-blue-50' : ''
              }`}
            >
              <input type="checkbox" checked={isSel} readOnly className="w-3 h-3" />
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  <span className="text-gray-500">{w.namespace}</span> ·{' '}
                  <span className="font-medium">{w.name}</span>
                </div>
                <div className="text-[10px] text-gray-400">{w.kind} · {w.podCount} pod{w.podCount === 1 ? '' : 's'}</div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-xs text-gray-400 italic px-3 py-4 text-center">No matches</div>
        )}
      </div>
    </div>
  );
}

export function Topology({ namespace, isConnected = true }: TopologyProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<TopologyResponse>({
    queryKey: ['topology', namespace],
    queryFn: () => api.topology.get(namespace),
    refetchInterval: isConnected ? 15000 : false,
    enabled: isConnected,
  });

  // Stable color per selected workload — assigned in insertion order.
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    let i = 0;
    selected.forEach((k) => {
      m[k] = HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length];
      i++;
    });
    return m;
  }, [selected]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!isConnected) return <div className="text-gray-500">Not connected to cluster</div>;
  if (isLoading && !data) return <div className="text-gray-500">Loading topology...</div>;
  if (error) return <div className="text-red-500">Error: {(error as Error).message}</div>;
  if (!data) return null;

  const hasSelection = selected.size > 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">Topology</h1>
          <span className="text-sm text-gray-500">
            {namespace || 'all namespaces'} ·{' '}
            {data.nodepools.length} nodepool{data.nodepools.length === 1 ? '' : 's'} ·{' '}
            {data.nodepools.reduce((sum, np) => sum + np.nodes.length, 0)} nodes ·{' '}
            {data.workloads.length} workloads
          </span>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['topology', namespace] })}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Selected-workload legend */}
      {hasSelection && (
        <div className="flex flex-wrap gap-2 mb-3">
          {Array.from(selected).map((key) => {
            const w = data.workloads.find((x) => x.key === key);
            if (!w) return null;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-gray-200 bg-white"
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colorMap[key] }} />
                <span className="text-gray-500">{w.namespace}</span>
                <span className="font-medium">{w.name}</span>
                <span className="text-gray-400">({w.kind})</span>
                <button
                  onClick={() => toggle(key)}
                  className="text-gray-400 hover:text-gray-700 ml-0.5"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:underline px-2 py-1"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="flex gap-4 items-start">
        <WorkloadPicker workloads={data.workloads} selected={selected} onToggle={toggle} />

        <div className="flex-1 min-w-0 space-y-4">
          {data.nodepools.map((np) => (
            <section key={np.name}>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">
                Nodepool: <span className="font-mono">{np.name}</span>
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {np.nodes.length} node{np.nodes.length === 1 ? '' : 's'}
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {np.nodes.map((node) => {
                  const matchCount = hasSelection
                    ? node.pods.filter((p) => selected.has(p.workloadKey)).length
                    : 0;
                  return (
                    <div
                      key={node.name}
                      className={`bg-white rounded-lg border p-3 ${
                        hasSelection && matchCount === 0 ? 'opacity-60' : ''
                      } ${node.ready ? 'border-gray-200' : 'border-red-300'}`}
                    >
                      <div className="flex items-baseline gap-2 mb-2">
                        <div className="text-xs font-mono truncate flex-1 min-w-0" title={node.name}>
                          {node.name}
                        </div>
                        {node.zone && (
                          <span className="text-[10px] text-gray-400 shrink-0">{node.zone}</span>
                        )}
                        {!node.ready && (
                          <span className="text-[10px] text-red-600 font-medium">NotReady</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] text-gray-400">{node.pods.length} pods</span>
                        {hasSelection && matchCount > 0 && (
                          <span className="text-[10px] text-blue-600 font-medium">
                            {matchCount} selected
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-0.5">
                        {node.pods.map((pod) => (
                          <PodDot
                            key={`${pod.namespace}/${pod.name}`}
                            pod={pod}
                            color={selected.has(pod.workloadKey) ? colorMap[pod.workloadKey] : undefined}
                            dim={hasSelection && !selected.has(pod.workloadKey)}
                          />
                        ))}
                        {node.pods.length === 0 && (
                          <span className="text-[10px] text-gray-400 italic">no pods</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
