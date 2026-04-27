import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { BinPackingPod, BinPackingResponse } from '../services/api';
import { formatCPU, formatMemory } from './ResourceBar';

interface Props {
  nodeName: string;
}

// Stable per-pod color palette using solid 500-shades. These are intentionally
// NOT in the dark-mode CSS overrides so colors stay consistent across themes.
const POD_FILLS = [
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

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function fillFor(pod: BinPackingPod): string {
  return POD_FILLS[hashString(`${pod.namespace}/${pod.name}`) % POD_FILLS.length];
}

interface Segment {
  pod: BinPackingPod;
  req: number;
  use: number;
}

/**
 * Build segments for one bar (CPU or Memory).
 * - Each segment carries both request and usage so the renderer can show
 *   a faded outer (request slot) with a solid inner (actual usage).
 * - Sorted descending by request so the eye lands on the biggest reservation.
 * - Anything < 1% of capacity is folded into a trailing "+N more" sliver.
 */
function buildSegments(
  pods: BinPackingPod[],
  capacity: number,
  pickReq: (p: BinPackingPod) => number,
  pickUse: (p: BinPackingPod) => number,
) {
  if (capacity <= 0) {
    return { segments: [] as Segment[], merged: 0, mergedReq: 0, mergedUse: 0 };
  }
  const sorted = [...pods]
    .map(p => ({ pod: p, req: pickReq(p), use: pickUse(p) }))
    .filter(s => s.req > 0 || s.use > 0)
    .sort((a, b) => b.req - a.req);
  const segments: Segment[] = [];
  let merged = 0, mergedReq = 0, mergedUse = 0;
  for (const s of sorted) {
    if ((s.req / capacity) * 100 < 1) {
      merged++;
      mergedReq += s.req;
      mergedUse += s.use;
      continue;
    }
    segments.push(s);
  }
  return { segments, merged, mergedReq, mergedUse };
}

function StackedBar({
  label,
  capacity,
  segments,
  merged,
  mergedReq,
  mergedUse,
  format,
  metricsAvailable,
}: {
  label: string;
  capacity: number;
  segments: Segment[];
  merged: number;
  mergedReq: number;
  mergedUse: number;
  format: (n: number) => string;
  metricsAvailable: boolean;
}) {
  const totalReq = segments.reduce((a, s) => a + s.req, 0) + mergedReq;
  const totalUse = segments.reduce((a, s) => a + s.use, 0) + mergedUse;
  const reqPct = capacity > 0 ? (totalReq / capacity) * 100 : 0;
  const usePct = capacity > 0 ? (totalUse / capacity) * 100 : 0;
  const overcommit = totalReq > capacity;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-600 font-medium w-16">{label}</span>
        <div className="flex items-center gap-3 font-mono text-gray-500">
          <span className={overcommit ? 'text-red-600 font-semibold' : ''}>
            req {format(totalReq)} / {format(capacity)} ({reqPct.toFixed(0)}%)
          </span>
          {metricsAvailable && (
            <span className="text-emerald-600">
              use {format(totalUse)} ({usePct.toFixed(0)}%)
            </span>
          )}
        </div>
      </div>
      {/* overflow-visible so tooltips escape the rounded bar */}
      <div className="relative flex h-6 rounded border border-gray-200 bg-gray-100">
        {segments.map((s, i) => {
          const segReqPct = (s.req / capacity) * 100;
          const segUsePct = s.req > 0 ? Math.min(100, (s.use / s.req) * 100) : 0;
          const fill = fillFor(s.pod);
          const isFirst = i === 0;
          // Request slot: faded fill at low alpha
          return (
            <div
              key={`${s.pod.namespace}/${s.pod.name}-${i}`}
              className="relative group"
              style={{
                width: `${segReqPct}%`,
                backgroundColor: `${fill}33`, // 20% opacity
                borderTopLeftRadius: isFirst ? '0.25rem' : 0,
                borderBottomLeftRadius: isFirst ? '0.25rem' : 0,
              }}
            >
              {/* Inner usage fill at full opacity */}
              {s.use > 0 && (
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${segUsePct}%`,
                    backgroundColor: fill,
                    borderTopLeftRadius: isFirst ? '0.25rem' : 0,
                    borderBottomLeftRadius: isFirst ? '0.25rem' : 0,
                  }}
                />
              )}
              <Tooltip
                pod={s.pod}
                req={s.req}
                use={s.use}
                segReqPct={segReqPct}
                format={format}
                metricsAvailable={metricsAvailable}
              />
            </div>
          );
        })}
        {merged > 0 && (() => {
          const segReqPct = (mergedReq / capacity) * 100;
          const segUsePct = mergedReq > 0 ? Math.min(100, (mergedUse / mergedReq) * 100) : 0;
          return (
            <div
              className="relative group"
              style={{ width: `${Math.max(segReqPct, 0.5)}%`, backgroundColor: 'rgb(156 163 175 / 0.35)' }}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${segUsePct}%`, backgroundColor: 'rgb(156 163 175 / 0.9)' }}
              />
              <div className="absolute left-1/2 -translate-x-1/2 -top-9 hidden group-hover:flex bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-20 gap-2 shadow-lg pointer-events-none">
                <span className="font-semibold">+{merged} small pods</span>
                <span>req {format(mergedReq)}</span>
                {metricsAvailable && <span className="text-emerald-300">use {format(mergedUse)}</span>}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function Tooltip({
  pod, req, use, segReqPct, format, metricsAvailable,
}: {
  pod: BinPackingPod;
  req: number;
  use: number;
  segReqPct: number;
  format: (n: number) => string;
  metricsAvailable: boolean;
}) {
  const innerPct = req > 0 ? (use / req) * 100 : 0;
  const overprov = metricsAvailable && req > 0 && innerPct < 25;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 -top-10 hidden group-hover:flex bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-20 gap-2 shadow-lg pointer-events-none">
      <span className="font-semibold">{pod.name}</span>
      <span className="text-gray-300">{pod.namespace}</span>
      <span className="text-blue-300">req {format(req)} ({segReqPct.toFixed(1)}%)</span>
      {metricsAvailable && (
        <span className={overprov ? 'text-amber-300 font-semibold' : 'text-emerald-300'}>
          use {format(use)} ({innerPct.toFixed(0)}%{overprov ? ' ⚠' : ''})
        </span>
      )}
    </div>
  );
}

export function BinPackingSection({ nodeName }: Props) {
  const { data, isLoading, error } = useQuery<BinPackingResponse>({
    queryKey: ['binpacking', nodeName],
    queryFn: () => api.nodes.binpacking(nodeName),
    refetchInterval: 15_000,
  });

  const cpuBar = useMemo(
    () => data ? buildSegments(data.pods, data.node.allocatableCPU, p => p.cpuRequest, p => p.cpuUsage) : null,
    [data],
  );
  const memBar = useMemo(
    () => data ? buildSegments(data.pods, data.node.allocatableMemory, p => p.memoryRequest, p => p.memoryUsage) : null,
    [data],
  );

  if (isLoading || !data) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Bin packing</h3>
        <p className="text-xs text-gray-500">Loading...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Bin packing</h3>
        <p className="text-xs text-red-600">{(error as Error).message}</p>
      </div>
    );
  }
  if (data.pods.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Bin packing</h3>
        <p className="text-xs text-gray-500">No pods scheduled on this node.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Bin packing</h3>
      <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-4">
        <p className="text-[11px] text-gray-500">
          Faded = pod's <span className="font-medium">request</span> slot · solid inner = <span className="font-medium">actual usage</span>.
          Big empty inner means the pod reserved more than it needs.
          {!data.metricsAvailable && ' Install metrics-server to see actual usage.'}
        </p>

        <div className="space-y-3 pt-3">
          {cpuBar && (
            <StackedBar
              label="CPU"
              capacity={data.node.allocatableCPU}
              segments={cpuBar.segments}
              merged={cpuBar.merged}
              mergedReq={cpuBar.mergedReq}
              mergedUse={cpuBar.mergedUse}
              format={formatCPU}
              metricsAvailable={data.metricsAvailable}
            />
          )}
          {memBar && (
            <StackedBar
              label="Memory"
              capacity={data.node.allocatableMemory}
              segments={memBar.segments}
              merged={memBar.merged}
              mergedReq={memBar.mergedReq}
              mergedUse={memBar.mergedUse}
              format={formatMemory}
              metricsAvailable={data.metricsAvailable}
            />
          )}
        </div>

        <ImbalanceScatter
          pods={data.pods}
          cpuCap={data.node.allocatableCPU}
          memCap={data.node.allocatableMemory}
          metricsAvailable={data.metricsAvailable}
        />
      </div>
    </div>
  );
}

function ImbalanceScatter({
  pods,
  cpuCap,
  memCap,
  metricsAvailable,
}: {
  pods: BinPackingPod[];
  cpuCap: number;
  memCap: number;
  metricsAvailable: boolean;
}) {
  const W = 360, H = 200, PADL = 44, PADB = 28, PADT = 12, PADR = 12;
  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;

  // Auto-scale axes: extend just past the largest data point (×1.2), capped
  // at node capacity. Otherwise tiny pods cluster in the corner of a chart
  // sized to capacity.
  const dataMaxCpu = Math.max(...pods.flatMap(p => [p.cpuRequest, p.cpuUsage]), 1);
  const dataMaxMem = Math.max(...pods.flatMap(p => [p.memoryRequest, p.memoryUsage]), 1);
  const xMax = Math.min(cpuCap, Math.ceil(dataMaxCpu * 1.2));
  const yMax = Math.min(memCap, Math.ceil(dataMaxMem * 1.2));
  const cappedX = xMax >= cpuCap;
  const cappedY = yMax >= memCap;

  const xScale = (cpu: number) => PADL + (xMax > 0 ? Math.min(1, cpu / xMax) * plotW : 0);
  const yScale = (mem: number) => PADT + plotH - (yMax > 0 ? Math.min(1, mem / yMax) * plotH : 0);

  // Tick labels — just min, mid, max for each axis.
  const xTicks = [0, xMax / 2, xMax];
  const yTicks = [0, yMax / 2, yMax];

  return (
    <div>
      <div className="text-xs font-medium text-gray-700 mb-1">
        Imbalance — CPU vs Memory per pod
      </div>
      <div className="text-[11px] text-gray-500 mb-2">
        Filled dot = request, hollow = usage, line = waste.
        Node capacity: {formatCPU(cpuCap)} CPU · {formatMemory(memCap)}
        {(!cappedX || !cappedY) && (
          <span> — axes auto-scaled to fit data (max {formatCPU(xMax)} CPU · {formatMemory(yMax)})</span>
        )}
      </div>
      <svg width={W} height={H} className="bg-white border border-gray-200 rounded">
        {/* Axes */}
        <line x1={PADL} y1={PADT} x2={PADL} y2={H - PADB} stroke="#9ca3af" strokeWidth={1} />
        <line x1={PADL} y1={H - PADB} x2={W - PADR} y2={H - PADB} stroke="#9ca3af" strokeWidth={1} />

        {/* Light gridlines at midpoints */}
        <line x1={PADL + plotW / 2} y1={PADT} x2={PADL + plotW / 2} y2={H - PADB} stroke="#e5e7eb" strokeDasharray="2 3" />
        <line x1={PADL} y1={PADT + plotH / 2} x2={W - PADR} y2={PADT + plotH / 2} stroke="#e5e7eb" strokeDasharray="2 3" />

        {/* Tick labels */}
        {xTicks.map((v, i) => (
          <text
            key={`xt${i}`}
            x={PADL + (i / 2) * plotW}
            y={H - PADB + 14}
            fontSize={10}
            fill="#6b7280"
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
          >
            {formatCPU(v)}
          </text>
        ))}
        {yTicks.map((v, i) => (
          <text
            key={`yt${i}`}
            x={PADL - 6}
            y={H - PADB - (i / 2) * plotH + 4}
            fontSize={10}
            fill="#6b7280"
            textAnchor="end"
          >
            {formatMemory(v)}
          </text>
        ))}

        {/* Axis titles */}
        <text x={W / 2} y={H - 4} fontSize={10} fill="#9ca3af" textAnchor="middle">CPU</text>
        <text x={10} y={PADT - 2} fontSize={10} fill="#9ca3af">Memory</text>

        {pods.map(p => {
          const fill = fillFor(p);
          const reqX = xScale(p.cpuRequest);
          const reqY = yScale(p.memoryRequest);
          const useX = xScale(p.cpuUsage);
          const useY = yScale(p.memoryUsage);
          const hasUsage = metricsAvailable && (p.cpuUsage > 0 || p.memoryUsage > 0);
          const isOverprov = hasUsage && (
            (p.cpuRequest > 0 && p.cpuUsage / p.cpuRequest < 0.25) ||
            (p.memoryRequest > 0 && p.memoryUsage / p.memoryRequest < 0.25)
          );
          return (
            <g key={`${p.namespace}/${p.name}`}>
              {hasUsage && (
                <line
                  x1={reqX} y1={reqY} x2={useX} y2={useY}
                  stroke={fill} strokeWidth={1.5} opacity={0.55}
                />
              )}
              <circle cx={reqX} cy={reqY} r={4.5} fill={fill} opacity={0.9} />
              {hasUsage && (
                <circle cx={useX} cy={useY} r={3.5} fill="white" stroke={fill} strokeWidth={1.5} />
              )}
              {isOverprov && (
                <circle cx={reqX} cy={reqY} r={8} fill="none" stroke={fill} strokeWidth={1} strokeDasharray="2 2" />
              )}
              <title>
                {p.namespace}/{p.name}{'\n'}
                request: {formatCPU(p.cpuRequest)} CPU · {formatMemory(p.memoryRequest)}
                {hasUsage && `\nusage:   ${formatCPU(p.cpuUsage)} CPU · ${formatMemory(p.memoryUsage)}`}
                {isOverprov && '\n⚠ overprovisioned'}
              </title>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" /> request
        </span>
        {metricsAvailable && (
          <>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-white border border-gray-500 inline-block" /> usage
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3.5 h-3.5 rounded-full border border-gray-500" style={{ borderStyle: 'dashed' }} />
              overprovisioned (&lt;25% used)
            </span>
          </>
        )}
      </div>
    </div>
  );
}
