import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { JobInfo, CronJobInfo } from '../services/api';
import { RefreshCw, FileCode, Trash2, X, ChevronRight, Info, Pause, Play, Clock, Save, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { YamlModal } from '../components/YamlModal';
import { ActionMenu } from '../components/ActionMenu';
import type { ActionMenuItem } from '../components/ActionMenu';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContainerCard } from '../components/ContainerCard';
import { TailLogsModal } from '../components/MultiPodLogModal';
import type { PodTarget } from '../components/MultiPodLogModal';
import { MetadataTabs } from '../components/MetadataTabs';
import { usePermissions } from '../hooks/usePermissions';
import { useSelectedResource } from '../hooks/useSelectedResource';
import { useTableSort, ageSeconds } from '../hooks/useTableSort';
import { SortableTh } from '../components/SortableTh';

const JOB_SORTERS = {
  name: (j: JobInfo) => j.name,
  namespace: (j: JobInfo) => j.namespace,
  status: (j: JobInfo) => j.status,
  completions: (j: JobInfo) => j.completions,
  duration: (j: JobInfo) => j.duration ?? '',
  age: (j: JobInfo) => -ageSeconds(j.age),
};

const CRONJOB_SORTERS = {
  name: (c: CronJobInfo) => c.name,
  namespace: (c: CronJobInfo) => c.namespace,
  schedule: (c: CronJobInfo) => c.schedule,
  suspend: (c: CronJobInfo) => c.suspend ? 1 : 0,
  active: (c: CronJobInfo) => c.active,
  lastSchedule: (c: CronJobInfo) => c.lastSchedule ?? '',
  age: (c: CronJobInfo) => -ageSeconds(c.age),
};

const JOB_CHECKS = [
  { verb: 'patch', group: 'batch', resource: 'cronjobs' },
  { verb: 'delete', group: 'batch', resource: 'cronjobs' },
  { verb: 'delete', group: 'batch', resource: 'jobs' },
];

function EditCronJobScheduleModal({ cronjob, onClose }: { cronjob: CronJobInfo; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [schedule, setSchedule] = useState(cronjob.schedule || '');

  const mutation = useMutation({
    mutationFn: () => api.jobs.updateCronJob(cronjob.namespace, cronjob.name, { schedule }),
    onSuccess: () => {
      addToast(`Schedule updated for ${cronjob.name}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['cronjobs'] });
      queryClient.invalidateQueries({ queryKey: ['cronjob-details', cronjob.namespace, cronjob.name] });
      onClose();
    },
    onError: (err: Error) => addToast(`Update failed: ${err.message}`, 'error'),
  });

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Edit schedule — {cronjob.name}</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cron expression</label>
            <input
              value={schedule}
              onChange={e => setSchedule(e.target.value)}
              placeholder="*/5 * * * *"
              className="w-full px-2 py-1.5 text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <div className="text-xs text-gray-500 mt-1">
              Format: minute hour day-of-month month day-of-week
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-lg">
          <button onClick={onClose} className="px-3 py-1.5 text-sm bg-white border border-gray-300 hover:bg-gray-100 rounded">Cancel</button>
          <button
            disabled={!schedule || schedule === cronjob.schedule || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded flex items-center gap-1 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface JobsProps {
  namespace?: string;
  isConnected?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Complete: 'bg-green-100 text-green-800',
    Running: 'bg-blue-100 text-blue-800',
    Failed: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

function JobDetailsPanel({
  job,
  onClose,
  onViewYaml,
  actions,
}: {
  job: JobInfo;
  onClose: () => void;
  onViewYaml: () => void;
  actions?: ActionMenuItem[];
}) {
  const { data: jobDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['job-details', job.namespace, job.name],
    queryFn: () => api.jobs.get(job.namespace, job.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['job-events', job.namespace, job.name],
    queryFn: () => api.jobs.events(job.namespace, job.name),
  });

  const details = jobDetails || job;

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold">{job.name}</h2>
          <p className="text-sm text-gray-500">{job.namespace}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewYaml}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            <FileCode className="w-4 h-4" />
            YAML
          </button>
          {actions && actions.length > 0 && <ActionMenu items={actions} />}
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
            <div className="font-medium"><StatusBadge status={job.status} /></div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Completions</div>
            <div className="font-medium">{job.completions}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Parallelism</div>
            <div className="font-medium">{details.parallelism ?? 1}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Duration</div>
            <div className="font-medium">{job.duration || '-'}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{job.age}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Active/Succeeded/Failed</div>
            <div className="font-medium">{details.active ?? 0}/{details.succeeded ?? 0}/{details.failed ?? 0}</div>
          </div>
        </div>

        {/* Timing */}
        {(details.startTime || details.completionTime) && (
          <div className="grid grid-cols-2 gap-4">
            {details.startTime && (
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-500 uppercase">Start Time</div>
                <div className="font-medium text-sm">{details.startTime}</div>
              </div>
            )}
            {details.completionTime && (
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-500 uppercase">Completion Time</div>
                <div className="font-medium text-sm">{details.completionTime}</div>
              </div>
            )}
          </div>
        )}

        {/* Running Pods */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Pods</h3>
          {detailsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : details.runningContainers && details.runningContainers.length > 0 ? (
            <div className="space-y-2">
              {details.runningContainers.map((container, idx) => (
                <ContainerCard
                  key={`${container.podName}-${container.containerName}-${idx}`}
                  name={container.containerName}
                  ready={container.ready}
                  state={container.state}
                  restarts={container.restarts}
                  podName={container.podName}
                  podNamespace={job.namespace}
                  resources={{
                    cpu: container.cpu,
                    memory: container.memory,
                  }}
                />
              ))}
            </div>
          ) : details.containerDetails && details.containerDetails.length > 0 ? (
            <div className="space-y-2">
              {details.containerDetails.map((container) => (
                <ContainerCard
                  key={container.name}
                  name={container.name}
                  image={container.image}
                  ready={true}
                  state="spec"
                  restarts={0}
                  resources={{
                    cpu: container.cpu,
                    memory: container.memory,
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No pods</p>
          )}
        </div>

        {/* Labels */}
        <MetadataTabs
          tabs={[
            { key: 'labels', label: 'Labels', data: details.labels },
          ]}
        />

        {/* Conditions */}
        {details.conditions && details.conditions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Conditions</h3>
            <div className="space-y-2">
              {details.conditions.map((cond, idx) => (
                <div
                  key={idx}
                  className={`border-l-2 pl-3 py-1 ${
                    cond.status === 'True' ? 'border-green-400' : 'border-yellow-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      cond.status === 'True' ? 'text-green-700' : 'text-yellow-700'
                    }`}>
                      {cond.type}
                    </span>
                    <span className="text-xs text-gray-400">{cond.reason}</span>
                  </div>
                  <p className="text-sm text-gray-600">{cond.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Events */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Events</h3>
          {eventsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : events && events.length > 0 ? (
            <div className="space-y-2">
              {events.map((event, idx) => (
                <div
                  key={idx}
                  className={`border-l-2 pl-3 py-1 ${
                    event.type === 'Warning' ? 'border-yellow-400' : 'border-green-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      event.type === 'Warning' ? 'text-yellow-700' : 'text-green-700'
                    }`}>
                      {event.reason}
                    </span>
                    {event.count > 1 && (
                      <span className="text-xs text-gray-400">x{event.count}</span>
                    )}
                    <span className="text-xs text-gray-400">{event.age}</span>
                  </div>
                  <p className="text-sm text-gray-600">{event.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No events</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CronJobDetailsPanel({
  cronjob,
  onClose,
  onViewYaml,
  actions,
}: {
  cronjob: CronJobInfo;
  onClose: () => void;
  onViewYaml: () => void;
  actions?: ActionMenuItem[];
}) {
  const { data: cronjobDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['cronjob-details', cronjob.namespace, cronjob.name],
    queryFn: () => api.jobs.getCronJob(cronjob.namespace, cronjob.name),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['cronjob-events', cronjob.namespace, cronjob.name],
    queryFn: () => api.jobs.cronJobEvents(cronjob.namespace, cronjob.name),
  });

  const { data: childJobs } = useQuery({
    queryKey: ['cronjob-jobs', cronjob.namespace, cronjob.name],
    queryFn: () => api.jobs.cronJobJobs(cronjob.namespace, cronjob.name),
  });

  const details = cronjobDetails || cronjob;

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white shadow-xl z-40 flex flex-col">
      <div className="flex justify-between items-center p-4 border-b bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold">{cronjob.name}</h2>
          <p className="text-sm text-gray-500">{cronjob.namespace}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewYaml}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            <FileCode className="w-4 h-4" />
            YAML
          </button>
          {actions && actions.length > 0 && <ActionMenu items={actions} />}
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Status Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Schedule</div>
            <div className="font-medium font-mono text-sm">{cronjob.schedule}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Suspended</div>
            <div className={`font-medium ${cronjob.suspend ? 'text-yellow-600' : 'text-green-600'}`}>
              {cronjob.suspend ? 'Yes' : 'No'}
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Active Jobs</div>
            <div className="font-medium">{cronjob.active}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Last Scheduled</div>
            <div className="font-medium">{cronjob.lastSchedule || 'Never'}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Age</div>
            <div className="font-medium">{cronjob.age}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Concurrency</div>
            <div className="font-medium">{details.concurrencyPolicy || 'Allow'}</div>
          </div>
        </div>

        {/* History Limits */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Success History</div>
            <div className="font-medium">{details.successfulJobsLimit ?? 3}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase">Failed History</div>
            <div className="font-medium">{details.failedJobsLimit ?? 1}</div>
          </div>
        </div>

        {/* Container Details */}
        {detailsLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : details.containerDetails && details.containerDetails.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Container Spec</h3>
            <div className="space-y-2">
              {details.containerDetails.map((container) => (
                <ContainerCard
                  key={container.name}
                  name={container.name}
                  image={container.image}
                  ready={true}
                  state="spec"
                  restarts={0}
                  resources={{
                    cpu: container.cpu,
                    memory: container.memory,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Child Jobs */}
        {childJobs && childJobs.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Jobs</h3>
            <div className="space-y-2">
              {childJobs.map((job) => (
                <div key={job.name} className="border rounded p-2 flex justify-between items-center">
                  <div>
                    <div className="text-sm font-medium">{job.name}</div>
                    <div className="text-xs text-gray-500">{job.age}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{job.completions}</span>
                    <StatusBadge status={job.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Labels */}
        <MetadataTabs
          tabs={[
            { key: 'labels', label: 'Labels', data: details.labels },
          ]}
        />

        {/* Events */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Events</h3>
          {eventsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : events && events.length > 0 ? (
            <div className="space-y-2">
              {events.map((event, idx) => (
                <div
                  key={idx}
                  className={`border-l-2 pl-3 py-1 ${
                    event.type === 'Warning' ? 'border-yellow-400' : 'border-green-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      event.type === 'Warning' ? 'text-yellow-700' : 'text-green-700'
                    }`}>
                      {event.reason}
                    </span>
                    {event.count > 1 && (
                      <span className="text-xs text-gray-400">x{event.count}</span>
                    )}
                    <span className="text-xs text-gray-400">{event.age}</span>
                  </div>
                  <p className="text-sm text-gray-600">{event.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No events</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function Jobs({ namespace, isConnected = true }: JobsProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'jobs' | 'cronjobs'>('jobs');
  const [yamlJob, setYamlJob] = useState<JobInfo | null>(null);
  const [yamlCronJob, setYamlCronJob] = useState<CronJobInfo | null>(null);
  const [editSchedule, setEditSchedule] = useState<CronJobInfo | null>(null);
  const [tailJobTarget, setTailJobTarget] = useState<JobInfo | null>(null);
  const { can } = usePermissions(namespace, JOB_CHECKS);
  const canPatchCJ = can('patch', 'batch', 'cronjobs');
  const canDeleteCJ = can('delete', 'batch', 'cronjobs');
  const canDeleteJob = can('delete', 'batch', 'jobs');
  const patchCJTitle = canPatchCJ ? undefined : 'Requires patch on cronjobs';
  const deleteCJTitle = canDeleteCJ ? undefined : 'Requires delete on cronjobs';
  const deleteJobTitle = canDeleteJob ? undefined : 'Requires delete on jobs';
  const [deleteJobTarget, setDeleteJobTarget] = useState<JobInfo | null>(null);
  const [deleteCronJobTarget, setDeleteCronJobTarget] = useState<CronJobInfo | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobInfo | null>(null);
  const [selectedCronJob, setSelectedCronJob] = useState<CronJobInfo | null>(null);

  const { data: jobs, isLoading: jobsLoading, error: jobsError } = useQuery({
    queryKey: ['jobs', namespace],
    queryFn: () => api.jobs.list(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'jobs',
  });

  const { data: cronJobs, isLoading: cronJobsLoading, error: cronJobsError } = useQuery({
    queryKey: ['cronjobs', namespace],
    queryFn: () => api.jobs.listCronJobs(namespace),
    refetchInterval: isConnected ? 5000 : false,
    enabled: isConnected && view === 'cronjobs',
  });
  useSelectedResource(view === 'jobs' ? jobs : undefined, selectedJob, setSelectedJob);
  useSelectedResource(view === 'cronjobs' ? cronJobs : undefined, selectedCronJob, setSelectedCronJob);
  const jobSort = useTableSort(jobs, JOB_SORTERS);
  const cjSort = useTableSort(cronJobs, CRONJOB_SORTERS);

  const { addToast } = useToast();

  const deleteJobMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.jobs.delete(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      addToast(`Deleted job ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  const suspendCronJobMutation = useMutation({
    mutationFn: ({ cj, suspend }: { cj: CronJobInfo; suspend: boolean }) =>
      api.jobs.updateCronJob(cj.namespace, cj.name, { suspend }),
    onSuccess: (_, { cj, suspend }) => {
      addToast(`${cj.name} ${suspend ? 'suspended' : 'resumed'}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['cronjobs'] });
      queryClient.invalidateQueries({ queryKey: ['cronjob-details', cj.namespace, cj.name] });
    },
    onError: (error: Error) => {
      addToast(`Failed: ${error.message}`, 'error');
    },
  });

  const deleteCronJobMutation = useMutation({
    mutationFn: ({ ns, name }: { ns: string; name: string }) => api.jobs.deleteCronJob(ns, name),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['cronjobs'] });
      addToast(`Deleted cronjob ${name}`, 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to delete: ${error.message}`, 'error');
    },
  });

  if (!isConnected) {
    return <div className="text-gray-500">Not connected to cluster</div>;
  }

  const jobActionsFor = (j: JobInfo): ActionMenuItem[] => [
    {
      label: 'Tail logs',
      icon: <ScrollText className="w-4 h-4" />,
      onClick: () => setTailJobTarget(j),
    },
    {
      label: 'Delete',
      icon: <Trash2 className="w-4 h-4" />,
      variant: 'danger',
      disabled: !canDeleteJob,
      title: deleteJobTitle,
      onClick: () => setDeleteJobTarget(j),
    },
  ];

  const cronJobActionsFor = (cj: CronJobInfo): ActionMenuItem[] => [
    {
      label: cj.suspend ? 'Resume' : 'Suspend',
      icon: cj.suspend ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />,
      disabled: !canPatchCJ,
      title: patchCJTitle,
      onClick: () => suspendCronJobMutation.mutate({ cj, suspend: !cj.suspend }),
    },
    {
      label: 'Edit schedule',
      icon: <Clock className="w-4 h-4" />,
      disabled: !canPatchCJ,
      title: patchCJTitle,
      onClick: () => setEditSchedule(cj),
    },
    {
      label: 'Delete',
      icon: <Trash2 className="w-4 h-4" />,
      variant: 'danger',
      disabled: !canDeleteCJ,
      title: deleteCJTitle,
      onClick: () => setDeleteCronJobTarget(cj),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setView('jobs')}
            className={`px-4 py-2 rounded ${view === 'jobs' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
          >
            Jobs
          </button>
          <button
            onClick={() => setView('cronjobs')}
            className={`px-4 py-2 rounded ${view === 'cronjobs' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
          >
            CronJobs
          </button>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: [view === 'jobs' ? 'jobs' : 'cronjobs'] })}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {view === 'jobs' ? (
        <>
          {jobsLoading ? (
            <div className="text-gray-500">Loading jobs...</div>
          ) : jobsError ? (
            <div className="text-red-500">Error: {(jobsError as Error).message}</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <SortableTh sortKey="name" label="Name" active={jobSort.sortKey} direction={jobSort.direction} onToggle={jobSort.toggle} />
                    <SortableTh sortKey="namespace" label="Namespace" active={jobSort.sortKey} direction={jobSort.direction} onToggle={jobSort.toggle} />
                    <SortableTh sortKey="status" label="Status" active={jobSort.sortKey} direction={jobSort.direction} onToggle={jobSort.toggle} />
                    <SortableTh sortKey="completions" label="Completions" active={jobSort.sortKey} direction={jobSort.direction} onToggle={jobSort.toggle} />
                    <SortableTh sortKey="duration" label="Duration" active={jobSort.sortKey} direction={jobSort.direction} onToggle={jobSort.toggle} />
                    <SortableTh sortKey="age" label="Age" active={jobSort.sortKey} direction={jobSort.direction} onToggle={jobSort.toggle} />
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {jobSort.sorted.map((job) => (
                    <tr
                      key={`${job.namespace}/${job.name}`}
                      className={`hover:bg-gray-50 cursor-pointer ${selectedJob?.name === job.name && selectedJob?.namespace === job.namespace ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelectedJob(job)}
                    >
                      <td className="px-4 py-3 text-sm font-medium">
                        <div className="flex items-center gap-1">
                          {job.name}
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{job.namespace}</td>
                      <td className="px-4 py-3 text-sm"><StatusBadge status={job.status} /></td>
                      <td className="px-4 py-3 text-sm">{job.completions}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{job.duration || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{job.age}</td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <ActionMenu
                          items={[
                            {
                              label: 'Details',
                              icon: <Info className="w-4 h-4" />,
                              onClick: () => setSelectedJob(job),
                            },
                            {
                              label: 'Tail logs',
                              icon: <ScrollText className="w-4 h-4" />,
                              onClick: () => setTailJobTarget(job),
                            },
                            {
                              label: 'View YAML',
                              icon: <FileCode className="w-4 h-4" />,
                              onClick: () => setYamlJob(job),
                            },
                            {
                              label: 'Delete',
                              icon: <Trash2 className="w-4 h-4" />,
                              variant: 'danger',
                              disabled: !canDeleteJob,
                              title: deleteJobTitle,
                              onClick: () => setDeleteJobTarget(job),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!jobs || jobs.length === 0) && (
                <div className="text-center py-8 text-gray-500">No jobs found</div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {cronJobsLoading ? (
            <div className="text-gray-500">Loading cronjobs...</div>
          ) : cronJobsError ? (
            <div className="text-red-500">Error: {(cronJobsError as Error).message}</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <SortableTh sortKey="name" label="Name" active={cjSort.sortKey} direction={cjSort.direction} onToggle={cjSort.toggle} />
                    <SortableTh sortKey="namespace" label="Namespace" active={cjSort.sortKey} direction={cjSort.direction} onToggle={cjSort.toggle} />
                    <SortableTh sortKey="schedule" label="Schedule" active={cjSort.sortKey} direction={cjSort.direction} onToggle={cjSort.toggle} />
                    <SortableTh sortKey="suspend" label="Suspended" active={cjSort.sortKey} direction={cjSort.direction} onToggle={cjSort.toggle} />
                    <SortableTh sortKey="active" label="Active" active={cjSort.sortKey} direction={cjSort.direction} onToggle={cjSort.toggle} />
                    <SortableTh sortKey="lastSchedule" label="Last Schedule" active={cjSort.sortKey} direction={cjSort.direction} onToggle={cjSort.toggle} />
                    <SortableTh sortKey="age" label="Age" active={cjSort.sortKey} direction={cjSort.direction} onToggle={cjSort.toggle} />
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cjSort.sorted.map((cj) => (
                    <tr
                      key={`${cj.namespace}/${cj.name}`}
                      className={`hover:bg-gray-50 cursor-pointer ${selectedCronJob?.name === cj.name && selectedCronJob?.namespace === cj.namespace ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelectedCronJob(cj)}
                    >
                      <td className="px-4 py-3 text-sm font-medium">
                        <div className="flex items-center gap-1">
                          {cj.name}
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{cj.namespace}</td>
                      <td className="px-4 py-3 text-sm"><code className="text-sm">{cj.schedule}</code></td>
                      <td className="px-4 py-3 text-sm">
                        <span className={cj.suspend ? 'text-yellow-600' : 'text-green-600'}>
                          {cj.suspend ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{cj.active}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{cj.lastSchedule || 'Never'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{cj.age}</td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <ActionMenu
                          items={[
                            {
                              label: 'Details',
                              icon: <Info className="w-4 h-4" />,
                              onClick: () => setSelectedCronJob(cj),
                            },
                            {
                              label: cj.suspend ? 'Resume' : 'Suspend',
                              icon: cj.suspend ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />,
                              disabled: !canPatchCJ,
                              title: patchCJTitle,
                              onClick: () => suspendCronJobMutation.mutate({ cj, suspend: !cj.suspend }),
                            },
                            {
                              label: 'Edit schedule',
                              icon: <Clock className="w-4 h-4" />,
                              disabled: !canPatchCJ,
                              title: patchCJTitle,
                              onClick: () => setEditSchedule(cj),
                            },
                            {
                              label: 'View YAML',
                              icon: <FileCode className="w-4 h-4" />,
                              onClick: () => setYamlCronJob(cj),
                            },
                            {
                              label: 'Delete',
                              icon: <Trash2 className="w-4 h-4" />,
                              variant: 'danger',
                              disabled: !canDeleteCJ,
                              title: deleteCJTitle,
                              onClick: () => setDeleteCronJobTarget(cj),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!cronJobs || cronJobs.length === 0) && (
                <div className="text-center py-8 text-gray-500">No cronjobs found</div>
              )}
            </div>
          )}
        </>
      )}

      {yamlJob && (
        <YamlModal
          resourceType="jobs"
          namespace={yamlJob.namespace}
          name={yamlJob.name}
          onClose={() => setYamlJob(null)}
        />
      )}

      {tailJobTarget && (
        <TailLogsModal
          title={`Logs · ${tailJobTarget.namespace}/${tailJobTarget.name}`}
          queryKey={['tail-pods', 'job', tailJobTarget.namespace, tailJobTarget.name]}
          fetchPods={async () => {
            const d = await api.jobs.get(tailJobTarget.namespace, tailJobTarget.name);
            const seen = new Set<string>();
            const pods: PodTarget[] = [];
            for (const c of d.runningContainers || []) {
              if (seen.has(c.podName)) continue;
              seen.add(c.podName);
              pods.push({ namespace: tailJobTarget.namespace, name: c.podName });
            }
            return pods;
          }}
          onClose={() => setTailJobTarget(null)}
        />
      )}
      {yamlCronJob && (
        <YamlModal
          resourceType="cronjobs"
          namespace={yamlCronJob.namespace}
          name={yamlCronJob.name}
          onClose={() => setYamlCronJob(null)}
        />
      )}

      {editSchedule && (
        <EditCronJobScheduleModal cronjob={editSchedule} onClose={() => setEditSchedule(null)} />
      )}

      <ConfirmDialog
        isOpen={!!deleteJobTarget}
        title="Delete Job"
        message={`Are you sure you want to delete job "${deleteJobTarget?.name}"? This will also delete associated pods.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteJobMutation.isPending}
        onConfirm={() => {
          if (deleteJobTarget) {
            deleteJobMutation.mutate(
              { ns: deleteJobTarget.namespace, name: deleteJobTarget.name },
              { onSettled: () => setDeleteJobTarget(null) }
            );
          }
        }}
        onCancel={() => setDeleteJobTarget(null)}
      />

      <ConfirmDialog
        isOpen={!!deleteCronJobTarget}
        title="Delete CronJob"
        message={`Are you sure you want to delete cronjob "${deleteCronJobTarget?.name}"?`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteCronJobMutation.isPending}
        onConfirm={() => {
          if (deleteCronJobTarget) {
            deleteCronJobMutation.mutate(
              { ns: deleteCronJobTarget.namespace, name: deleteCronJobTarget.name },
              { onSettled: () => setDeleteCronJobTarget(null) }
            );
          }
        }}
        onCancel={() => setDeleteCronJobTarget(null)}
      />

      {selectedJob && (
        <JobDetailsPanel
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onViewYaml={() => {
            setYamlJob(selectedJob);
          }}
          actions={jobActionsFor(selectedJob)}
        />
      )}

      {selectedCronJob && (
        <CronJobDetailsPanel
          cronjob={selectedCronJob}
          onClose={() => setSelectedCronJob(null)}
          onViewYaml={() => {
            setYamlCronJob(selectedCronJob);
          }}
          actions={cronJobActionsFor(selectedCronJob)}
        />
      )}
    </div>
  );
}
