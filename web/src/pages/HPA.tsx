import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { HPAInfo } from '../services/api';
import { RefreshCw, FileCode, X, ChevronRight, Info, TrendingUp, TrendingDown, Activity, Scale, Save, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { MetadataTabs } from '../components/MetadataTabs';
import { useToast } from '../components/Toast';
import { usePermissions } from '../hooks/usePermissions';
import { useSelectedResource, selectedHref } from '../hooks/useSelectedResource';
import { Link } from 'react-router-dom';
import { useTableSort, ageSeconds } from '../hooks/useTableSort';
import { SortableTh } from '../components/SortableTh';

const HPA_SORTERS = {
  name: (h: HPAInfo) => h.name,
  namespace: (h: HPAInfo) => h.namespace,
  reference: (h: HPAInfo) => h.reference,
  replicas: (h: HPAInfo) => h.replicas,
  age: (h: HPAInfo) => -ageSeconds(h.age),
};

// Map ScaleTargetRef.kind → list page route. Anything else falls through to
// plain text (the user can still find it manually).
const SCALE_TARGET_ROUTES: Record<string, string> = {
  Deployment: '/deployments',
  StatefulSet: '/statefulsets',
  DaemonSet: '/daemonsets',
  ReplicaSet: '/replicasets',
};

const HPA_CHECKS = [
  { verb: 'patch', group: 'autoscaling', resource: 'horizontalpodautoscalers' },
];

function HPAEditModal({ hpa, onClose }: { hpa: HPAInfo; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [minR, setMinR] = useState<string>(hpa.minPods != null ? String(hpa.minPods) : '');
  const [maxR, setMaxR] = useState<string>(String(hpa.maxPods));

  const mutation = useMutation({
    mutationFn: () => {
      const patch: { minReplicas?: number; maxReplicas?: number } = {};
      if (minR !== '' && Number(minR) !== hpa.minPods) patch.minReplicas = Number(minR);
      if (maxR !== '' && Number(maxR) !== hpa.maxPods) patch.maxReplicas = Number(maxR);
      return api.hpas.update(hpa.namespace, hpa.name, patch);
    },
    onSuccess: () => {
      addToast(`HPA ${hpa.name} updated`, 'success');
      queryClient.invalidateQueries({ queryKey: ['hpas'] });
      queryClient.invalidateQueries({ queryKey: ['hpa-details', hpa.namespace, hpa.name] });
      onClose();
    },
    onError: (err: Error) => addToast(`Update failed: ${err.message}`, 'error'),
  });

  const minNum = Number(minR);
  const maxNum = Number(maxR);
  const invalid = maxR === '' || maxNum < 1 || (minR !== '' && (minNum < 1 || minNum > maxNum));

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Edit HPA — {hpa.name}</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Min replicas</label>
            <input
              type="number"
              min={1}
              value={minR}
              onChange={e => setMinR(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max replicas</label>
            <input
              type="number"
              min={1}
              value={maxR}
              onChange={e => setMaxR(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <p className="text-xs text-gray-500">
            Target-utilization edits require YAML — the metrics array structure varies by metric type.
          </p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-lg">
          <button onClick={onClose} className="px-3 py-1.5 text-sm bg-white border border-gray-300 hover:bg-gray-100 rounded">Cancel</button>
          <button
            disabled={invalid || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded flex items-center gap-1 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Range bar for HPA replicas. The track represents the *scaling band* —
 * 0% = min, 100% = max — so 0..min is not wasted space. The current value
 * is a dot inside the band; the right-hand label says how much headroom is
 * left (or "at max", "at min", or "scaling to N" during a scale event).
 *
 *   3 / 1–10   ┃────●─────────┃   7 to scale up
 *               min        max
 */
function ReplicasBar({ min, max, current, desired }: {
  min: number;
  max: number;
  current: number;
  desired?: number;
}) {
  const fixed = min === max;
  const range = Math.max(1, max - min);
  const pct = (n: number) => Math.max(0, Math.min(100, ((n - min) / range) * 100));
  const curPct = pct(current);
  const desPct = desired != null ? pct(desired) : null;
  const scaling = desired != null && desired !== current;
  const atMax = current >= max;
  const atMin = current <= min && !fixed;

  let label = '';
  let labelClass = 'text-gray-500';
  if (scaling) { label = `scaling to ${desired}`; labelClass = 'text-amber-700'; }
  else if (atMax) { label = 'at max'; labelClass = 'text-red-600'; }
  else if (atMin) { label = 'at min'; labelClass = 'text-gray-500'; }
  else { label = `${max - current} to scale up`; labelClass = 'text-gray-500'; }

  return (
    <div className="bg-gray-50 p-3 rounded">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs text-gray-500 uppercase">Replicas</span>
        <span className="ml-auto text-2xl font-bold text-blue-600 leading-none">{current}</span>
        <span className="text-sm text-gray-500">/ {min}–{max}</span>
      </div>

      {fixed ? (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-2 rounded">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <div className="font-semibold">Autoscaling is disabled (min = max)</div>
            <div>This HPA has both min and max set to {min}, so it's not actually scaling. Consider deleting the HPA and setting <code className="font-mono bg-amber-100 px-1 rounded">spec.replicas</code> on the workload directly.</div>
          </div>
        </div>
      ) : (() => {
        const dotPx = 14;
        const inset = (p: number) => `calc(${p}% + ${(0.5 - p / 100) * dotPx}px - ${dotPx / 2}px)`;
        const atEdge = atMin || atMax;
        return (
          <>
            <div className="relative h-2 bg-blue-200/60 rounded">
              {desPct != null && scaling && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-amber-500 z-10"
                  style={{ left: inset(desPct), width: dotPx, height: dotPx }}
                  title={`Desired: ${desired}`}
                />
              )}
              <div
                className="absolute top-1/2 -translate-y-1/2 rounded-full bg-blue-600 border-2 border-white shadow z-20"
                style={{ left: inset(curPct), width: dotPx, height: dotPx }}
                title={`Current: ${current}`}
              />
            </div>
            {/* Numbers below the bar — min · (current) · max, with current
                aligned under its dot. Hidden when current sits exactly at an
                edge to avoid colliding with the min/max label. */}
            <div className="relative h-4 mt-1 text-[11px]">
              <span className={`absolute left-0 ${atMin ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>min {min}</span>
              {!atEdge && (
                <span
                  className="absolute -translate-x-1/2 font-semibold text-blue-600"
                  style={{ left: `${curPct}%` }}
                >
                  {current}
                </span>
              )}
              <span className={`absolute right-0 ${atMax ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>max {max}</span>
            </div>
            {label && <div className={`text-[11px] mt-0.5 ${labelClass}`}>{label}</div>}
          </>
        );
      })()}
    </div>
  );
}

/**
 * Compact replicas bar for the list-page table cell. Track represents only
 * the min..max scaling band; current is a dot inside it.
 *
 *   3 / 1–10  ┃────●──────┃
 */
function MiniReplicasBar({ min, max, current }: { min: number; max: number; current: number }) {
  if (min === max) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-sm whitespace-nowrap">
        <span title="Configuration disables autoscaling (min = max). Consider setting replicas directly on the workload spec instead." className="inline-flex">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
        </span>
        <span className="font-semibold text-blue-600">{current}</span>
      </span>
    );
  }

  const range = max - min;
  const curPct = Math.max(0, Math.min(100, ((current - min) / range) * 100));
  const atMax = current >= max;
  const atMin = current <= min;

  // Edge-clip safe positioning so the dot/label sit fully inside the track.
  const dotPx = 10;
  const dotLeft = `calc(${curPct}% + ${(0.5 - curPct / 100) * dotPx}px - ${dotPx / 2}px)`;
  const dotColor = atMax ? 'bg-red-500' : 'bg-blue-600';

  return (
    <div className="w-32" title={`current ${current} · min ${min} · max ${max}`}>
      <div className="relative h-1.5 bg-blue-200/60 rounded">
        <div
          className={`absolute top-1/2 -translate-y-1/2 rounded-full ${dotColor} border border-white shadow`}
          style={{ left: dotLeft, width: dotPx, height: dotPx }}
        />
      </div>
      <div className="relative h-3 mt-1 font-mono text-[10px]">
        <span className={`absolute left-0 ${atMin ? 'font-semibold text-blue-600' : 'text-gray-500'}`}>{min}</span>
        {/* Show current only when it's clearly distinct from min/max — otherwise
            the number would crash into the edge label. */}
        {!atMin && !atMax && (
          <span
            className="absolute -translate-x-1/2 font-semibold text-blue-600"
            style={{ left: `${curPct}%` }}
          >
            {current}
          </span>
        )}
        <span className={`absolute right-0 ${atMax ? 'font-semibold text-red-600' : 'text-gray-500'}`}>{max}</span>
      </div>
    </div>
  );
}

/**
 * Compact metric bar for the list-page Targets column.
 *
 * Bar spans 0..120% of target so we visually distinguish "approaching target"
 * from "over target", with a vertical tick at 100% (the target line).
 *  - <80%  green
 *  - 80-100% amber (close, may scale up soon)
 *  - >100% red (already over target — should already be scaling)
 *
 * For metric types without a percent (raw value targets), we fall back to a
 * non-bar text rendering.
 */
function MetricChip({ metric }: { metric: { name: string; currentValue: string; targetValue: string; currentPercent?: number; targetPercent?: number } }) {
  const cur = metric.currentPercent;
  const tgt = metric.targetPercent;
  const label = metric.name === 'cpu' ? 'CPU' : metric.name === 'memory' ? 'MEM' : metric.name.toUpperCase();

  if (cur == null || tgt == null || tgt === 0) {
    // Value-based target (no utilization %) — text only.
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span className="font-medium text-gray-500 w-9">{label}</span>
        <span className="font-mono">{metric.currentValue}<span className="text-gray-400"> / {metric.targetValue}</span></span>
      </div>
    );
  }

  // Bar geometry: 0..120% of target maps to 0..100% bar width.
  const SCALE = 1.2;
  const fillPct = Math.min(100, (cur / (tgt * SCALE)) * 100);
  const targetTickPct = (1 / SCALE) * 100; // where 100% of target sits
  const overTarget = cur > tgt;
  const approaching = !overTarget && cur > tgt * 0.8;
  const fillColor = overTarget ? 'bg-red-500' : approaching ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="font-medium text-gray-500 w-9">{label}</span>
      <div className="relative h-2 w-24 bg-gray-200 rounded">
        <div className={`absolute inset-y-0 left-0 ${fillColor} rounded`} style={{ width: `${fillPct}%` }} />
        <div className="absolute top-0 bottom-0 w-px bg-gray-700" style={{ left: `${targetTickPct}%` }} title={`Target: ${metric.targetValue}`} />
      </div>
      <span className="font-mono w-16 text-right">
        <span className={overTarget ? 'text-red-600 font-medium' : approaching ? 'text-amber-700' : ''}>{cur}%</span>
        <span className="text-gray-400">/{tgt}%</span>
      </span>
    </div>
  );
}

interface HPAProps {
  namespace?: string;
  isConnected?: boolean;
}

function HPADetailsPanel({
  hpa,
  onClose,
  onViewYaml,
}: {
  hpa: HPAInfo;
  onClose: () => void;
  onViewYaml: () => void;
}) {
  const { data: hpaDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['hpa-details', hpa.namespace, hpa.name],
    queryFn: () => api.hpas.get(hpa.namespace, hpa.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['hpa-events', hpa.namespace, hpa.name],
    queryFn: () => api.hpas.events(hpa.namespace, hpa.name),
  });

  const details = hpaDetails || hpa;

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            {hpa.name}
          </h2>
          <p className="text-sm text-gray-500">{hpa.namespace}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewYaml}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            <FileCode className="w-4 h-4" />
            YAML
          </button>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Replicas range bar */}
        <ReplicasBar
          min={hpa.minPods}
          max={hpa.maxPods}
          current={hpa.replicas}
          desired={details.desiredReplicas}
        />

        {/* Target Reference */}
        <div className="bg-blue-50 p-3 rounded">
          <div className="text-xs text-gray-500 uppercase mb-1">Scale Target</div>
          <div className="flex items-center gap-2">
            {(() => {
              const kind = details.referenceKind || hpa.reference.split('/')[0];
              const refName = details.referenceName || hpa.reference.split('/')[1];
              const route = SCALE_TARGET_ROUTES[kind];
              const content = (
                <>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">{kind}</span>
                  <span className="font-mono text-sm">{refName}</span>
                </>
              );
              if (!route) return content;
              return (
                <Link
                  to={selectedHref(route, hpa.namespace, refName)}
                  className="flex items-center gap-2 hover:underline decoration-blue-400 underline-offset-2"
                  title={`Open ${kind} ${refName}`}
                >
                  {content}
                </Link>
              );
            })()}
          </div>
        </div>

        {/* Metrics — bar spans 0..120% of target with a tick at the target line */}
        {detailsLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : details.metrics && details.metrics.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Resource Metrics</h3>
            <div className="bg-gray-50 rounded p-3 space-y-3">
              {details.metrics.map((metric, idx) => {
                const cur = metric.currentPercent;
                const tgt = metric.targetPercent;
                const label = metric.name === 'cpu' ? 'CPU' : metric.name === 'memory' ? 'Memory' : metric.name;

                // Value-based metrics: no percent — render text only.
                if (cur == null || tgt == null || tgt === 0) {
                  return (
                    <div key={idx} className="flex items-center gap-3 text-sm">
                      <span className="font-medium text-gray-700 w-20">{label}</span>
                      <span className="font-mono">{metric.currentValue}<span className="text-gray-400"> / {metric.targetValue} target</span></span>
                    </div>
                  );
                }

                const SCALE = 1.2;
                const fillPct = Math.min(100, (cur / (tgt * SCALE)) * 100);
                const targetTickPct = (1 / SCALE) * 100;
                const overTarget = cur > tgt;
                const approaching = !overTarget && cur > tgt * 0.8;
                const fillColor = overTarget ? 'bg-red-500' : approaching ? 'bg-amber-500' : 'bg-emerald-500';

                return (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                      <span className="text-xs font-mono">
                        <span className={overTarget ? 'text-red-600 font-semibold' : approaching ? 'text-amber-700' : 'text-gray-700'}>
                          {metric.currentValue}
                        </span>
                        <span className="text-gray-400"> / {metric.targetValue} target</span>
                      </span>
                    </div>
                    <div className="relative h-3 bg-gray-200 rounded">
                      <div className={`absolute inset-y-0 left-0 ${fillColor} rounded-l`} style={{ width: `${fillPct}%` }} />
                      <div className="absolute top-0 bottom-0 w-px bg-gray-700" style={{ left: `${targetTickPct}%` }} title={`Target: ${tgt}%`} />
                    </div>
                    {/* Tick labels — absolutely positioned so they align under
                        the bar's geometry instead of fighting flexbox margins. */}
                    <div className="relative h-3 mt-0.5 text-[10px] text-gray-400">
                      <span className="absolute left-0">0%</span>
                      <span className="absolute -translate-x-1/2 font-medium text-gray-500" style={{ left: `${targetTickPct}%` }}>
                        {tgt}%
                      </span>
                      <span className="absolute right-0">{Math.round(tgt * SCALE)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Last Scale Time */}
        {details.lastScaleTime && (
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Last Scale Event</div>
            <div className="font-medium">{details.lastScaleTime} ago</div>
          </div>
        )}

        {/* Scaling Behavior */}
        {(details.scaleUpBehavior || details.scaleDownBehavior) && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Scaling Behavior</h3>
            <div className="grid grid-cols-2 gap-4">
              {details.scaleUpBehavior && (
                <div className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-sm">Scale Up</span>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    {(details.scaleUpBehavior.stabilizationWindowSeconds ?? 0) > 0 && (
                      <div>Stabilization: {details.scaleUpBehavior.stabilizationWindowSeconds}s</div>
                    )}
                    {details.scaleUpBehavior.selectPolicy && (
                      <div>Policy: {details.scaleUpBehavior.selectPolicy}</div>
                    )}
                  </div>
                </div>
              )}
              {details.scaleDownBehavior && (
                <div className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <span className="font-medium text-sm">Scale Down</span>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    {(details.scaleDownBehavior.stabilizationWindowSeconds ?? 0) > 0 && (
                      <div>Stabilization: {details.scaleDownBehavior.stabilizationWindowSeconds}s</div>
                    )}
                    {details.scaleDownBehavior.selectPolicy && (
                      <div>Policy: {details.scaleDownBehavior.selectPolicy}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Conditions */}
        {details.conditions && details.conditions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Conditions</h3>
            <div className="space-y-2">
              {details.conditions.map((condition, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full mt-1.5 ${
                    condition.status === 'True' ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <div>
                    <span className="font-medium">{condition.type}</span>
                    {condition.reason && (
                      <span className="text-gray-500 ml-2">({condition.reason})</span>
                    )}
                    {condition.message && (
                      <p className="text-gray-600 text-xs mt-0.5">{condition.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Labels */}
        <MetadataTabs
          tabs={[
            { key: 'labels', label: 'Labels', data: details.labels },
          ]}
        />

        {/* Events */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Events</h3>
          {eventsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : events && events.length > 0 ? (
            <div className="space-y-2">
              {events.map((event, idx) => (
                <div
                  key={idx}
                  className={`border-l-2 pl-3 py-1 ${
                    event.type === 'Warning' ? 'border-yellow-400' : 'border-green-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      event.type === 'Warning' ? 'text-yellow-700' : 'text-green-700'
                    }`}>
                      {event.reason}
                    </span>
                    {event.count > 1 && (
                      <span className="text-xs text-gray-400">x{event.count}</span>
                    )}
                    <span className="text-xs text-gray-400">{event.age}</span>
                  </div>
                  <p className="text-sm text-gray-600">{event.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No events</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function HPA({ namespace, isConnected = true }: HPAProps) {
  const queryClient = useQueryClient();
  const [yamlHPA, setYamlHPA] = useState<HPAInfo | null>(null);
  const [selectedHPA, setSelectedHPA] = useState<HPAInfo | null>(null);
  const [editHPA, setEditHPA] = useState<HPAInfo | null>(null);
  const { can } = usePermissions(namespace, HPA_CHECKS);
  const canPatch = can('patch', 'autoscaling', 'horizontalpodautoscalers');
  const patchTitle = canPatch ? undefined : 'Requires patch on horizontalpodautoscalers';

  const { data: hpas, isLoading, error } = useQuery({
    queryKey: ['hpas', namespace],
    queryFn: () => api.hpas.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });
  useSelectedResource(hpas, selectedHPA, setSelectedHPA);
  const sort = useTableSort(hpas, HPA_SORTERS);

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading HPAs...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Horizontal Pod Autoscalers</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['hpas'] })}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <SortableTh sortKey="name" label="Name" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="namespace" label="Namespace" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="reference" label="Reference" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Targets</th>
              <SortableTh sortKey="replicas" label="Replicas" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="age" label="Age" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sort.sorted.map((hpa) => (
              <tr
                key={`${hpa.namespace}/${hpa.name}`}
                className={`hover:bg-gray-50 cursor-pointer ${selectedHPA?.name === hpa.name && selectedHPA?.namespace === hpa.namespace ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedHPA(hpa)}
              >
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-1">
                    {hpa.name}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{hpa.namespace}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-mono">{hpa.reference}</span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {hpa.metrics && hpa.metrics.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {hpa.metrics.map((m, i) => <MetricChip key={i} metric={m} />)}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <MiniReplicasBar min={hpa.minPods} max={hpa.maxPods} current={hpa.replicas} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{hpa.age}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      {
                        label: 'Details',
                        icon: <Info className="w-4 h-4" />,
                        onClick: () => setSelectedHPA(hpa),
                      },
                      {
                        label: 'Edit min/max',
                        icon: <Scale className="w-4 h-4" />,
                        disabled: !canPatch,
                        title: patchTitle,
                        onClick: () => setEditHPA(hpa),
                      },
                      {
                        label: 'View YAML',
                        icon: <FileCode className="w-4 h-4" />,
                        onClick: () => setYamlHPA(hpa),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!hpas || hpas.length === 0) && (
          <div className="text-center py-8 text-gray-500">No HPAs found</div>
        )}
      </div>

      {yamlHPA && (
        <YamlModal
          resourceType="horizontalpodautoscalers"
          namespace={yamlHPA.namespace}
          name={yamlHPA.name}
          onClose={() => setYamlHPA(null)}
        />
      )}

      {editHPA && <HPAEditModal hpa={editHPA} onClose={() => setEditHPA(null)} />}

      {selectedHPA && (
        <HPADetailsPanel
          hpa={selectedHPA}
          onClose={() => setSelectedHPA(null)}
          onViewYaml={() => {
            setYamlHPA(selectedHPA);
          }}
        />
      )}
    </div>
  );
}
