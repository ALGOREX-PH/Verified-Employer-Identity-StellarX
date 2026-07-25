'use client';
import { useEffect, useState } from 'react';
import { fetchCredentialInfo, type CredentialStatus } from '@/lib/credential';
import type { RegistryEntry } from '@/lib/registry';
import Seal from '@/components/Seal';
import StatusBadge, { type BadgeKind } from '@/components/StatusBadge';

interface Verdict {
  kind: BadgeKind;
  label: string;
  detail: string;
  sealTone: 'seal' | 'alarm';
  sealGlyph: string;
}

/** Registry = index, classic trustline = truth; the ledger wins on conflict. */
function combine(entry: RegistryEntry, chain: CredentialStatus): Verdict {
  if (entry.status === 'Verified' && chain === 'verified') {
    return {
      kind: 'verified',
      label: 'VERIFIED',
      detail: 'DTI credential confirmed live on the Stellar ledger.',
      sealTone: 'seal',
      sealGlyph: '✓',
    };
  }
  if (entry.status === 'Revoked' || chain === 'revoked') {
    return {
      kind: 'revoked',
      label: 'REVOKED',
      detail:
        'DTI has revoked this credential. Treat job offers from this business as suspicious.',
      sealTone: 'alarm',
      sealGlyph: '✕',
    };
  }
  return {
    kind: 'none',
    label: 'NOT VERIFIED',
    detail:
      'The registry and the live ledger disagree — the on-chain credential check did not pass.',
    sealTone: 'alarm',
    sealGlyph: '?',
  };
}

type LoadResult =
  | { ok: true; employer: string; status: CredentialStatus }
  | { ok: false; employer: string; error: string };

/** Pure fetch — never touches component state, so it's safe to call from the
 *  effect below and land results inline once it resolves. */
async function loadChainStatus(employer: string): Promise<LoadResult> {
  try {
    const info = await fetchCredentialInfo(employer);
    return { ok: true, employer, status: info.status };
  } catch (e: unknown) {
    return {
      ok: false,
      employer,
      error: e instanceof Error ? e.message : 'Live ledger check failed',
    };
  }
}

export default function ResultCard({ entry }: { entry: RegistryEntry }) {
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadChainStatus(entry.employer).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.employer]);

  // Derived instead of reset-in-effect: a stale result for a previous
  // selection simply fails this check, so the loading skeleton shows again
  // until the fresh check for the new entry lands — no synchronous setState
  // at the top of the effect.
  const current = result && result.employer === entry.employer ? result : null;
  const verdict = current && current.ok ? combine(entry, current.status) : null;

  return (
    <div aria-live="polite" className="mt-6">
      {!current && (
        <div className="h-40 animate-pulse rounded border border-rule bg-surface" />
      )}

      {current && !current.ok && (
        <p
          role="alert"
          className="rounded border border-alarm/30 bg-alarm-wash p-4 text-sm text-alarm"
        >
          {current.error}
        </p>
      )}

      {verdict && (
        <div className="relative rounded border border-rule bg-surface p-4 sm:p-8">
          <div className="pointer-events-none absolute inset-2 rounded border border-rule/70" />
          <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Seal
              key={verdict.label}
              tone={verdict.sealTone}
              center={verdict.sealGlyph}
              size={88}
              className="animate-stamp shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xl text-ink">{entry.name}</h3>
                <StatusBadge kind={verdict.kind} label={verdict.label} />
              </div>
              <p className="mt-2 text-sm text-ink-soft">{verdict.detail}</p>
              <dl className="mt-4 space-y-1">
                <div>
                  <dt className="inline font-mono text-xs uppercase tracking-wide text-ink-soft">
                    DTI cert no.{' '}
                  </dt>
                  <dd className="inline font-mono text-xs text-ink">{entry.certNo}</dd>
                </div>
                <div>
                  <dt className="font-mono text-xs uppercase tracking-wide text-ink-soft">
                    Employer address
                  </dt>
                  <dd className="break-all font-mono text-xs text-ink-soft">
                    {entry.employer}
                  </dd>
                </div>
              </dl>
              <a
                href={`https://stellar.expert/explorer/testnet/account/${entry.employer}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm text-seal underline-offset-2 hover:underline"
              >
                See the proof on Stellar Expert →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
