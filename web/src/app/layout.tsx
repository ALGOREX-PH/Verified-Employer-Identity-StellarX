import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lehitimo — Verified Employer Identity",
  description:
    "Check before you apply: DTI-verified employer credentials on Stellar testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-bold text-indigo-700">
              Lehitimo
            </Link>
            <div className="flex gap-4 text-sm text-gray-600">
              <Link href="/employer" className="hover:text-indigo-700">
                Employers
              </Link>
              <Link href="/verify" className="hover:text-indigo-700">
                Verify
              </Link>
              <Link href="/dti" className="hover:text-indigo-700">
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
