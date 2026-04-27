import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { PermCheck, ResourceRule } from '../services/api';

function matches(list: string[] | undefined, value: string): boolean {
  if (!list || list.length === 0) return false;
  return list.includes('*') || list.includes(value);
}

function canMatch(rules: ResourceRule[], verb: string, group: string, resource: string): boolean {
  for (const r of rules) {
    if (matches(r.verbs, verb) && matches(r.apiGroups, group) && matches(r.resources, resource)) {
      return true;
    }
  }
  return false;
}

export interface PermissionChecker {
  /**
   * Returns true when the current user is allowed to perform `verb` on
   * `resource` (group `group`, "" for core) in the queried namespace.
   *
   * Resolution order:
   *   1. If SSRR returned complete rules, evaluate the rule list locally.
   *   2. If SSRR is incomplete (typical on GKE/IAM webhook auth) and this
   *      check was passed in `requiredChecks`, use the SSAR result.
   *   3. Otherwise return true — server stays the authority and surfaces
   *      a permission-denied error if the action is actually disallowed.
   */
  can: (verb: string, group: string, resource: string) => boolean;
  ready: boolean;
}

/**
 * Fetches the SelfSubjectRulesReview for the namespace; when SSRR is
 * incomplete (GKE / external authorization webhook), additionally runs a
 * SelfSubjectAccessReview for each `requiredChecks` entry so gating stays
 * accurate without enumerating rules.
 *
 * Pass the (verb, group, resource) tuples the page actually gates so the
 * extra round-trip stays small and cacheable.
 */
export function usePermissions(
  namespace: string | undefined,
  requiredChecks: PermCheck[] = [],
): PermissionChecker {
  const { data: ssrr } = useQuery({
    queryKey: ['permissions', namespace],
    queryFn: () => api.permissions.get(namespace!),
    enabled: !!namespace,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 0,
  });

  // Stable key for the SSAR query — sort so order doesn't matter.
  const checksKey = useMemo(() => {
    const ns = namespace ?? '';
    const items = requiredChecks
      .map(c => `${c.verb}|${c.group}|${c.resource}|${c.namespace ?? ns}`)
      .sort();
    return items.join(',');
  }, [requiredChecks, namespace]);

  const ssarEnabled = !!namespace && !!ssrr?.incomplete && requiredChecks.length > 0;
  const { data: ssar } = useQuery({
    queryKey: ['permissions-check', checksKey],
    queryFn: () => api.permissions.check(
      requiredChecks.map(c => ({ ...c, namespace: c.namespace ?? namespace })),
    ),
    enabled: ssarEnabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 0,
  });

  return useMemo<PermissionChecker>(() => {
    if (!namespace) return { can: () => true, ready: true };
    if (!ssrr) return { can: () => true, ready: false };

    if (ssrr.incomplete) {
      // SSRR can't enumerate rules — rely on SSAR for the requested checks.
      // Anything not in requiredChecks falls back to permissive (server
      // enforces). If SSAR hasn't returned yet, also permissive — better
      // than briefly hiding all controls.
      if (!ssarEnabled) return { can: () => true, ready: true };
      if (!ssar) return { can: () => true, ready: false };
      const lookup = new Map<string, boolean>();
      for (const r of ssar.results) {
        lookup.set(`${r.verb}|${r.group}|${r.resource}`, r.allowed);
      }
      return {
        can: (verb, group, resource) => {
          const k = `${verb}|${group}|${resource}`;
          if (lookup.has(k)) return lookup.get(k)!;
          return true;
        },
        ready: true,
      };
    }

    return {
      can: (verb, group, resource) => canMatch(ssrr.resourceRules, verb, group, resource),
      ready: true,
    };
  }, [ssrr, ssar, ssarEnabled, namespace]);
}
