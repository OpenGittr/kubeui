import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { NodeInfo, NodeResource } from '../services/api';
import { useState } from 'react';
import { RefreshCw, X, FileCode, ChevronRight } from 'lucide-react';
import { YamlModal } from '../components/YamlModal';

// Formatting helpers
function formatCPU(res: NodeResource): string {
  const capacityCores = res.capacity / 1000;
  const requestedCores = res.requested / 1000;
  const percent = res.capacity > 0 ? (res.requested / res.capacity) * 100 : 0;
  return `${requestedCores.toFixed(1)}/${capacityCores.toFixed(1)} (${percent.toFixed(0)}%)`;
}

function formatMemory(res: NodeResource): string {
  const capacityGB = res.capacity / (1024 * 1024 * 1024);
  const requestedGB = res.requested / (1024 * 1024 * 1024);
  const percent = res.capacity > 0 ? (res.requested / res.capacity) * 100 : 0;
  return `${requestedGB.toFixed(1)}/${capacityGB.toFixed(1)} GB (${percent.toFixed(0)}%)`;
}

function formatPods(res: NodeResource): string {
  return `${res.requested}/${res.capacity}`;
}

// Visual resource bar component
function ResourceBar({
  label,
  used,
  total,
  unit,
  formatValue
}: {
  label: string;
  used: number;
  total: number;
  unit: string;
  formatValue: (val: number) => string;
}) {
  const percent = total > 0 ? (used / total) * 100 : 0;
  const barWidth = Math.min(percent, 100);

  // Color based on usage
  const getColor = (p: number) => {
    if (p >= 90) return 'bg-red-500';
    if (p >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-600">{percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(percent)} transition-all`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">
        Used: {formatValue(used)}{unit} / {formatValue(total)}{unit}
      </div>
    </div>
  );
}

function CPUBar({ res }: { res: NodeResource }) {
  const cores = res.capacity / 1000;
  return (
    <ResourceBar
      label="CPU"
      used={res.requested}
      total={res.capacity}
      unit={` (${cores.toFixed(0)} cores)`}
      formatValue={(v) => `${v}m`}
    />
  );
}

function MemoryBar({ res }: { res: NodeResource }) {
  const formatGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(1);
  return (
    <ResourceBar
      label="Memory"
      used={res.requested}
      total={res.capacity}
      unit=""
      formatValue={(v) => `${formatGB(v)} GB`}
    />
  );
}

function PodsBar({ res }: { res: NodeResource }) {
  return (
    <ResourceBar
      label="Pods"
      used={res.requested}
      total={res.capacity}
      unit=""
      formatValue={(v) => `${v}`}
    />
  );
}

interface NodesProps {
  isConnected?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const isReady = status === 'Ready';
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${isReady ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {status}
    </span>
  );
}

function RoleBadge({ roles }: { roles: string }) {
  if (roles === '<none>') return <span className="text-gray-400">-</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {roles.split(',').map((role) => (
        <span key={role} className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-medium">
          {role}
        </span>
      ))}
    </div>
  );
}

function NodeDetailsPanel({ node, onClose, onViewYaml }: {
  node: NodeInfo;
  onClose: () => void;
  onViewYaml: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold">{node.name}</h2>
          <p className="text-sm text-gray-500">{node.roles !== '<none>' ? node.roles : 'Node'}</p>
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
            <div className="text-xs text-gray-500 uppercase">Status</div>
            <div className="font-medium"><StatusBadge status={node.status} /></div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{node.age}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Internal IP</div>
            <div className="font-medium font-mono text-sm">{node.internalIP}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">External IP</div>
            <div className="font-medium font-mono text-sm">{node.externalIP || '-'}</div>
          </div>
        </div>

        {/* System Info */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">System Info</h3>
          <div className="bg-gray-50 p-3 rounded space-y-1 text-sm">
            <div><span className="text-gray-500">OS:</span> {node.os}</div>
            <div><span className="text-gray-500">Kernel:</span> {node.kernel}</div>
            <div><span className="text-gray-500">Container Runtime:</span> {node.containerRuntime}</div>
            <div><span className="text-gray-500">Kubelet Version:</span> {node.version}</div>
          </div>
        </div>

        {/* Resource Usage */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Resource Usage</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 p-3 rounded">
              <CPUBar res={node.cpu} />
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <MemoryBar res={node.memory} />
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <PodsBar res={node.pods} />
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Conditions</h3>
          <div className="space-y-2">
            {node.conditions?.map((condition) => (
              <div key={condition.type} className={`border-l-2 pl-3 py-1 ${
                condition.status === 'True' && condition.type !== 'Ready' ? 'border-red-400' :
                condition.status === 'True' ? 'border-green-400' : 'border-gray-300'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{condition.type}</span>
                  <span className={`text-xs ${
                    condition.status === 'True' && condition.type !== 'Ready' ? 'text-red-600' :
                    condition.status === 'True' ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {condition.status}
                  </span>
                </div>
                {condition.message && (
                  <p className="text-xs text-gray-500 mt-0.5">{condition.message}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Labels */}
        {node.labels && Object.keys(node.labels).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Labels</h3>
            <div className="flex flex-wrap gap-1">
              {Object.entries(node.labels).map(([key, value]) => (
                <span key={key} className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
                  {key}={value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Nodes({ isConnected = true }: NodesProps) {
  const queryClient = useQueryClient();
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [yamlNode, setYamlNode] = useState<NodeInfo | null>(null);

  const { data: nodes, isLoading, error } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api.nodes.list(),
    refetchInterval: isConnected ? 10000 : false,
    enabled: isConnected,
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading nodes...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Nodes</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-green-600 bg-green-50 rounded">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['nodes'] })}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full min-w-max">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Roles</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Version</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Internal IP</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">CPU</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Memory</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Pods</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {nodes?.map((node) => (
              <tr
                key={node.name}
                className={`hover:bg-gray-50 cursor-pointer ${selectedNode?.name === node.name ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedNode(node)}
              >
                <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    {node.name}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={node.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <RoleBadge roles={node.roles} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{node.version}</td>
                <td className="px-4 py-3 text-sm font-mono whitespace-nowrap">{node.internalIP}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">{formatCPU(node.cpu)}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">{formatMemory(node.memory)}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">{formatPods(node.pods)}</td>
                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{node.age}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!nodes || nodes.length === 0) && (
          <div className="text-center py-8 text-gray-500">No nodes found</div>
        )}
      </div>

      {nodes && nodes.length > 0 && (
        <div className="mt-2 text-sm text-gray-500">
          {nodes.length} node{nodes.length !== 1 ? 's' : ''}
        </div>
      )}

      {selectedNode && (
        <NodeDetailsPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onViewYaml={() => setYamlNode(selectedNode)}
        />
      )}

      {yamlNode && (
        <YamlModal
          resourceType="nodes"
          name={yamlNode.name}
          onClose={() => setYamlNode(null)}
        />
      )}
    </div>
  );
}
