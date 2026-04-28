import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ConfigMapInfo } from '../services/api';
import { RefreshCw, FileCode, Trash2, X, ChevronRight, Info, Pencil, Plus, Save, XCircle } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import type { ActionMenuItem } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MetadataTabs } from '../components/MetadataTabs';
import { usePermissions } from '../hooks/usePermissions';
import { useSelectedResource } from '../hooks/useSelectedResource';
import { useTableSort, ageSeconds } from '../hooks/useTableSort';
import { SortableTh } from '../components/SortableTh';

const CM_SORTERS = {
  name: (c: ConfigMapInfo) => c.name,
  namespace: (c: ConfigMapInfo) => c.namespace,
  keys: (c: ConfigMapInfo) => c.keys.length,
  age: (c: ConfigMapInfo) => -ageSeconds(c.age),
};

const CM_CHECKS = [
  { verb: 'patch', group: '', resource: 'configmaps' },
  { verb: 'delete', group: '', resource: 'configmaps' },
];

interface ConfigMapsProps {
  namespace?: string;
  isConnected?: boolean;
}

function EditableConfigMapData({
  namespace,
  name,
  data,
}: {
  namespace: string;
  name: string;
  data: Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { can } = usePermissions(namespace, CM_CHECKS);
  const canPatch = can('patch', '', 'configmaps');
  const patchTitle = canPatch ? undefined : 'Requires patch on configmaps';
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [addingKey, setAddingKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['configmap-details', namespace, name] });
    queryClient.invalidateQueries({ queryKey: ['configmaps'] });
  };

  const upsertMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.configmaps.upsertKey(namespace, name, key, value),
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
    mutationFn: (key: string) => api.configmaps.deleteKey(namespace, name, key),
    onSuccess: (_, key) => {
      addToast(`Removed key "${key}"`, 'success');
      setKeyToDelete(null);
      invalidate();
    },
    onError: (err: Error) => {
      addToast(`Delete failed: ${err.message}`, 'error');
      setKeyToDelete(null);
    },
  });

  const keys = Object.keys(data).sort();

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
            placeholder="key name"
            className="w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <textarea
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            placeholder="value"
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
              const isEditing = editingKey === key;
              return (
                <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 font-mono font-medium text-gray-800 align-top whitespace-nowrap" style={{ maxWidth: '40%' }}>
                    {key}
                  </td>
                  <td className="py-2 text-gray-300 align-top text-center w-4">|</td>
                  <td className="px-3 py-2 font-mono text-gray-600 break-all align-top">
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          autoFocus
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          rows={Math.min(15, Math.max(3, draft.split('\n').length))}
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
                      <div className="flex items-start gap-2">
                        <pre className="flex-1 whitespace-pre-wrap break-all">{data[key] || <span className="text-gray-400">-</span>}</pre>
                        {canPatch && (
                          <div className="flex-shrink-0 flex gap-1">
                            <button
                              onClick={() => { setEditingKey(key); setDraft(data[key] ?? ''); }}
                              className="p-0.5 hover:bg-blue-100 rounded"
                              title="Edit value"
                            >
                              <Pencil className="w-3 h-3 text-blue-600" />
                            </button>
                            <button
                              onClick={() => setKeyToDelete(key)}
                              className="p-0.5 hover:bg-red-100 rounded"
                              title="Remove key"
                            >
                              <Trash2 className="w-3 h-3 text-red-600" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        isOpen={!!keyToDelete}
        title="Remove Key"
        message={`Remove key "${keyToDelete}" from configmap "${name}"?`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={deleteKeyMutation.isPending}
        onConfirm={() => keyToDelete && deleteKeyMutation.mutate(keyToDelete)}
        onCancel={() => setKeyToDelete(null)}
      />
    </div>
  );
}

function ConfigMapDetailsPanel({
  configmap,
  onClose,
  onViewYaml,
  actions,
}: {
  configmap: ConfigMapInfo;
  onClose: () => void;
  onViewYaml: () => void;
  actions?: ActionMenuItem[];
}) {
  const { data: configmapDetails } = useQuery({
    queryKey: ['configmap-details', configmap.namespace, configmap.name],
    queryFn: () => api.configmaps.get(configmap.namespace, configmap.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['configmap-events', configmap.namespace, configmap.name],
    queryFn: () => api.configmaps.events(configmap.namespace, configmap.name),
  });

  const details = configmapDetails || configmap;

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold">{configmap.name}</h2>
          <p className="text-sm text-gray-500">{configmap.namespace}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewYaml}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            <FileCode className="w-4 h-4" />
            YAML
          </button>
          {actions && actions.length > 0 && <ActionMenu items={actions} />}
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Status Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Data Keys</div>
            <div className="font-medium">{configmap.keys.length}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{configmap.age}</div>
          </div>
          {details.binaryKeys && details.binaryKeys.length > 0 && (
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-xs text-gray-500 uppercase">Binary Keys</div>
              <div className="font-medium">{details.binaryKeys.length}</div>
            </div>
          )}
        </div>

        {/* Binary Keys */}
        {details.binaryKeys && details.binaryKeys.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Binary Data</h3>
            <div className="flex flex-wrap gap-1">
              {details.binaryKeys.map((key) => (
                <span key={key} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-mono">
                  {key}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Editable data */}
        <EditableConfigMapData
          namespace={configmap.namespace}
          name={configmap.name}
          data={details.data || {}}
        />

        {/* Labels & Annotations */}
        <MetadataTabs
          tabs={[
            { key: 'labels', label: 'Labels', data: details.labels },
            { key: 'annotations', label: 'Annotations', data: details.annotations },
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

export function ConfigMaps({ namespace, isConnected = true }: ConfigMapsProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [yamlConfigmap, setYamlConfigmap] = useState<ConfigMapInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConfigMapInfo | null>(null);
  const { can } = usePermissions(namespace, CM_CHECKS);
  const canDelete = can('delete', '', 'configmaps');
  const deleteTitle = canDelete ? undefined : 'Requires delete on configmaps';
  const [selectedConfigmap, setSelectedConfigmap] = useState<ConfigMapInfo | null>(null);

  const { data: configmaps, isLoading, error } = useQuery({
    queryKey: ['configmaps', namespace],
    queryFn: () => api.configmaps.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });
  useSelectedResource(configmaps, selectedConfigmap, setSelectedConfigmap);
  const sort = useTableSort(configmaps, CM_SORTERS);

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.configmaps.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['configmaps'] });
      addToast(`Deleted configmap ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading configmaps...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  const actionsFor = (cm: ConfigMapInfo): ActionMenuItem[] => [
    {
      label: 'Delete',
      icon: <Trash2 className="w-4 h-4" />,
      variant: 'danger',
      disabled: !canDelete,
      title: deleteTitle,
      onClick: () => setDeleteTarget(cm),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">ConfigMaps</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['configmaps'] })}
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
              <SortableTh sortKey="keys" label="Keys" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <SortableTh sortKey="age" label="Age" active={sort.sortKey} direction={sort.direction} onToggle={sort.toggle} />
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sort.sorted.map((cm) => (
              <tr
                key={`${cm.namespace}/${cm.name}`}
                className={`hover:bg-gray-50 cursor-pointer ${selectedConfigmap?.name === cm.name && selectedConfigmap?.namespace === cm.namespace ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedConfigmap(cm)}
              >
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-1">
                    {cm.name}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{cm.namespace}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {cm.keys.length} key{cm.keys.length !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{cm.age}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      {
                        label: 'Details',
                        icon: <Info className="w-4 h-4" />,
                        onClick: () => setSelectedConfigmap(cm),
                      },
                      {
                        label: 'View YAML',
                        icon: <FileCode className="w-4 h-4" />,
                        onClick: () => setYamlConfigmap(cm),
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 className="w-4 h-4" />,
                        variant: 'danger',
                        disabled: !canDelete,
                        title: deleteTitle,
                        onClick: () => setDeleteTarget(cm),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!configmaps || configmaps.length === 0) && (
          <div className="text-center py-8 text-gray-500">No configmaps found</div>
        )}
      </div>

      {yamlConfigmap && (
        <YamlModal
          resourceType="configmaps"
          namespace={yamlConfigmap.namespace}
          name={yamlConfigmap.name}
          onClose={() => setYamlConfigmap(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete ConfigMap"
        message={`Are you sure you want to delete configmap "${deleteTarget?.name}"?`}
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

      {selectedConfigmap && (
        <ConfigMapDetailsPanel
          configmap={selectedConfigmap}
          onClose={() => setSelectedConfigmap(null)}
          onViewYaml={() => {
            setYamlConfigmap(selectedConfigmap);
          }}
          actions={actionsFor(selectedConfigmap)}
        />
      )}
    </div>
  );
}
