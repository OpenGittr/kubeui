import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { SecretInfo } from '../services/api';
import { RefreshCw, FileCode, Trash2, X, ChevronRight, Info, Lock, LockOpen, Pencil, Plus, Save, XCircle } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MetadataTabs } from '../components/MetadataTabs';
import { usePermissions } from '../hooks/usePermissions';
import { useSelectedResource } from '../hooks/useSelectedResource';
import { useTableSort, ageSeconds } from '../hooks/useTableSort';
import { SortableTh } from '../components/SortableTh';

const SECRET_SORTERS = {
  name: (s: SecretInfo) => s.name,
  namespace: (s: SecretInfo) => s.namespace,
  type: (s: SecretInfo) => s.type,
  keys: (s: SecretInfo) => s.keys.length,
  age: (s: SecretInfo) => -ageSeconds(s.age),
};

const SECRET_CHECKS = [
  { verb: 'patch', group: '', resource: 'secrets' },
  { verb: 'delete', group: '', resource: 'secrets' },
];

interface SecretsProps {
  namespace?: string;
  isConnected?: boolean;
}

function SecretTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    'Opaque': 'bg-gray-100 text-gray-800',
    'kubernetes.io/service-account-token': 'bg-blue-100 text-blue-800',
    'kubernetes.io/dockerconfigjson': 'bg-purple-100 text-purple-800',
    'kubernetes.io/dockercfg': 'bg-purple-100 text-purple-800',
    'kubernetes.io/tls': 'bg-green-100 text-green-800',
    'kubernetes.io/ssh-auth': 'bg-yellow-100 text-yellow-800',
    'kubernetes.io/basic-auth': 'bg-orange-100 text-orange-800',
    'bootstrap.kubernetes.io/token': 'bg-red-100 text-red-800',
  };

  // Get short name for display
  const shortName = type.replace('kubernetes.io/', '');

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-800'}`}>
      {shortName}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EditableSecretData({
  namespace,
  name,
  data,
  deletableKey,
  setDeletableKey,
}: {
  namespace: string;
  name: string;
  data: Record<string, string>;
  deletableKey: string | null;
  setDeletableKey: (k: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { can } = usePermissions(namespace, SECRET_CHECKS);
  const canPatch = can('patch', '', 'secrets');
  const patchTitle = canPatch ? undefined : 'Requires patch on secrets';
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [addingKey, setAddingKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const keys = Object.keys(data).sort();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['secret-details', namespace, name] });
    queryClient.invalidateQueries({ queryKey: ['secrets'] });
  };

  const upsertMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.secrets.upsertKey(namespace, name, key, value),
    onSuccess: (_, { key }) => {
      addToast(`Saved key "${key}"`, 'success');
      setEditingKey(null);
      setAddingKey(false);
      setNewKey('');
      setNewValue('');
      invalidate();
    },
    onError: (err: Error) => addToast(`Save failed: ${err.message}`, 'error'),
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (key: string) => api.secrets.deleteKey(namespace, name, key),
    onSuccess: (_, key) => {
      addToast(`Removed key "${key}"`, 'success');
      setDeletableKey(null);
      invalidate();
    },
    onError: (err: Error) => {
      addToast(`Delete failed: ${err.message}`, 'error');
      setDeletableKey(null);
    },
  });

  const toggleLock = (key: string) => {
    setUnlocked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const startEdit = (key: string) => {
    setEditingKey(key);
    setDraft(data[key] ?? '');
    setUnlocked(prev => new Set(prev).add(key));
  };

  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="text-xs font-medium text-gray-600">Data</div>
        {!addingKey && (
          <button
            onClick={() => setAddingKey(true)}
            disabled={!canPatch}
            title={patchTitle}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" />
            Add key
          </button>
        )}
      </div>

      {addingKey && (
        <div className="p-3 bg-blue-50/40 border-b border-blue-100 space-y-2">
          <input
            autoFocus
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="key (e.g. GITHUB_APP_ID)"
            className="w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <textarea
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            placeholder="plaintext value (will be base64-encoded server-side)"
            rows={4}
            className="w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setAddingKey(false); setNewKey(''); setNewValue(''); }}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
            >
              <XCircle className="w-3 h-3" />
              Cancel
            </button>
            <button
              disabled={!newKey || upsertMutation.isPending}
              onClick={() => upsertMutation.mutate({ key: newKey, value: newValue })}
              className="px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded flex items-center gap-1 disabled:opacity-50"
            >
              <Save className="w-3 h-3" />
              {upsertMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 && !addingKey ? (
        <div className="px-3 py-4 text-xs text-gray-500 text-center">No data keys</div>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {keys.map((key, idx) => {
              const isUnlocked = unlocked.has(key);
              const isEditing = editingKey === key;
              return (
                <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 font-mono font-medium text-gray-800 align-top whitespace-nowrap" style={{ maxWidth: '40%' }}>
                    {key}
                  </td>
                  <td className="py-2 text-gray-300 align-top text-center w-4">|</td>
                  <td className="px-3 py-2 font-mono text-gray-600 break-all align-top">
                    <div className="flex items-start gap-1.5">
                      <button
                        onClick={() => toggleLock(key)}
                        className="p-0.5 hover:bg-yellow-100 rounded flex-shrink-0 mt-0.5"
                        title={isUnlocked ? 'Hide value' : 'Show value'}
                      >
                        {isUnlocked ? <LockOpen className="w-3 h-3 text-yellow-600" /> : <Lock className="w-3 h-3 text-yellow-600" />}
                      </button>
                      {isEditing ? (
                        <div className="flex-1 space-y-2">
                          <textarea
                            autoFocus
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            rows={Math.min(10, Math.max(3, draft.split('\n').length))}
                            className="w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setEditingKey(null); setDraft(''); }}
                              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" />
                              Cancel
                            </button>
                            <button
                              disabled={upsertMutation.isPending}
                              onClick={() => upsertMutation.mutate({ key, value: draft })}
                              className="px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded flex items-center gap-1 disabled:opacity-50"
                            >
                              <Save className="w-3 h-3" />
                              {upsertMutation.isPending ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="flex-1">
                          {isUnlocked
                            ? (data[key] || <span className="text-gray-400">-</span>)
                            : <span className="text-gray-400">••••••••</span>}
                        </span>
                      )}
                      {!isEditing && canPatch && (
                        <div className="flex-shrink-0 flex gap-1">
                          <button
                            onClick={() => startEdit(key)}
                            className="p-0.5 hover:bg-blue-100 rounded"
                            title="Edit value"
                          >
                            <Pencil className="w-3 h-3 text-blue-600" />
                          </button>
                          <button
                            onClick={() => setDeletableKey(key)}
                            className="p-0.5 hover:bg-red-100 rounded"
                            title="Remove key"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        isOpen={!!deletableKey}
        title="Remove Key"
        message={`Remove key "${deletableKey}" from secret "${name}"?`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={deleteKeyMutation.isPending}
        onConfirm={() => deletableKey && deleteKeyMutation.mutate(deletableKey)}
        onCancel={() => setDeletableKey(null)}
      />
    </div>
  );
}

function SecretDetailsPanel({
  secret,
  onClose,
  onViewYaml,
}: {
  secret: SecretInfo;
  onClose: () => void;
  onViewYaml: () => void;
}) {
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const { data: secretDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['secret-details', secret.namespace, secret.name],
    queryFn: () => api.secrets.get(secret.namespace, secret.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['secret-events', secret.namespace, secret.name],
    queryFn: () => api.secrets.events(secret.namespace, secret.name),
  });

  const details = secretDetails || secret;
  const totalSize = details.keySizes
    ? Object.values(details.keySizes).reduce((sum, size) => sum + size, 0)
    : 0;

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Lock className="w-5 h-5 text-gray-500" />
            {secret.name}
          </h2>
          <p className="text-sm text-gray-500">{secret.namespace}</p>
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
        {/* Status Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Type</div>
            <div className="font-medium mt-1"><SecretTypeBadge type={secret.type} /></div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{secret.age}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Data Keys</div>
            <div className="font-medium">{secret.keys.length}</div>
          </div>
          {totalSize > 0 && (
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-xs text-gray-500 uppercase">Total Size</div>
              <div className="font-medium">{formatBytes(totalSize)}</div>
            </div>
          )}
        </div>

        {/* Editable data */}
        {detailsLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : (
          <EditableSecretData
            namespace={secret.namespace}
            name={secret.name}
            data={details.data || {}}
            deletableKey={keyToDelete}
            setDeletableKey={setKeyToDelete}
          />
        )}

        {/* Labels & Annotations */}
        {!detailsLoading && (
          <MetadataTabs
            tabs={[
              { key: 'labels', label: 'Labels', data: details.labels },
              { key: 'annotations', label: 'Annotations', data: details.annotations },
            ]}
          />
        )}

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

export function Secrets({ namespace, isConnected = true }: SecretsProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [yamlSecret, setYamlSecret] = useState<SecretInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SecretInfo | null>(null);
  const [selectedSecret, setSelectedSecret] = useState<SecretInfo | null>(null);
  const { can } = usePermissions(namespace, SECRET_CHECKS);
  const canDelete = can('delete', '', 'secrets');
  const deleteTitle = canDelete ? undefined : 'Requires delete on secrets';

  const { data: secrets, isLoading, error } = useQuery({
    queryKey: ['secrets', namespace],
    queryFn: () => api.secrets.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });
  useSelectedResource(secrets, selectedSecret, setSelectedSecret);
  const sort = useTableSort(secrets, SECRET_SORTERS);

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.secrets.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      addToast(`Deleted secret ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading secrets...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Secrets</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['secrets'] })}
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
              <SortableTh sortKey="type" label="Type" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="keys" label="Keys" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="age" label="Age" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sort.sorted.map((secret) => (
              <tr
                key={`${secret.namespace}/${secret.name}`}
                className={`hover:bg-gray-50 cursor-pointer ${selectedSecret?.name === secret.name && selectedSecret?.namespace === secret.namespace ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedSecret(secret)}
              >
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" />
                    {secret.name}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{secret.namespace}</td>
                <td className="px-4 py-3 text-sm">
                  <SecretTypeBadge type={secret.type} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {secret.keys.length} key{secret.keys.length !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{secret.age}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      {
                        label: 'Details',
                        icon: <Info className="w-4 h-4" />,
                        onClick: () => setSelectedSecret(secret),
                      },
                      {
                        label: 'View YAML',
                        icon: <FileCode className="w-4 h-4" />,
                        onClick: () => setYamlSecret(secret),
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 className="w-4 h-4" />,
                        variant: 'danger',
                        disabled: !canDelete,
                        title: deleteTitle,
                        onClick: () => setDeleteTarget(secret),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!secrets || secrets.length === 0) && (
          <div className="text-center py-8 text-gray-500">No secrets found</div>
        )}
      </div>

      {yamlSecret && (
        <YamlModal
          resourceType="secrets"
          namespace={yamlSecret.namespace}
          name={yamlSecret.name}
          onClose={() => setYamlSecret(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Secret"
        message={`Are you sure you want to delete secret "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(
              { ns: deleteTarget.namespace, name: deleteTarget.name },
              { onSettled: () => setDeleteTarget(null) }
            );
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {selectedSecret && (
        <SecretDetailsPanel
          secret={selectedSecret}
          onClose={() => setSelectedSecret(null)}
          onViewYaml={() => {
            setYamlSecret(selectedSecret);
          }}
        />
      )}
    </div>
  );
}
