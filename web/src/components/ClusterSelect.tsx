import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ClusterStatus } from '../App';

interface ClusterSelectProps {
  clusters: { name: string; isCurrent: boolean }[];
  currentCluster?: string;
  clusterStatuses: Record<string, ClusterStatus>;
  onChange: (cluster: string) => void;
  disabled?: boolean;
}

function StatusDot({ status }: { status: ClusterStatus }) {
  const colors: Record<ClusterStatus, string> = {
    connected: 'bg-green-500',
    failed: 'bg-red-500',
    untested: 'bg-gray-400',
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status]}`}
    />
  );
}

export function ClusterSelect({
  clusters,
  currentCluster,
  clusterStatuses,
  onChange,
  disabled = false,
}: ClusterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getStatus = (name: string): ClusterStatus => {
    return clusterStatuses[name] || 'untested';
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded
          hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed
          min-w-[200px] text-left
        `}
      >
        <StatusDot status={getStatus(currentCluster || '')} />
        <span className="flex-1 truncate">{currentCluster || 'Select cluster'}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-auto">
          {clusters.map((cluster) => (
            <button
              key={cluster.name}
              type="button"
              onClick={() => {
                onChange(cluster.name);
                setIsOpen(false);
              }}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                hover:bg-gray-100 transition-colors
                ${cluster.name === currentCluster ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
              `}
            >
              <StatusDot status={getStatus(cluster.name)} />
              <span className="truncate">{cluster.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
