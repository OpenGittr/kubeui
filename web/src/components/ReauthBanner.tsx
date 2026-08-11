import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, LogIn, RefreshCw, ExternalLink, CheckCircle } from 'lucide-react';
import { api } from '../services/api';
import type { AuthProvider } from '../services/api';

interface ReauthBannerProps {
  /** The connection error surfaced by the first failing query. */
  error: string;
}

const providerLabels: Record<AuthProvider, string> = {
  gke: 'Google Cloud',
  eks: 'AWS',
  aks: 'Azure',
  oidc: 'your identity provider',
  exec: 'the cluster',
  static: 'the cluster',
  unknown: 'the cluster',
};

/**
 * Connection-failure banner that can fix the failure in place. When the cause
 * is expired cloud credentials, it runs the provider's login from the backend
 * and streams the output, so there's no need to drop to a terminal.
 */
export function ReauthBanner({ error }: ReauthBannerProps) {
  const queryClient = useQueryClient();
  const [loginId, setLoginId] = useState<string | null>(null);

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['auth-status'],
    queryFn: api.auth.status,
    retry: false,
    staleTime: 0,
  });

  const { data: session } = useQuery({
    queryKey: ['login-status', loginId],
    queryFn: () => api.auth.loginStatus(loginId as string),
    enabled: !!loginId,
    // Poll while the CLI is waiting on the browser flow, then stop.
    refetchInterval: (query) => (query.state.data?.running ? 1000 : false),
  });

  const loginMutation = useMutation({
    mutationFn: api.auth.login,
    onSuccess: (created) => setLoginId(created.id),
  });

  const retry = useCallback(async () => {
    const { data: fresh } = await refetchStatus();
    if (fresh?.connected) {
      // Credentials are good again — let every view refetch.
      queryClient.invalidateQueries();
    }
  }, [refetchStatus, queryClient]);

  // A finished login means new credentials on disk: re-probe once, and if
  // we're back, every view refetches. handledRef keeps that to one run.
  const handledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.running || session.error) return;
    if (handledRef.current === session.id) return;
    handledRef.current = session.id;
    void retry();
  }, [session, retry]);

  const loginFailed = !!session && !session.running && !!session.error;

  const provider = status?.provider ?? 'unknown';
  const providerLabel = providerLabels[provider] ?? providerLabels.unknown;
  const canReauth = !!status?.needsLogin && !!status?.canLogin;
  const loggingIn = loginMutation.isPending || !!session?.running;

  return (
    <div className="bg-red-50 border-b border-red-200 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0 text-sm text-red-700">
          <div>
            <span className="font-medium">
              {canReauth ? `Credentials for ${providerLabel} have expired` : 'Connection failed:'}
            </span>{' '}
            {canReauth ? (
              <span>
                Sign in again to reconnect
                {status?.account ? ` as ${status.account}` : ''}.
              </span>
            ) : (
              <span className="break-words">{error}</span>
            )}
          </div>

          {canReauth && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-red-600 hover:text-red-800">
                Details
              </summary>
              <div className="mt-1 text-xs text-red-600 space-y-1">
                <p className="break-words font-mono">{status?.error || error}</p>
                {status?.loginCommand && (
                  <p>
                    Runs: <span className="font-mono">{status.loginCommand}</span>
                  </p>
                )}
              </div>
            </details>
          )}

          {session && (
            <div className="mt-2 space-y-1">
              {session.running && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Complete the sign-in in your browser…
                </p>
              )}
              {session.authUrl && session.running && (
                <a
                  href={session.authUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1"
                >
                  Open sign-in page <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {loginFailed && <p className="text-xs text-red-700">{session.error}</p>}
              {session.output && (
                <pre className="max-h-32 overflow-auto rounded bg-red-100 p-2 text-[11px] leading-relaxed text-red-800 whitespace-pre-wrap">
                  {session.output}
                </pre>
              )}
            </div>
          )}

          {loginMutation.error && (
            <p className="mt-1 text-xs text-red-700">{(loginMutation.error as Error).message}</p>
          )}

          {status?.connected && (
            <p className="mt-1 text-xs text-green-700 flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3" />
              Credentials refreshed — reconnecting.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canReauth && (
            <button
              onClick={() => loginMutation.mutate()}
              disabled={loggingIn}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
            >
              {loggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              Sign in to {providerLabel}
            </button>
          )}
          <button
            onClick={retry}
            disabled={statusLoading || loggingIn}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-100 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
