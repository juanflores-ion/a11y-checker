'use client';

import { BRANDS, BRAND_LABEL, PAGE_LABEL, type Brand } from '@/lib/model';
import { SITES, stagingTwin } from '@/lib/sites';
import type { ScanTarget } from '../FullScanRunner';

/** One tracked page and the two URLs a before/after run would scan for it. */
export interface ComparePage {
  key: string;
  label: string;
  beforeUrl: string;
  afterUrl: string;
}

/**
 * The tracked pages for one site, each paired with its staging twin.
 *
 * The production side is the same target list the scheduled run measures, so
 * a before/after here is against the exact page the dashboard's figures came
 * from. A page whose brand has no staging origin is dropped rather than shown
 * half-usable.
 */
export function pagesFor(targets: ScanTarget[], site: Brand): ComparePage[] {
  const pages: ComparePage[] = [];
  for (const target of targets) {
    if (target.brand !== site) continue;
    const afterUrl = stagingTwin(site, target.url);
    if (!afterUrl) continue;
    pages.push({
      key: target.key,
      label: PAGE_LABEL[target.key] ?? target.key,
      beforeUrl: target.url,
      afterUrl,
    });
  }
  return pages;
}

/**
 * Pick the pages to compare, rather than type twenty URLs.
 *
 * QA's job after a fix reaches staging is "check the page types we track",
 * and the tool knew all twenty URLs already — it just made someone paste them
 * in two columns in the right order. So the pages are a checklist, the two
 * origins are stated once above it, and the URLs themselves stay out of the
 * form: they are derived, shown on hover, and never something to keep in sync
 * by hand.
 */
export function ComparePages({
  targets,
  site,
  onSiteChange,
  picked,
  onPickedChange,
  disabled = false,
}: {
  targets: ScanTarget[];
  site: Brand;
  onSiteChange: (site: Brand) => void;
  picked: ReadonlySet<string>;
  onPickedChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const pages = pagesFor(targets, site);
  const pickedHere = pages.filter((p) => picked.has(p.key));
  const allPicked = pages.length > 0 && pickedHere.length === pages.length;

  function toggle(key: string) {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onPickedChange(next);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-medium text-ink">Pages</span>
        <div className="flex gap-1">
          {BRANDS.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={site === b}
              disabled={disabled}
              onClick={() => onSiteChange(b)}
              className={`rounded-[6px] border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-55 ${
                site === b
                  ? 'border-accent/50 bg-accent/10 text-ink'
                  : 'border-rule bg-paper text-muted hover:border-accent/40 hover:text-ink'
              }`}
            >
              {BRAND_LABEL[b]}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled || pages.length === 0}
          onClick={() => {
            const next = new Set(picked);
            if (allPicked) pages.forEach((p) => next.delete(p.key));
            else pages.forEach((p) => next.add(p.key));
            onPickedChange(next);
          }}
          className="text-[11px] text-muted underline decoration-rule underline-offset-2 hover:text-accent disabled:opacity-55"
        >
          {allPicked ? 'Clear' : `All ${pages.length}`}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {pages.map((page) => {
          const on = picked.has(page.key);
          return (
            <label
              key={page.key}
              title={`Before: ${page.beforeUrl}\nAfter: ${page.afterUrl}`}
              className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
            >
              <input
                type="checkbox"
                className="peer sr-only"
                checked={on}
                disabled={disabled}
                onChange={() => toggle(page.key)}
              />
              <span
                className={`inline-block rounded-[6px] border px-2 py-1 text-[11.5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60 ${
                  on
                    ? 'border-accent/50 bg-accent/10 text-ink'
                    : 'border-rule bg-paper text-muted hover:border-accent/40 hover:text-ink'
                } ${disabled ? 'opacity-55' : ''}`}
              >
                {page.label}
              </span>
            </label>
          );
        })}
      </div>

      {/* Named rather than arrowed: this line says which origin each side of
          the comparison comes from, and it is the whole explanation of what a
          picked page turns into. */}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        <span className="text-faint">Before</span>{' '}
        <span className="font-mono text-[11px] text-muted">{SITES[site].host}</span>
        <span className="mx-1.5 text-faint">·</span>
        <span className="text-faint">After</span>{' '}
        <span className="font-mono text-[11px] text-muted">
          {SITES[site].staging ? new URL(SITES[site].staging as string).host : 'no staging origin'}
        </span>
        <span className="mx-1.5 text-faint">·</span>
        {pickedHere.length === 0
          ? 'nothing picked yet'
          : `${pickedHere.length} page${pickedHere.length === 1 ? '' : 's'}, ${pickedHere.length * 2} URLs to scan`}
      </p>
    </div>
  );
}
