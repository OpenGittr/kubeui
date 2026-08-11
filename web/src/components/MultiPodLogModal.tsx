import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Pause, Play, Trash2, Search, Maximize2, Minimize2, ArrowDown, Braces, Hash } from 'lucide-react';

export interface PodTarget {
  namespace: string;
  name: string;
  container?: string;
}

interface Props {
  title: string;
  pods: PodTarget[];
  onClose: () => void;
  // Extra controls rendered in the header before the search box. Used by
  // single-pod views to inject a container selector.
  headerExtra?: React.ReactNode;
}

type ConnState = 'connecting' | 'open' | 'closed' | 'error';

interface LogLine {
  podKey: string;
  text: string;
  // Sequence number (per-modal monotonic) used as a stable React key. We can't
  // rely on (podKey, text) since duplicate lines are common.
  seq: number;
}

// Solid 500-shade palette — matches what we use in the bin-packing chart so
// per-pod colours feel consistent across the app. Excluded from dark-mode
// remapping intentionally, so the colour stays the same in both themes.
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

function colorFor(podKey: string): string {
  return POD_FILLS[hashString(podKey) % POD_FILLS.length];
}

/**
 * Longest common prefix across the supplied pod names, snapped back to the
 * last `-` boundary so we don't slice through a meaningful segment. With ~all
 * Kubernetes pod naming conventions (`{deploy}-{rs-hash}-{id}`) this strips
 * the redundant prefix that repeats on every replica, leaving the unique pod
 * id as the visible label.
 */
function commonPrefix(podNames: string[]): string {
  if (podNames.length < 2) return '';
  let p = podNames[0];
  for (let i = 1; i < podNames.length; i++) {
    while (!podNames[i].startsWith(p)) {
      p = p.slice(0, -1);
      if (!p) return '';
    }
  }
  // Anchor on a hyphen — `offer-service-d7cc8998b-9gq6g` → strip up to last
  // `-` so we don't show `offer-service-d7cc8998b` minus the trailing `-`.
  const idx = p.lastIndexOf('-');
  return idx > 0 ? p.slice(0, idx + 1) : '';
}

const MAX_LINES = 5000; // ring-buffer cap so the DOM doesn't melt

/**
 * Single-icon legend chip: filled = open, ring = closed, ring + dot = error,
 * pulsing ring = connecting. Replaces the previous two-icon (status dot +
 * colour square) chip — same information in a third of the visual real
 * estate.
 */
function PodChip({ podName, color, status }: { podName: string; color: string; status: ConnState }) {
  let inner: React.ReactNode = null;
  switch (status) {
    case 'open':
      inner = <span className="block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />;
      break;
    case 'closed':
      inner = <span className="block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: color }} />;
      break;
    case 'connecting':
      inner = (
        <span className="relative inline-flex w-2.5 h-2.5">
          <span className="absolute inset-0 rounded-full opacity-60 animate-ping" style={{ backgroundColor: color }} />
          <span className="relative w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        </span>
      );
      break;
    case 'error':
      inner = (
        <span className="relative inline-flex w-2.5 h-2.5">
          <span className="absolute inset-0 rounded-full border-2 border-red-500" />
          <span className="absolute inset-[3px] rounded-full" style={{ backgroundColor: color }} />
        </span>
      );
      break;
  }
  return (
    <>
      {inner}
      <span className="truncate max-w-[16rem]">{podName}</span>
    </>
  );
}

/**
 * Recursively flatten a nested object into [key, primitive-or-array-or-string]
 * tuples using dot notation, e.g. `{req: {method: 'GET'}}` →
 * `[["req.method", "GET"]]`. Arrays are stringified (rare in structured logs;
 * the "user.tags" pattern is unusual). Capped at `maxDepth` so deeply nested
 * payloads don't blow up the row width.
 */
function flatten(obj: Record<string, unknown>, prefix = '', maxDepth = 3): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && maxDepth > 0) {
      out.push(...flatten(v as Record<string, unknown>, key, maxDepth - 1));
    } else if (Array.isArray(v)) {
      out.push([key, JSON.stringify(v)]);
    } else {
      out.push([key, v]);
    }
  }
  return out;
}

/**
 * Render the time value the log emitter put in the line, in the *user's*
 * locale + timezone, with millisecond precision. Shows `HH:mm:ss.SSS`.
 *
 * Robustness:
 *  - ISO 8601 with explicit TZ (`...Z` / `...+05:30`) — parsed as-is.
 *  - ISO 8601 *without* TZ (`2026-04-28T03:08:53.123`) — treated as UTC.
 *    JS's spec-default for naive ISO is local time, but server logs almost
 *    always emit naive-UTC; using local would shift every buffered line by
 *    the user's offset, producing the "old logs in wrong zone" bug.
 *  - Numeric epoch — auto-detected by magnitude:
 *      n > 1e15 → nanoseconds (Go's time.Now().UnixNano())
 *      n > 1e12 → milliseconds
 *      otherwise → seconds
 *  - Anything else: returned as raw so we never silently lose info.
 */
function formatTime(s: string | undefined): { display: string; full: string } | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;

  let ms: number | null = null;
  // Numeric epoch.
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) {
      if (n > 1e15) ms = n / 1e6;       // nanos → ms
      else if (n > 1e12) ms = n;        // already ms
      else ms = n * 1000;               // seconds → ms
    }
  }
  if (ms === null) {
    let parsable = trimmed;
    const looksLikeISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(trimmed);
    const hasTZ = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
    if (looksLikeISO && !hasTZ) parsable = trimmed + 'Z';
    const parsed = Date.parse(parsable);
    if (Number.isFinite(parsed)) ms = parsed;
  }
  if (ms === null) return { display: trimmed, full: trimmed };

  const d = new Date(ms);
  const display = d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
  return { display, full: d.toLocaleString() };
}

interface ParsedLog {
  level?: string;
  msg?: string;
  time?: { display: string; full: string };
  rest: Array<[string, unknown]>;
}

/**
 * Detect a JSON object log line and extract the typical (level, msg, time,
 * remaining-fields) shape. Anything that doesn't parse to an object — array
 * literals, primitives, multi-line — is left as raw text.
 */
function parseStructured(text: string): ParsedLog | null {
  const t = text.trimStart();
  if (!(t.startsWith('{') && t.endsWith('}'))) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(t);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const pickKey = (...keys: string[]): { key: string; value: unknown } | null => {
    for (const k of keys) {
      if (k in o) return { key: k, value: o[k] };
    }
    return null;
  };
  const levelEntry = pickKey('level', 'lvl', 'severity');
  const msgEntry = pickKey('msg', 'message', 'log');
  const timeEntry = pickKey('time', 'timestamp', 'ts', '@timestamp');
  const skip = new Set(
    [levelEntry?.key, msgEntry?.key, timeEntry?.key].filter(Boolean) as string[],
  );
  // Build a "remaining fields" object (top-level minus skip), then flatten
  // recursively so nested payloads like `{req: {method, path}}` render as
  // `req.method=GET req.path=/v1` instead of one giant JSON blob.
  const restRoot: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (skip.has(k)) continue;
    restRoot[k] = v;
  }
  const stringify = (v: unknown): string =>
    v == null ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return {
    level: levelEntry ? stringify(levelEntry.value) : undefined,
    msg: msgEntry ? stringify(msgEntry.value) : undefined,
    time: timeEntry ? formatTime(stringify(timeEntry.value)) ?? undefined : undefined,
    rest: flatten(restRoot),
  };
}

function levelClass(level: string | undefined): string {
  if (!level) return 'text-gray-400';
  const l = level.toLowerCase();
  if (l.includes('err') || l === 'fatal' || l === 'panic') return 'text-red-400';
  if (l.includes('warn')) return 'text-amber-400';
  if (l.includes('info') || l === 'log') return 'text-emerald-400';
  if (l.includes('debug') || l.includes('trace')) return 'text-gray-500';
  return 'text-gray-300';
}

function StructuredRow({ podColor, podName, fullName, parsed }: { podColor: string; podName: string; fullName: string; parsed: ParsedLog }) {
  return (
    <div className="flex gap-2 whitespace-pre-wrap break-all">
      <span
        className="flex-shrink-0 select-none truncate"
        style={{ color: podColor, width: '7rem' }}
        title={fullName}
      >
        {podName}
      </span>
      <span className="flex-1 min-w-0">
        {parsed.time && (
          <span className="text-gray-500 mr-2" title={parsed.time.full}>
            {parsed.time.display}
          </span>
        )}
        {parsed.level && (
          <span className={`mr-2 font-semibold uppercase ${levelClass(parsed.level)}`}>
            {parsed.level}
          </span>
        )}
        {parsed.msg && <span className="text-gray-100 font-medium mr-2">{parsed.msg}</span>}
        {parsed.rest.map(([k, v], i) => (
          <span key={i} className="text-gray-500 mr-2">
            <span className="text-gray-400">{k}</span>
            <span className="text-gray-600">=</span>
            <span className="text-gray-300">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

function PlainRow({ podColor, podName, fullName, text }: { podColor: string; podName: string; fullName: string; text: string }) {
  return (
    <div className="flex gap-2 whitespace-pre-wrap break-all">
      <span
        className="flex-shrink-0 select-none truncate"
        style={{ color: podColor, width: '7rem' }}
        title={fullName}
      >
        {podName}
      </span>
      <span className="text-gray-100">{text}</span>
    </div>
  );
}

/**
 * Multi-pod log tail. Opens one WebSocket per pod against
 * /api/pods/{ns}/{name}/logs/stream and merges incoming lines into a single
 * scroll. Lines retain a per-pod colour tag so you can see at a glance which
 * replica is which.
 */
export function MultiPodLogModal({ title, pods, onClose, headerExtra }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [structured, setStructured] = useState(true);
  const [status, setStatus] = useState<Record<string, ConnState>>({});
  const [following, setFollowing] = useState(true); // true => auto-scroll new lines into view
  const seqRef = useRef(0);
  const bufferRef = useRef<LogLine[]>([]); // pending lines while paused
  const scrollRef = useRef<HTMLDivElement>(null);
  // We mutate this from a wheel/scroll handler to know if the user is
  // intentionally scrolled away from the bottom — different from `following`
  // (which is the user's intent flag). When ignoreScrollRef is true the next
  // scroll event was triggered by us programmatically and shouldn't break
  // follow mode.
  const ignoreScrollRef = useRef(false);

  // Open one WebSocket per pod. Re-runs only when the pod set changes.
  useEffect(() => {
    const sockets: WebSocket[] = [];
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

    for (const p of pods) {
      const podKey = `${p.namespace}/${p.name}`;
      setStatus(s => ({ ...s, [podKey]: 'connecting' }));

      const params = new URLSearchParams({ tail: '200' });
      if (p.container) params.set('container', p.container);
      const url = `${protocol}://${window.location.host}/api/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}/logs/stream?${params}`;

      const ws = new WebSocket(url);
      sockets.push(ws);

      ws.onopen = () => setStatus(s => ({ ...s, [podKey]: 'open' }));
      ws.onerror = () => setStatus(s => ({ ...s, [podKey]: 'error' }));
      ws.onclose = () => setStatus(s => (s[podKey] === 'error' ? s : { ...s, [podKey]: 'closed' }));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type: 'line' | 'error' | 'end'; data?: string };
          if (msg.type === 'line' && msg.data != null) {
            seqRef.current++;
            const line: LogLine = { podKey, text: msg.data, seq: seqRef.current };
            // While paused, buffer lines; once resumed, flush in order.
            if (paused) {
              bufferRef.current.push(line);
            } else {
              setLines(prev => {
                const next = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev;
                return [...next, line];
              });
            }
          } else if (msg.type === 'error' && msg.data) {
            seqRef.current++;
            const line: LogLine = { podKey, text: `[error] ${msg.data}`, seq: seqRef.current };
            setLines(prev => [...prev, line]);
          }
        } catch {
          // Malformed message — ignore.
        }
      };
    }

    return () => {
      for (const ws of sockets) {
        try { ws.close(); } catch { /* ignore */ }
      }
    };
    // We intentionally don't include `paused` in the dep list — toggling pause
    // shouldn't reopen sockets. The latest `paused` value is read by closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pods.map(p => `${p.namespace}/${p.name}/${p.container ?? ''}`).join('|')]);

  // When un-pausing, drain the pending buffer in order.
  useEffect(() => {
    if (paused) return;
    if (bufferRef.current.length === 0) return;
    const drained = bufferRef.current;
    bufferRef.current = [];
    setLines(prev => {
      const merged = [...prev, ...drained];
      return merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged;
    });
  }, [paused]);

  // Auto-scroll to bottom when new lines arrive, IF following. Mark the next
  // scroll event as "ours" so the scroll handler doesn't toggle follow off.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !following) return;
    ignoreScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [lines.length, following]);

  // Stop following the moment the user scrolls away from the bottom; resume
  // automatically once they scroll back to the bottom themselves (no separate
  // button click required, but the floating "Jump to live" makes it explicit).
  const handleScroll = () => {
    if (ignoreScrollRef.current) {
      ignoreScrollRef.current = false;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
    if (atBottom) {
      if (!following) setFollowing(true);
    } else {
      if (following) setFollowing(false);
    }
  };

  const jumpToLive = () => {
    const el = scrollRef.current;
    if (!el) return;
    ignoreScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    setFollowing(true);
  };

  const togglePodVisible = (podKey: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(podKey)) next.delete(podKey); else next.add(podKey);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return lines.filter(l => !hidden.has(l.podKey) && (f === '' || l.text.toLowerCase().includes(f)));
  }, [lines, filter, hidden]);

  const podKeys = useMemo(() => Array.from(new Set(pods.map(p => `${p.namespace}/${p.name}`))), [pods]);

  // Strip the deployment-name + replicaset-hash prefix that all replicas
  // share, leaving only the unique pod id visible. The full name still shows
  // on hover (title attr), and the prefix is shown once in the header so the
  // context isn't lost.
  const podPrefix = useMemo(() => commonPrefix(pods.map(p => p.name)), [pods]);
  const shortPodName = (fullName: string): string =>
    podPrefix && fullName.startsWith(podPrefix) ? fullName.slice(podPrefix.length) : fullName;

  return (
    <div className={`fixed ${fullscreen ? 'inset-0' : 'inset-4'} bg-black/60 z-50 flex items-center justify-center`} onClick={onClose}>
      <div
        className={`bg-[#1e1e1e] text-gray-100 rounded-lg shadow-2xl flex flex-col ${fullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[85vh]'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800">
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-gray-400">· {pods.length} pod{pods.length !== 1 ? 's' : ''}</div>
          {podPrefix && (
            <div className="text-[11px] text-gray-500 font-mono truncate" title={`Common prefix stripped from pod labels: ${podPrefix}`}>
              · {podPrefix}…
            </div>
          )}
          <div className="flex-1" />
          {headerExtra}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="filter..."
              className="pl-7 pr-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-100 placeholder:text-gray-500"
            />
          </div>
          <button
            onClick={() => setStructured(s => !s)}
            className={`p-1.5 rounded ${structured ? 'text-emerald-400 bg-gray-800' : 'text-gray-300 hover:bg-gray-800'}`}
            title={structured ? 'Showing JSON logs as fields — click to switch to raw' : 'Showing raw — click to parse JSON lines'}
          >
            {structured ? <Braces className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setPaused(p => !p)}
            className="p-1.5 text-gray-300 hover:bg-gray-800 rounded"
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={() => { setLines([]); bufferRef.current = []; }}
            className="p-1.5 text-gray-300 hover:bg-gray-800 rounded"
            title="Clear"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setFullscreen(f => !f)}
            className="p-1.5 text-gray-300 hover:bg-gray-800 rounded"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-300 hover:bg-gray-800 rounded" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pod legend / toggles — single icon chip per pod */}
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-gray-800 text-[11px]">
          {podKeys.map(podKey => {
            const isHidden = hidden.has(podKey);
            const fullName = podKey.split('/')[1];
            const display = shortPodName(fullName);
            const s = status[podKey] ?? 'connecting';
            return (
              <button
                key={podKey}
                onClick={() => togglePodVisible(podKey)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-mono ${isHidden ? 'opacity-40' : ''} hover:bg-gray-800`}
                title={`${podKey} · ${s}${isHidden ? ' (hidden)' : ''}`}
              >
                <PodChip podName={display} color={colorFor(podKey)} status={s} />
              </button>
            );
          })}
        </div>

        {/* Log stream */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="absolute inset-0 overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.4] bg-[#1e1e1e]"
          >
            {filtered.length === 0 ? (
              <div className="text-gray-500 italic">{lines.length === 0 ? 'Waiting for log lines...' : 'No lines match the current filter.'}</div>
            ) : (
              filtered.map(line => {
                const podColor = colorFor(line.podKey);
                const fullName = line.podKey.split('/')[1];
                const podName = shortPodName(fullName);
                const parsed = structured ? parseStructured(line.text) : null;
                return parsed ? (
                  <StructuredRow key={line.seq} podColor={podColor} podName={podName} fullName={fullName} parsed={parsed} />
                ) : (
                  <PlainRow key={line.seq} podColor={podColor} podName={podName} fullName={fullName} text={line.text} />
                );
              })
            )}
          </div>

          {/* Floating "Jump to live" — appears whenever follow mode is off
              (user has scrolled up). One click resumes tailing. */}
          {!following && filtered.length > 0 && (
            <button
              onClick={jumpToLive}
              className="absolute bottom-3 right-4 flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              Jump to live
            </button>
          )}
        </div>

        {/* Footer status */}
        <div className="px-3 py-1.5 border-t border-gray-800 text-[10px] text-gray-400 flex items-center justify-between">
          <span>{filtered.length} / {lines.length} lines{lines.length >= MAX_LINES ? ` (capped at ${MAX_LINES})` : ''}</span>
          <span>{paused ? 'paused' : 'live'} · {following ? 'following' : 'scrolled (click Jump to live to resume)'}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Convenience wrapper that resolves a pod list (typically from a workload's
 * Get response) before mounting MultiPodLogModal. Shows a tiny placeholder
 * while resolving, an error state if the fetch fails, and an empty-state if
 * the workload has no running pods.
 */
export function TailLogsModal({
  title,
  queryKey,
  fetchPods,
  onClose,
}: {
  title: string;
  queryKey: readonly unknown[];
  fetchPods: () => Promise<PodTarget[]>;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({ queryKey: [...queryKey], queryFn: fetchPods });
  if (isLoading || (!data && !error)) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <div className="bg-[#1e1e1e] text-gray-100 rounded-lg px-6 py-4 text-sm">Resolving pods...</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-[#1e1e1e] text-gray-100 rounded-lg px-6 py-4 text-sm" onClick={e => e.stopPropagation()}>
          Failed to load pods. <button onClick={onClose} className="ml-2 underline">Close</button>
        </div>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-[#1e1e1e] text-gray-100 rounded-lg px-6 py-4 text-sm" onClick={e => e.stopPropagation()}>
          No running pods to tail. <button onClick={onClose} className="ml-2 underline">Close</button>
        </div>
      </div>
    );
  }
  return <MultiPodLogModal title={title} pods={data} onClose={onClose} />;
}
