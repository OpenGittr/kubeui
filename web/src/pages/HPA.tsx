import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { HPAInfo } from '../services/api';
import { RefreshCw, FileCode, X, ChevronRight, Info, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';

interface HPAProps {
  namespace?: string;
  isConnected?: boolean;
}

function HPADetailsPanel({
  hpa,
  onClose,
  onViewYaml,
}: {
  hpa: HPAInfo;
  onClose: () => void;
  onViewYaml: () => void;
}) {
  const { data: hpaDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['hpa-details', hpa.namespace, hpa.name],
    queryFn: () => api.hpas.get(hpa.namespace, hpa.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['hpa-events', hpa.namespace, hpa.name],
    queryFn: () => api.hpas.events(hpa.namespace, hpa.name),
  });

  const details = hpaDetails || hpa;

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            {hpa.name}
          </h2>
          <p className="text-sm text-gray-500">{hpa.namespace}</p>
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
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Current</div>
            <div className="text-2xl font-bold text-blue-600">{hpa.replicas}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Min</div>
            <div className="text-2xl font-bold">{hpa.minPods}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Max</div>
            <div className="text-2xl font-bold">{hpa.maxPods}</div>
          </div>
        </div>

        {/* Target Reference */}
        <div className="bg-blue-50 p-3 rounded">
          <div className="text-xs text-gray-500 uppercase mb-1">Scale Target</div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
              {details.referenceKind || hpa.reference.split('/')[0]}
            </span>
            <span className="font-mono text-sm">{details.referenceName || hpa.reference.split('/')[1]}</span>
          </div>
        </div>

        {/* Desired vs Current */}
        {details.desiredReplicas !== undefined && details.desiredReplicas !== hpa.replicas && (
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded flex items-center gap-2">
            <Activity className="w-5 h-5 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              Scaling in progress: {hpa.replicas} → {details.desiredReplicas} replicas
            </span>
          </div>
        )}

        {/* Metrics - Compact CPU/Memory display */}
        {detailsLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : details.metrics && details.metrics.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Resource Metrics</h3>
            <div className="bg-gray-50 rounded p-3">
              <div className="flex gap-6">
                {details.metrics.map((metric, idx) => {
                  const currentPct = metric.currentPercent ?? 0;
                  const targetPct = metric.targetPercent ?? 100;
                  const ratio = targetPct > 0 ? (currentPct / targetPct) * 100 : 0;
                  const isOverTarget = currentPct > targetPct;
                  const barColor = isOverTarget ? 'bg-red-500' : currentPct > targetPct * 0.8 ? 'bg-yellow-500' : 'bg-emerald-500';

                  return (
                    <div key={idx} className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium uppercase text-gray-500 w-12">
                          {metric.name === 'cpu' ? 'CPU' : metric.name === 'memory' ? 'MEM' : metric.name}
                        </span>
                        <div className="flex-1 h-4 bg-gray-200 rounded relative group">
                          {/* Progress bar */}
                          <div
                            className={`h-full ${barColor} rounded-l transition-all`}
                            style={{ width: `${Math.min(ratio, 100)}%` }}
                          />
                          {/* Target marker */}
                          <div className="absolute top-0 right-0 w-0.5 h-full bg-blue-600" title={`Target: ${metric.targetValue}`} />
                          {/* Tooltip */}
                          <div className="absolute left-1/2 -translate-x-1/2 -top-8 hidden group-hover:flex bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-20 gap-2">
                            <span>Current: {metric.currentValue}</span>
                            <span className="text-blue-300">Target: {metric.targetValue}</span>
                          </div>
                        </div>
                        <span className="text-xs font-mono w-16 text-right">
                          <span className={isOverTarget ? 'text-red-600 font-medium' : ''}>{metric.currentValue}</span>
                          <span className="text-gray-400">/{metric.targetValue}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Last Scale Time */}
        {details.lastScaleTime && (
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Last Scale Event</div>
            <div className="font-medium">{details.lastScaleTime} ago</div>
          </div>
        )}

        {/* Scaling Behavior */}
        {(details.scaleUpBehavior || details.scaleDownBehavior) && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Scaling Behavior</h3>
            <div className="grid grid-cols-2 gap-4">
              {details.scaleUpBehavior && (
                <div className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-sm">Scale Up</span>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    {details.scaleUpBehavior.stabilizationWindowSeconds > 0 && (
                      <div>Stabilization: {details.scaleUpBehavior.stabilizationWindowSeconds}s</div>
                    )}
                    {details.scaleUpBehavior.selectPolicy && (
                      <div>Policy: {details.scaleUpBehavior.selectPolicy}</div>
                    )}
                  </div>
                </div>
              )}
              {details.scaleDownBehavior && (
                <div className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <span className="font-medium text-sm">Scale Down</span>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    {details.scaleDownBehavior.stabilizationWindowSeconds > 0 && (
                      <div>Stabilization: {details.scaleDownBehavior.stabilizationWindowSeconds}s</div>
                    )}
                    {details.scaleDownBehavior.selectPolicy && (
                      <div>Policy: {details.scaleDownBehavior.selectPolicy}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Conditions */}
        {details.conditions && details.conditions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Conditions</h3>
            <div className="space-y-2">
              {details.conditions.map((condition, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full mt-1.5 ${
                    condition.status === 'True' ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <div>
                    <span className="font-medium">{condition.type}</span>
                    {condition.reason && (
                      <span className="text-gray-500 ml-2">({condition.reason})</span>
                    )}
                    {condition.message && (
                      <p className="text-gray-600 text-xs mt-0.5">{condition.message}</p>
                    )}
                  </div>
                </div>
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

export function HPA({ namespace, isConnected = true }: HPAProps) {
  const queryClient = useQueryClient();
  const [yamlHPA, setYamlHPA] = useState<HPAInfo | null>(null);
  const [selectedHPA, setSelectedHPA] = useState<HPAInfo | null>(null);

  const { data: hpas, isLoading, error } = useQuery({
    queryKey: ['hpas', namespace],
    queryFn: () => api.hpas.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading HPAs...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Horizontal Pod Autoscalers</h1>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['hpas'] })}
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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Reference</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Targets</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Min</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Max</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Replicas</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Age</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {hpas?.map((hpa) => (
              <tr
                key={`${hpa.namespace}/${hpa.name}`}
                className={`hover:bg-gray-50 cursor-pointer ${selectedHPA?.name === hpa.name && selectedHPA?.namespace === hpa.namespace ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedHPA(hpa)}
              >
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-1">
                    {hpa.name}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{hpa.namespace}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-mono">{hpa.reference}</span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={hpa.targets === '<none>' ? 'text-gray-400' : ''}>{hpa.targets}</span>
                </td>
                <td className="px-4 py-3 text-sm">{hpa.minPods}</td>
                <td className="px-4 py-3 text-sm">{hpa.maxPods}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="font-medium text-blue-600">{hpa.replicas}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{hpa.age}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      {
                        label: 'Details',
                        icon: <Info className="w-4 h-4" />,
                        onClick: () => setSelectedHPA(hpa),
                      },
                      {
                        label: 'View YAML',
                        icon: <FileCode className="w-4 h-4" />,
                        onClick: () => setYamlHPA(hpa),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!hpas || hpas.length === 0) && (
          <div className="text-center py-8 text-gray-500">No HPAs found</div>
        )}
      </div>

      {yamlHPA && (
        <YamlModal
          resourceType="horizontalpodautoscalers"
          namespace={yamlHPA.namespace}
          name={yamlHPA.name}
          onClose={() => setYamlHPA(null)}
        />
      )}

      {selectedHPA && (
        <HPADetailsPanel
          hpa={selectedHPA}
          onClose={() => setSelectedHPA(null)}
          onViewYaml={() => {
            setYamlHPA(selectedHPA);
          }}
        />
      )}
    </div>
  );
}
