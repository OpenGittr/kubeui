const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || response.statusText);
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return {} as T;
  }

  const json = await response.json();
  return json.data;
}

export interface ClusterInfo {
  name: string;
  cluster: string;
  namespace?: string;
  isCurrent: boolean;
}

export interface NamespaceInfo {
  name: string;
  status: string;
  age: string;
}

export interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
  node: string;
  ip: string;
  ports?: ContainerPort[];
  containers?: ContainerInfo[];
  labels?: Record<string, string>;
}

export interface ResourceUsage {
  request: number;  // CPU in millicores, Memory in bytes
  limit: number;
  usage: number;
}

export interface ContainerResource {
  cpu: ResourceUsage;
  memory: ResourceUsage;
}

export interface ContainerPort {
  name?: string;
  containerPort: number;
  protocol?: string;
}

export interface ContainerInfo {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  state: string;
  ports?: ContainerPort[];
  resources?: ContainerResource;
}

export interface DeploymentInfo {
  name: string;
  namespace: string;
  ready: string;
  upToDate: number;
  available: number;
  age: string;
  replicas: number;
  labels?: Record<string, string>;
  containers?: string[];
  // Detailed fields
  strategy?: string;
  selector?: Record<string, string>;
  images?: string[];
  containerDetails?: DeploymentContainer[];
  conditions?: DeploymentCondition[];
  runningContainers?: RunningContainer[];
}

export interface RunningContainer {
  podName: string;
  containerName: string;
  ready: boolean;
  state: string;
  restarts: number;
  cpu: DeploymentResourceUsage;
  memory: DeploymentResourceUsage;
}

export interface DeploymentContainer {
  name: string;
  image: string;
  cpu: DeploymentResourceUsage;
  memory: DeploymentResourceUsage;
  ports?: DeploymentContainerPort[];
}

export interface DeploymentResourceUsage {
  request: number;  // CPU in millicores, Memory in bytes
  limit: number;
  usage: number;
}

export interface DeploymentContainerPort {
  name?: string;
  containerPort: number;
  protocol: string;
}

export interface DeploymentCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

export interface DeploymentEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface ServiceInfo {
  name: string;
  namespace: string;
  type: string;
  clusterIP: string;
  externalIP?: string;
  ports: string[];
  age: string;
  labels?: Record<string, string>;
  selector?: Record<string, string>;
  sessionAffinity?: string;
  portDetails?: ServicePort[];
  endpoints?: ServiceEndpoint[];
}

export interface ServicePort {
  name: string;
  port: number;
  targetPort: string;
  nodePort?: number;
  protocol: string;
}

export interface ServiceEndpoint {
  ip: string;
  nodeName?: string;
  ready: boolean;
}

export interface ServiceEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface ConfigMapInfo {
  name: string;
  namespace: string;
  keys: string[];
  age: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  data?: Record<string, string>;
  binaryKeys?: string[];
}

export interface ConfigMapEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface SecretInfo {
  name: string;
  namespace: string;
  type: string;
  keys: string[];
  age: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  keySizes?: Record<string, number>;
}

export interface SecretEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface JobInfo {
  name: string;
  namespace: string;
  completions: string;
  parallelism?: number;
  duration?: string;
  age: string;
  status: string;
  startTime?: string;
  completionTime?: string;
  succeeded?: number;
  failed?: number;
  active?: number;
  labels?: Record<string, string>;
  selector?: Record<string, string>;
  containerDetails?: JobContainer[];
  conditions?: JobCondition[];
  runningContainers?: JobRunningContainer[];
}

export interface JobContainer {
  name: string;
  image: string;
  cpu: { request: number; limit: number; usage: number };
  memory: { request: number; limit: number; usage: number };
}

export interface JobCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

export interface JobRunningContainer {
  podName: string;
  containerName: string;
  ready: boolean;
  state: string;
  restarts: number;
  cpu: { request: number; limit: number; usage: number };
  memory: { request: number; limit: number; usage: number };
}

export interface JobEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface CronJobInfo {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  lastSchedule?: string;
  age: string;
  concurrencyPolicy?: string;
  successfulJobsLimit?: number;
  failedJobsLimit?: number;
  labels?: Record<string, string>;
  containerDetails?: JobContainer[];
  activeJobs?: string[];
  lastSuccessfulTime?: string;
}

export interface CronJobEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface PVInfo {
  name: string;
  capacity: string;
  accessModes: string;
  reclaimPolicy: string;
  status: string;
  claim?: string;
  storageClass: string;
  age: string;
}

export interface PVCInfo {
  name: string;
  namespace: string;
  status: string;
  volume?: string;
  capacity: string;
  accessModes: string;
  storageClass: string;
  age: string;
}

export interface CRDInfo {
  name: string;
  group: string;
  version: string;
  kind: string;
  scope: string;
  shortNames: string;
}

export interface CRInfo {
  name: string;
  namespace: string;
  age: string;
}

export interface NodeResource {
  capacity: number;  // CPU in millicores, Memory in bytes, Pods as count
  requested: number; // Currently requested/used
}

export interface NodeInfo {
  name: string;
  status: string;
  roles: string;
  age: string;
  version: string;
  internalIP: string;
  externalIP: string;
  os: string;
  kernel: string;
  containerRuntime: string;
  cpu: NodeResource;
  memory: NodeResource;
  pods: NodeResource;
  labels: Record<string, string>;
  conditions: NodeCondition[];
}

export interface NodeCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
  lastTransitionTime: string;
}

export interface DaemonSetInfo {
  name: string;
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  upToDate: number;
  available: number;
  nodeSelector: string;
  age: string;
  labels?: Record<string, string>;
  selector?: Record<string, string>;
  containerDetails?: DaemonSetContainer[];
  conditions?: DaemonSetCondition[];
  runningContainers?: DaemonSetRunningContainer[];
}

export interface DaemonSetContainer {
  name: string;
  image: string;
  cpu: { request: number; limit: number; usage: number };
  memory: { request: number; limit: number; usage: number };
}

export interface DaemonSetCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

export interface DaemonSetRunningContainer {
  podName: string;
  nodeName: string;
  containerName: string;
  ready: boolean;
  state: string;
  restarts: number;
  cpu: { request: number; limit: number; usage: number };
  memory: { request: number; limit: number; usage: number };
}

export interface DaemonSetEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface StatefulSetInfo {
  name: string;
  namespace: string;
  ready: string;
  replicas: number;
  readyReplicas?: number;
  currentReplicas?: number;
  updatedReplicas?: number;
  age: string;
  serviceName?: string;
  labels?: Record<string, string>;
  selector?: Record<string, string>;
  containerDetails?: StatefulSetContainer[];
  conditions?: StatefulSetCondition[];
  runningContainers?: StatefulSetRunningContainer[];
}

export interface StatefulSetContainer {
  name: string;
  image: string;
  cpu: { request: number; limit: number; usage: number };
  memory: { request: number; limit: number; usage: number };
}

export interface StatefulSetCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

export interface StatefulSetRunningContainer {
  podName: string;
  containerName: string;
  ready: boolean;
  state: string;
  restarts: number;
  cpu: { request: number; limit: number; usage: number };
  memory: { request: number; limit: number; usage: number };
}

export interface StatefulSetEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface ReplicaSetInfo {
  name: string;
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  available?: number;
  age: string;
  ownerReferences?: string[];
  labels?: Record<string, string>;
  selector?: Record<string, string>;
  containerDetails?: ReplicaSetContainer[];
  conditions?: ReplicaSetCondition[];
  runningContainers?: ReplicaSetRunningContainer[];
}

export interface ReplicaSetContainer {
  name: string;
  image: string;
  cpu: { request: number; limit: number; usage: number };
  memory: { request: number; limit: number; usage: number };
}

export interface ReplicaSetCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

export interface ReplicaSetRunningContainer {
  podName: string;
  containerName: string;
  ready: boolean;
  state: string;
  restarts: number;
  cpu: { request: number; limit: number; usage: number };
  memory: { request: number; limit: number; usage: number };
}

export interface ReplicaSetEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface IngressInfo {
  name: string;
  namespace: string;
  class: string;
  hosts: string[];
  address: string;
  ports: string;
  age: string;
}

export interface EndpointInfo {
  name: string;
  namespace: string;
  endpoints: string;
  age: string;
}

export interface NetworkPolicyInfo {
  name: string;
  namespace: string;
  podSelector: string;
  policyTypes: string;
  age: string;
}

export interface HPAInfo {
  name: string;
  namespace: string;
  reference: string;
  referenceKind?: string;
  referenceName?: string;
  targets: string;
  minPods: number;
  maxPods: number;
  replicas: number;
  desiredReplicas?: number;
  age: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  metrics?: HPAMetric[];
  conditions?: HPACondition[];
  lastScaleTime?: string;
  scaleUpBehavior?: HPAScalingRules;
  scaleDownBehavior?: HPAScalingRules;
}

export interface HPAMetric {
  type: string;
  name: string;
  currentValue: string;
  targetValue: string;
  currentPercent?: number;
  targetPercent?: number;
}

export interface HPACondition {
  type: string;
  status: string;
  reason: string;
  message: string;
}

export interface HPAScalingRules {
  stabilizationWindowSeconds?: number;
  selectPolicy?: string;
}

export interface HPAEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface EventInfo {
  name: string;
  namespace: string;
  type: string;
  reason: string;
  message: string;
  object: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  age: string;
}

export interface PodEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface WarningEventGroup {
  reason: string;
  object: string;
  objectKind: string;
  objectName: string;
  message: string;
  count: number;
  namespace: string;
  lastSeen: string;
}

export interface PortForwardInfo {
  id: string;
  namespace: string;
  podName: string;
  localPort: number;
  remotePort: number;
}

export interface StorageClassInfo {
  name: string;
  provisioner: string;
  reclaimPolicy: string;
  volumeBindingMode: string;
  allowExpansion: boolean;
  isDefault: boolean;
  age: string;
}

export interface ServiceAccountInfo {
  name: string;
  namespace: string;
  secrets: number;
  age: string;
}

export interface ResourceQuotaInfo {
  name: string;
  namespace: string;
  hard: Record<string, string>;
  used: Record<string, string>;
  age: string;
}

export interface LimitRangeInfo {
  name: string;
  namespace: string;
  limits: string[];
  age: string;
}

export const api = {
  clusters: {
    list: () => request<ClusterInfo[]>('/clusters'),
    current: () => request<{ context: string; namespace: string }>('/clusters/current'),
    switch: (context: string) =>
      request<{ context: string; namespace: string }>('/clusters/switch', {
        method: 'POST',
        body: JSON.stringify({ context }),
      }),
  },

  namespaces: {
    list: () => request<NamespaceInfo[]>('/namespaces'),
  },

  pods: {
    list: (namespace?: string) =>
      request<PodInfo[]>(`/pods${namespace ? `?namespace=${namespace}` : ''}`),
    get: (namespace: string, name: string) =>
      request<PodInfo>(`/pods/${namespace}/${name}`),
    logs: (namespace: string, name: string, container?: string, tail?: number) => {
      const params = new URLSearchParams();
      if (container) params.set('container', container);
      if (tail) params.set('tail', tail.toString());
      const query = params.toString();
      return request<{ logs: string }>(`/pods/${namespace}/${name}/logs${query ? `?${query}` : ''}`);
    },
    events: (namespace: string, name: string) =>
      request<PodEvent[]>(`/pods/${namespace}/${name}/events`),
    delete: (namespace: string, name: string) =>
      request<{ message: string }>(`/pods/${namespace}/${name}`, { method: 'DELETE' }),
  },

  portForward: {
    list: () => request<PortForwardInfo[]>('/portforwards'),
    listForPod: (namespace: string, name: string) =>
      request<PortForwardInfo[]>(`/pods/${namespace}/${name}/portforwards`),
    start: (namespace: string, name: string, localPort: number, remotePort: number) =>
      request<PortForwardInfo>(`/pods/${namespace}/${name}/portforward`, {
        method: 'POST',
        body: JSON.stringify({ localPort, remotePort }),
      }),
    stop: (namespace: string, name: string, localPort: number, remotePort: number) =>
      request<{ message: string }>(`/pods/${namespace}/${name}/portforward?localPort=${localPort}&remotePort=${remotePort}`, {
        method: 'DELETE',
      }),
  },

  deployments: {
    list: (namespace?: string) =>
      request<DeploymentInfo[]>(`/deployments${namespace ? `?namespace=${namespace}` : ''}`),
    get: (namespace: string, name: string) =>
      request<DeploymentInfo>(`/deployments/${namespace}/${name}`),
    events: (namespace: string, name: string) =>
      request<DeploymentEvent[]>(`/deployments/${namespace}/${name}/events`),
    scale: (namespace: string, name: string, replicas: number) =>
      request<{ message: string; replicas: number }>(`/deployments/${namespace}/${name}/scale`, {
        method: 'PATCH',
        body: JSON.stringify({ replicas }),
      }),
    restart: (namespace: string, name: string) =>
      request<{ message: string }>(`/deployments/${namespace}/${name}/restart`, {
        method: 'POST',
      }),
    delete: (namespace: string, name: string) =>
      request<{ message: string }>(`/deployments/${namespace}/${name}`, { method: 'DELETE' }),
  },

  services: {
    list: (namespace?: string) =>
      request<ServiceInfo[]>(`/services${namespace ? `?namespace=${namespace}` : ''}`),
    get: (namespace: string, name: string) =>
      request<ServiceInfo>(`/services/${namespace}/${name}`),
    events: (namespace: string, name: string) =>
      request<ServiceEvent[]>(`/services/${namespace}/${name}/events`),
    delete: (namespace: string, name: string) =>
      request<{ message: string }>(`/services/${namespace}/${name}`, { method: 'DELETE' }),
  },

  configmaps: {
    list: (namespace?: string) =>
      request<ConfigMapInfo[]>(`/configmaps${namespace ? `?namespace=${namespace}` : ''}`),
    get: (namespace: string, name: string) =>
      request<ConfigMapInfo>(`/configmaps/${namespace}/${name}`),
    events: (namespace: string, name: string) =>
      request<ConfigMapEvent[]>(`/configmaps/${namespace}/${name}/events`),
    delete: (namespace: string, name: string) =>
      request<{ message: string }>(`/configmaps/${namespace}/${name}`, { method: 'DELETE' }),
  },

  secrets: {
    list: (namespace?: string) =>
      request<SecretInfo[]>(`/secrets${namespace ? `?namespace=${namespace}` : ''}`),
    get: (namespace: string, name: string) =>
      request<SecretInfo>(`/secrets/${namespace}/${name}`),
    events: (namespace: string, name: string) =>
      request<SecretEvent[]>(`/secrets/${namespace}/${name}/events`),
    delete: (namespace: string, name: string) =>
      request<{ message: string }>(`/secrets/${namespace}/${name}`, { method: 'DELETE' }),
  },

  jobs: {
    list: (namespace?: string) =>
      request<JobInfo[]>(`/jobs${namespace ? `?namespace=${namespace}` : ''}`),
    get: (namespace: string, name: string) =>
      request<JobInfo>(`/jobs/${namespace}/${name}`),
    events: (namespace: string, name: string) =>
      request<JobEvent[]>(`/jobs/${namespace}/${name}/events`),
    listCronJobs: (namespace?: string) =>
      request<CronJobInfo[]>(`/cronjobs${namespace ? `?namespace=${namespace}` : ''}`),
    getCronJob: (namespace: string, name: string) =>
      request<CronJobInfo>(`/cronjobs/${namespace}/${name}`),
    cronJobEvents: (namespace: string, name: string) =>
      request<CronJobEvent[]>(`/cronjobs/${namespace}/${name}/events`),
    cronJobJobs: (namespace: string, name: string) =>
      request<JobInfo[]>(`/cronjobs/${namespace}/${name}/jobs`),
    delete: (namespace: string, name: string) =>
      request<{ message: string }>(`/jobs/${namespace}/${name}`, { method: 'DELETE' }),
    deleteCronJob: (namespace: string, name: string) =>
      request<{ message: string }>(`/cronjobs/${namespace}/${name}`, { method: 'DELETE' }),
  },

  storage: {
    listPVs: () => request<PVInfo[]>('/pvs'),
    listPVCs: (namespace?: string) =>
      request<PVCInfo[]>(`/pvcs${namespace ? `?namespace=${namespace}` : ''}`),
  },

  yaml: {
    get: (type: string, namespace: string, name: string) =>
      request<{ yaml: string; canEdit: boolean }>(`/yaml/${type}/${namespace}/${name}`),
    getClusterScoped: (type: string, name: string) =>
      request<{ yaml: string; canEdit: boolean }>(`/yaml/${type}/${name}`),
    update: (type: string, namespace: string, name: string, yaml: string) =>
      request<void>(`/yaml/${type}/${namespace}/${name}`, {
        method: 'PUT',
        body: JSON.stringify({ yaml }),
      }),
    updateClusterScoped: (type: string, name: string, yaml: string) =>
      request<void>(`/yaml/${type}/${name}`, {
        method: 'PUT',
        body: JSON.stringify({ yaml }),
      }),
  },

  crds: {
    list: () => request<CRDInfo[]>('/crds'),
    listInstances: (group: string, version: string, resource: string, namespace?: string) =>
      request<CRInfo[]>(`/crds/${group}/${version}/${resource}${namespace ? `?namespace=${namespace}` : ''}`),
    getInstance: (group: string, version: string, resource: string, namespace: string, name: string) =>
      request<Record<string, unknown>>(`/crds/${group}/${version}/${resource}/${namespace}/${name}`),
  },

  nodes: {
    list: () => request<NodeInfo[]>('/nodes'),
  },

  workloads: {
    listDaemonSets: (namespace?: string) =>
      request<DaemonSetInfo[]>(`/daemonsets${namespace ? `?namespace=${namespace}` : ''}`),
    getDaemonSet: (namespace: string, name: string) =>
      request<DaemonSetInfo>(`/daemonsets/${namespace}/${name}`),
    daemonSetEvents: (namespace: string, name: string) =>
      request<DaemonSetEvent[]>(`/daemonsets/${namespace}/${name}/events`),
    listStatefulSets: (namespace?: string) =>
      request<StatefulSetInfo[]>(`/statefulsets${namespace ? `?namespace=${namespace}` : ''}`),
    getStatefulSet: (namespace: string, name: string) =>
      request<StatefulSetInfo>(`/statefulsets/${namespace}/${name}`),
    statefulSetEvents: (namespace: string, name: string) =>
      request<StatefulSetEvent[]>(`/statefulsets/${namespace}/${name}/events`),
    listReplicaSets: (namespace?: string) =>
      request<ReplicaSetInfo[]>(`/replicasets${namespace ? `?namespace=${namespace}` : ''}`),
    getReplicaSet: (namespace: string, name: string) =>
      request<ReplicaSetInfo>(`/replicasets/${namespace}/${name}`),
    replicaSetEvents: (namespace: string, name: string) =>
      request<ReplicaSetEvent[]>(`/replicasets/${namespace}/${name}/events`),
    deleteDaemonSet: (namespace: string, name: string) =>
      request<{ message: string }>(`/daemonsets/${namespace}/${name}`, { method: 'DELETE' }),
    deleteStatefulSet: (namespace: string, name: string) =>
      request<{ message: string }>(`/statefulsets/${namespace}/${name}`, { method: 'DELETE' }),
    deleteReplicaSet: (namespace: string, name: string) =>
      request<{ message: string }>(`/replicasets/${namespace}/${name}`, { method: 'DELETE' }),
  },

  network: {
    listIngresses: (namespace?: string) =>
      request<IngressInfo[]>(`/ingresses${namespace ? `?namespace=${namespace}` : ''}`),
    listEndpoints: (namespace?: string) =>
      request<EndpointInfo[]>(`/endpoints${namespace ? `?namespace=${namespace}` : ''}`),
    listNetworkPolicies: (namespace?: string) =>
      request<NetworkPolicyInfo[]>(`/networkpolicies${namespace ? `?namespace=${namespace}` : ''}`),
    deleteIngress: (namespace: string, name: string) =>
      request<{ message: string }>(`/ingresses/${namespace}/${name}`, { method: 'DELETE' }),
    deleteNetworkPolicy: (namespace: string, name: string) =>
      request<{ message: string }>(`/networkpolicies/${namespace}/${name}`, { method: 'DELETE' }),
  },

  hpas: {
    list: (namespace?: string) =>
      request<HPAInfo[]>(`/hpas${namespace ? `?namespace=${namespace}` : ''}`),
    get: (namespace: string, name: string) =>
      request<HPAInfo>(`/hpas/${namespace}/${name}`),
    events: (namespace: string, name: string) =>
      request<HPAEvent[]>(`/hpas/${namespace}/${name}/events`),
  },

  events: {
    list: (namespace?: string) =>
      request<EventInfo[]>(`/events${namespace ? `?namespace=${namespace}` : ''}`),
    listWarnings: (namespace?: string) =>
      request<WarningEventGroup[]>(`/events/warnings${namespace ? `?namespace=${namespace}` : ''}`),
  },

  storageClasses: {
    list: () => request<StorageClassInfo[]>('/storageclasses'),
  },

  serviceAccounts: {
    list: (namespace?: string) =>
      request<ServiceAccountInfo[]>(`/serviceaccounts${namespace ? `?namespace=${namespace}` : ''}`),
  },

  quotas: {
    listResourceQuotas: (namespace?: string) =>
      request<ResourceQuotaInfo[]>(`/resourcequotas${namespace ? `?namespace=${namespace}` : ''}`),
    listLimitRanges: (namespace?: string) =>
      request<LimitRangeInfo[]>(`/limitranges${namespace ? `?namespace=${namespace}` : ''}`),
  },

  search: {
    query: (q: string, namespace?: string) => {
      const params = new URLSearchParams({ q });
      if (namespace) params.set('namespace', namespace);
      return request<SearchResult[]>(`/search?${params}`);
    },
  },

  version: {
    check: () => request<VersionInfo>('/version'),
  },

  github: {
    getStars: async (): Promise<number> => {
      const res = await fetch('https://api.github.com/repos/opengittr/kubeui');
      if (!res.ok) return 0;
      const data = await res.json();
      return data.stargazers_count || 0;
    },
  },
};

export interface SearchResult {
  type: string;
  name: string;
  namespace?: string;
  status?: string;
  age: string;
}

export interface VersionInfo {
  current: string;
  latest?: string;
  updateAvailable: boolean;
  releaseUrl?: string;
  checkedAt?: string;
}
