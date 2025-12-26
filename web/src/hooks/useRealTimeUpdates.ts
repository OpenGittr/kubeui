import { useEffect, useState, useCallback, useRef } from 'react';

interface ResourceSummary {
  total: number;
  healthy: number;
  warning: number;
  error: number;
  items?: ResourceItem[];
}

interface ResourceItem {
  name: string;
  namespace?: string;
  status: string;
  ready?: string;
  age?: string;
}

interface SummaryData {
  pods?: ResourceSummary;
  deployments?: ResourceSummary;
  services?: ResourceSummary;
  nodes?: ResourceSummary;
}

interface SSEMessage {
  type: string;
  resource: string;
  namespace: string;
  data: ResourceSummary;
}

// Fetch summary data via regular polling (simpler than SSE for React Query compatibility)
export function useSummary(namespace?: string, enabled = true) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const params = namespace ? `?namespace=${namespace}` : '';
      const response = await fetch(`/api/summary${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch summary');
      }
      const json = await response.json();
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [namespace]);

  useEffect(() => {
    if (!enabled) return;

    fetchSummary();

    // Poll every 5 seconds
    const interval = setInterval(fetchSummary, 5000);
    return () => clearInterval(interval);
  }, [enabled, fetchSummary]);

  return { data, isLoading, error, refetch: fetchSummary };
}

// SSE-based real-time updates for a specific resource
export function useSSEUpdates(
  resource: string,
  namespace?: string,
  enabled = true
) {
  const [data, setData] = useState<ResourceSummary | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const params = new URLSearchParams();
    params.set('resource', resource);
    if (namespace) params.set('namespace', namespace);

    const url = `/api/events/stream?${params}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        if (message.type === 'update') {
          setData(message.data);
        } else if (message.type === 'error') {
          setError(message.data as unknown as string);
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError('Connection lost. Reconnecting...');
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [resource, namespace, enabled]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return { data, isConnected, error, disconnect };
}

export type { ResourceSummary, ResourceItem, SummaryData };
