import { useMemo, useState } from 'react';

/**
 * Parse the age strings the backend formats (e.g. "5d", "2h", "10m", "5d2h")
 * into seconds — for sorting "Age" columns by recency. Smaller seconds = older
 * so ascending sort puts newest first; reverse if you want oldest first.
 */
export function ageSeconds(age: string | undefined | null): number {
  if (!age) return 0;
  const mult: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
  const re = /(\d+)([dhms])/g;
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(age)) !== null) {
    total += Number(m[1]) * mult[m[2]];
  }
  return total;
}

export type SortDirection = 'asc' | 'desc';
export type SortGetter<T> = (item: T) => string | number | undefined | null;

export interface TableSort<T> {
  sorted: T[];
  sortKey: string | null;
  direction: SortDirection;
  toggle: (key: string) => void;
}

/**
 * Click-to-sort table sort state.
 *
 * Pass a map of column key → value getter. Header components call `toggle(key)`
 * on click; consumers render `sorted` instead of the raw array. First click
 * sorts ascending, second descending, third clears.
 */
export function useTableSort<T>(
  data: T[] | undefined,
  getters: Record<string, SortGetter<T>>,
): TableSort<T> {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<SortDirection>('asc');

  const sorted = useMemo(() => {
    if (!data) return [];
    if (!sortKey) return data;
    const fn = getters[sortKey];
    if (!fn) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return direction === 'asc' ? va - vb : vb - va;
      }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return direction === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [data, sortKey, direction, getters]);

  const toggle = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setDirection('asc');
      return;
    }
    if (direction === 'asc') {
      setDirection('desc');
      return;
    }
    setSortKey(null);
    setDirection('asc');
  };

  return { sorted, sortKey, direction, toggle };
}
