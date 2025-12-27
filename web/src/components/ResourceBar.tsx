// Shared resource bar component for visualizing CPU/Memory request/limit/usage

interface ResourceBarProps {
  label: string;
  request: number;
  limit: number;
  usage?: number;
  formatValue: (v: number) => string;
}

export function ResourceBar({
  label,
  request,
  limit,
  usage = 0,
  formatValue,
}: ResourceBarProps) {
  // Scale: use limit only if it's reasonably close to request (within 4x)
  // Otherwise scale to request to make the visualization useful
  const getMaxValue = () => {
    if (limit > 0 && request > 0 && limit > request * 4) {
      // Limit is too large, scale to request instead
      return request;
    }
    if (limit > 0) return limit;
    if (request > 0) return request;
    if (usage > 0) return usage;
    return 100;
  };
  const maxValue = getMaxValue();
  const usagePercent = maxValue > 0 && usage > 0 ? (usage / maxValue) * 100 : 0;
  const requestPercent = maxValue > 0 && request > 0 ? (request / maxValue) * 100 : 0;

  const hasUsage = usage > 0;
  const hasRequest = request > 0;
  const hasLimit = limit > 0;

  const getUsageColor = () => {
    if (limit > 0 && usage > limit * 0.9) return 'bg-red-500';
    if (request > 0 && usage > request) return 'bg-orange-500';
    if (request > 0 && usage > request * 0.8) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  if (!hasUsage && !hasRequest && !hasLimit) return null;

  return (
    <div className={`flex items-center gap-1.5 ${hasRequest ? 'mb-3' : ''} group relative`}>
      <span className="text-[10px] text-gray-500 w-7 shrink-0">{label}</span>
      <div className="flex-1 h-4 bg-gray-100 rounded relative min-w-[60px]">
        {/* Hover tooltip */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-8 hidden group-hover:flex bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-20 gap-3">
          {hasUsage && <span>use: {formatValue(usage)}</span>}
          {hasRequest && <span className="text-blue-300">req: {formatValue(request)}</span>}
          {hasLimit && <span className="text-gray-300">lim: {formatValue(limit)}</span>}
        </div>
        {/* Usage bar */}
        {hasUsage && (
          <div
            className={`h-full ${getUsageColor()} rounded-l transition-all`}
            style={{ width: `${Math.max(Math.min(usagePercent, 100), 2)}%` }}
          />
        )}
        {/* Usage value - positioned at end of bar or start if too small */}
        {hasUsage && (
          <span
            className="absolute top-0 h-full flex items-center text-[9px] font-mono font-medium"
            style={{
              left: usagePercent > 20 ? `${Math.min(usagePercent, 100) / 2}%` : `${Math.min(usagePercent, 100) + 2}%`,
              color: usagePercent > 20 ? 'white' : '#374151',
              transform: usagePercent > 20 ? 'translateX(-50%)' : 'none'
            }}
          >
            {formatValue(usage)}
          </span>
        )}
        {/* Request marker with label */}
        {hasRequest && (
          <div
            className="absolute top-0 h-full flex flex-col items-center"
            style={{ left: `${Math.min(requestPercent, 100)}%` }}
          >
            <div className="w-0.5 h-full bg-blue-600" />
            <span className="absolute -bottom-3 text-[8px] font-mono text-blue-600 whitespace-nowrap -translate-x-1/2">
              {formatValue(request)}
            </span>
          </div>
        )}
      </div>
      {/* Limit at end */}
      <span className="text-[10px] font-mono text-gray-400 shrink-0">
        {hasLimit ? formatValue(limit) : '-'}
      </span>
    </div>
  );
}

// Format helpers
export const formatCPU = (m: number) => {
  if (m >= 1000) {
    const cores = m / 1000;
    return cores % 1 === 0 ? `${cores}c` : `${cores.toFixed(1)}c`;
  }
  return `${m}m`;
};

export const formatMemory = (b: number) => {
  if (b >= 1024*1024*1024) return `${(b/(1024*1024*1024)).toFixed(1)}Gi`;
  if (b >= 1024*1024) return `${(b/(1024*1024)).toFixed(0)}Mi`;
  return `${(b/1024).toFixed(0)}Ki`;
};

export const parseResourceValue = (val: string): number => {
  if (!val) return 0;
  if (val.endsWith('m')) {
    return parseInt(val.slice(0, -1), 10);
  }
  if (val.endsWith('Ki')) {
    return parseInt(val.slice(0, -2), 10) * 1024;
  }
  if (val.endsWith('Mi')) {
    return parseInt(val.slice(0, -2), 10) * 1024 * 1024;
  }
  if (val.endsWith('Gi')) {
    return parseInt(val.slice(0, -2), 10) * 1024 * 1024 * 1024;
  }
  const num = parseFloat(val);
  if (!isNaN(num)) {
    return num * 1000;
  }
  return 0;
};
