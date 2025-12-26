import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/': 'Overview',
  '/pods': 'Pods',
  '/deployments': 'Deployments',
  '/services': 'Services',
  '/configmaps': 'ConfigMaps',
  '/secrets': 'Secrets',
  '/jobs': 'Jobs',
  '/storage': 'Storage',
  '/crds': 'CRDs',
  '/nodes': 'Nodes',
  '/daemonsets': 'DaemonSets',
  '/statefulsets': 'StatefulSets',
  '/replicasets': 'ReplicaSets',
  '/ingresses': 'Ingresses',
  '/endpoints': 'Endpoints',
  '/networkpolicies': 'Network Policies',
  '/hpa': 'HPA',
  '/events': 'Events',
  '/storageclasses': 'Storage Classes',
  '/serviceaccounts': 'Service Accounts',
  '/namespaces': 'Namespaces',
  '/quotas': 'Quotas & Limits',
};

export function useDocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    const pageTitle = pageTitles[location.pathname] || 'KubeUI';
    document.title = pageTitle === 'Overview' ? 'KubeUI' : `${pageTitle} - KubeUI`;
  }, [location.pathname]);
}
