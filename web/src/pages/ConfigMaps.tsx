import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ConfigMapInfo } from '../services/api';
import { RefreshCw, FileCode, Trash2, X, ChevronRight, Info } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MetadataTabs } from '../components/MetadataTabs';

interface ConfigMapsProps {
  namespace?: string;
  isConnected?: boolean;
}

function ConfigMapDetailsPanel({
  configmap,
  onClose,
  onViewYaml,
}: {
  configmap: ConfigMapInfo;
  onClose: () => void;
  onViewYaml: () => void;
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

        {/* Data, Labels & Annotations Tabs */}
        <MetadataTabs
          tabs={[
            { key: 'data', label: 'Data', data: details.data, multiline: true },
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
  const [selectedConfigmap, setSelectedConfigmap] = useState<ConfigMapInfo | null>(null);

  const { data: configmaps, isLoading, error } = useQuery({
    queryKey: ['configmaps', namespace],
    queryFn: () => api.configmaps.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Namespace</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Keys</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Age</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {configmaps?.map((cm) => (
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
        />
      )}
    </div>
  );
}
