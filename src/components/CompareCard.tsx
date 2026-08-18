import { makeDelta } from '@/lib/aggregate';
import { isFailedPage, VIEWPORT_LABEL } from '@/lib/model';
import { summariseDiff, type CompareLine, type CompareVerdict, type NotComparable, type PageDiff } from '@/lib/compare';
import { ruleMeta } from '@/lib/rules';
import { DeltaChip, Eyebrow, ImpactDot, Notice } from './Primitives';
import { ScanResultCard } from './ScanResultCard';
import { NumCell, Table, TBody, Td, Th, THead } from './ui/Table';

const NOT_COMPARABLE_REASON: Record<NotComparable, string> = {
  'not-measured': 'a side was never measured',
  'viewport-mismatch': 'the two sides were measured at different device profiles',
  'identity-mismatch': 'the two sides are not known to be the same page',
};

/** A recorded identity, in prose. `null` value means asked and unanswerable. */
function identityLabel(id: { key: string; value: string | null } | null): string {
  if (!id) return 'not recorded';
  return id.value === null ? 'could not be identified' : id.value;
}

/** "desktop" -> "Desktop", and anything unrecognised through unchanged. */
function viewportLabel(name: string): string {
  return (VIEWPORT_LABEL as Record<string, string>)[name] ?? name;
}

/**
 * One before/after pair: headline numbers, rule-by-rule status, full detail on request.
 *
 * Two things this card is careful about, both of them incidents rather than
 * taste. A side that wasn't measured renders as "not measured" and contributes
 * no delta — it used to render as 0, so a failed scan printed "0 → 120" under
 * its own error notice and read as 120 new violations. And a pair measured at
 * two device profiles renders no figures at all, because these sites serve
 * different markup per device and every row of that diff is noise.
 */
export function CompareCard({ diff, title }: { diff: PageDiff; title?: string }) {
  const beforeFailed = diff.before && isFailedPage(diff.before);
  const afterFailed = diff.after && isFailedPage(diff.after);
  const beforeMissing = diff.beforeUrl === '';
  const afterMissing = diff.afterUrl === '';
  /** A URL was given and nothing at all came back for it — not even an error. */
  const beforeAbsent = !beforeMissing && diff.before === null;
  const afterAbsent = !afterMissing && diff.after === null;

  const comparable = !diff.notComparable;
  /**
   * A cross-profile pair shows no figures whatsoever — not even side by side
   * with the delta suppressed, because two numbers with an arrow between them
   * is a diff however it's captioned. The two scans are still readable on their
   * own terms in the full detail below.
   */
  const showFigures = !diff.viewportMismatch && !diff.identityMismatch;

  const summary = summariseDiff(diff);

  return (
    <div className="space-y-5 rounded-lg border border-rule bg-card p-5 shadow-card">
      {/*
        The answer first.
        
        This card exists to settle one question — did the fix work — and the
        version before this one never said. It led with three figures of
        different kinds, printed the same movement in a table underneath, and
        printed it a third time inside "Full detail". The verdict line states
        the conclusion; everything below is the evidence for it, each fact in
        exactly one place.
      */}
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-rule pb-5">
        {summary.verdict !== 'unknown' ? <VerdictBadge verdict={summary.verdict} /> : null}
        <div className="min-w-[16rem] flex-1">
          <h3 className="font-display text-xl font-semibold leading-snug tracking-tight text-ink">
            {summary.verdict === 'unknown' ? 'Not comparable' : summary.headline}
          </h3>
          <p className="mt-1.5 text-sm text-muted">
            {summary.verdict === 'unknown'
              ? diff.notComparable
                ? `No comparison: ${NOT_COMPARABLE_REASON[diff.notComparable]}. Whatever was measured is in the detail below, on its own terms.`
                : 'One side was never measured, so there is nothing to compare.'
              : summary.detail}
          </p>
        </div>
        <div className="ml-auto text-right font-mono text-[11px] leading-relaxed text-faint">
          {title ? <div className="text-muted">{title}</div> : null}
          <div>{hostOf(diff.beforeUrl)}</div>
          <div>{hostOf(diff.afterUrl)}</div>
          <div>{[diff.viewports.before, diff.viewports.after].every((v) => v === diff.viewports.before)
            ? viewportLabel(diff.viewports.before ?? 'device not stated')
            : 'two device profiles'}</div>
        </div>
      </header>

      {diff.viewportMismatch ? (
        <Notice tone="error" title="Not comparable — two different device profiles">
          <p>
            Before was measured at {viewportLabel(diff.viewportMismatch.before)}, after at{' '}
            {viewportLabel(diff.viewportMismatch.after)}. These sites serve different markup per
            device, so this pair is two different pages — the desktop nav alone accounts for
            roughly 56 links. No comparison is shown, because every number in it would be noise.
            Re-run both sides at one profile.
          </p>
        </Notice>
      ) : null}

      {diff.identityMismatch ? (
        <Notice tone="error" title="Not comparable — not known to be the same page">
          <p>
            Before served <strong>{identityLabel(diff.identityMismatch.before)}</strong>, after
            served <strong>{identityLabel(diff.identityMismatch.after)}</strong>. This URL returns
            more than one document — Insureon&apos;s homepage is one item under a content test
            that serves three, measured at 971, 893 and 1191 DOM nodes. Diffing two of them would
            report every difference between the designs as a change somebody made, so no figures
            are shown. Re-run until both sides land on the same one, or compare a page that
            serves only itself.
          </p>
        </Notice>
      ) : null}

      {beforeMissing || afterMissing ? (
        <Notice tone="neutral" title="Only one side given">
          {beforeMissing ? 'No Before URL on this line — showing After only.' : null}
          {afterMissing ? 'No After URL on this line — showing Before only.' : null}
        </Notice>
      ) : null}

      {beforeFailed || afterFailed ? (
        <Notice tone="error" title="Scan failed on one side">
          {beforeFailed && diff.before && isFailedPage(diff.before) ? (
            <p>Before: {diff.before.error}</p>
          ) : null}
          {afterFailed && diff.after && isFailedPage(diff.after) ? (
            <p>After: {diff.after.error}</p>
          ) : null}
          <p className="mt-1.5 text-muted">
            That side is reported as not measured, never as zero — nothing looked, so nothing can
            be called clean.
          </p>
        </Notice>
      ) : null}

      {beforeAbsent || afterAbsent ? (
        <Notice tone="error" title="No result came back for one side">
          {beforeAbsent ? <p>Before: the scanner returned nothing for this URL.</p> : null}
          {afterAbsent ? <p>After: the scanner returned nothing for this URL.</p> : null}
        </Notice>
      ) : null}

      {summary.moved.length > 0 ? (
        <section>
          <Eyebrow className="mb-2.5">What moved</Eyebrow>
          <div className="space-y-1.5">
            {summary.moved.map((line) => (
              <MovedRow key={line.key} line={line} />
            ))}
          </div>
        </section>
      ) : null}

      {summary.stillThere.length > 0 ? (
        <section>
          <Eyebrow className="mb-2.5">Still there after the fix</Eyebrow>
          <div className="overflow-hidden rounded-card border border-rule">
            {summary.stillThere.map((line) => (
              <div
                key={line.key}
                className="flex items-center justify-between gap-4 border-b border-rule/70 px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="flex items-center gap-2 text-ink">
                  {line.ruleId ? <ImpactDot impact={ruleMeta(line.ruleId).impact} /> : null}
                  <RuleLabel line={line} />
                </span>
                <span className="whitespace-nowrap font-mono text-xs text-muted tnum">
                  <span className={line.after > 0 ? 'font-medium text-ink' : ''}>{line.after}</span>{' '}
                  · unchanged
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {summary.verdict !== 'unknown' && summary.moved.length === 0 && summary.stillThere.length === 0 ? (
        <p className="text-sm text-good">Nothing failing on either side.</p>
      ) : null}

      <details className="group">
        <summary className="cursor-pointer text-eyebrow font-medium text-accent [&::-webkit-details-marker]:hidden">
          Details · every check, both sides, raw counts ▾
        </summary>
        <div className="mt-4 space-y-5">
          {diff.rules.length > 0 ? (
            <Table label="Rule-by-rule comparison">
              <THead>
                <tr>
                  <Th>Check</Th>
                  <Th align="right">Before</Th>
                  <Th align="right">After</Th>
                  <Th align="right">Change</Th>
                </tr>
              </THead>
              <TBody>
                {diff.rules.map((r) => {
                  const meta = ruleMeta(r.id);
                  return (
                    <tr key={r.id}>
                      <Td>
                        <span className="flex items-center gap-2">
                          <ImpactDot impact={meta.impact} />
                          {meta.label}
                        </span>
                      </Td>
                      <NumCell tone="neutral" text={String(r.before)} />
                      <NumCell tone="neutral" text={String(r.after)} />
                      <Td align="right">
                        <DeltaChip delta={makeDelta(r.after, r.before, meta.exact, r.id)} />
                      </Td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          ) : null}

          {/*
            Demoted, not deleted. It over-reports on exactly the code that has
            been fixed, so it cannot sit next to a verdict — but it is still a
            lead worth having once you are reading detail.
          */}
          {showFigures ? (
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
              <DeltaFigure
                label="Phantom focusable"
                before={diff.phantomBefore}
                after={diff.phantomAfter}
                comparable={comparable}
                size="small"
              />
              <p className="max-w-measure text-xs leading-relaxed text-faint">
                Counts every focusable control inside the closed mega-menu, including panels a
                disclosure button correctly announces — so it over-reports on exactly the code
                that has been fixed. A lead to check by hand, not a verdict.
              </p>
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <Eyebrow className="mb-2">Before · {diff.beforeUrl || 'not given'}</Eyebrow>
              {diff.before && !isFailedPage(diff.before) ? (
                <ScanResultCard page={diff.before} compact />
              ) : (
                <p className="text-sm text-faint">Not measured.</p>
              )}
            </div>
            <div>
              <Eyebrow className="mb-2">After · {diff.afterUrl || 'not given'}</Eyebrow>
              {diff.after && !isFailedPage(diff.after) ? (
                <ScanResultCard page={diff.after} compact />
              ) : (
                <p className="text-sm text-faint">Not measured.</p>
              )}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

/** Better / Worse / No change, from the failing-element total. */
function VerdictBadge({ verdict }: { verdict: CompareVerdict }) {
  const tone =
    verdict === 'better'
      ? 'border-good/40 bg-good/10 text-good'
      : verdict === 'worse'
      ? 'border-critical/40 bg-critical/10 text-critical'
      : 'border-rule bg-paper text-muted';
  const label = verdict === 'better' ? 'Better' : verdict === 'worse' ? 'Worse' : 'No change';
  return (
    <span className={`mt-0.5 whitespace-nowrap rounded-pill border px-3 py-1 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}

/** A check whose number changed: name, both figures, and the size of the move. */
function MovedRow({ line }: { line: CompareLine }) {
  const better = line.change < 0;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-5 gap-y-1 rounded-card border px-4 py-2.5 ${
        better ? 'border-good/25 bg-good/[0.05]' : 'border-critical/25 bg-critical/[0.05]'
      }`}
    >
      <span className="flex items-center gap-2 text-sm text-ink">
        {line.ruleId ? <ImpactDot impact={ruleMeta(line.ruleId).impact} /> : null}
        <RuleLabel line={line} />
      </span>
      <span className="flex items-baseline gap-4 font-mono text-xs tnum">
        <span className="text-muted">
          <span className="font-medium text-ink">{line.before}</span>
          <span className="px-1.5 text-faint">→</span>
          <span className="font-medium text-ink">{line.after}</span>
        </span>
        <span className={`font-medium ${better ? 'text-good' : 'text-critical'}`}>
          {better ? `${-line.change} fixed` : `${line.change} more`}
        </span>
      </span>
    </div>
  );
}

/**
 * A metric carries its own label; a rule gets the catalogue's wording.
 *
 * `ruleMeta` falls back to the bare axe id for rules the catalogue has no
 * copy for — `frame-title`, `label-title-only`. Printed as prose those read
 * as a bug; printed as mono they read as what they are, an identifier we have
 * not written a name for yet.
 */
function RuleLabel({ line }: { line: CompareLine }) {
  const meta = line.ruleId ? ruleMeta(line.ruleId) : null;
  const named = !meta || meta.label !== meta.id;
  return named ? (
    <span>{meta ? meta.label : line.label}</span>
  ) : (
    <span className="font-mono text-[12.5px] text-muted">{meta.id}</span>
  );
}

/** Just the host — the full URL is in the detail, and this is an identity line. */
function hostOf(url: string): string {
  if (!url) return 'not given';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function UrlLabel({
  label,
  url,
  viewport,
}: {
  label: string;
  url: string;
  viewport: string | null;
}) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-0.5 truncate font-mono text-xs text-muted">{url || '—'}</p>
      {/*
        Which profile a figure came from is part of what the figure means here:
        these sites branch their markup on the device, server-side. Saying
        nothing would leave "compared two different pages" indistinguishable
        from "compared like with like".
      */}
      <p
        className="mt-0.5 text-xs text-faint"
        title={
          viewport
            ? 'The device profile this side was measured at. Both sides must match.'
            : 'The caller did not state which device profile this side was measured at, so a cross-profile pair cannot be detected.'
        }
      >
        {viewport ? viewportLabel(viewport) : 'profile not recorded'}
      </p>
    </div>
  );
}

const FIGURE_SIZE: Record<'lead' | 'normal' | 'small', string> = {
  lead: 'text-2xl',
  normal: 'text-xl',
  small: 'text-base',
};

/**
 * before → after for one metric, with the delta *only* when there is a real
 * one to state. A null side prints "not measured" and suppresses the delta
 * rather than treating absence as a zero to subtract from.
 */
function DeltaFigure({
  label,
  before,
  after,
  comparable = true,
  size = 'normal',
}: {
  label: string;
  before: number | null;
  after: number | null;
  comparable?: boolean;
  size?: 'lead' | 'normal' | 'small';
}) {
  const change = comparable && before !== null && after !== null ? after - before : null;
  const improving = change !== null && change < 0;

  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1 flex items-baseline gap-2">
        <Figure value={before} className="font-mono text-sm tnum text-faint" />
        <span aria-hidden="true" className="text-faint">
          →
        </span>
        <Figure
          value={after}
          className={`font-mono ${FIGURE_SIZE[size]} font-bold tnum text-ink`}
        />
        {change === null ? (
          <span
            className="font-mono text-xs text-faint"
            title="Nothing valid to compare against, so no change is reported. That is absence, not a flat result."
          >
            no comparison
          </span>
        ) : change !== 0 ? (
          <span
            className={`font-mono text-xs tnum ${improving ? 'text-good' : 'text-critical'}`}
          >
            {improving ? '−' : '+'}
            {Math.abs(change)}
          </span>
        ) : (
          <span className="font-mono text-xs text-faint">no change</span>
        )}
      </div>
    </div>
  );
}

/** A measured figure, or the fact that there isn't one. Never a stand-in zero. */
function Figure({ value, className }: { value: number | null; className: string }) {
  if (value === null) {
    return (
      <span
        className="font-mono text-sm text-faint"
        title="This side was not measured — no scan, or a scanner with no such check. Absence, not zero."
      >
        not measured
      </span>
    );
  }
  return <span className={className}>{value.toLocaleString()}</span>;
}
