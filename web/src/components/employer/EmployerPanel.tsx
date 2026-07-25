'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchCredentialInfo, type CredentialInfo } from '@/lib/credential';
import FundAccount from '@/components/FundAccount';
import Seal from '@/components/Seal';
import StatusBadge from '@/components/StatusBadge';
import ApplicationForm from '@/components/employer/ApplicationForm';

type LoadResult =
  | { ok: true; info: CredentialInfo }
  | { ok: false; error: string };

/** Pure fetch — never touches component state, so it's safe to call from
 *  both the mount effect and the refresh handler below. */
async function loadCredentialInfo(publicKey: string): Promise<LoadResult> {
  try {
    return { ok: true, info: await fetchCredentialInfo(publicKey) };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to load credential status',
    };
  }
}

export default function EmployerPanel({ publicKey }: { publicKey: string }) {
  const [info, setInfo] = useState<CredentialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Inline, self-contained effect body (no reference to an externally
  // defined setState-calling function) — keeps this clear of the
  // set-state-in-effect rule while still being a plain "fetch on mount".
  useEffect(() => {
    let cancelled = false;
    loadCredentialInfo(publicKey).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setInfo(result.info);
        setError('');
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadCredentialInfo(publicKey);
    if (result.ok) {
      setInfo(result.info);
      setError('');
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [publicKey]);

  return (
    <div aria-live="polite" className="space-y-4">
      {loading && <div className="h-32 animate-pulse rounded bg-rule/50" />}

      {!loading && (error || !info) && (
        <div>
          <p role="alert" className="text-sm text-alarm">
            {error || 'Failed to load status.'}
          </p>
          <button
            onClick={refresh}
            className="mt-2 text-sm text-ink-soft underline hover:text-ink"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && info && (
        <>
          {info.status === 'unfunded' && (
            <div className="rounded border border-goldleaf/30 bg-gold-wash p-4">
              <h2 className="font-display text-lg text-goldleaf">Fund your account</h2>
              <p className="mt-2 text-sm text-ink-soft">
                This account isn&rsquo;t funded on testnet yet — fund it first (the
                application transaction needs XLM for fees and the trustline).
              </p>
              <div className="mt-3">
                <FundAccount publicKey={publicKey} onFunded={refresh} />
              </div>
            </div>
          )}

          {info.status === 'none' && (
            <ApplicationForm publicKey={publicKey} onDone={refresh} />
          )}

          {info.status === 'pending' && (
            <div className="rounded border border-goldleaf/30 bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg text-ink">Application submitted</h2>
                <StatusBadge kind="pending" />
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                DTI is reviewing your application. Your trustline to DTICERT is on
                the ledger — once authorized, your credential goes live.
              </p>
              <Claim info={info} />
            </div>
          )}

          {info.status === 'verified' && (
            <div className="relative rounded border border-seal/40 bg-surface p-6">
              <div className="pointer-events-none absolute inset-2 rounded border border-seal/20" />
              <div className="relative flex flex-col items-start gap-4 sm:flex-row">
                <Seal size={88} className="animate-stamp shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-lg text-ink">You are verified</h2>
                    <StatusBadge kind="verified" />
                  </div>
                  <p className="mt-2 text-sm text-ink-soft">
                    Your account holds 1 DTICERT, issued and authorized by DTI.
                    Share your address on job postings so applicants can verify
                    you.
                  </p>
                  <Claim info={info} />
                  <a
                    href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block font-mono text-sm text-seal hover:underline"
                  >
                    View your credential on Stellar Expert →
                  </a>
                </div>
              </div>
            </div>
          )}

          {info.status === 'revoked' && (
            <div className="rounded border border-alarm/30 bg-alarm-wash p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg text-ink">Credential revoked</h2>
                <StatusBadge kind="revoked" />
              </div>
              <p className="mt-2 text-sm text-alarm">
                DTI has frozen this credential. Contact DTI to resolve your case
                — re-approval reinstates the same credential.
              </p>
              <Claim info={info} />
            </div>
          )}

          <button
            onClick={refresh}
            className="text-sm text-ink-soft underline hover:text-ink"
          >
            Refresh status
          </button>
        </>
      )}
    </div>
  );
}

function Claim({ info }: { info: CredentialInfo }) {
  if (!info.name && !info.certNo) return null;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
      <div>
        <dt className="font-mono text-xs uppercase tracking-wide text-ink-soft">
          Business name
        </dt>
        <dd className="text-ink">{info.name || '—'}</dd>
      </div>
      <div>
        <dt className="font-mono text-xs uppercase tracking-wide text-ink-soft">
          DTI cert no.
        </dt>
        <dd className="font-mono text-ink">{info.certNo || '—'}</dd>
      </div>
    </dl>
  );
}
