import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { HealthResponse, HealthPodIssue, HealthWorkloadIssue, HealthEvent } from '../services/api';
import {
  Server,
  Layers,
  AlertCircle,
  CheckCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  RotateCw,
  Clock,
  Activity,
  Bell,
} from 'lucide-react';
import { useSummary } from '../hooks/useRealTimeUpdates';
import { selectedHref } from '../hooks/useSelectedResource';

interface OverviewProps {
  namespace?: string;
  isConnected?: boolean;
}

const WORKLOAD_ROUTES: Record<string, string> = {
  Deployment: '/deployments',
  StatefulSet: '/statefulsets',
  DaemonSet: '/daemonsets',
};

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

function HealthCard({
  title,
  icon,
  tone,
  count,
  children,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  tone: 'red' | 'amber';
  count: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const toneClass = {
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  }[tone];
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
      <div className={`flex items-center gap-2 px-4 py-2 border-b ${toneClass}`}>
        {icon}
        <span className="font-semibold text-sm">{title}</span>
        <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded bg-white/70">
          {count}
        </span>
      </div>
      <div className="flex-1">
        {count === 0 ? (
          <div className="px-4 py-3 text-xs text-gray-400 italic">No issues</div>
        ) : (
          children
        )}
      </div>
      {footer}
    </div>
  );
}

function PodRow({ issue }: { issue: HealthPodIssue }) {
  return (
    <Link
      to={selectedHref('/pods', issue.namespace, issue.name)}
      className="flex items-baseline gap-2 px-4 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
      title={issue.message || issue.reason}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-blue-600 truncate">{issue.name}</div>
        <div className="text-xs text-gray-500 truncate">
          {issue.namespace}
          {issue.container && <> · <span className="font-mono">{issue.container}</span></>}
          {issue.restarts != null && issue.restarts > 0 && <> · ↻{issue.restarts}</>}
          {issue.message && <> · {issue.message}</>}
        </div>
      </div>
      {issue.age && <span className="text-[10px] text-gray-400 font-mono shrink-0">{issue.age}</span>}
    </Link>
  );
}

function WorkloadRow({ issue }: { issue: HealthWorkloadIssue }) {
  const route = WORKLOAD_ROUTES[issue.kind];
  const inner = (
    <div className="flex items-baseline gap-2 px-4 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-blue-600 truncate">{issue.name}</div>
        <div className="text-xs text-gray-500 truncate">
          {issue.namespace} · {issue.kind} · ready {issue.ready}/{issue.desired}
        </div>
      </div>
      {issue.age && <span className="text-[10px] text-gray-400 font-mono shrink-0">{issue.age}</span>}
    </div>
  );
  return route ? (
    <Link to={selectedHref(route, issue.namespace, issue.name)}>{inner}</Link>
  ) : inner;
}

function EventRow({ event }: { event: HealthEvent }) {
  return (
    <div className="px-4 py-2 border-b border-gray-100 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-amber-700">{event.reason}</span>
        {event.count > 1 && <span className="text-[10px] text-gray-400">x{event.count}</span>}
        <span className="text-[10px] text-gray-400 ml-auto font-mono">{event.age}</span>
      </div>
      <div className="text-xs text-gray-600 mt-0.5">{event.message}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{event.namespace} · {event.object}</div>
    </div>
  );
}

export function Overview({ namespace, isConnected = true }: OverviewProps) {
  const queryClient = useQueryClient();
  const { data: summary, isLoading: summaryLoading } = useSummary(namespace, isConnected);

  const { data: pods } = useQuery({
    queryKey: ['pods', namespace],
    queryFn: () => api.pods.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { data: health } = useQuery<HealthResponse>({
    queryKey: ['health', namespace],
    queryFn: () => api.health.get(namespace),
    refetchInterval: isConnected ? 15_000 : false,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  const podsSummary = summary?.pods;
  const deploymentsSummary = summary?.deployments;

  const runningPods = podsSummary?.healthy || pods?.filter((p) => p.status === 'Running').length || 0;
  const totalPods = podsSummary?.total || pods?.length || 0;
  const failedPods = podsSummary?.error || pods?.filter((p) => p.status === 'Failed').length || 0;

  const healthyDeployments = deploymentsSummary?.healthy || 0;
  const totalDeployments = deploymentsSummary?.total || 0;

  const totalIssues = health
    ? health.crashLooping.length +
      health.oomKilled.length +
      health.pending.length +
      health.unhealthyWorkloads.length +
      health.recentWarnings.length
    : 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Overview</h1>
        <div className="flex items-center gap-3">
          {health && (
            totalIssues === 0 ? (
              <span className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Everything healthy
              </span>
            ) : (
              <span className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded font-mono">
                {totalIssues} issue{totalIssues === 1 ? '' : 's'}
              </span>
            )
          )}
          <ConnectionIndicator isConnected={isConnected && !summaryLoading} />
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['health'] });
              queryClient.invalidateQueries({ queryKey: ['pods'] });
              queryClient.invalidateQueries({ queryKey: ['summary'] });
            }}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

      {health && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <HealthCard
            title="CrashLoopBackOff"
            icon={<RotateCw className="w-4 h-4" />}
            tone="red"
            count={health.crashLooping.length}
          >
            {health.crashLooping.map((p, i) => <PodRow key={i} issue={p} />)}
          </HealthCard>

          <HealthCard
            title="OOMKilled (last hour)"
            icon={<AlertCircle className="w-4 h-4" />}
            tone="red"
            count={health.oomKilled.length}
          >
            {health.oomKilled.map((p, i) => <PodRow key={i} issue={p} />)}
          </HealthCard>

          <HealthCard
            title="Pending > 5 min"
            icon={<Clock className="w-4 h-4" />}
            tone="amber"
            count={health.pending.length}
          >
            {health.pending.map((p, i) => <PodRow key={i} issue={p} />)}
          </HealthCard>

          <HealthCard
            title="Workloads not converged"
            icon={<Activity className="w-4 h-4" />}
            tone="amber"
            count={health.unhealthyWorkloads.length}
          >
            {health.unhealthyWorkloads.map((w, i) => <WorkloadRow key={i} issue={w} />)}
          </HealthCard>

          <HealthCard
            title="Recent warning events"
            icon={<Bell className="w-4 h-4" />}
            tone="amber"
            count={health.recentWarnings.length}
            footer={
              health.recentWarnings.length > 0 && (
                <Link
                  to="/events"
                  className="block px-4 py-2 text-xs text-blue-600 hover:bg-gray-50 border-t border-gray-100"
                >
                  {health.recentWarnings.length > 5
                    ? `View all ${health.recentWarnings.length} events →`
                    : 'View all events →'}
                </Link>
              )
            }
          >
            {health.recentWarnings.slice(0, 5).map((ev, i) => <EventRow key={i} event={ev} />)}
          </HealthCard>
        </div>
      )}
    </div>
  );
}
