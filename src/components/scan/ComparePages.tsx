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

/** The path a row will scan on both origins — the host is stated once, above. */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/**
 * Pick the pages to compare, rather than type twenty URLs.
 *
 * A checklist, because that is what the job is: QA ticks the page types they
 * want checked and the tool supplies both URLs. The first pass at this used
 * chips, which read as filters rather than as a selection — the row, the
 * checkbox and the path make it obvious what is about to be scanned. The
 * URLs themselves stay out of the form: they are derived from the tracked
 * targets and the site's staging origin, never kept in sync by hand.
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
  const staging = SITES[site].staging;

  function toggle(key: string) {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onPickedChange(next);
  }

  function toggleAll() {
    const next = new Set(picked);
    if (allPicked) pages.forEach((p) => next.delete(p.key));
    else pages.forEach((p) => next.add(p.key));
    onPickedChange(next);
  }

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">Pages to compare</legend>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span aria-hidden="true" className="text-xs font-medium text-ink">Pages to compare</span>
        <div className="flex gap-1" role="group" aria-label="Site">
          {BRANDS.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={site === b}
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
      </div>

      <div className="overflow-hidden rounded-card border border-rule">
        {/* Header: the select-all, and the two origins every row below is
            scanned against — stated once so the rows can be paths. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule bg-paper/60 px-3 py-2">
          <label className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <Checkbox
              checked={allPicked}
              indeterminate={pickedHere.length > 0 && !allPicked}
              onChange={toggleAll}
              aria-label={allPicked ? 'Clear all pages' : 'Select all pages'}
            />
            All {pages.length} pages
          </label>
          <span className="ml-auto text-[11px] text-muted">
            {pickedHere.length === 0
              ? 'nothing picked yet'
              : `${pickedHere.length} picked · ${pickedHere.length * 2} URLs to scan`}
          </span>
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-x-3 border-b border-rule px-3 py-1.5 text-[10.5px] uppercase tracking-[0.05em] text-faint">
          <span className="w-[11.75rem]">Page</span>
          <span className="truncate">
            Before <span className="font-mono normal-case tracking-normal text-muted">{SITES[site].host}</span>
            <span className="mx-1.5">·</span>
            After{' '}
            <span className="font-mono normal-case tracking-normal text-muted">
              {staging ? new URL(staging).host : 'no staging origin'}
            </span>
          </span>
        </div>

        <ul>
          {pages.map((page) => {
            const on = picked.has(page.key);
            return (
              <li key={page.key} className="border-b border-rule/60 last:border-b-0">
                <label
                  className={`grid grid-cols-[auto_1fr] items-center gap-x-3 px-3 py-1.5 transition-colors ${
                    disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-white/[0.03]'
                  } ${on ? 'bg-accent/[0.05]' : ''}`}
                >
                  <span className="flex w-[11.75rem] items-center gap-2">
                    <Checkbox checked={on} onChange={() => toggle(page.key)} />
                    <span className={`text-[12.5px] ${on ? 'text-ink' : 'text-muted'}`}>{page.label}</span>
                  </span>
                  <span
                    title={`Before: ${page.beforeUrl}\nAfter: ${page.afterUrl}`}
                    className={`truncate font-mono text-[11px] ${on ? 'text-muted' : 'text-faint'}`}
                  >
                    {pathOf(page.beforeUrl)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </fieldset>
  );
}

/** A real checkbox, tinted to the theme, with the tri-state the header needs. */
function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  ...rest
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      className="h-3.5 w-3.5 shrink-0 accent-accent"
      {...rest}
    />
  );
}
