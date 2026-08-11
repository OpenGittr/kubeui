import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { RevisionInfo } from '../services/api';
import { Check, RotateCcw } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';

interface Props {
  kind: 'deployment' | 'statefulset' | 'daemonset';
  namespace: string;
  name: string;
}

const fetcher = {
  deployment: (ns: string, n: string) => api.deployments.revisions(ns, n),
  statefulset: (ns: string, n: string) => api.workloadRevisions.statefulset(ns, n),
  daemonset: (ns: string, n: string) => api.workloadRevisions.daemonset(ns, n),
} satisfies Record<Props['kind'], (ns: string, n: string) => Promise<RevisionInfo[]>>;

async function rollback(
  kind: Props['kind'],
  namespace: string,
  name: string,
  r: RevisionInfo,
): Promise<{ status: string; toRevision: string }> {
  if (kind === 'deployment') {
    const res = await api.deployments.rollback(namespace, name, r.revision);
    return { status: res.status, toRevision: String(res.toRevision) };
  }
  if (!r.name) throw new Error('missing ControllerRevision name');
  if (kind === 'statefulset') {
    return api.workloadRevisions.rollbackStatefulSet(namespace, name, r.name);
  }
  return api.workloadRevisions.rollbackDaemonSet(namespace, name, r.name);
}

const listKey = {
  deployment: 'deployments',
  statefulset: 'statefulsets',
  daemonset: 'daemonsets',
} as const;

export function RevisionsPanel({ kind, namespace, name }: Props) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [confirmTarget, setConfirmTarget] = useState<RevisionInfo | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['revisions', kind, namespace, name],
    queryFn: () => fetcher[kind](namespace, name),
  });

  const mutation = useMutation({
    mutationFn: (r: RevisionInfo) => rollback(kind, namespace, name, r),
    onSuccess: (_res, r) => {
      addToast(`Rolled back to revision #${r.revision}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['revisions', kind, namespace, name] });
      queryClient.invalidateQueries({ queryKey: [listKey[kind]] });
    },
    onError: (err: Error) => addToast(`Rollback failed: ${err.message}`, 'error'),
    onSettled: () => setConfirmTarget(null),
  });

  return (
    <div>
      {isLoading ? (
        <div className="text-xs text-gray-500 px-3 py-2">Loading revisions...</div>
      ) : error ? (
        <div className="text-xs text-red-600 px-3 py-2">Failed to load: {(error as Error).message}</div>
      ) : !data || data.length === 0 ? (
        <div className="text-xs text-gray-400 italic px-3 py-2">No revision history</div>
      ) : (
        <div className="bg-gray-50 rounded border border-gray-200 divide-y divide-gray-100">
          {data.map((r) => (
            <div key={`${r.revision}-${r.name ?? ''}`} className="px-3 py-2 flex items-baseline gap-2">
              <span className="font-mono text-xs text-gray-500 w-12 shrink-0">#{r.revision}</span>
              {r.current && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">
                  <Check className="w-3 h-3" /> current
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-700 truncate" title={r.images.join(', ')}>
                  {r.images.length > 0 ? r.images.join(', ') : <span className="text-gray-400">(no image data)</span>}
                </div>
                {r.changeCause && <div className="text-[10px] text-gray-500 truncate">{r.changeCause}</div>}
              </div>
              <span className="text-[10px] text-gray-400 font-mono shrink-0" title={r.createdAt}>{r.age}</span>
              {!r.current && (
                <button
                  onClick={() => setConfirmTarget(r)}
                  disabled={mutation.isPending}
                  className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-100 disabled:opacity-50 shrink-0"
                  title="Rollback to this revision"
                >
                  <RotateCcw className="w-3 h-3" /> Rollback
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmTarget}
        title={`Rollback ${kind}`}
        message={confirmTarget
          ? `Roll back "${name}" to revision #${confirmTarget.revision}? Pods will be recreated with the earlier template (${confirmTarget.images.join(', ') || 'no image data'}).`
          : ''}
        confirmLabel="Rollback"
        variant="warning"
        isLoading={mutation.isPending}
        onConfirm={() => confirmTarget && mutation.mutate(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
