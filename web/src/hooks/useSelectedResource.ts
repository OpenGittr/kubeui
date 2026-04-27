import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

interface ResourceLike {
  namespace?: string;
  name: string;
}

/**
 * Two-way bind a list page's "selected detail" state to the URL query param
 * `?selected=<namespace>/<name>` (or `?selected=<name>` for cluster-scoped).
 *
 * - On mount / data-load, if the URL has `selected` and the matching item is
 *   in `data`, set it as the selected item and open the detail panel.
 * - When the user clicks a row (caller calls `setSelected(item)`), the URL
 *   is updated so the address bar stays shareable.
 * - Closing the panel (caller calls `setSelected(null)`) clears the param.
 *
 * Pass the same `selected` state your page already manages — this hook only
 * adds URL sync. No state duplication.
 */
export function useSelectedResource<T extends ResourceLike>(
  data: T[] | undefined,
  selected: T | null,
  setSelected: (item: T | null) => void,
) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('selected');

  // Hydrate from URL when data loads.
  useEffect(() => {
    if (!wanted || !data) return;
    if (selected) {
      const key = selected.namespace ? `${selected.namespace}/${selected.name}` : selected.name;
      if (key === wanted) return; // already in sync
    }
    const slash = wanted.indexOf('/');
    const targetNs = slash >= 0 ? wanted.slice(0, slash) : '';
    const targetName = slash >= 0 ? wanted.slice(slash + 1) : wanted;
    const match = data.find(d =>
      d.name === targetName && (slash < 0 || (d.namespace ?? '') === targetNs),
    );
    if (match) setSelected(match);
    // If no match (data not yet loaded for that namespace, or item gone), do
    // nothing — when data arrives a later effect run will hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, data]);

  // Push selection changes back to URL.
  //
  // Subtle: on mount with a deep-link URL like `?selected=foo`, `selected`
  // starts null but the URL must NOT be cleared — the hydration effect needs
  // to read it once data loads. Track the last *known* selection in a ref
  // and only push to URL when it actually changes. This way "null on mount"
  // is a no-op and only user-driven open/close events touch the URL.
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    const key = selected
      ? (selected.namespace ? `${selected.namespace}/${selected.name}` : selected.name)
      : null;
    if (key === lastKey.current) return;
    lastKey.current = key;

    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (key) next.set('selected', key);
      else next.delete('selected');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
}

/**
 * Build the `?selected=<ns>/<name>` query string for a deep link.
 */
export function selectedHref(path: string, namespace: string | undefined, name: string): string {
  const key = namespace ? `${namespace}/${name}` : name;
  return `${path}?selected=${encodeURIComponent(key)}`;
}
