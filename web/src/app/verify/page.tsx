'use client';
import PageShell from '@/components/PageShell';
import SetupNotice from '@/components/SetupNotice';
import VerifySearch from '@/components/verify/VerifySearch';
import { contractConfigured, issuerConfigured } from '@/lib/stellar';

export default function VerifyPage() {
  const missing = !issuerConfigured()
    ? ('issuer' as const)
    : !contractConfigured()
      ? ('contract' as const)
      : null;

  return (
    <PageShell
      title="Verify an employer"
      lede="No wallet, no account — the check runs against the public registry and the live Stellar ledger."
    >
      {missing ? <SetupNotice missing={missing} /> : <VerifySearch />}
    </PageShell>
  );
}
