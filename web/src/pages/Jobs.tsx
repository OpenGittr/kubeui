import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { JobInfo, CronJobInfo } from '../services/api';
import { ResourceTable } from '../components/ResourceTable';
import { useState } from 'react';
import { useToast } from '../components/Toast';

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

export function Jobs({ namespace, isConnected = true }: JobsProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'jobs' | 'cronjobs'>('jobs');

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

  return (
    <div>
      <div className="flex gap-2 mb-4">
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

      {view === 'jobs' ? (
        <ResourceTable
          title="Jobs"
          data={jobs}
          isLoading={jobsLoading}
          error={jobsError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['jobs'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="jobs"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          onDelete={(item: JobInfo) => deleteJobMutation.mutate({ ns: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'status', header: 'Status', render: (item) => <StatusBadge status={item.status} /> },
            { key: 'completions', header: 'Completions' },
            { key: 'duration', header: 'Duration', render: (item) => item.duration || '-' },
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      ) : (
        <ResourceTable
          title="CronJobs"
          data={cronJobs}
          isLoading={cronJobsLoading}
          error={cronJobsError as Error | null}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['cronjobs'] })}
          getRowKey={(item) => `${item.namespace}/${item.name}`}
          resourceType="cronjobs"
          getResourceInfo={(item) => ({ namespace: item.namespace, name: item.name })}
          onDelete={(item: CronJobInfo) => deleteCronJobMutation.mutate({ ns: item.namespace, name: item.name })}
          columns={[
            { key: 'name', header: 'Name', render: (item) => <span className="font-medium">{item.name}</span> },
            { key: 'namespace', header: 'Namespace', className: 'text-gray-600' },
            { key: 'schedule', header: 'Schedule', render: (item) => <code className="text-sm">{item.schedule}</code> },
            {
              key: 'suspend',
              header: 'Suspended',
              render: (item) => (
                <span className={item.suspend ? 'text-yellow-600' : 'text-green-600'}>
                  {item.suspend ? 'Yes' : 'No'}
                </span>
              ),
            },
            { key: 'active', header: 'Active' },
            { key: 'lastSchedule', header: 'Last Schedule', render: (item) => item.lastSchedule || 'Never' },
            { key: 'age', header: 'Age', className: 'text-gray-600' },
          ]}
        />
      )}
    </div>
  );
}
