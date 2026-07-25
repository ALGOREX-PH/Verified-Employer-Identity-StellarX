'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchApplications, type Application } from '@/lib/dti';
import StatusBadge from '@/components/StatusBadge';

const RANK: Record<Application['status'], number> = {
  pending: 0,
  verified: 1,
  revoked: 2,
};

type LoadResult =
  | { ok: true; apps: Application[] }
  | { ok: false; error: string };

/** Pure fetch + sort — never touches component state, so it's safe to call
 *  from both the mount effect and the refresh handler below. */
async function loadApplications(): Promise<LoadResult> {
  try {
    const list = await fetchApplications();
    return {
      ok: true,
      apps: [...list].sort((a, b) => RANK[a.status] - RANK[b.status]),
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to load applications',
    };
  }
}

export default function ApplicationsTable() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyFor, setBusyFor] = useState('');
  const [error, setError] = useState('');

  // Inline, self-contained effect body (no reference to an externally
  // defined setState-calling function) — keeps this clear of the
  // set-state-in-effect rule while still being a plain "fetch on mount".
  useEffect(() => {
    let cancelled = false;
    loadApplications().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setApps(result.apps);
        setError('');
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadApplications();
    if (result.ok) {
      setApps(result.apps);
      setError('');
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const act = async (action: 'approve' | 'revoke', employer: string) => {
    setBusyFor(employer);
    setError('');
    try {
      const res = await fetch(`/api/dti/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employer }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `${action} failed`);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setBusyFor('');
    }
  };

  if (loading) {
    return <div className="h-32 animate-pulse rounded bg-rule/50" />;
  }

  const counts = {
    pending: apps.filter((a) => a.status === 'pending').length,
    verified: apps.filter((a) => a.status === 'verified').length,
    revoked: apps.filter((a) => a.status === 'revoked').length,
  };

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded bg-alarm-wash p-3 text-sm text-alarm">
          {error}
        </p>
      )}

      <div aria-live="polite">
        {apps.length === 0 ? (
          <div className="rounded border border-dashed border-rule bg-surface p-6 text-center text-sm text-ink-soft">
            No applications yet — an employer opens one by submitting the form
            on the Employers page.
          </div>
        ) : (
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-ink-soft">
              {counts.pending} pending · {counts.verified} verified ·{' '}
              {counts.revoked} revoked
            </p>
            <ul className="divide-y divide-rule rounded border border-rule bg-surface">
              {apps.map((a) => (
                <li
                  key={a.employer}
                  className="flex flex-col items-start gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {a.name || (
                        <span className="italic text-ink-soft">
                          (no business name submitted)
                        </span>
                      )}
                    </p>
                    <p className="truncate font-mono text-xs text-ink-soft">
                      DTI cert no. {a.certNo || '—'} · {a.employer.slice(0, 6)}…
                      {a.employer.slice(-6)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge kind={a.status} />
                    {a.status !== 'verified' && (
                      <button
                        type="button"
                        onClick={() => act('approve', a.employer)}
                        disabled={busyFor !== ''}
                        aria-busy={busyFor === a.employer}
                        className="rounded bg-seal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-seal-deep disabled:opacity-50"
                      >
                        {busyFor === a.employer
                          ? 'Working…'
                          : a.status === 'revoked'
                            ? 'Re-approve'
                            : 'Approve'}
                      </button>
                    )}
                    {a.status === 'verified' && (
                      <button
                        type="button"
                        onClick={() => act('revoke', a.employer)}
                        disabled={busyFor !== ''}
                        aria-busy={busyFor === a.employer}
                        className="rounded bg-alarm px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                      >
                        {busyFor === a.employer ? 'Working…' : 'Revoke'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={refresh}
        className="mt-3 text-sm text-ink-soft underline hover:text-ink"
      >
        Refresh
      </button>
    </div>
  );
}
