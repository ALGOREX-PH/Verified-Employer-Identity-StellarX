'use client';
import { useId, useState } from 'react';
import { buildApplicationXDR, byteLength } from '@/lib/credential';
import { signAndSubmit } from '@/lib/sign';

const MAX_BYTES = 64;

export default function ApplicationForm({
  publicKey,
  onDone,
}: {
  publicKey: string;
  onDone: () => void;
}) {
  const nameId = useId();
  const certId = useId();
  const nameErrorId = `${nameId}-error`;
  const certErrorId = `${certId}-error`;

  const [name, setName] = useState('');
  const [certNo, setCertNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nameBytes = byteLength(name.trim());
  const certBytes = byteLength(certNo.trim());
  const nameOk = name.trim().length > 0 && nameBytes <= MAX_BYTES;
  const certOk = certNo.trim().length > 0 && certBytes <= MAX_BYTES;
  const nameInvalid = name.length > 0 && !nameOk;
  const certInvalid = certNo.length > 0 && !certOk;

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      const xdr = await buildApplicationXDR(publicKey, name.trim(), certNo.trim());
      await signAndSubmit(xdr, publicKey);
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Application failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-rule bg-surface p-6">
      <h2 className="mb-1 font-display text-lg text-ink">Apply for verification</h2>
      <p className="mb-4 text-sm text-ink-soft">
        One signed transaction: it opens your DTICERT trustline (the application
        itself) and records your claimed business details on your account.
      </p>
      <div className="space-y-4">
        <div>
          <label htmlFor={nameId} className="mb-1 block text-sm text-ink-soft">
            Registered business name
          </label>
          <input
            id={nameId}
            type="text"
            placeholder="e.g. Acme Manpower Services"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={nameInvalid}
            aria-describedby={nameInvalid ? nameErrorId : undefined}
            className="w-full rounded border border-rule bg-surface px-3 py-2 text-ink"
          />
          {nameInvalid && (
            <p id={nameErrorId} className="mt-1 text-xs text-alarm">
              Required, max 64 bytes.
            </p>
          )}
          {name.length > 0 && (
            <p className="mt-1 font-mono text-xs text-ink-soft">{nameBytes}/64</p>
          )}
        </div>
        <div>
          <label htmlFor={certId} className="mb-1 block text-sm text-ink-soft">
            DTI certificate number
          </label>
          <input
            id={certId}
            type="text"
            placeholder="e.g. 6171234"
            value={certNo}
            onChange={(e) => setCertNo(e.target.value)}
            aria-invalid={certInvalid}
            aria-describedby={certInvalid ? certErrorId : undefined}
            className="w-full rounded border border-rule bg-surface px-3 py-2 font-mono text-ink"
          />
          {certInvalid && (
            <p id={certErrorId} className="mt-1 text-xs text-alarm">
              Required, max 64 bytes.
            </p>
          )}
          {certNo.length > 0 && (
            <p className="mt-1 font-mono text-xs text-ink-soft">{certBytes}/64</p>
          )}
        </div>
        <button
          onClick={apply}
          disabled={busy || !nameOk || !certOk}
          aria-busy={busy}
          className="w-full rounded bg-seal py-3 font-medium text-white transition-colors hover:bg-seal-deep disabled:opacity-50"
        >
          {busy ? 'Waiting for Freighter…' : 'Submit application'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded bg-alarm-wash p-3 text-sm text-alarm">
          {error}
        </p>
      )}
    </div>
  );
}
