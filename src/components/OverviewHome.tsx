import Link from 'next/link';

import { AUDIT, severityCounts, trackedIssuesForBrand } from '@/lib/issues';
import { BRAND_LABEL, type Brand } from '@/lib/model';
import { IssueList, type IssueMetrics } from './IssueList';
import { Eyebrow } from './Primitives';

export interface SiteCard {
  brand: Brand;
  url: string;
  phantom: number;
  failing: number;
  unnamedControls: number;
  /** Insureon reads 0 here because the controls are <div>s the rule can't fire on. */
  unnamedControlsMisleading: boolean;
  unlabelledFields: number;
  pagesMissingMain: number;
  pagesScanned: number;
}

export function OverviewHome({
  sites,
  metrics,
  runLabel,
  runNote,
  viewport,
  viewportLabel,
  runCount,
}: {
  sites: SiteCard[];
  metrics: IssueMetrics;
  runLabel: string | null;
  runNote: string | null;
  viewport: { width: number; height: number; isMobile: boolean } | null;
  viewportLabel: string | null;
  runCount: number;
}) {
  return (
    <div className="space-y-12">
      <header className="max-w-measure">
        <h1 className="font-display text-[2rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-hero">
          How well can an AI agent use our sites?
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          AI assistants — ChatGPT, Gemini, Perplexity — don&apos;t look at a page, they operate
          it through the browser&apos;s list of controls. A control with no name is one they
          can&apos;t use, and the journey stops there. This measures how much of our sites they
          can actually operate.
        </p>
        {runLabel ? (
          <p className="mt-4 text-xs text-faint">
            Latest measurement of production: {runLabel}
            {runNote ? ` · ${runNote}` : ''}
            {viewportLabel ? ` · ${viewportLabel}` : ''}
            {viewport ? ` ${viewport.width}×${viewport.height}` : ''} ·{' '}
            {sites[0]?.pagesScanned ?? 0} page types per site
          </p>
        ) : (
          <p className="mt-4 text-xs text-critical">
            No scan on file yet — take one from Measure, or run the scanner CLI.
          </p>
        )}
      </header>

      <section aria-labelledby="sites">
        <h2 id="sites" className="sr-only">
          The sites we track
        </h2>
        <div className="grid gap-5 lg:grid-cols-2">
          {sites.map((site) => (
            <SiteSummary key={site.brand} site={site} />
          ))}
        </div>
      </section>

      <section aria-labelledby="issues">
        <IssueList metrics={metrics} />
      </section>

      <section aria-labelledby="do">
        <h2 id="do" className="font-display text-xl font-bold tracking-tight text-ink">
          Where to next
        </h2>
        <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
          <Action
            href="/runs"
            title="Read a measurement we already took"
            body="Scheduled scans of production, broken down by check, by page and over time. Nothing to install — the numbers are already here."
            who="Everyone"
          />
          <Action
            href="/measure"
            title="Measure a site right now"
            body="Point the scanner at any URL — production, staging, a preview build — and get the same numbers the scheduled runs produce."
            who="QA · Engineering"
          />
          <Action
            href="/compare"
            title="Check a fix actually landed"
            body="Put the current site on one side and the fixed one on the other. It diffs them check by check and tells you what resolved, what's new, and what didn't move."
            who="QA"
            highlight
          />
        </div>
      </section>

      <Footer runCount={runCount} pagesScanned={sites[0]?.pagesScanned ?? 0} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SiteSummary({ site }: { site: SiteCard }) {
  const counts = severityCounts(site.brand);
  const total = trackedIssuesForBrand(site.brand).length;

  return (
    <article className="rounded-lg border border-rule bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h3 className="font-display text-xl font-bold tracking-tight text-ink">
            {BRAND_LABEL[site.brand]}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-faint">
            {site.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </p>
        </div>
        {counts.blocking === 0 ? (
          <span className="rounded-pill border border-good/40 bg-good/[0.08] px-2.5 py-0.5 text-xs font-medium text-good">
            Nothing blocking
          </span>
        ) : (
          <span className="rounded-pill border border-critical/30 bg-critical/[0.06] px-2.5 py-0.5 text-xs font-medium text-critical">
            {counts.blocking} blocking
          </span>
        )}
      </div>

      <dl className="mt-5 space-y-2.5">
        <Row
          label="Dead controls in the closed menu"
          value={site.phantom}
          tone={site.phantom > 0 ? 'text-phantom' : 'text-good'}
        />
        <Row
          label="Controls an agent can't identify"
          value={site.unnamedControls}
          notMeasurable={site.unnamedControlsMisleading}
        />
        <Row label="Form fields with no label" value={site.unlabelledFields} />
        <Row
          label="Pages that don't mark their main content"
          value={site.pagesMissingMain}
          suffix={site.pagesScanned ? ` of ${site.pagesScanned}` : ''}
        />
        <Row label="Failing elements in total" value={site.failing} />
      </dl>

      {site.unnamedControlsMisleading ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          <span className="font-mono">†</span> Not measurable rather than clean — these
          controls are <code className="font-mono">&lt;div&gt;</code>s, so the check
          can&apos;t fire on them. They are still unnamed.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule pt-4">
        <p className="text-sm text-muted">
          {total} known issue{total === 1 ? '' : 's'} on this site
        </p>
        <p className="text-xs text-faint tnum">
          {counts.blocking} blocking · {counts.serious} serious · {counts.moderate} moderate
        </p>
      </div>
    </article>
  );
}

function Row({
  label,
  value,
  tone = 'text-ink',
  suffix = '',
  notMeasurable = false,
}: {
  label: string;
  value: number;
  tone?: string;
  suffix?: string;
  notMeasurable?: boolean;
}) {
  // A zero the scanner can't be trusted on must never render as a green pass.
  const valueTone = notMeasurable ? 'text-muted' : value === 0 ? 'text-good' : tone;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={`shrink-0 font-mono text-sm font-semibold tnum ${valueTone}`}
        title={
          notMeasurable
            ? "These controls are <div>s, so the check can't fire on them. Not measurable, not fixed."
            : undefined
        }
      >
        {value.toLocaleString()}
        {suffix ? <span className="font-normal text-faint">{suffix}</span> : null}
        {notMeasurable ? <span className="font-normal text-faint"> †</span> : null}
      </dd>
    </div>
  );
}

function Action({
  href,
  title,
  body,
  who,
  highlight = false,
}: {
  href: string;
  title: string;
  body: string;
  who: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group block p-5 transition-colors ${
        highlight ? 'bg-accent/[0.03] hover:bg-accent/[0.06]' : 'bg-card hover:bg-ink/[0.02]'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base font-bold tracking-tight text-ink">{title}</h3>
        <span
          aria-hidden="true"
          className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
        >
          →
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
      <p className="mt-2.5 text-xs text-faint">{who}</p>
    </Link>
  );
}

function Footer({ runCount, pagesScanned }: { runCount: number; pagesScanned: number }) {
  return (
    <section className="rounded-lg border border-rule bg-card p-6 shadow-card">
      <h2 className="font-display text-lg font-bold tracking-tight text-ink">
        How the measuring works
      </h2>
      <div className="mt-3 grid gap-x-8 gap-y-4 text-sm leading-relaxed text-muted sm:grid-cols-2">
        <p>
          Each page loads in a real browser and is audited with axe-core — the same engine
          behind PageSpeed Insights, so the numbers line up with what Google reports.{' '}
          {pagesScanned > 0 ? `${pagesScanned} page types per site.` : ''}
        </p>
        <p>
          Every page is measured twice, on desktop and on mobile. These sites choose their
          markup from the device before the page is even sent, so the two aren&apos;t one page
          at two widths — they&apos;re different pages that fail in different ways. Desktop is
          what an agent is served.
        </p>
        <p>
          The scanner never clicks, hovers or scrolls. The moment it opens a menu the counts
          stop being comparable between runs, and every trend line becomes meaningless.
        </p>
        <p>
          {runCount} scan{runCount === 1 ? '' : 's'} on file.{' '}
          {runCount < 2
            ? 'Take another from Measure to start seeing movement between runs.'
            : 'Runs shows how the figures moved between them.'}
        </p>
        <p>
          Counts aggregate by check and page type only. Class-name hashes change on every
          deploy, so individual elements deliberately aren&apos;t tracked. A page the server
          refuses is an explicit failure contributing zero, never a pass.
        </p>
        <p>
          The {AUDIT.total} code-level defects ({AUDIT.byBrand.insureon.total} Insureon,{' '}
          {AUDIT.byBrand.techinsurance.total} TechInsurance) come from reading both codebases
          rather than from a scan. They measure different things and are never added together;{' '}
          {AUDIT.inSharedComponents} sit in shared components, so one change clears many pages.
        </p>
        <p className="text-ink">
          <strong className="font-medium">
            A clean off-the-shelf report is not the same as done.
          </strong>{' '}
          A menu button built from a <code className="font-mono text-xs">&lt;div&gt;</code> is
          invisible to every rule engine, which is why this scanner measures the properties
          directly. Those checks are in{' '}
          <Link href="/runs/rules" className="text-accent underline underline-offset-2">
            Runs → By check
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
