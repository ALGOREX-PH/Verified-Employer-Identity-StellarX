'use client';
import { useState } from 'react';
import type { WalletState } from '@/hooks/useWallet';

export default function ConnectWallet({
  publicKey,
  connecting,
  error,
  connect,
  disconnect,
}: WalletState) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!publicKey) return;
    await navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (publicKey) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={copy}
          title="Copy full address"
          className="rounded border border-rule bg-paper px-3 py-1 font-mono text-sm text-ink transition-colors hover:bg-seal-wash"
        >
          {copied ? 'Copied!' : `${publicKey.slice(0, 6)}…${publicKey.slice(-6)}`}
        </button>
        <button onClick={disconnect} className="text-sm text-alarm hover:underline">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="text-right">
      <button
        onClick={connect}
        disabled={connecting}
        className="rounded bg-seal px-4 py-2 text-white transition-colors hover:bg-seal-deep disabled:opacity-50"
      >
        {connecting ? 'Connecting…' : 'Connect Freighter'}
      </button>
      {error && <p className="mt-2 max-w-xs text-sm text-alarm">{error}</p>}
    </div>
  );
}
