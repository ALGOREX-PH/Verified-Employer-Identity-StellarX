import type { Metadata } from 'next';
import Link from 'next/link';
import { Libre_Caslon_Text, Public_Sans, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';

const caslon = Libre_Caslon_Text({
  variable: '--font-caslon',
  subsets: ['latin'],
  weight: ['400', '700'],
});

const publicSans = Public_Sans({
  variable: '--font-public',
  subsets: ['latin'],
});

const splineMono = Spline_Sans_Mono({
  variable: '--font-spline-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Lehitimo — Verified Employer Identity',
  description:
    'Security-paper styled, on-chain employer verification for job seekers — DTI-issued credentials on Stellar testnet.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${caslon.variable} ${publicSans.variable} ${splineMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:text-ink focus:shadow"
        >
          Skip to content
        </a>
        <nav className="border-b border-rule bg-surface">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 font-display text-base text-ink sm:text-lg"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
                <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-seal)" strokeWidth="2" />
                <path
                  d="M7.5 12.5l3 3 6-6.5"
                  fill="none"
                  stroke="var(--color-seal)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Lehitimo
            </Link>
            <div className="flex items-center gap-2.5 text-sm text-ink-soft sm:gap-4">
              <Link href="/employer" className="hover:text-seal">
                Employers
              </Link>
              <Link href="/verify" className="hover:text-seal">
                Verify
              </Link>
              <Link href="/dti" className="hover:text-seal">
                DTI Portal
              </Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
