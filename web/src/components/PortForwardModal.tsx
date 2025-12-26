import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Play, Square, ExternalLink, ChevronDown } from 'lucide-react';
import { api } from '../services/api';
import type { PodInfo, PortForwardInfo } from '../services/api';
import { useToast } from './Toast';

interface PortForwardModalProps {
  pod: PodInfo;
  onClose: () => void;
}

export function PortForwardModal({ pod, onClose }: PortForwardModalProps) {
  const [localPort, setLocalPort] = useState('');
  const [remotePort, setRemotePort] = useState('');
  const [customPort, setCustomPort] = useState(false);
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  // Use ports directly from pod (available from list)
  const availablePorts = pod.ports || [];

  // Auto-select first port if available
  useEffect(() => {
    if (availablePorts.length > 0 && !remotePort && !customPort) {
      setRemotePort(availablePorts[0].containerPort.toString());
    }
  }, [availablePorts.length, remotePort, customPort]);

  // Get active port forwards for this pod
  const { data: activeForwards } = useQuery({
    queryKey: ['portforwards', pod.namespace, pod.name],
    queryFn: () => api.portForward.listForPod(pod.namespace, pod.name),
    refetchInterval: 3000,
  });

  const startMutation = useMutation({
    mutationFn: () => api.portForward.start(
      pod.namespace,
      pod.name,
      parseInt(localPort) || parseInt(remotePort),
      parseInt(remotePort)
    ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['portforwards'] });
      addToast(`Port forward started: localhost:${data.localPort} → ${data.remotePort}`, 'success');
      setLocalPort('');
    },
    onError: (error: Error) => {
      addToast(`Failed to start port forward: ${error.message}`, 'error');
    },
  });

  const stopMutation = useMutation({
    mutationFn: (forward: PortForwardInfo) => api.portForward.stop(
      forward.namespace,
      forward.podName,
      forward.localPort,
      forward.remotePort
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portforwards'] });
      addToast('Port forward stopped', 'success');
    },
    onError: (error: Error) => {
      addToast(`Failed to stop port forward: ${error.message}`, 'error');
    },
  });

  const handleStart = () => {
    if (!remotePort) {
      addToast('Remote port is required', 'error');
      return;
    }
    startMutation.mutate();
  };

  const handlePortChange = (value: string) => {
    if (value === 'custom') {
      setCustomPort(true);
      setRemotePort('');
    } else {
      setCustomPort(false);
      setRemotePort(value);
    }
  };

  const selectedPort = availablePorts.find(p => p.containerPort.toString() === remotePort);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="text-lg font-semibold">Port Forward</h3>
            <p className="text-sm text-gray-500">{pod.namespace}/{pod.name}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Active forwards */}
          {activeForwards && activeForwards.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Active Forwards</h4>
              <div className="space-y-2">
                {activeForwards.map((forward) => (
                  <div
                    key={forward.id}
                    className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="font-mono text-sm">
                        localhost:{forward.localPort} → {forward.remotePort}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <a
                        href={`http://localhost:${forward.localPort}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 rounded flex items-center gap-1"
                        title="Open in browser"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </a>
                      <button
                        onClick={() => stopMutation.mutate(forward)}
                        disabled={stopMutation.isPending}
                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-100 rounded flex items-center gap-1 disabled:opacity-50"
                        title="Stop port forward"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        Stop
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New forward form */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">New Port Forward</h4>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1.5">Local Port</label>
                <input
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value)}
                  placeholder={remotePort || 'Auto'}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="text-gray-400 pb-3 font-medium">→</div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1.5">Pod Port</label>
                {availablePorts.length > 0 && !customPort ? (
                  <div className="relative">
                    <select
                      value={remotePort}
                      onChange={(e) => handlePortChange(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer pr-10"
                    >
                      {availablePorts.map((port, idx) => (
                        <option key={idx} value={port.containerPort}>
                          {port.containerPort}{port.name ? ` (${port.name})` : ''}
                        </option>
                      ))}
                      <option value="custom">Custom...</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={remotePort}
                      onChange={(e) => setRemotePort(e.target.value)}
                      placeholder="8080"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus={customPort}
                    />
                    {availablePorts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomPort(false);
                          setRemotePort(availablePorts[0].containerPort.toString());
                        }}
                        className="px-3 py-2.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 whitespace-nowrap"
                      >
                        Select
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected port info */}
            {selectedPort && selectedPort.name && (
              <p className="mt-2 text-xs text-gray-500">
                Port <span className="font-medium">{selectedPort.containerPort}</span> ({selectedPort.name})
              </p>
            )}

            {/* Start button */}
            <button
              onClick={handleStart}
              disabled={!remotePort || startMutation.isPending}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              <Play className="w-4 h-4" />
              {startMutation.isPending ? 'Starting...' : 'Start Port Forward'}
            </button>
          </div>

          {/* Help text */}
          {availablePorts.length === 0 && (
            <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
              No exposed ports found in pod spec. Enter a custom port number.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 bg-gray-50 rounded-b-lg border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
