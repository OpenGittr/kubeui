import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { Overview } from './pages/Overview';
import { Pods } from './pages/Pods';
import { Deployments } from './pages/Deployments';
import { Services } from './pages/Services';
import { ConfigMaps } from './pages/ConfigMaps';
import { Secrets } from './pages/Secrets';
import { Jobs } from './pages/Jobs';
import { Storage } from './pages/Storage';
import { CRDs } from './pages/CRDs';
import { Nodes } from './pages/Nodes';
import { DaemonSets } from './pages/DaemonSets';
import { StatefulSets } from './pages/StatefulSets';
import { ReplicaSets } from './pages/ReplicaSets';
import { Ingresses } from './pages/Ingresses';
import { Endpoints } from './pages/Endpoints';
import { NetworkPolicies } from './pages/NetworkPolicies';
import { HPA } from './pages/HPA';
import { Events } from './pages/Events';
import { StorageClasses } from './pages/StorageClasses';
import { ServiceAccounts } from './pages/ServiceAccounts';
import { Namespaces } from './pages/Namespaces';
import { Quotas } from './pages/Quotas';
import { api } from './services/api';
import { useDocumentTitle } from './hooks/useDocumentTitle';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

export type ClusterStatus = 'connected' | 'failed' | 'untested';

function AppContent() {
  useDocumentTitle();
  const [namespace, setNamespace] = useState<string>('');
  const [clusterStatuses, setClusterStatuses] = useState<Record<string, ClusterStatus>>({});

  const { data: clusters } = useQuery({
    queryKey: ['clusters'],
    queryFn: api.clusters.list,
  });

  const { data: currentCluster, refetch: refetchCurrentCluster } = useQuery({
    queryKey: ['current-cluster'],
    queryFn: api.clusters.current,
  });

  // Include current cluster context in query key so it caches per cluster
  const {
    data: namespaces,
    isLoading: namespacesLoading,
    error: namespacesError,
  } = useQuery({
    queryKey: ['namespaces', currentCluster?.context],
    queryFn: api.namespaces.list,
    enabled: !!currentCluster?.context,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes - namespaces don't change often
    gcTime: 10 * 60 * 1000,   // Keep in cache for 10 minutes
  });

  // Update cluster status based on namespace query result
  useEffect(() => {
    if (!currentCluster?.context || namespacesLoading) return;
    setClusterStatuses((prev) => ({
      ...prev,
      [currentCluster.context]: namespacesError ? 'failed' : 'connected',
    }));
  }, [currentCluster?.context, namespacesError, namespacesLoading]);

  const switchClusterMutation = useMutation({
    mutationFn: api.clusters.switch,
    onSuccess: async () => {
      setNamespace(''); // Reset namespace selection
      await refetchCurrentCluster();
      // Invalidate resource queries (but not namespaces - they're cached per cluster)
      queryClient.invalidateQueries({ queryKey: ['pods'] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['configmaps'] });
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['cronjobs'] });
      queryClient.invalidateQueries({ queryKey: ['pvs'] });
      queryClient.invalidateQueries({ queryKey: ['pvcs'] });
      queryClient.invalidateQueries({ queryKey: ['crds'] });
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      queryClient.invalidateQueries({ queryKey: ['daemonsets'] });
      queryClient.invalidateQueries({ queryKey: ['statefulsets'] });
      queryClient.invalidateQueries({ queryKey: ['replicasets'] });
      queryClient.invalidateQueries({ queryKey: ['ingresses'] });
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      queryClient.invalidateQueries({ queryKey: ['networkpolicies'] });
      queryClient.invalidateQueries({ queryKey: ['hpas'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['storageclasses'] });
      queryClient.invalidateQueries({ queryKey: ['serviceaccounts'] });
      queryClient.invalidateQueries({ queryKey: ['resourcequotas'] });
      queryClient.invalidateQueries({ queryKey: ['limitranges'] });
    },
  });

  // Determine connection status based on namespace query (first query after cluster switch)
  const connectionStatus = namespacesLoading
    ? 'loading'
    : namespacesError
      ? 'error'
      : 'connected';

  const connectionError = namespacesError
    ? (namespacesError as Error).message
    : undefined;

  return (
    <Layout
      currentCluster={currentCluster?.context}
      currentNamespace={namespace}
      clusters={clusters || []}
      namespaces={namespaces || []}
      clusterStatuses={clusterStatuses}
      onClusterChange={(cluster) => switchClusterMutation.mutate(cluster)}
      onNamespaceChange={setNamespace}
      connectionStatus={connectionStatus}
      connectionError={connectionError}
      isSwitching={switchClusterMutation.isPending}
      namespacesLoading={namespacesLoading}
    >
      <Routes>
        <Route path="/" element={<Overview namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/pods" element={<Pods namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/deployments" element={<Deployments namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/services" element={<Services namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/configmaps" element={<ConfigMaps namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/secrets" element={<Secrets namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/jobs" element={<Jobs namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/storage" element={<Storage namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/crds" element={<CRDs namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/nodes" element={<Nodes isConnected={connectionStatus === 'connected'} />} />
        <Route path="/daemonsets" element={<DaemonSets namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/statefulsets" element={<StatefulSets namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/replicasets" element={<ReplicaSets namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/ingresses" element={<Ingresses namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/endpoints" element={<Endpoints namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/networkpolicies" element={<NetworkPolicies namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/hpa" element={<HPA namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/events" element={<Events namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/storageclasses" element={<StorageClasses isConnected={connectionStatus === 'connected'} />} />
        <Route path="/serviceaccounts" element={<ServiceAccounts namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
        <Route path="/namespaces" element={<Namespaces isConnected={connectionStatus === 'connected'} />} />
        <Route path="/quotas" element={<Quotas namespace={namespace} isConnected={connectionStatus === 'connected'} />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
