// Unified container card component for Pods and Deployments
import { ResourceBar, formatCPU, formatMemory } from './ResourceBar';

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
}

export function ContainerCard({
  name,
  image,
  ready,
  state,
  restarts,
  resources,
  podName,
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
        <div className="text-[10px] text-gray-400 font-mono mt-1 truncate" title={podName}>
          {podName}
        </div>
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
  containers: Array<{
    containerName: string;
    ready: boolean;
    state: string;
    restarts: number;
    cpu: { request: number; limit: number; usage: number };
    memory: { request: number; limit: number; usage: number };
  }>;
}

export function PodContainersGroup({ podName, containers }: PodContainersGroupProps) {
  return (
    <div className="border-l-2 border-gray-200 pl-3">
      <div className="text-xs text-gray-500 font-mono mb-2 truncate" title={podName}>
        {podName}
      </div>
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
