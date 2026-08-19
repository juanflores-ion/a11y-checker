/**
 * The findings a panel shows for one page, or for one before/after pair.
 *
 * This exists because the same list was being derived in two components with
 * two different shapes, and the compare view then printed it twice more. One
 * builder per context, one shape out, so `FindingsPanel` never has to know
 * whether it was opened from a single scan or from a comparison.
 *
 * The codebase's standing rule applies here as everywhere: **a side that was
 * never measured is `null`, never 0.** A rule that a scan looked for and did
 * not find is `{ count: 0, samples: [] }` — that is a clean result. A side
 * whose scan failed is `null`. Collapsing those two into a zero is the
 * false-clean this repo has shipped twice; see the header of `compare.ts`.
 */
import type { PageDiff } from './compare';
import { isFailedPage, type ScannedPage, type Violation } from './model';
import { IMPACT_RANK, ruleMeta, sortRuleIds, type Impact } from './rules';

/** One piece of evidence: where it is, and the markup itself. */
export interface FindingSample {
  /** The scanner's selector for the node. `null` when it recorded none. */
  selector: string | null;
  html: string;
}

/** What one scan found for one rule. Reached only when that side was measured. */
export interface FindingSide {
  count: number;
  samples: FindingSample[];
}

/**
 * Which sides a finding has.
 *
 * A discriminated union rather than two optional fields, so the panel cannot
 * render a Before/After switch for a single scan, and cannot forget to handle
 * an unmeasured side on a pair.
 */
export type FindingSides =
  | { kind: 'single'; only: FindingSide }
  | { kind: 'pair'; before: FindingSide | null; after: FindingSide | null };

export interface Finding {
  key: string;
  ruleId: string;
  label: string;
  impact: Impact;
  sides: FindingSides;
}

/** The scanner joins its selector parts with a space; an empty list is no selector. */
function toSamples(violation: Violation | undefined): FindingSample[] {
  return (violation?.sample ?? []).map((s) => ({
    selector: s.t?.length ? s.t.join(' ') : null,
    html: s.h,
  }));
}

function violationsOf(page: ScannedPage | null): Map<string, Violation> {
  const byId = new Map<string, Violation>();
  for (const v of page?.violations ?? []) byId.set(v.id, v);
  return byId;
}

/** A measured side, even when it found nothing. `null` only for an absent scan. */
function sideFor(page: ScannedPage | null, ruleId: string): FindingSide | null {
  if (!page) return null;
  const violation = violationsOf(page).get(ruleId);
  return { count: violation?.n ?? 0, samples: toSamples(violation) };
}

function describe(ruleId: string): Pick<Finding, 'key' | 'ruleId' | 'label' | 'impact'> {
  const meta = ruleMeta(ruleId);
  return { key: ruleId, ruleId, label: meta.label, impact: meta.impact };
}

/**
 * Every rule one scan found, worst first: hardest impact, then largest count.
 *
 * This is the order the card's old "Start here" list used, and it is now the
 * order of the only list — that block named its top three rules a second time
 * directly above the full list, which is the same duplication the comparison
 * view was just rid of. Sorting here rather than in the card keeps the panel's
 * Previous/Next stepping through exactly what the reader is looking at.
 */
export function findingsForPage(page: ScannedPage): Finding[] {
  const byId = violationsOf(page);
  return sortRuleIds([...byId.keys()])
    .map((id) => ({
      ...describe(id),
      sides: {
        kind: 'single' as const,
        only: { count: byId.get(id)?.n ?? 0, samples: toSamples(byId.get(id)) },
      },
    }))
    .sort(
      (a, b) =>
        IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || b.sides.only.count - a.sides.only.count
    );
}

/**
 * Every rule either side found, in the order the comparison table shows them.
 *
 * `diff.rules` is empty for a pair that could not be compared, and that pair
 * still has evidence worth reading — so the rule list falls back to the union
 * of both sides rather than rendering an empty panel. The two sides are still
 * reported separately; nothing cross-side is computed here.
 */
export function findingsForDiff(diff: PageDiff): Finding[] {
  const before = diff.before && !isFailedPage(diff.before) ? diff.before : null;
  const after = diff.after && !isFailedPage(diff.after) ? diff.after : null;

  const ids = diff.rules.length
    ? diff.rules.map((r) => r.id)
    : sortRuleIds([...new Set([...violationsOf(before).keys(), ...violationsOf(after).keys()])]);

  return ids.map((id) => ({
    ...describe(id),
    sides: { kind: 'pair', before: sideFor(before, id), after: sideFor(after, id) },
  }));
}
