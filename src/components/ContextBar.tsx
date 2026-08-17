'use client';

import { usePathname } from 'next/navigation';

import { BRAND_LABEL, BRANDS, VIEWPORT_LABEL, type ViewportName } from '@/lib/model';
import { useRuns, type SiteSelection } from './RunContext';

const selectClass =
  'appearance-none rounded-[7px] border border-rule bg-card py-[3px] pl-2 pr-6 font-mono text-xs text-ink ' +
  'hover:border-accent focus-visible:border-accent max-w-[18rem] truncate';

/**
 * The picker needs the label — it is what tells two runs apart. The bar does
 * not: with one run on file it is a note to nobody, sitting in the strip that
 * is supposed to say briefly which measurement is on screen. So the label
 * shows where you choose a run, and hovers on the plain-text case.
 */
function runText(run: { display: string; label?: string }) {
  return run.label ? `${run.display} — ${run.label}` : run.display;
}

/**
 * The one strip that says what every figure below it belongs to: which run,
 * which device profile, and what it is being compared against. It appears on
 * every page that shows measured data and nowhere else — Scan measures whatever
 * you type, and How it works has no figures to select.
 *
 * Each control renders as plain text when there is nothing to choose, so a
 * one-run, one-profile deployment still states its context instead of showing
 * a select with a single option.
 */
export function ContextBar() {
  const pathname = usePathname() ?? '/';
  const {
    runs,
    current,
    currentId,
    compareId,
    setCurrentId,
    setCompareId,
    viewport,
    setViewport,
    availableViewports,
    compareMissingViewport,
    site,
    setSite,
  } = useRuns();

  const showsData = pathname === '/' || pathname.startsWith('/runs');
  if (!showsData || !current) return null;

  /**
   * The instrument stamp — which axe, which scanner build, which Chromium
   * produced these figures. It matters to whoever audits a number, not to
   * whoever reads one, so it sits behind an icon at the far right and shows
   * on hover or focus rather than taking a third of the strip.
   */
  const stamp = [
    current.axeVersion ? `axe-core ${current.axeVersion}` : 'axe-core not recorded',
    current.probeVersion ? `scanner ${current.probeVersion}` : 'scanner not recorded',
    current.browserVersion ?? 'browser not recorded',
  ];

  return (
    <div className="border-t border-rule bg-card/60">
      <div className="mx-auto flex min-h-[38px] max-w-6xl flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-1.5 text-xs text-muted sm:px-8">
        <Field label="Run">
          {runs.length >= 2 ? (
            <select
              aria-label="Run"
              className={selectClass}
              value={currentId}
              onChange={(e) => setCurrentId(e.target.value)}
            >
              {[...runs].reverse().map((r) => (
                <option key={r.id} value={r.id}>
                  {runText(r)}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate font-mono text-xs text-ink" title={current.label ?? undefined}>
              {current.display}
            </span>
          )}
        </Field>

        <Field label="Device">
          {availableViewports.length >= 2 ? (
            <select
              aria-label="Device profile"
              className={selectClass}
              value={viewport}
              onChange={(e) => setViewport(e.target.value as ViewportName)}
            >
              {availableViewports.map((v) => (
                <option key={v} value={v}>
                  {VIEWPORT_LABEL[v]}
                  {v === 'desktop' ? ' — what agents get' : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate font-mono text-xs text-ink">
              {VIEWPORT_LABEL[viewport]}
              {viewport === 'desktop' ? ' — what agents get' : ''}
            </span>
          )}
        </Field>

        <Field label="Site">
          <select
            aria-label="Site"
            className={selectClass}
            value={site}
            onChange={(e) => setSite(e.target.value as SiteSelection)}
          >
            {BRANDS.map((b) => (
              <option key={b} value={b}>
                {BRAND_LABEL[b]}
              </option>
            ))}
          </select>
        </Field>

        {runs.length >= 2 ? (
          <Field label="Compare to">
            <select
              aria-label="Compare to"
              className={selectClass}
              value={compareId ?? 'none'}
              onChange={(e) => setCompareId(e.target.value === 'none' ? null : e.target.value)}
            >
              <option value="none">—</option>
              {[...runs]
                .reverse()
                .filter((r) => r.id !== currentId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {runText(r)}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}

        {compareMissingViewport ? (
          <span role="status" className="text-critical">
            No deltas — that run never measured {VIEWPORT_LABEL[viewport].toLowerCase()}
          </span>
        ) : null}

        <span className="group relative ml-auto flex items-center">
          <button
            type="button"
            aria-label={`Measured with ${stamp.join(', ')}`}
            className="rounded-full p-1 text-faint transition-colors hover:text-ink focus-visible:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 6.2v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="7" cy="4" r="0.8" fill="currentColor" />
            </svg>
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 hidden w-max rounded-card border border-rule bg-card px-3 py-2 font-mono text-[11px] leading-relaxed text-muted shadow-pop group-hover:block group-focus-within:block"
          >
            <span className="mb-0.5 block font-sans text-[10.5px] uppercase tracking-[0.06em] text-faint">Measured with</span>
            {stamp.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}

/** A caption and its value. The selects carry their own aria-label, so this is a span, not a label — half the time the value is plain text. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0">{label}</span>
      {children}
    </span>
  );
}
