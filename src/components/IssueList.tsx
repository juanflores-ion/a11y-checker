'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { ResolvedMetric } from '@/lib/aggregate';
import { ISSUES, SEVERITY_BLURB, SEVERITY_LABEL, sortIssues, type Issue } from '@/lib/issues';
import { BRAND_LABEL, BRANDS, type Brand } from '@/lib/model';
import { CodeSample, DetectionTag, Eyebrow, SeverityBadge } from './Primitives';

/** issue id -> brand -> the figures that issue quotes, resolved from the run. */
export type IssueMetrics = Record<string, Record<string, ResolvedMetric[]>>;

/**
 * The issue list, as a section of Overview rather than a page of its own.
 *
 * It had its own tab until the scanner learned to measure what only prose
 * could describe before. Now that every figure it quotes is also in Runs, what
 * remains here is the part Runs genuinely can't carry: which defects a single
 * count is actually made of, why they cost something, and what would fix them.
 * That is a section, not a destination.
 *
 * Carries no notion of whether anything has been fixed — that was tried and
 * removed. Whether a fix landed is answered by measuring staging, not by an
 * assertion stored in a file. See Compare.
 */
export function IssueList({ metrics }: { metrics: IssueMetrics }) {
  const [site, setSite] = useState<Brand | 'both'>('both');
  const [openId, setOpenId] = useState<string | null>(null);

  const { tracked, parked } = useMemo(() => {
    const sorted = sortIssues(ISSUES);
    return {
      tracked: sorted.filter((i) => i.inScope),
      parked: sorted.filter((i) => !i.inScope),
    };
  }, []);

  const visible = site === 'both' ? tracked : tracked.filter((i) => i.brands.includes(site));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id="issues" className="font-display text-xl font-bold tracking-tight text-ink">
            What&apos;s wrong, and what would fix it
          </h2>
          <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">
            {tracked.length} problems behind the numbers above, hardest-blocking first. Open any
            one for what an agent actually runs into and what it would take to fix.
          </p>
        </div>
        <SiteToggle value={site} onChange={setSite} />
      </div>

      <ol className="space-y-3">
        {visible.map((issue, i) => (
          <IssueCard
            key={issue.id}
            index={i + 1}
            issue={issue}
            metrics={metrics[issue.id] ?? {}}
            open={openId === issue.id}
            onToggle={() => setOpenId(openId === issue.id ? null : issue.id)}
            site={site}
          />
        ))}
      </ol>

      {parked.length > 0 ? <ParkedSection issues={parked} metrics={metrics} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SiteToggle({
  value,
  onChange,
}: {
  value: Brand | 'both';
  onChange: (v: Brand | 'both') => void;
}) {
  const options: Array<{ id: Brand | 'both'; label: string }> = [
    { id: 'both', label: 'Both sites' },
    ...BRANDS.map((b) => ({ id: b, label: BRAND_LABEL[b] })),
  ];
  return (
    <div className="inline-flex shrink-0 gap-0.5 rounded-card bg-paper p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-[7px] px-3 py-1.5 text-sm transition-colors ${
            value === o.id
              ? 'bg-card font-medium text-ink shadow-card'
              : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IssueCard({
  index,
  issue,
  metrics,
  open,
  onToggle,
  site,
}: {
  index: number;
  issue: Issue;
  metrics: Record<string, ResolvedMetric[]>;
  open: boolean;
  onToggle: () => void;
  site: Brand | 'both';
}) {
  const shownBrands = site === 'both' ? issue.brands : [site];
  const panelId = `issue-${issue.id}`;

  return (
    <li className="overflow-hidden rounded-lg border border-rule bg-card shadow-card">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-start gap-4 p-5 text-left transition-colors hover:bg-ink/[0.015]"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 w-5 shrink-0 font-mono text-sm text-faint tnum"
          >
            {index}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-display text-lg font-bold leading-snug tracking-tight text-ink">
                {issue.title}
              </span>
              <SeverityBadge severity={issue.severity} />
            </span>

            <span className="mt-1.5 block max-w-measure text-sm leading-relaxed text-muted">
              {issue.whatBreaks}
            </span>

            <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs text-muted">
                Affects{' '}
                <span className="font-medium text-ink">
                  {issue.brands.map((b) => BRAND_LABEL[b]).join(' and ')}
                </span>
              </span>
              <DetectionTag detection={issue.detection} />
            </span>
          </span>

          <span
            aria-hidden="true"
            className={`mt-1 shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''}`}
          >
            ›
          </span>
        </button>
      </h2>

      {open ? (
        <div id={panelId} className="border-t border-rule bg-paper/50 px-5 pb-6 pt-5 sm:px-14">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <Block title="What an agent runs into">
                <Metrics issue={issue} metrics={metrics} brands={shownBrands} />
                {issue.samples?.length ? (
                  <div className="mt-4 space-y-3">
                    {issue.samples.map((s, i) => (
                      <div key={i}>
                        <p className="mb-1.5 text-xs text-faint">{s.caption}</p>
                        <CodeSample html={s.code} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </Block>

              <Block title="Why it costs us something">
                <p className="text-sm leading-relaxed text-ink">{issue.whyItMatters}</p>
              </Block>

              <Block title="How it happens, technically">
                <p className="text-sm leading-relaxed text-muted">{issue.technical}</p>
                {issue.sources?.length ? (
                  <ul className="mt-3 space-y-1">
                    {issue.sources.map((s) => (
                      <li key={s} className="break-all font-mono text-xs text-faint">
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Block>
            </div>

            <div className="space-y-6">
              <div className="rounded-card border border-rule bg-card p-4">
                <Eyebrow>What would fix it</Eyebrow>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink">
                  {issue.fix.summary}
                </p>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{issue.fix.technical}</p>

                <div className="mt-4 border-t border-rule pt-3">
                  <div className="flex items-baseline gap-2">
                    <Eyebrow>Risk of making that change</Eyebrow>
                    <RiskChip level={issue.fix.riskLevel} />
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{issue.fix.risk}</p>
                </div>
              </div>

              <Block title="How to confirm it's gone">
                <p className="text-sm leading-relaxed text-muted">{issue.verify}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Once a fix is on staging,{' '}
                  <Link href="/compare" className="text-accent underline underline-offset-2">
                    Compare
                  </Link>{' '}
                  scans it against production and shows whether this actually moved.
                </p>
              </Block>
            </div>
          </div>

          <p className="mt-6 border-t border-rule pt-4 text-xs text-muted">
            <span className="font-medium text-ink">{SEVERITY_LABEL[issue.severity]}:</span>{' '}
            {SEVERITY_BLURB[issue.severity]}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <Eyebrow className="mb-2">{title}</Eyebrow>
      {children}
    </section>
  );
}

const RISK_STYLE = {
  'very-low': { label: 'Very low', className: 'border-good/30 bg-good/[0.07] text-good' },
  low: { label: 'Low', className: 'border-rule bg-paper text-muted' },
  medium: { label: 'Medium', className: 'border-serious/30 bg-serious/[0.06] text-serious' },
} as const;

function RiskChip({ level }: { level: keyof typeof RISK_STYLE }) {
  const s = RISK_STYLE[level];
  return (
    <span className={`rounded-pill border px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

function Metrics({
  issue,
  metrics,
  brands,
}: {
  issue: Issue;
  metrics: Record<string, ResolvedMetric[]>;
  brands: Brand[];
}) {
  if (issue.metrics.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        No automated measurement exists for this one — it was found by reading the code and
        testing by hand, which is exactly why it never appears in a scan report.
      </p>
    );
  }

  const anyMisleading = issue.metrics.some((_, i) =>
    brands.some((b) => metrics[b]?.[i]?.misleadingZero)
  );

  return (
    <div className="overflow-hidden rounded-card border border-rule bg-card">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Measured values for {issue.title}, per site, from the most recent production scan
        </caption>
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className="px-3 py-2 text-left text-eyebrow font-medium text-muted">
              Measured
            </th>
            {brands.map((b) => (
              <th
                key={b}
                scope="col"
                className="px-3 py-2 text-right text-eyebrow font-medium text-muted"
              >
                {BRAND_LABEL[b]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {issue.metrics.map((ref, i) => (
            <tr key={i} className="border-b border-rule/60 last:border-0">
              <th scope="row" className="px-3 py-2 text-left font-normal text-ink">
                {ref.label}
              </th>
              {brands.map((b) => {
                const m = metrics[b]?.[i];
                return (
                  <td key={b} className="px-3 py-2 text-right font-mono font-semibold tnum">
                    {!m ? (
                      <span className="text-faint">—</span>
                    ) : m.misleadingZero ? (
                      <span
                        className="text-muted"
                        title="Zero here means the check structurally can't measure this control on this site — not that it's fixed"
                      >
                        0 <span className="text-faint">†</span>
                      </span>
                    ) : (
                      <span className={m.value > 0 ? 'text-ink' : 'text-good'}>
                        {m.value.toLocaleString()}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {anyMisleading ? (
        <p className="border-t border-rule px-3 py-2 text-xs text-muted">
          <span className="font-mono">†</span> A zero the scanner can&apos;t be trusted on — the
          control is a <code className="font-mono">&lt;div&gt;</code>, so the check never fires
          on it. The control is still nameless.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ParkedSection({ issues, metrics }: { issues: Issue[]; metrics: IssueMetrics }) {
  return (
    <section aria-labelledby="parked" className="border-t border-rule pt-8">
      <h2 id="parked" className="font-display text-lg font-bold tracking-tight text-muted">
        Measured, but owned elsewhere
      </h2>
      <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">
        These are real and they are counted on every scan. They are styling and brand-palette
        decisions with a different owner, so they are shown separately rather than folded into
        the numbers above — nobody should read them as failures being quietly ignored.
      </p>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {issues.map((issue) => (
          <li key={issue.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{issue.title}</p>
              <p className="mt-0.5 max-w-measure text-xs leading-relaxed text-muted">
                {issue.fix.summary}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {BRANDS.map((b) => {
                const m = metrics[issue.id]?.[b]?.[0];
                return (
                  <span key={b} className="text-xs text-muted">
                    {BRAND_LABEL[b]}{' '}
                    <span className="font-mono font-semibold text-ink tnum">
                      {m ? m.value.toLocaleString() : '—'}
                    </span>
                  </span>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

