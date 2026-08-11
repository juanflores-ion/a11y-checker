import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

import { Nav, RunsNav } from '@/components/Nav';
import { RunProvider, RunSummary } from '@/components/RunContext';
import { RunPicker } from '@/components/RunPicker';
import { formatRunShort, formatRunTime, loadRuns } from '@/lib/loadRuns';

export const metadata: Metadata = {
  title: 'Agent Readiness',
  description:
    'Internal tool for measuring how well AI browsing agents, screen readers and keyboard users can operate our sites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const runs = loadRuns();
  const summaries: RunSummary[] = runs.map((r) => ({
    id: r.id,
    label: r.meta.label,
    startedAt: r.meta.startedAt,
    finishedAt: r.meta.finishedAt,
    axeVersion: r.meta.axeVersion,
    display: formatRunTime(r),
    short: formatRunShort(r),
    viewports: r.viewports,
  }));

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <RunProvider runs={summaries}>
          <div className="min-h-screen">
            <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur">
              <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-2.5 sm:px-8">
                <Link href="/" className="flex shrink-0 items-center gap-2.5">
                  <Mark />
                  <span className="font-display text-[15px] font-bold tracking-tight text-ink">
                    Agent Readiness
                  </span>
                </Link>
                <Nav />
                <div className="ml-auto">
                  <RunPicker />
                </div>
              </div>
              <RunsNav />
            </header>

            <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
              {children}
            </main>
          </div>
        </RunProvider>
      </body>
    </html>
  );
}

/**
 * Three nodes, the last one faded out. The mark is the thing the product
 * measures: a row of controls where one has dropped out of the tab order.
 */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <rect x="1" y="4" width="4" height="12" rx="1.5" fill="#1F3FD8" />
      <rect x="6.5" y="4" width="4" height="12" rx="1.5" fill="#1F3FD8" opacity="0.55" />
      <rect x="12" y="4" width="4" height="12" rx="1.5" fill="#6D28D9" opacity="0.25" />
    </svg>
  );
}
