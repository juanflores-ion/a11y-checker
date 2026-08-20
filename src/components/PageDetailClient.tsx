'use client';

import { useRouter } from 'next/navigation';

import { BRAND_LABEL, BRANDS, PAGE_LABEL, isFailedPage, type Brand, type PageResult } from '@/lib/model';
import { RunsHeader } from './RunsHeader';
import { ScanResultCard } from './ScanResultCard';
import { SectionHead } from './ui/SectionHead';
import { useRuns } from './RunContext';

export type PageDetailByRun = Record<
  string,
  { present: boolean; result: PageResult | null; brandPhantomPages: number }
>;

const selectClass =
  'appearance-none rounded-[7px] border border-rule bg-card py-1 pl-2 pr-6 text-xs text-ink hover:border-accent';

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
  const { currentKey } = useRuns();
  const router = useRouter();
  const entry = byRun[currentKey];

  return (
    <>
      <RunsHeader
        aside={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            <label className="flex items-center gap-1.5">
              Site
              <select className={selectClass} value={brand} onChange={(e) => router.push(`/runs/pages/${e.target.value}/${pageKey}`)}>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{BRAND_LABEL[b]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Page
              <select className={selectClass} value={pageKey} onChange={(e) => router.push(`/runs/pages/${brand}/${e.target.value}`)}>
                {allPageKeys.map((key) => (
                  <option key={key} value={key}>{PAGE_LABEL[key] ?? key}</option>
                ))}
              </select>
            </label>
          </div>
        }
      />
      <SectionHead
        chapter={false}
        title={`${BRAND_LABEL[brand]} · ${PAGE_LABEL[pageKey] ?? pageKey}`}
        note="Everything the scanner recorded for this one page, with the markup it captured."
      />

      {!entry || !entry.present || !entry.result ? (
        <p className="text-sm text-muted">This page type wasn’t part of the selected run. Pick a different run in the bar above.</p>
      ) : isFailedPage(entry.result) ? (
        <div className="text-sm">
          <p className="text-critical">Scan failed: <span className="font-mono text-xs">{entry.result.url}</span></p>
          <p className="mt-1 text-muted">{entry.result.error}. Nothing was measured here; this page contributed zero to every total, so read those totals as incomplete for this run.</p>
        </div>
      ) : (
        <ScanResultCard page={entry.result} brandPhantomPages={entry.brandPhantomPages} />
      )}
    </>
  );
}
