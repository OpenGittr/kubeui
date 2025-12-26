import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { CRDInfo, CRInfo } from '../services/api';
import { RefreshCw, ChevronRight, ChevronDown, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CRDGroup {
  group: string;
  crds: CRDInfo[];
}

interface CRDsProps {
  namespace?: string;
  isConnected?: boolean;
}

function CRInstancesPanel({
  crd,
  namespace,
  onClose,
}: {
  crd: CRDInfo;
  namespace?: string;
  onClose: () => void;
}) {
  const [selectedInstance, setSelectedInstance] = useState<CRInfo | null>(null);

  // Convert kind to plural resource name (simple pluralization)
  const resource = crd.name.split('.')[0];

  const { data: instances, isLoading } = useQuery({
    queryKey: ['cr-instances', crd.group, crd.version, resource, namespace],
    queryFn: () => api.crds.listInstances(crd.group, crd.version, resource, crd.scope === 'Namespaced' ? namespace : undefined),
  });

  const { data: instanceData, isLoading: instanceLoading } = useQuery({
    queryKey: ['cr-instance', crd.group, crd.version, resource, selectedInstance?.namespace, selectedInstance?.name],
    queryFn: () => {
      if (!selectedInstance) return null;
      return api.crds.getInstance(crd.group, crd.version, resource, selectedInstance.namespace || '', selectedInstance.name);
    },
    enabled: !!selectedInstance,
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-4/5 h-4/5 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">{crd.kind}</h2>
            <p className="text-sm text-gray-500">{crd.group}/{crd.version}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Instances list */}
          <div className="w-1/3 border-r overflow-auto">
            {isLoading ? (
              <div className="p-4 text-gray-500">Loading instances...</div>
            ) : instances && instances.length > 0 ? (
              <div className="divide-y">
                {instances.map((instance) => (
                  <button
                    key={`${instance.namespace}/${instance.name}`}
                    onClick={() => setSelectedInstance(instance)}
                    className={`w-full text-left p-3 hover:bg-gray-50 ${
                      selectedInstance?.name === instance.name ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="font-medium text-sm">{instance.name}</div>
                    {instance.namespace && (
                      <div className="text-xs text-gray-500">{instance.namespace}</div>
                    )}
                    <div className="text-xs text-gray-400">{instance.age}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-gray-500 text-center">No instances found</div>
            )}
          </div>

          {/* Instance details */}
          <div className="flex-1 overflow-auto">
            {selectedInstance ? (
              instanceLoading ? (
                <div className="p-4 text-gray-500">Loading...</div>
              ) : instanceData ? (
                <SyntaxHighlighter
                  language="json"
                  style={oneDark}
                  showLineNumbers
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    minHeight: '100%',
                    fontSize: '13px',
                  }}
                  lineNumberStyle={{
                    minWidth: '3em',
                    paddingRight: '1em',
                    color: '#636d83',
                    userSelect: 'none',
                  }}
                >
                  {JSON.stringify(instanceData, null, 2)}
                </SyntaxHighlighter>
              ) : (
                <div className="p-4 text-gray-500">Failed to load instance</div>
              )
            ) : (
              <div className="p-4 text-gray-500 text-center mt-8">
                Select an instance to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CRDs({ namespace, isConnected = true }: CRDsProps) {
  const queryClient = useQueryClient();
  const [selectedCRD, setSelectedCRD] = useState<CRDInfo | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const { data: crds, isLoading, error } = useQuery({
    queryKey: ['crds'],
    queryFn: () => api.crds.list(),
    refetchInterval: isConnected ? 30000 : false,
    enabled: isConnected,
  });

  // Group CRDs by API group
  const groupedCRDs = useMemo(() => {
    if (!crds) return [];

    const filtered = searchTerm
      ? crds.filter(crd =>
          crd.kind.toLowerCase().includes(searchTerm.toLowerCase()) ||
          crd.group.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : crds;

    const groups = new Map<string, CRDInfo[]>();
    for (const crd of filtered) {
      const group = crd.group || 'core';
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(crd);
    }

    // Sort groups alphabetically, then sort CRDs within each group
    return Array.from(groups.entries())
      .map(([group, items]) => ({
        group,
        crds: items.sort((a, b) => a.kind.localeCompare(b.kind)),
      }))
      .sort((a, b) => a.group.localeCompare(b.group)) as CRDGroup[];
  }, [crds, searchTerm]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedGroups(new Set(groupedCRDs.map(g => g.group)));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading CRDs...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {(error as Error).message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Custom Resource Definitions</h1>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search CRDs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={expandAll}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            Collapse All
          </button>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['crds'] })}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {groupedCRDs.map(({ group, crds: groupCrds }) => (
          <div key={group} className="bg-white rounded-lg shadow overflow-hidden">
            <button
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                {expandedGroups.has(group) ? (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                )}
                <span className="font-medium text-gray-900">{group}</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                  {groupCrds.length}
                </span>
              </div>
            </button>

            {expandedGroups.has(group) && (
              <table className="w-full">
                <thead className="bg-gray-50 border-t border-b">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Kind</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Version</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Scope</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Short Names</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groupCrds.map((crd) => (
                    <tr key={crd.name} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{crd.kind}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{crd.version}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            crd.scope === 'Namespaced'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {crd.scope}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">
                        {crd.shortNames || '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedCRD(crd)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:text-blue-800"
                        >
                          View Instances
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

        {groupedCRDs.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            {searchTerm ? 'No CRDs match your search' : 'No CRDs found'}
          </div>
        )}
      </div>

      {selectedCRD && (
        <CRInstancesPanel
          crd={selectedCRD}
          namespace={namespace}
          onClose={() => setSelectedCRD(null)}
        />
      )}
    </div>
  );
}
