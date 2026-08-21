'use client';

import { usePathname } from 'next/navigation';

import { BRAND_LABEL, BRANDS, VIEWPORT_LABEL, type ViewportName } from '@/lib/model';
import { ENVIRONMENT_LABEL, type Environment } from '@/lib/environment';
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
/**
 * Every run names its environment, production included.
 *
 * Production used to be the unmarked case, on the reasoning that staging is
 * the exception worth flagging. In a list where the other entries all say
 * "Staging", an entry saying nothing reads as missing information rather than
 * as production: "19 Aug, 16:07 UTC" next to three labelled runs is a question,
 * not an answer. Compare runs has always named both sides; this now matches it.
 */
function runText(run: { display: string; label?: string; environment?: Environment }) {
  const env = run.environment ? `${ENVIRONMENT_LABEL[run.environment]} · ` : '';
  return run.label ? `${env}${run.display} · ${run.label}` : `${env}${run.display}`;
}

/**
 * The one strip that says what every figure below it belongs to: which run,
 * which device profile, and which site. It appears on
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
    totalRuns,
    current,
    currentId,
    setCurrentId,
    viewport,
    setViewport,
    availableViewports,
    site,
    setSite,
  } = useRuns();

  const showsData = pathname === '/' || pathname.startsWith('/runs');
  /**
   * Nothing on file at all: there is no context to state, so the strip goes.
   *
   * A site with no runs is a different case and keeps the bar. `runs` is
   * filtered to the selected site, so hiding on an empty list would take the
   * Site control away with it and strand the reader on the site that has
   * nothing — with `site` in the URL hash, a reload would strand them again.
   */
  if (!showsData || totalRuns === 0) return null;

  /**
   * The instrument stamp — which axe, which scanner build, which Chromium
   * produced these figures. It matters to whoever audits a number, not to
   * whoever reads one, so it sits behind an icon at the far right and shows
   * on hover or focus rather than taking a third of the strip.
   */
  const stamp = current
    ? [
        current.axeVersion ? `axe-core ${current.axeVersion}` : 'axe-core not recorded',
        current.probeVersion ? `scanner ${current.probeVersion}` : 'scanner not recorded',
        current.browserVersion ?? 'browser not recorded',
      ]
    : [];

  return (
    <div className="border-t border-rule bg-card/60">
      <div data-tour="context" className="mx-auto flex min-h-[38px] max-w-6xl flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-1.5 text-xs text-muted sm:px-8">
        <Field label="Run">
          {!current ? (
            <span className="font-mono text-xs text-serious">
              No run has scanned {BRAND_LABEL[site]}
            </span>
          ) : runs.length >= 2 ? (
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
              {current.environment ? (
                <span
                  className={`mr-1.5 rounded-[5px] border px-1.5 py-0.5 text-[10.5px] font-medium ${
                    current.environment === 'production'
                      ? 'border-rule bg-paper text-muted'
                      : 'border-serious/40 bg-serious/10 text-serious'
                  }`}
                >
                  {ENVIRONMENT_LABEL[current.environment]}
                </span>
              ) : null}
              {current.display}
            </span>
          )}
        </Field>

        {current ? (
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
                  {v === 'desktop' ? ' (what agents get)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate font-mono text-xs text-ink">
              {VIEWPORT_LABEL[viewport]}
              {viewport === 'desktop' ? ' (what agents get)' : ''}
            </span>
          )}
        </Field>
        ) : null}

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


        {current ? (
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
        ) : null}
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
