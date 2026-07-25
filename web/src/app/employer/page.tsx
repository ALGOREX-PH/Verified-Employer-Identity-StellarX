'use client';
import { useWallet } from '@/hooks/useWallet';
import ConnectWallet from '@/components/ConnectWallet';
import EmployerPanel from '@/components/employer/EmployerPanel';
import PageShell from '@/components/PageShell';
import SetupNotice from '@/components/SetupNotice';
import { issuerConfigured } from '@/lib/stellar';

export default function EmployerPage() {
  const wallet = useWallet();
  const { publicKey } = wallet;

  return (
    <PageShell
      title="Employer verification"
      lede="Apply once, sign once — your credential lives on the public ledger."
    >
      {!issuerConfigured() ? (
        <SetupNotice missing="issuer" />
      ) : (
        <>
          <div className="mb-6 flex justify-end">
            <ConnectWallet {...wallet} />
          </div>
          {publicKey ? (
            // key={publicKey} forces a fresh EmployerPanel (and thus a fresh
            // `loading: true` initial state) whenever the connected account
            // changes, so switching accounts shows the skeleton instead of
            // the previous account's stale status card.
            <EmployerPanel key={publicKey} publicKey={publicKey} />
          ) : (
            <div className="rounded border border-rule bg-surface py-16 text-center text-ink-soft">
              <p>
                Connect your Freighter wallet (Test Net) to apply for
                verification.
              </p>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
