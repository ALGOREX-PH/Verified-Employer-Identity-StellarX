import Link from 'next/link';

const ROLES = [
  {
    href: '/employer',
    title: 'For Employers',
    desc: 'Apply for your DTI verification credential — one wallet signature.',
    cta: 'Get verified',
  },
  {
    href: '/verify',
    title: 'For Job Applicants',
    desc: 'Search a business by name and see live, on-chain proof it is legitimate.',
    cta: 'Check an employer',
  },
  {
    href: '/dti',
    title: 'DTI Portal',
    desc: 'Review applications, issue credentials, revoke scammers instantly.',
    cta: 'Open portal',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-indigo-700">Lehitimo</h1>
          <p className="mt-3 text-lg text-gray-700">Check before you apply.</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
            Job scams are rampant. Lehitimo gives DTI-certified businesses an
            on-chain credential any applicant can verify in seconds — live on
            the Stellar ledger, revocable the moment a scam is found.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <h2 className="font-semibold text-gray-900">{r.title}</h2>
              <p className="mt-1 text-sm text-gray-600">{r.desc}</p>
              <p className="mt-3 text-sm font-medium text-indigo-600">{r.cta} →</p>
            </Link>
          ))}
        </div>

        <ol className="mt-12 grid gap-4 text-sm text-gray-600 sm:grid-cols-3">
          <li className="rounded border border-gray-200 bg-white p-4">
            <span className="font-semibold text-gray-900">1 · Apply</span>
            <br />
            An employer&rsquo;s trustline to the DTICERT asset is the application
            itself.
          </li>
          <li className="rounded border border-gray-200 bg-white p-4">
            <span className="font-semibold text-gray-900">2 · Approve</span>
            <br />
            DTI authorizes the trustline and issues 1 DTICERT — the credential.
          </li>
          <li className="rounded border border-gray-200 bg-white p-4">
            <span className="font-semibold text-gray-900">3 · Verify</span>
            <br />
            Applicants check the live ledger — revoked means the badge dies
            instantly.
          </li>
        </ol>

        <footer className="mt-12 text-center text-xs text-gray-400">
          Stellar testnet · built on the StellarX workshop scaffold
        </footer>
      </div>
    </main>
  );
}
