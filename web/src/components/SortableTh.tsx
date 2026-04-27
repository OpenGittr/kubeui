import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { SortDirection } from '../hooks/useTableSort';

interface Props {
  sortKey: string;
  label: string;
  active: string | null;
  direction: SortDirection;
  onToggle: (key: string) => void;
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Click-to-sort table header. Pair with `useTableSort`.
 *
 * Renders the column label plus a chevron whose state reflects the active
 * sort. Idle columns show a faint up/down icon as an affordance.
 */
export function SortableTh({ sortKey, label, active, direction, onToggle, align = 'left', className = '' }: Props) {
  const isActive = active === sortKey;
  const Icon = isActive ? (direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  const iconClass = isActive ? 'text-blue-600' : 'text-gray-400';
  const justify = align === 'right' ? 'justify-end' : '';

  return (
    <th
      className={`px-4 py-3 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none text-${align} ${className}`}
      onClick={() => onToggle(sortKey)}
    >
      <div className={`flex items-center gap-1 ${justify}`}>
        <span>{label}</span>
        <Icon className={`w-3 h-3 ${iconClass}`} />
      </div>
    </th>
  );
}
