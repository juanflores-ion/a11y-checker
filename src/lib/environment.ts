import { SITES } from './sites';
import type { BrandResults, PageResult } from './model';

/**
 * Which deployment a run measured.
 *
 * A before/after between production and staging cannot tell a fix from a
 * difference between the two environments, and on 18 Aug 2026 that bit: with
 * nothing deployed, a prod-vs-staging comparison of Insureon's home page
 * reported `label 2 → 0` and `label-title-only 2 → 0` as **resolved**. They
 * were not fixed; cd-preview simply serves different content. Two other pages
 * in the same export were identical on both sides, so the gap is not even a
 * constant that could be subtracted.
 *
 * The fix is to compare like with like — staging against staging, production
 * against production — which first requires every run to know which one it
 * measured. `mixed` is a real answer and never gets collapsed into either.
 */
export type Environment = 'production' | 'staging' | 'mixed' | 'unknown';

export const ENVIRONMENT_LABEL: Record<Environment, string> = {
  production: 'Production',
  staging: 'Staging',
  mixed: 'Mixed',
  unknown: 'Unknown',
};

/** Host → environment, for the sites this tool tracks. */
export function environmentOfUrl(url: string): Environment {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  for (const site of Object.values(SITES)) {
    if (host === site.host.toLowerCase()) return 'production';
    // www-less and www forms of the same production host
    if (host === site.host.replace(/^www\./, '').toLowerCase()) return 'production';
    if (site.staging && host === new URL(site.staging).hostname.toLowerCase()) return 'staging';
  }
  return 'unknown';
}

/**
 * The environment a set of scanned pages belongs to.
 *
 * Derived from the URLs the run actually recorded, never from a field the
 * writer supplied: a claim in `meta` can drift from what was scanned, and this
 * is the value that decides whether two runs may be compared at all.
 */
export function environmentOfPages(pages: Iterable<PageResult>): Environment {
  const seen = new Set<Environment>();
  for (const page of pages) {
    if (!page?.url) continue;
    seen.add(environmentOfUrl(page.url));
  }
  seen.delete('unknown');
  if (seen.size === 0) return 'unknown';
  if (seen.size > 1) return 'mixed';
  return [...seen][0];
}

/** The environment of a whole run, across every brand and viewport it holds. */
export function environmentOfRun(byViewport: Partial<Record<string, BrandResults>>): Environment {
  const pages: PageResult[] = [];
  for (const brands of Object.values(byViewport)) {
    if (!brands) continue;
    for (const results of Object.values(brands) as Array<Record<string, PageResult>>) {
      pages.push(...Object.values(results ?? {}));
    }
  }
  return environmentOfPages(pages);
}
