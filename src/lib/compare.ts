/**
 * Before/after diffing for Compare mode — the QA workflow of "here's prod,
 * here's staging after my fix, what actually changed."
 *
 * Pure and side-effect free on purpose: it takes two already-fetched
 * PageResults and produces a comparison, nothing more. No fetching, no
 * server calls, so it's cheap to unit test and cheap to reuse anywhere a
 * before/after view is useful later.
 *
 * The rule the whole file is built around: **a figure that was never measured
 * is `null`, never 0.** Every number here used to default to zero, so a scan
 * that failed on one side produced "0 → 120" — which reads as 120 new
 * violations rather than as a measurement that never happened, and reads it
 * directly underneath the notice saying the scan failed. That is the 10 Aug
 * false-clean, and it is the same fault `aggregate.ts` already designs out with
 * `notMeasured` / `met: null` on the scorecard. Absence renders as absence on
 * both screens now, and by the same mechanism.
 */
import {
  isFailedPage,
  sameIdentity,
  type PageIdentity,
  type PageResult,
  type ScannedPage,
} from './model';

export type RuleDiffStatus = 'resolved' | 'new' | 'improved' | 'worsened' | 'unchanged';

/**
 * Why a pair could not be diffed at all.
 *
 * Both cases end the same way: the per-side figures stand alone if they were
 * measured, and every cross-side number — the rule table, the resolved/new
 * counts, each delta — is withheld rather than computed. A delta against
 * nothing, or against a different page, is not a measurement.
 */
export type NotComparable = 'not-measured' | 'viewport-mismatch' | 'identity-mismatch';

export interface RuleDiffRow {
  id: string;
  before: number;
  after: number;
  change: number;
  status: RuleDiffStatus;
}

export interface PageDiff {
  beforeUrl: string;
  afterUrl: string;
  before: PageResult | null;
  after: PageResult | null;
  /**
   * Rules with any presence on either side, resolved/new first.
   *
   * Empty whenever `notComparable` is set. It used to be populated regardless,
   * so a failed *after* scan marked every rule the before side found as
   * "Resolved" — a screen full of green produced by a scan that never ran.
   */
  rules: RuleDiffRow[];
  /** null = that side was never measured. Not zero. Zero is a clean page. */
  totalBefore: number | null;
  totalAfter: number | null;
  /** null whenever there is nothing valid to subtract from what. */
  totalChange: number | null;
  /**
   * Focusable controls inside the closed mega-menu.
   *
   * Kept, but demoted in the UI. It is a raw count of what is inside the
   * closed panel, announced or not — hidden-vs-unfindable at the metric layer,
   * which is false-positive class 1. A panel a disclosure button correctly
   * announces still scores here, so it over-reports on exactly the code that
   * has been fixed. A lead to check by hand, not a verdict; `unfindable*`
   * below is the corrected figure, and it is what Compare now leads on.
   */
  phantomBefore: number | null;
  phantomAfter: number | null;
  /**
   * Links out of the accessibility tree that nothing announces.
   *
   * The headline figure of the whole tool, and the one Compare leads on.
   *
   * Deliberately not "links out of the tree": a menu closed behind a proper
   * disclosure button puts its links out of the tree, and that is the fix, not
   * the fault. Diffing the broader figure made a corrected build look like a
   * 680-link regression.
   *
   * null, not 0, when the side wasn't measured *and* when it was measured by a
   * scanner that predates this check — the Scanner control on Compare accepts
   * any address, so a local server running older probe code can return a page
   * with no `unreachableTotals` at all. Nothing looked, so there is no answer.
   */
  unfindableBefore: number | null;
  unfindableAfter: number | null;
  /** null when no rule diff was possible, so "0 resolved" can't be read as news. */
  resolvedCount: number | null;
  newCount: number | null;
  /**
   * The device profile each side was measured at, as the caller stated it.
   *
   * null means the caller never said. That is worth showing rather than
   * assuming: these sites branch their markup on the device server-side, so
   * "which profile" is part of what a figure means, and an unstated profile is
   * also what leaves `viewportMismatch` below unable to fire.
   */
  viewports: { before: string | null; after: string | null };
  /**
   * Set when the two sides were measured at different device profiles.
   *
   * These sites serve different markup per device, so such a diff compares two
   * different pages and every row of it is noise — the desktop nav alone moves
   * ~56 links. The UI applies one viewport to both sides, so this should never
   * fire; it exists because "compared the wrong two things and reported a
   * confident number" is the failure this tool keeps having to design out.
   *
   * It only fires if the caller states both profiles. `LiveScanClient` holds
   * one `viewport` for the whole compare run and currently passes neither, so
   * today the guard is unarmed — hence `viewports` above, which shows on screen
   * whether it was armed rather than leaving the answer to a code reading.
   */
  viewportMismatch?: { before: string; after: string };
  /**
   * Set when the two sides are not known to be the same document.
   *
   * A URL is assumed to name a page and sometimes does not. Insureon's homepage
   * is one Sitecore item under a content test that returns one of three
   * materially different documents — measured 13 Aug 2026, 971 / 893 / 1191 DOM
   * nodes from the same URL. Diffing variant A against variant C would report
   * every one of those differences as a change somebody made.
   *
   * This is `viewportMismatch`'s twin and exists for the identical reason: the
   * failure this tool keeps designing out is comparing the wrong two things and
   * printing a confident number. It fires when either side answered the identity
   * question differently, when only one side answered, or when either was asked
   * and could not tell — see `sameIdentity`, where unknown never equals unknown.
   *
   * It cannot fire when neither target declares an identity, which is every page
   * but one, so this costs nothing where it buys nothing.
   */
  identityMismatch?: { before: PageIdentity | null; after: PageIdentity | null };
  /** Set when no cross-side figure on this pair means anything. */
  notComparable?: NotComparable;
}

function scannedOrNull(page: PageResult | null): ScannedPage | null {
  if (!page || isFailedPage(page)) return null;
  return page;
}

/** null for a side that was never measured — a failed scan is not a clean one. */
function totalNodes(page: ScannedPage | null): number | null {
  if (!page) return null;
  return (page.violations ?? []).reduce((sum, v) => sum + v.n, 0);
}

function ruleCounts(page: ScannedPage | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of page?.violations ?? []) counts[v.id] = (counts[v.id] ?? 0) + v.n;
  return counts;
}

function classify(before: number, after: number): RuleDiffStatus {
  if (before > 0 && after === 0) return 'resolved';
  if (before === 0 && after > 0) return 'new';
  if (after < before) return 'improved';
  if (after > before) return 'worsened';
  return 'unchanged';
}

const STATUS_ORDER: Record<RuleDiffStatus, number> = {
  resolved: 0,
  new: 1,
  worsened: 2,
  improved: 3,
  unchanged: 4,
};

/**
 * Rule-by-rule status, and only ever for two sides that were both measured at
 * the same profile — a rule "resolved" on a scan that never ran is not a
 * result. `diffPages` gates this on `notComparable` rather than letting the
 * absent side count as zero everywhere.
 */
function diffRules(before: ScannedPage | null, after: ScannedPage | null): RuleDiffRow[] {
  const beforeCounts = ruleCounts(before);
  const afterCounts = ruleCounts(after);
  const ids = new Set([...Object.keys(beforeCounts), ...Object.keys(afterCounts)]);

  return [...ids]
    .map((id) => {
      const b = beforeCounts[id] ?? 0;
      const a = afterCounts[id] ?? 0;
      return { id, before: b, after: a, change: a - b, status: classify(b, a) };
    })
    .sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || y.before - x.before);
}

/**
 * Compare one URL's before-scan to its after-scan. Either side can be a
 * failed scan or missing entirely (still queued, request cap hit) — the
 * result degrades gracefully rather than throwing, since a QA workflow will
 * hit this mid-deploy when one side isn't ready yet.
 *
 * "Degrades gracefully" means it reports the absence. It does not mean it
 * substitutes a zero and carries on.
 */
export function diffPages(
  beforeUrl: string,
  afterUrl: string,
  before: PageResult | null,
  after: PageResult | null,
  viewports?: { before?: string; after?: string }
): PageDiff {
  const beforePage = scannedOrNull(before);
  const afterPage = scannedOrNull(after);

  const mismatch =
    viewports?.before && viewports?.after && viewports.before !== viewports.after
      ? { before: viewports.before, after: viewports.after }
      : undefined;

  /**
   * Only meaningful once both sides were actually scanned — an unmeasured side
   * has no identity to disagree about, and `not-measured` is the truer answer.
   */
  const identityDiffers =
    !!beforePage && !!afterPage && !sameIdentity(beforePage.identity, afterPage.identity);

  const notComparable: NotComparable | undefined = mismatch
    ? 'viewport-mismatch'
    : !beforePage || !afterPage
    ? 'not-measured'
    : identityDiffers
    ? 'identity-mismatch'
    : undefined;

  /**
   * Three cases collapse to null here, and they are all the same answer:
   * the side failed, the side is missing, or the side was measured by a
   * scanner with no reachability probe. In none of them did anything count
   * unfindable links, so none of them may report that it found none.
   */
  const unfindable = (page: ScannedPage | null): number | null =>
    page?.unreachableTotals?.unannouncedLinks ?? null;

  /**
   * `phantomMenu: null` on a scanned page is a real measurement — no mega-menu
   * element on this page, so no phantom controls. Only an unmeasured side is
   * null.
   */
  const phantom = (page: ScannedPage | null): number | null =>
    page ? page.phantomMenu?.focusable ?? 0 : null;

  /** A delta exists only when both sides are real numbers of the same thing. */
  const change = (b: number | null, a: number | null): number | null =>
    notComparable || b === null || a === null ? null : a - b;

  const rules = notComparable ? [] : diffRules(beforePage, afterPage);

  const totalBefore = totalNodes(beforePage);
  const totalAfter = totalNodes(afterPage);

  return {
    beforeUrl,
    afterUrl,
    before,
    after,
    rules,
    totalBefore,
    totalAfter,
    totalChange: change(totalBefore, totalAfter),
    phantomBefore: phantom(beforePage),
    phantomAfter: phantom(afterPage),
    unfindableBefore: unfindable(beforePage),
    unfindableAfter: unfindable(afterPage),
    resolvedCount: notComparable ? null : rules.filter((r) => r.status === 'resolved').length,
    newCount: notComparable ? null : rules.filter((r) => r.status === 'new').length,
    viewports: { before: viewports?.before ?? null, after: viewports?.after ?? null },
    ...(mismatch ? { viewportMismatch: mismatch } : {}),
    ...(identityDiffers
      ? {
          identityMismatch: {
            before: beforePage?.identity ?? null,
            after: afterPage?.identity ?? null,
          },
        }
      : {}),
    ...(notComparable ? { notComparable } : {}),
  };
}

/**
 * Pair two line-delimited URL lists positionally (line 1 with line 1, and
 * so on) rather than trying to guess which staging URL corresponds to which
 * prod URL. Uneven lists still pair as far as they can and leave the rest
 * one-sided — better than silently dropping a URL someone typed.
 */
export function pairUrls(beforeUrls: string[], afterUrls: string[]): Array<{
  beforeUrl: string | null;
  afterUrl: string | null;
}> {
  const length = Math.max(beforeUrls.length, afterUrls.length);
  return Array.from({ length }, (_, i) => ({
    beforeUrl: beforeUrls[i] ?? null,
    afterUrl: afterUrls[i] ?? null,
  }));
}
