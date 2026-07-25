'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { listEntries, type RegistryEntry } from '@/lib/registry';
import StatusBadge from '@/components/StatusBadge';
import ResultCard from '@/components/verify/ResultCard';

export default function VerifySearch() {
  const inputId = useId();
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RegistryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listEntries()
      .then(setEntries)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load the registry'),
      )
      .finally(() => setLoading(false));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.certNo.toLowerCase().includes(q),
    );
  }, [entries, query]);

  if (loading) {
    return <div className="h-16 animate-pulse rounded border border-rule bg-surface" />;
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-alarm">
        {error}
      </p>
    );
  }

  return (
    <div>
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor={inputId} className="sr-only">
          Search verified employers
        </label>
        <input
          id={inputId}
          type="text"
          placeholder="Search by business name or DTI cert no."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          className="w-full rounded border border-rule bg-surface px-4 py-3 text-lg text-ink placeholder:text-ink-soft"
        />
      </form>

      <div aria-live="polite" className="mt-4">
        {matches.length === 0 && (
          <div className="rounded border border-rule bg-surface p-6 text-center">
            <StatusBadge kind="none" />
            <p className="mt-2 text-sm text-ink-soft">
              {query.trim() ? (
                <>
                  No DTI-verified business matches &ldquo;{query.trim()}&rdquo;.
                  If a job posting claims otherwise, treat it as a red flag.
                </>
              ) : (
                'No verified businesses in the registry yet.'
              )}
            </p>
          </div>
        )}

        {matches.length > 0 && (
          <>
            <p className="font-mono text-xs text-ink-soft">
              {matches.length} of {entries.length} businesses
            </p>
            <ul className="mt-2 divide-y divide-rule rounded border border-rule bg-surface">
              {matches.map((e) => {
                const isSelected = selected?.employer === e.employer;
                return (
                  <li key={e.employer}>
                    <button
                      type="button"
                      onClick={() => setSelected(e)}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-paper ${
                        isSelected ? 'bg-seal-wash' : ''
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {e.name}
                        </span>
                        <span className="block font-mono text-xs text-ink-soft">
                          DTI cert no. {e.certNo}
                        </span>
                      </span>
                      <StatusBadge
                        kind={e.status === 'Verified' ? 'verified' : 'revoked'}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {selected && <ResultCard entry={selected} />}
    </div>
  );
}
