import Link from 'next/link';
import Seal from '@/components/Seal';

const ROLES = [
  {
    href: '/employer',
    eyebrow: 'FOR EMPLOYERS',
    desc: 'Apply for your DTI verification credential with one wallet signature.',
    cta: 'Get verified →',
  },
  {
    href: '/verify',
    eyebrow: 'FOR APPLICANTS',
    desc: 'Search a business by name and see live, on-chain proof it is legitimate.',
    cta: 'Check an employer →',
  },
  {
    href: '/dti',
    eyebrow: 'FOR DTI OFFICERS',
    desc: 'Review applications, issue credentials, revoke scammers instantly.',
    cta: 'Open the portal →',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Apply',
    desc: 'One signed transaction — the trustline IS the application.',
  },
  {
    n: '2',
    title: 'Approve',
    desc: 'DTI authorizes the trustline and issues 1 DTICERT.',
  },
  {
    n: '3',
    title: 'Verify',
    desc: 'Anyone checks the live ledger — revocation is instant.',
  },
];

export default function Home() {
  return (
    <main id="main" className="w-full bg-paper">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <section className="relative overflow-x-clip rounded border border-rule bg-surface px-6 py-10 sm:px-10 sm:py-14">
          <div className="pointer-events-none absolute inset-3 rounded border border-rule/70 sm:inset-4" />

          <div className="absolute -right-4 -top-8 hidden sm:block">
            <Seal size={112} className="animate-stamp" />
          </div>

          <div className="relative text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-soft">
              Stellar testnet · workshop build
            </p>
            <h1 className="mt-4 font-display text-5xl font-normal text-ink sm:text-6xl">
              Lehitimo
            </h1>
            <p className="mt-3 text-lg text-ink">Check before you apply.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-ink-soft">
              Job scams are rampant. Lehitimo gives DTI-certified businesses an
              on-chain credential any applicant can verify in seconds — live on
              the Stellar ledger, revocable the moment a scam is found.
            </p>
          </div>
        </section>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded border border-rule bg-surface p-5 transition-all hover:border-seal hover:shadow-md"
            >
              <p className="font-mono text-xs uppercase tracking-wide text-ink-soft">
                {r.eyebrow}
              </p>
              <p className="mt-2 text-sm text-ink">{r.desc}</p>
              <p className="mt-4 text-sm font-medium text-seal">{r.cta}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 divide-y divide-rule border-y border-rule sm:grid sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-4 py-5 sm:px-5 sm:py-6">
              <span className="font-display text-3xl text-seal">{s.n}</span>
              <div>
                <p className="font-semibold text-ink">{s.title}</p>
                <p className="mt-1 text-sm text-ink-soft">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <footer className="mt-12 text-center text-xs text-ink-soft">
          Built on the StellarX workshop scaffold · demo only — not affiliated
          with the Department of Trade and Industry
        </footer>
      </div>
    </main>
  );
}
