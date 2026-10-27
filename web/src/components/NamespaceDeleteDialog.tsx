import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Database, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { NamespaceContentGroup } from '../services/api';

interface NamespaceDeleteDialogProps {
  namespace: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

// Names shown per kind before collapsing to "+N more"; keeps the dialog
// scannable for namespaces with hundreds of pods or secrets.
const NAME_PREVIEW = 8;

function ContentGroup({ group }: { group: NamespaceContentGroup }) {
  const [open, setOpen] = useState(false);
  const names = group.names ?? [];
  const shown = open ? names : names.slice(0, NAME_PREVIEW);
  const isData = group.kind === 'PersistentVolumeClaim';

  if (group.error) {
    return (
      <div className="py-2 text-sm">
        <span className="font-medium text-gray-900">{group.kind}</span>
        <span className="ml-2 text-amber-700">couldn't list — may contain resources</span>
      </div>
    );
  }

  return (
    <div className="py-2 text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 w-full text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        {isData && <Database className="w-4 h-4 text-red-600" />}
        <span className={`font-medium ${isData ? 'text-red-700' : 'text-gray-900'}`}>{group.kind}</span>
        <span className="ml-auto px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-mono">{group.count}</span>
      </button>
      <div className="mt-1 ml-6 flex flex-wrap gap-1">
        {shown.map((n) => (
          <span key={n} className="px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-700 break-all">
            {n}
          </span>
        ))}
        {!open && names.length > NAME_PREVIEW && (
          <button type="button" onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:underline">
            +{names.length - NAME_PREVIEW} more
          </button>
        )}
      </div>
    </div>
  );
}

export function NamespaceDeleteDialog({ namespace, onConfirm, onCancel, isLoading = false }: NamespaceDeleteDialogProps) {
  const [typed, setTyped] = useState('');

  const { data, isLoading: contentsLoading, error } = useQuery({
    queryKey: ['namespace-contents', namespace],
    queryFn: () => api.namespaces.contents(namespace),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, onCancel]);

  const groups = data?.groups ?? [];
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  const pvcs = groups.find((g) => g.kind === 'PersistentVolumeClaim')?.count ?? 0;
  const incomplete = groups.some((g) => g.error);
  const isProtected = data?.protected ?? false;
  const terminating = data?.status === 'Terminating';
  // Confirmation is gated on the inventory having loaded, so nobody types the
  // name before seeing what they're about to delete.
  const canConfirm = !!data && !isProtected && !terminating && typed === namespace && !isLoading;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-full bg-red-100 text-red-600 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 truncate">Delete namespace {namespace}</h3>
          </div>
          <button onClick={onCancel} disabled={isLoading} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-3">
          {contentsLoading && <p className="text-sm text-gray-500">Checking what's in this namespace...</p>}
          {error && <p className="text-sm text-red-600">Couldn't load namespace contents: {(error as Error).message}</p>}

          {data && isProtected && (
            <p className="text-sm text-gray-700">
              <span className="font-mono">{namespace}</span> is a system namespace and can't be deleted from kubeui.
            </p>
          )}
          {data && terminating && (
            <p className="text-sm text-gray-700">This namespace is already being deleted.</p>
          )}

          {data && !isProtected && !terminating && (
            <>
              <p className="text-sm text-gray-600">
                {total > 0
                  ? <>Deleting this namespace permanently deletes <strong>{total}</strong> resource{total === 1 ? '' : 's'} inside it:</>
                  : 'No resources found in this namespace.'}
              </p>

              {pvcs > 0 && (
                <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 text-red-800 p-2 rounded">
                  <Database className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {pvcs} PersistentVolumeClaim{pvcs === 1 ? '' : 's'} will be deleted. Volumes with a Delete reclaim policy lose their data.
                  </span>
                </div>
              )}

              {groups.length > 0 && (
                <div className="divide-y divide-gray-100 border rounded px-3">
                  {groups.map((g) => <ContentGroup key={g.kind} group={g} />)}
                </div>
              )}

              <p className="text-xs text-gray-500">
                {incomplete && 'Some kinds couldn\'t be listed with your permissions. '}
                Custom resources (CRDs) are not shown but will also be deleted.
              </p>

              <label className="block text-sm text-gray-700">
                Type <span className="font-mono font-semibold select-all">{namespace}</span> to confirm
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) onConfirm(); }}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Deleting...' : 'Delete namespace'}
          </button>
        </div>
      </div>
    </div>
  );
}
