import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Save } from 'lucide-react';
import { useToast } from './Toast';

export type SetImageKind = 'deployment' | 'statefulset' | 'daemonset';

interface Container {
  name: string;
  image: string;
}

interface SetImageModalProps {
  kind: SetImageKind;
  namespace: string;
  name: string;
  onClose: () => void;
  onSaved: () => void;
  fetchContainers: () => Promise<Container[]>;
  setImage: (namespace: string, name: string, container: string, image: string) => Promise<{ message: string }>;
  invalidateKeys: string[][];
}

export function SetImageModal({
  kind,
  namespace,
  name,
  onClose,
  onSaved,
  fetchContainers,
  setImage,
  invalidateKeys,
}: SetImageModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const { data: containers, isLoading, error } = useQuery({
    queryKey: [`${kind}-image-containers`, namespace, name],
    queryFn: fetchContainers,
  });

  const [container, setContainer] = useState('');
  const [image, setImageState] = useState('');

  useEffect(() => {
    if (containers && containers.length > 0 && !container) {
      setContainer(containers[0].name);
      setImageState(containers[0].image);
    }
  }, [containers, container]);

  const current = containers?.find(c => c.name === container);

  const mutation = useMutation({
    mutationFn: () => setImage(namespace, name, container, image),
    onSuccess: () => {
      addToast(`Image updated on ${kind} ${name}`, 'success');
      invalidateKeys.forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      onSaved();
    },
    onError: (err: Error) => addToast(`Update failed: ${err.message}`, 'error'),
  });

  const unchanged = !current || image === current.image;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Set image — {name}</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {isLoading && <p className="text-sm text-gray-500">Loading containers...</p>}
          {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
          {containers && containers.length === 0 && (
            <p className="text-sm text-gray-500">No containers found.</p>
          )}
          {containers && containers.length > 0 && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Container</label>
                <select
                  value={container}
                  onChange={e => {
                    const next = e.target.value;
                    setContainer(next);
                    setImageState(containers.find(c => c.name === next)?.image || '');
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {containers.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Image</label>
                <input
                  value={image}
                  onChange={e => setImageState(e.target.value)}
                  placeholder="registry/repo:tag"
                  className="w-full px-2 py-1.5 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                {current && (
                  <div className="text-xs text-gray-500 mt-1 font-mono break-all">
                    current: {current.image}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 hover:bg-gray-100 rounded"
          >
            Cancel
          </button>
          <button
            disabled={!image || unchanged || mutation.isPending}
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
