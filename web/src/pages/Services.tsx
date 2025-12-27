import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ServiceInfo } from '../services/api';
import { RefreshCw, FileCode, Trash2, X, ChevronRight, Info } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface ServicesProps {
  namespace?: string;
  isConnected?: boolean;
}

function ServiceTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    LoadBalancer: 'bg-blue-100 text-blue-800',
    NodePort: 'bg-green-100 text-green-800',
    ClusterIP: 'bg-gray-100 text-gray-800',
    ExternalName: 'bg-purple-100 text-purple-800',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-800'}`}>
      {type}
    </span>
  );
}

function ServiceDetailsPanel({
  service,
  onClose,
  onViewYaml,
}: {
  service: ServiceInfo;
  onClose: () => void;
  onViewYaml: () => void;
}) {
  const { data: serviceDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['service-details', service.namespace, service.name],
    queryFn: () => api.services.get(service.namespace, service.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['service-events', service.namespace, service.name],
    queryFn: () => api.services.events(service.namespace, service.name),
  });

  const details = serviceDetails || service;

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold">{service.name}</h2>
          <p className="text-sm text-gray-500">{service.namespace}</p>
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
            <div className="font-medium"><ServiceTypeBadge type={service.type} /></div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Cluster IP</div>
            <div className="font-medium font-mono text-sm">{service.clusterIP}</div>
          </div>
          {service.externalIP && (
            <div className="bg-gray-50 p-3 rounded col-span-2">
              <div className="text-xs text-gray-500 uppercase">External IP</div>
              <div className="font-medium font-mono text-sm">{service.externalIP}</div>
            </div>
          )}
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Session Affinity</div>
            <div className="font-medium">{details.sessionAffinity || 'None'}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{service.age}</div>
          </div>
        </div>

        {/* Port Details */}
        {detailsLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : details.portDetails && details.portDetails.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Ports</h3>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Name</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Port</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Target</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">NodePort</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Protocol</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {details.portDetails.map((port, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-mono">{port.name || '-'}</td>
                      <td className="px-3 py-2 font-mono">{port.port}</td>
                      <td className="px-3 py-2 font-mono">{port.targetPort}</td>
                      <td className="px-3 py-2 font-mono">{port.nodePort || '-'}</td>
                      <td className="px-3 py-2">{port.protocol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Endpoints */}
        {details.endpoints && details.endpoints.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Endpoints ({details.endpoints.length})</h3>
            <div className="space-y-1">
              {details.endpoints.map((ep, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${ep.ready ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <span className="font-mono">{ep.ip}</span>
                  {ep.nodeName && <span className="text-gray-400">({ep.nodeName})</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selector */}
        {details.selector && Object.keys(details.selector).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Selector</h3>
            <div className="flex flex-wrap gap-1">
              {Object.entries(details.selector).map(([key, value]) => (
                <span key={key} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-mono">
                  {key}={value}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Labels */}
        {details.labels && Object.keys(details.labels).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Labels</h3>
            <div className="flex flex-wrap gap-1">
              {Object.entries(details.labels).map(([key, value]) => (
                <span key={key} className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
                  {key}={value}
                </span>
              ))}
            </div>
          </div>
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

export function Services({ namespace, isConnected = true }: ServicesProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [yamlService, setYamlService] = useState<ServiceInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceInfo | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceInfo | null>(null);

  const { data: services, isLoading, error } = useQuery({
    queryKey: ['services', namespace],
    queryFn: () => api.services.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.services.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      addToast(`Deleted service ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading services...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Services</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['services'] })}
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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Cluster IP</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">External IP</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Ports</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Age</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {services?.map((svc) => (
              <tr
                key={`${svc.namespace}/${svc.name}`}
                className={`hover:bg-gray-50 cursor-pointer ${selectedService?.name === svc.name && selectedService?.namespace === svc.namespace ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedService(svc)}
              >
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-1">
                    {svc.name}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{svc.namespace}</td>
                <td className="px-4 py-3 text-sm"><ServiceTypeBadge type={svc.type} /></td>
                <td className="px-4 py-3 text-sm font-mono">{svc.clusterIP}</td>
                <td className="px-4 py-3 text-sm font-mono">{svc.externalIP || '-'}</td>
                <td className="px-4 py-3 text-sm">{svc.ports.join(', ') || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{svc.age}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      {
                        label: 'Details',
                        icon: <Info className="w-4 h-4" />,
                        onClick: () => setSelectedService(svc),
                      },
                      {
                        label: 'View YAML',
                        icon: <FileCode className="w-4 h-4" />,
                        onClick: () => setYamlService(svc),
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 className="w-4 h-4" />,
                        variant: 'danger',
                        onClick: () => setDeleteTarget(svc),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!services || services.length === 0) && (
          <div className="text-center py-8 text-gray-500">No services found</div>
        )}
      </div>

      {yamlService && (
        <YamlModal
          resourceType="services"
          namespace={yamlService.namespace}
          name={yamlService.name}
          onClose={() => setYamlService(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Service"
        message={`Are you sure you want to delete service "${deleteTarget?.name}"?`}
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

      {selectedService && (
        <ServiceDetailsPanel
          service={selectedService}
          onClose={() => setSelectedService(null)}
          onViewYaml={() => {
            setYamlService(selectedService);
          }}
        />
      )}
    </div>
  );
}
