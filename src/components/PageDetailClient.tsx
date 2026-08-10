'use client';

import Link from 'next/link';

import { BRAND_LABEL, BRANDS, PAGE_LABEL, isFailedPage, type Brand, type PageResult } from '@/lib/model';
import { ScanResultCard } from './ScanResultCard';
import { Eyebrow, Notice } from './Primitives';
import { useRuns } from './RunContext';

export type PageDetailByRun = Record<
  string,
  { present: boolean; result: PageResult | null; brandPhantomPages: number }
>;

export function PageDetailClient({
  brand,
  pageKey,
  byRun,
  allPageKeys,
}: {
  brand: Brand;
  pageKey: string;
  byRun: PageDetailByRun;
  allPageKeys: string[];
}) {
  const { currentId, current } = useRuns();
  const entry = byRun[currentId];

  return (
    <div className="space-y-6">
      <PageSwitcher brand={brand} pageKey={pageKey} allPageKeys={allPageKeys} />

      <div>
        <Eyebrow>{BRAND_LABEL[brand]}</Eyebrow>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
          {PAGE_LABEL[pageKey] ?? pageKey}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {current?.display}
          {current?.label ? ` · ${current.label}` : ''}
        </p>
      </div>

      {!entry || !entry.present || !entry.result ? (
        <Notice tone="neutral" title="Not in this run">
          This page type wasn&apos;t part of the selected scan. Pick a different run, or rerun the
          scanner to include it.
        </Notice>
      ) : isFailedPage(entry.result) ? (
        <Notice tone="error" title="Scan failed">
          <p className="font-mono text-xs break-all">{entry.result.url}</p>
          <p className="mt-2">{entry.result.error}</p>
          <p className="mt-2 text-muted">
            Nothing was measured here. This is not a pass — the page contributed zero to every
            total on every other view, so read those totals as incomplete for this run.
          </p>
        </Notice>
      ) : (
        <ScanResultCard page={entry.result} brandPhantomPages={entry.brandPhantomPages} />
      )}
    </div>
  );
}

function PageSwitcher({
  brand,
  pageKey,
  allPageKeys,
}: {
  brand: Brand;
  pageKey: string;
  allPageKeys: string[];
}) {
  return (
    <div className="space-y-2 border-b border-rule pb-4">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-2 text-eyebrow font-medium text-muted">Brand</span>
        {BRANDS.map((b) => (
          <Link
            key={b}
            href={`/runs/pages/${b}/${pageKey}`}
            aria-current={b === brand ? 'page' : undefined}
            className={`rounded-card px-2.5 py-1 text-eyebrow font-medium ${
              b === brand ? 'bg-ink text-paper' : 'text-muted hover:bg-ink/5'
            }`}
          >
            {BRAND_LABEL[b]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-2 text-eyebrow font-medium text-muted">Page</span>
        {allPageKeys.map((key) => (
          <Link
            key={key}
            href={`/runs/pages/${brand}/${key}`}
            aria-current={key === pageKey ? 'page' : undefined}
            className={`rounded-card px-2.5 py-1 text-eyebrow font-medium ${
              key === pageKey ? 'bg-accent text-paper' : 'text-muted hover:bg-ink/5'
            }`}
          >
            {key}
          </Link>
        ))}
      </div>
    </div>
  );
}
