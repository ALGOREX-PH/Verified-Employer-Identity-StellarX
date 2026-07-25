'use client';
import PageShell from '@/components/PageShell';
import SetupNotice from '@/components/SetupNotice';
import ApplicationsTable from '@/components/dti/ApplicationsTable';
import { contractConfigured, issuerConfigured } from '@/lib/stellar';

export default function DtiPage() {
  const missing = !issuerConfigured()
    ? ('issuer' as const)
    : !contractConfigured()
      ? ('contract' as const)
      : null;

  return (
    <PageShell
      title="DTI Portal"
      lede="Applications appear the moment an employer opens a DTICERT trustline."
    >
      {missing ? (
        <SetupNotice missing={missing} />
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-soft">
            Applications appear here the moment an employer opens a DTICERT
            trustline. Approving authorizes the trustline, issues the
            credential, and lists the business in the public registry.
          </p>
          <ApplicationsTable />
          <p className="mt-6 text-xs text-ink-soft">
            Demo build: this portal is unauthenticated and signs with a
            testnet issuer key on the server. A real deployment would sit
            behind DTI staff authentication.
          </p>
        </>
      )}
    </PageShell>
  );
}
