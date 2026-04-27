// Unified container card component for Pods and Deployments
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { ResourceBar, formatCPU, formatMemory } from './ResourceBar';
import { selectedHref } from '../hooks/useSelectedResource';

interface ContainerResourceData {
  cpu: { request: number; limit: number; usage: number };
  memory: { request: number; limit: number; usage: number };
}

interface ContainerCardProps {
  name: string;
  image?: string;
  ready: boolean;
  state: string;
  restarts: number;
  resources: ContainerResourceData;
  podName?: string; // Optional - shown when displaying deployment containers
  /** When set together with podName, the pod label becomes a deep link to /pods. */
  podNamespace?: string;
}

export function ContainerCard({
  name,
  image,
  ready,
  state,
  restarts,
  resources,
  podName,
  podNamespace,
}: ContainerCardProps) {
  const hasCPU = resources.cpu.usage > 0 || resources.cpu.request > 0 || resources.cpu.limit > 0;
  const hasMem = resources.memory.usage > 0 || resources.memory.request > 0 || resources.memory.limit > 0;

  return (
    <div className="bg-gray-50 rounded-lg p-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            ready ? 'bg-emerald-500' : 'bg-yellow-500'
          }`} />
          <span className="font-medium text-xs text-gray-800 shrink-0">{name}</span>
          {image && (
            <span className="text-[10px] text-gray-400 font-mono truncate" title={image}>
              {image}
            </span>
          )}
          {restarts > 0 && (
            <span className="text-[10px] text-gray-400 shrink-0">↻{restarts}</span>
          )}
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ml-2 ${
          ready ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {state}
        </span>
      </div>

      {podName && (
        podNamespace ? (
          <Link
            to={selectedHref('/pods', podNamespace, podName)}
            className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-mono mt-1 hover:underline truncate max-w-full"
            title={`Open pod ${podName}`}
          >
            <span className="truncate">{podName}</span>
            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
          </Link>
        ) : (
          <div className="text-[10px] text-gray-400 font-mono mt-1 truncate" title={podName}>
            {podName}
          </div>
        )
      )}

      {(hasCPU || hasMem) && (
        <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-gray-200 gap-1 sm:gap-0 mt-1">
          {hasCPU && (
            <div className="flex-1 sm:pr-3">
              <ResourceBar
                label="CPU"
                usage={resources.cpu.usage}
                request={resources.cpu.request}
                limit={resources.cpu.limit}
                formatValue={formatCPU}
              />
            </div>
          )}
          {hasMem && (
            <div className="flex-1 sm:pl-3">
              <ResourceBar
                label="Mem"
                usage={resources.memory.usage}
                request={resources.memory.request}
                limit={resources.memory.limit}
                formatValue={formatMemory}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Grouped pod containers for deployment view
interface PodContainersGroupProps {
  podName: string;
  /** Pod's namespace — required for the deep-link to the pod detail. */
  namespace?: string;
  containers: Array<{
    containerName: string;
    ready: boolean;
    state: string;
    restarts: number;
    cpu: { request: number; limit: number; usage: number };
    memory: { request: number; limit: number; usage: number };
  }>;
}

export function PodContainersGroup({ podName, namespace, containers }: PodContainersGroupProps) {
  // Pod name is a deep-link to /pods?selected=ns/name. The detail panel that
  // page opens already has Logs / Events / Terminal so we don't need separate
  // quick-action buttons here — keeps the row clean.
  const podLabel = namespace ? (
    <Link
      to={selectedHref('/pods', namespace, podName)}
      className="inline-flex items-center gap-1 text-xs text-blue-600 font-mono hover:underline truncate"
      title={`Open pod ${podName}`}
    >
      <span className="truncate">{podName}</span>
      <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
    </Link>
  ) : (
    <span className="text-xs text-gray-500 font-mono truncate" title={podName}>{podName}</span>
  );

  return (
    <div className="border-l-2 border-gray-200 pl-3">
      <div className="mb-2">{podLabel}</div>
      <div className="space-y-2">
        {containers.map((container, idx) => (
          <ContainerCard
            key={`${container.containerName}-${idx}`}
            name={container.containerName}
            ready={container.ready}
            state={container.state}
            restarts={container.restarts}
            resources={{
              cpu: container.cpu,
              memory: container.memory,
            }}
          />
        ))}
      </div>
    </div>
  );
}
