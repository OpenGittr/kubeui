import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { SecretInfo } from '../services/api';
import { RefreshCw, FileCode, Trash2, X, ChevronRight, Info, Lock } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MetadataTabs } from '../components/MetadataTabs';

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

function SecretDetailsPanel({
  secret,
  onClose,
  onViewYaml,
}: {
  secret: SecretInfo;
  onClose: () => void;
  onViewYaml: () => void;
}) {
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

        {/* Data, Labels & Annotations */}
        {detailsLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : (
          <MetadataTabs
            tabs={[
              { key: 'data', label: 'Data', secretData: details.data },
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

  const { data: secrets, isLoading, error } = useQuery({
    queryKey: ['secrets', namespace],
    queryFn: () => api.secrets.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Namespace</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Keys</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Age</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {secrets?.map((secret) => (
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
