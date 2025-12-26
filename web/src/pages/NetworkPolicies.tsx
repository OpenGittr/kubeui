import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { NetworkPolicyInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useToast } from '../components/Toast';

interface NetworkPoliciesProps {
  namespace?: string;
  isConnected?: boolean;
}

export function NetworkPolicies({ namespace, isConnected = true }: NetworkPoliciesProps) {
  const queryClient = useQueryClient();

  const { data: networkPolicies, isLoading, error } = useQuery({
    queryKey: ['networkpolicies', namespace],
    queryFn: () => api.network.listNetworkPolicies(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected,
  });

  const { addToast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.network.deleteNetworkPolicy(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['networkpolicies'] });
      addToast(`Deleted network policy ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  return (
    <ResourceTable
      title="Network Policies"
      data={networkPolicies}
      isLoading={isLoading}
      error={error as Error | null}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['networkpolicies'] })}
      getRowKey={(item) => `${item.namespace}/${item.name}`}
      resourceType="networkpolicies"
      getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
      onDelete={(item: NetworkPolicyInfo) => deleteMutation.mutate({ ns: item.namespace, name: item.name })}
      columns={[
        { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
        { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
        { key: 'podSelector', header: 'Pod Selector', render: (item) => (
          <span className={item.podSelector === '<all>' ? 'text-gray-400' : 'font-mono text-xs'}>{item.podSelector}</span>
        )},
        { key: 'policyTypes', header: 'Policy Types', render: (item) => (
          <div className="flex gap-1">
            {item.policyTypes.split(', ').map((type) => (
              <span key={type} className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-medium">{type}</span>
            ))}
          </div>
        )},
        { key: 'age', header: 'Age', className: 'text-gray-600' },
      ]}
    />
  );
}
