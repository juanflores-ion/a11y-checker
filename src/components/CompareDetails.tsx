'use client';

import { useState } from 'react';

import { makeDelta } from '@/lib/aggregate';
import type { PageDiff } from '@/lib/compare';
import { findingsForDiff, type Finding } from '@/lib/findings';
import { isFailedPage, type ScannedPage } from '@/lib/model';
import { ruleMeta } from '@/lib/rules';
import { Chevron } from './FindingsList';
import { FindingsPanel } from './FindingsPanel';
import { Arrow, DeltaChip, Eyebrow, ImpactDot } from './Primitives';
import { NumCell, Table, TBody, Td, Th, THead } from './ui/Table';

/**
 * The evidence behind a comparison: every check, both sides, raw counts.
 *
 * Every rule appears exactly **once** here. The version before this one showed
 * the same five rules twenty-one times on one screen — a rule table, then each
 * side's "Start here", then each side's full findings list, because it rendered
 * two whole `ScanResultCard`s underneath a table that already said the same
 * thing. Those cards are gone; the markup they carried opens in `FindingsPanel`
 * from the row it belongs to, where it has width instead of a 430px column.
 *
 * What the cards uniquely held — the directly-measured controls, which are not
 * axe rules — survives as the strip at the foot, both sides side by side.
 */
export function CompareDetails({ diff }: { diff: PageDiff }) {
  const [open, setOpen] = useState<number | null>(null);
  const findings = findingsForDiff(diff);
  const comparable = !diff.notComparable;
  const showFigures = !diff.viewportMismatch && !diff.identityMismatch;

  const before = diff.before && !isFailedPage(diff.before) ? diff.before : null;
  const after = diff.after && !isFailedPage(diff.after) ? diff.after : null;

  return (
    <div className="mt-4 space-y-5">
      {findings.length > 0 ? (
        <Table label="Rule-by-rule comparison">
          <THead>
            <tr>
              <Th>Check</Th>
              <Th align="right">Before</Th>
              <Th align="right">After</Th>
              <Th align="right">Change</Th>
              <Th align="right">Evidence</Th>
            </tr>
          </THead>
          <TBody>
            {findings.map((finding, i) => (
              <RuleRow
                key={finding.key}
                finding={finding}
                comparable={comparable}
                onOpen={() => setOpen(i)}
              />
            ))}
          </TBody>
        </Table>
      ) : null}

      {/*
        Demoted, not deleted. It over-reports on exactly the code that has been
        fixed, so it cannot sit next to a verdict — but it is still a lead worth
        having once you are reading detail. It gets its own block now rather
        than being squeezed into a row beside its own 47-word caveat.
      */}
      {showFigures ? (
        <section className="rounded-card border border-phantom/25 bg-phantom/[0.04] p-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Eyebrow>Phantom focusable</Eyebrow>
            <p className="font-mono text-sm tnum">
              <Figure value={diff.phantomBefore} className="text-faint" />
              <Arrow className="mx-2 text-faint" />
              <Figure value={diff.phantomAfter} className="text-base font-semibold text-ink" />
              <PhantomChange
                before={diff.phantomBefore}
                after={diff.phantomAfter}
                comparable={comparable}
              />
            </p>
          </div>
          <p className="mt-2 max-w-measure text-xs leading-relaxed text-faint">
            Counts every focusable control inside the closed mega-menu, including panels a
            disclosure button correctly announces — so it over-reports on exactly the code that has
            been fixed. A lead to check by hand, not a verdict.
          </p>
        </section>
      ) : null}

      {/*
        The measurements that are not rules, and so were only ever visible
        inside the two scan cards. Directly counted, both sides, one strip.
      */}
      <ControlsStrip before={before} after={after} />

      <p className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-faint">
        <span>before · {diff.beforeUrl || 'not given'}</span>
        <span>after · {diff.afterUrl || 'not given'}</span>
      </p>

      <FindingsPanel
        findings={findings}
        index={open}
        onIndexChange={setOpen}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

/** One check: both raw counts, the movement, and the way into its markup. */
function RuleRow({
  finding,
  comparable,
  onOpen,
}: {
  finding: Finding;
  comparable: boolean;
  onOpen: () => void;
}) {
  const sides = finding.sides;
  const before = sides.kind === 'pair' ? sides.before : null;
  const after = sides.kind === 'pair' ? sides.after : null;
  const meta = ruleMeta(finding.ruleId);
  /**
   * The panel opens on Before and shows one side at a time, so the button
   * counts that side. Summing both read as "4 samples" for a rule with two
   * samples recorded twice — a number that exists nowhere in the data.
   */
  const shown = before ?? after;
  const samples = shown?.samples.length ?? 0;

  return (
    <tr>
      <Td>
        <span className="flex items-center gap-2">
          <ImpactDot impact={finding.impact} />
          {finding.label}
          <span className="font-mono text-[11px] text-faint">{finding.ruleId}</span>
        </span>
      </Td>
      <NumCell tone={before ? 'neutral' : 'na'} text={String(before?.count ?? '')} />
      <NumCell tone={after ? 'neutral' : 'na'} text={String(after?.count ?? '')} />
      <Td align="right">
        {comparable && before && after ? (
          <DeltaChip delta={makeDelta(after.count, before.count, meta.exact, finding.ruleId)} />
        ) : (
          <span className="font-mono text-xs text-faint">no comparison</span>
        )}
      </Td>
      <Td align="right">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 rounded-card border border-accent/25 bg-accent/[0.07] px-2 py-1 text-xs text-accent hover:border-accent"
        >
          {samples === 0 ? 'Detail' : samples === 1 ? '1 sample' : `${samples} samples`}
          <Chevron />
        </button>
      </Td>
    </tr>
  );
}

/**
 * Counted directly rather than through a rule, so these appear even where no
 * rule covers them. A side that was never measured prints as such — never a
 * zero, which would read as a clean result.
 */
function ControlsStrip({ before, after }: { before: ScannedPage | null; after: ScannedPage | null }) {
  const rows: Array<{ label: string; of: (p: ScannedPage) => number | string }> = [
    { label: 'Main landmark', of: (p) => (p.hasMain ? 'Present' : 'Missing') },
    { label: 'Unnamed buttons', of: (p) => p.namelessButtons?.length ?? 0 },
    { label: 'Unnamed links', of: (p) => p.namelessLinks?.length ?? 0 },
    { label: 'Empty links', of: (p) => p.emptyHref?.length ?? 0 },
  ];

  return (
    <section>
      <Eyebrow className="mb-2">Measured directly, not through a rule</Eyebrow>
      <div className="overflow-hidden rounded-card border border-rule">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-rule bg-paper/60 px-4 py-2 text-[11px] uppercase tracking-[0.06em] text-faint">
          <span>Measurement</span>
          <span className="w-20 text-right">Before</span>
          <span className="w-20 text-right">After</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-rule/70 px-4 py-2 text-sm last:border-b-0"
          >
            <span className="text-ink">{row.label}</span>
            <SideCell page={before} of={row.of} />
            <SideCell page={after} of={row.of} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SideCell({
  page,
  of,
}: {
  page: ScannedPage | null;
  of: (p: ScannedPage) => number | string;
}) {
  if (!page) {
    return (
      <span
        title="This side was not measured. Absence, not zero."
        className="w-20 text-right font-mono text-xs text-faint"
      >
        not measured
      </span>
    );
  }
  const value = of(page);
  const bad = value === 'Missing' || (typeof value === 'number' && value > 0);
  return (
    <span className={`w-20 text-right font-mono text-xs tnum ${bad ? 'text-critical' : 'text-ink'}`}>
      {value}
    </span>
  );
}

/** A measured figure, or the fact that there isn't one. Never a stand-in zero. */
function Figure({ value, className }: { value: number | null; className: string }) {
  if (value === null) {
    return (
      <span
        className="text-sm text-faint"
        title="This side was not measured — no scan, or a scanner with no such check. Absence, not zero."
      >
        not measured
      </span>
    );
  }
  return <span className={className}>{value.toLocaleString()}</span>;
}

function PhantomChange({
  before,
  after,
  comparable,
}: {
  before: number | null;
  after: number | null;
  comparable: boolean;
}) {
  const change = comparable && before !== null && after !== null ? after - before : null;
  if (change === null) {
    return (
      <span
        className="ml-3 text-xs text-faint"
        title="Nothing valid to compare against, so no change is reported. That is absence, not a flat result."
      >
        no comparison
      </span>
    );
  }
  if (change === 0) return <span className="ml-3 text-xs text-faint">no change</span>;
  return (
    <span className={`ml-3 text-xs tnum ${change < 0 ? 'text-good' : 'text-critical'}`}>
      {change < 0 ? '−' : '+'}
      {Math.abs(change)}
    </span>
  );
}
