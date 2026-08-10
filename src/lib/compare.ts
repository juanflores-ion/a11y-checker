/**
 * Before/after diffing for Compare mode — the QA workflow of "here's prod,
 * here's staging after my fix, what actually changed."
 *
 * Pure and side-effect free on purpose: it takes two already-fetched
 * PageResults and produces a comparison, nothing more. No fetching, no
 * server calls, so it's cheap to unit test and cheap to reuse anywhere a
 * before/after view is useful later.
 */
import { isFailedPage, type PageResult, type ScannedPage } from './model';

export type RuleDiffStatus = 'resolved' | 'new' | 'improved' | 'worsened' | 'unchanged';

export interface RuleDiffRow {
  id: string;
  before: number;
  after: number;
  change: number;
  status: RuleDiffStatus;
}

export interface PageDiff {
  beforeUrl: string;
  afterUrl: string;
  before: PageResult | null;
  after: PageResult | null;
  /** Rules with any presence on either side, resolved/new first. */
  rules: RuleDiffRow[];
  totalBefore: number;
  totalAfter: number;
  totalChange: number;
  phantomBefore: number;
  phantomAfter: number;
  resolvedCount: number;
  newCount: number;
}

function scannedOrNull(page: PageResult | null): ScannedPage | null {
  if (!page || isFailedPage(page)) return null;
  return page;
}

function totalNodes(page: ScannedPage | null): number {
  if (!page) return 0;
  return (page.violations ?? []).reduce((sum, v) => sum + v.n, 0);
}

function ruleCounts(page: ScannedPage | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of page?.violations ?? []) counts[v.id] = (counts[v.id] ?? 0) + v.n;
  return counts;
}

function classify(before: number, after: number): RuleDiffStatus {
  if (before > 0 && after === 0) return 'resolved';
  if (before === 0 && after > 0) return 'new';
  if (after < before) return 'improved';
  if (after > before) return 'worsened';
  return 'unchanged';
}

const STATUS_ORDER: Record<RuleDiffStatus, number> = {
  resolved: 0,
  new: 1,
  worsened: 2,
  improved: 3,
  unchanged: 4,
};

/**
 * Compare one URL's before-scan to its after-scan. Either side can be a
 * failed scan or missing entirely (still queued, request cap hit) — the
 * result degrades gracefully rather than throwing, since a QA workflow will
 * hit this mid-deploy when one side isn't ready yet.
 */
export function diffPages(
  beforeUrl: string,
  afterUrl: string,
  before: PageResult | null,
  after: PageResult | null
): PageDiff {
  const beforePage = scannedOrNull(before);
  const afterPage = scannedOrNull(after);

  const beforeCounts = ruleCounts(beforePage);
  const afterCounts = ruleCounts(afterPage);
  const ids = new Set([...Object.keys(beforeCounts), ...Object.keys(afterCounts)]);

  const rules: RuleDiffRow[] = [...ids]
    .map((id) => {
      const b = beforeCounts[id] ?? 0;
      const a = afterCounts[id] ?? 0;
      return { id, before: b, after: a, change: a - b, status: classify(b, a) };
    })
    .sort(
      (x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || y.before - x.before
    );

  return {
    beforeUrl,
    afterUrl,
    before,
    after,
    rules,
    totalBefore: totalNodes(beforePage),
    totalAfter: totalNodes(afterPage),
    totalChange: totalNodes(afterPage) - totalNodes(beforePage),
    phantomBefore: beforePage?.phantomMenu?.focusable ?? 0,
    phantomAfter: afterPage?.phantomMenu?.focusable ?? 0,
    resolvedCount: rules.filter((r) => r.status === 'resolved').length,
    newCount: rules.filter((r) => r.status === 'new').length,
  };
}

/**
 * Pair two line-delimited URL lists positionally (line 1 with line 1, and
 * so on) rather than trying to guess which staging URL corresponds to which
 * prod URL. Uneven lists still pair as far as they can and leave the rest
 * one-sided — better than silently dropping a URL someone typed.
 */
export function pairUrls(beforeUrls: string[], afterUrls: string[]): Array<{
  beforeUrl: string | null;
  afterUrl: string | null;
}> {
  const length = Math.max(beforeUrls.length, afterUrls.length);
  return Array.from({ length }, (_, i) => ({
    beforeUrl: beforeUrls[i] ?? null,
    afterUrl: afterUrls[i] ?? null,
  }));
}
