import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { WarningEventGroup } from '../services/api';
import { Server, Layers, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Wifi, WifiOff } from 'lucide-react';
import { useSummary } from '../hooks/useRealTimeUpdates';

interface OverviewProps {
  namespace?: string;
  isConnected?: boolean;
}

function ExpandableMessage({ event }: { event: WarningEventGroup }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = event.message.length > 80;

  return (
    <div className="flex items-start gap-1">
      <div className={expanded ? '' : 'max-w-md'}>
        <span className={expanded ? 'whitespace-pre-wrap' : 'truncate block'}>
          {event.message}
        </span>
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-blue-500 hover:text-blue-700 flex-shrink-0 p-0.5"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
      isConnected
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {isConnected ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <Wifi className="w-4 h-4" />
          <span>Live</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Disconnected</span>
        </>
      )}
    </div>
  );
}

export function Overview({ namespace, isConnected = true }: OverviewProps) {
  // Use the summary endpoint for efficient data fetching
  const { data: summary, isLoading: summaryLoading } = useSummary(namespace, isConnected);

  const { data: pods } = useQuery({
    queryKey: ['pods', namespace],
    queryFn: () => api.pods.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { data: warningEvents } = useQuery({
    queryKey: ['events-warnings', namespace],
    queryFn: () => api.events.listWarnings(namespace),
    refetchInterval: isConnected ? 10000 : false,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  // Use summary data if available, fallback to computed values
  const podsSummary = summary?.pods;
  const deploymentsSummary = summary?.deployments;

  const runningPods = podsSummary?.healthy || pods?.filter((p) => p.status === 'Running').length || 0;
  const totalPods = podsSummary?.total || pods?.length || 0;
  const failedPods = podsSummary?.error || pods?.filter((p) => p.status === 'Failed').length || 0;

  const healthyDeployments = deploymentsSummary?.healthy || 0;
  const totalDeployments = deploymentsSummary?.total || 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Overview</h1>
        <ConnectionIndicator isConnected={isConnected && !summaryLoading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Running Pods"
          value={`${runningPods}/${totalPods}`}
          icon={Server}
          color="bg-green-500"
        />
        <StatCard
          title="Failed Pods"
          value={failedPods}
          icon={AlertCircle}
          color={failedPods > 0 ? 'bg-red-500' : 'bg-gray-400'}
        />
        <StatCard
          title="Healthy Deployments"
          value={`${healthyDeployments}/${totalDeployments}`}
          icon={Layers}
          color="bg-blue-500"
        />
        <StatCard
          title="Total Restarts"
          value={pods?.reduce((sum, p) => sum + p.restarts, 0) || 0}
          icon={CheckCircle}
          color="bg-orange-500"
        />
      </div>

      {/* Recent pods with issues */}
      {failedPods > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            Pods with Issues
          </h2>
          <div className="space-y-2">
            {pods
              ?.filter((p) => p.status !== 'Running' && p.status !== 'Succeeded')
              .slice(0, 5)
              .map((pod) => (
                <div
                  key={`${pod.namespace}/${pod.name}`}
                  className="flex items-center justify-between py-2 border-b border-gray-100"
                >
                  <div>
                    <span className="font-medium">{pod.name}</span>
                    <span className="text-gray-500 text-sm ml-2">({pod.namespace})</span>
                  </div>
                  <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm">
                    {pod.status}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Warning Events (Last 24h) */}
      {warningEvents && warningEvents.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            Warning Events
            <span className="text-sm font-normal text-gray-500">(Last 24h)</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4 w-16">Count</th>
                  <th className="pb-2 pr-4">Reason</th>
                  <th className="pb-2 pr-4">Object</th>
                  <th className="pb-2 pr-4">Message</th>
                  <th className="pb-2 w-20">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {warningEvents.map((event, idx) => (
                  <tr key={`${event.namespace}/${event.object}/${event.reason}/${idx}`} className="border-b border-gray-50">
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        event.count > 10 ? 'bg-red-100 text-red-800' :
                        event.count > 3 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {event.count}x
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-medium">{event.reason}</td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
                        {event.object}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      <ExpandableMessage event={event} />
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{event.lastSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
