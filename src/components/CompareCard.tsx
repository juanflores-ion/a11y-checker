import { makeDelta } from '@/lib/aggregate';
import { isFailedPage, VIEWPORT_LABEL } from '@/lib/model';
import type { NotComparable, PageDiff, RuleDiffStatus } from '@/lib/compare';
import { ruleMeta } from '@/lib/rules';
import { DeltaChip, Eyebrow, ImpactDot, Notice } from './Primitives';
import { ScanResultCard } from './ScanResultCard';
import { NumCell, Table, TBody, Td, Th, THead } from './ui/Table';

const STATUS_LABEL: Record<RuleDiffStatus, string> = {
  resolved: 'Resolved',
  new: 'New',
  worsened: 'Worse',
  improved: 'Better',
  unchanged: 'Unchanged',
};

const STATUS_TONE: Record<RuleDiffStatus, string> = {
  resolved: 'text-good',
  new: 'text-critical',
  worsened: 'text-serious',
  improved: 'text-good',
  unchanged: 'text-faint',
};

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
export function CompareCard({ diff }: { diff: PageDiff }) {
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

  return (
    <div className="space-y-4 rounded-lg border border-rule bg-card p-4 shadow-card">
      <div className="grid gap-3 sm:grid-cols-2">
        <UrlLabel label="Before" url={diff.beforeUrl} viewport={diff.viewports.before} />
        <UrlLabel label="After" url={diff.afterUrl} viewport={diff.viewports.after} />
      </div>

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

      {showFigures ? (
        <>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-y border-rule py-4">
            {/*
              The unfindable count leads. It is the corrected metric — hidden
              *and* unannounced — and Compare rendered it nowhere at all until
              now, while giving the top line to the phantom count, which still
              carries the false positive. The fix that matters most was the one
              this screen couldn't show.
            */}
            <DeltaFigure
              label="Links an agent cannot find"
              before={diff.unfindableBefore}
              after={diff.unfindableAfter}
              comparable={comparable}
              size="lead"
            />
            <DeltaFigure
              label="Failing nodes"
              before={diff.totalBefore}
              after={diff.totalAfter}
              comparable={comparable}
            />
            <div className="ml-auto flex gap-5">
              {diff.resolvedCount !== null && diff.resolvedCount > 0 ? (
                <span className="font-mono text-sm text-good">
                  {diff.resolvedCount} resolved
                </span>
              ) : null}
              {diff.newCount !== null && diff.newCount > 0 ? (
                <span className="font-mono text-sm text-critical">{diff.newCount} new</span>
              ) : null}
              {diff.resolvedCount === 0 && diff.newCount === 0 && diff.rules.length > 0 ? (
                <span className="font-mono text-sm text-faint">no rules resolved or new</span>
              ) : null}
            </div>
          </div>

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
        </>
      ) : null}

      {diff.notComparable ? (
        <p className="text-sm text-muted">
          No rule-by-rule comparison: {NOT_COMPARABLE_REASON[diff.notComparable]}. Whatever was
          measured is in the full detail below, on its own terms.
        </p>
      ) : diff.rules.length === 0 ? (
        <p className="text-sm text-good">No axe findings on either side.</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Check</Th>
              <Th align="right">Before</Th>
              <Th align="right">After</Th>
              <Th align="right">Change</Th>
              <Th align="right">Status</Th>
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
                    <DeltaChip delta={makeDelta(r.after, r.before, ruleMeta(r.id).exact, r.id)} />
                  </Td>
                  <Td align="right" className={`text-xs font-medium ${STATUS_TONE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      )}

      <details className="group">
        <summary className="cursor-pointer text-eyebrow font-medium text-accent [&::-webkit-details-marker]:hidden">
          Full detail, both sides ▾
        </summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <Eyebrow className="mb-2">Before</Eyebrow>
            {diff.before && !isFailedPage(diff.before) ? (
              <ScanResultCard page={diff.before} compact />
            ) : (
              <p className="text-sm text-faint">Not measured.</p>
            )}
          </div>
          <div>
            <Eyebrow className="mb-2">After</Eyebrow>
            {diff.after && !isFailedPage(diff.after) ? (
              <ScanResultCard page={diff.after} compact />
            ) : (
              <p className="text-sm text-faint">Not measured.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
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
