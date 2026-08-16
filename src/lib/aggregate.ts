import type { MetricRef } from './issues';
import {
  Brand,
  GhostControl,
  PageResult,
  PhantomMenu,
  Run,
  ScannedPage,
  countsAsGhostControl,
  isFailedPage,
  isScannedPage,
} from './model';
import { Impact, ruleMeta, sortRuleIds } from './rules';

/* ------------------------------------------------------------------ */
/* Page-level helpers                                                  */
/* ------------------------------------------------------------------ */

/** Every page key present in the run for this brand, in file order. */
export function pageKeys(run: Run, brand: Brand): string[] {
  return Object.keys(run[brand] ?? {});
}

export function pageResult(run: Run, brand: Brand, key: string): PageResult | undefined {
  return run[brand]?.[key];
}

/** Only pages that actually scanned. Failed pages are excluded from all maths. */
export function scannedPages(run: Run, brand: Brand): Array<[string, ScannedPage]> {
  return Object.entries(run[brand] ?? {}).filter(
    (entry): entry is [string, ScannedPage] => isScannedPage(entry[1])
  );
}

export function failedPages(run: Run, brand: Brand): Array<[string, { url: string; error: string }]> {
  return Object.entries(run[brand] ?? {}).filter(
    (entry): entry is [string, { url: string; error: string }] => isFailedPage(entry[1])
  );
}

/**
 * Reading a field the *type* says is always there.
 *
 * `ScannedPage` marks `emptyHref`, `hasMain` and `phantomMenu` required because
 * every scanner that has ever run wrote them. The files on disk are not bound
 * by that: they were written by older code, and a field added later is simply
 * absent from an older run. The type describes today's scanner; the JSON is a
 * historical record, and only the JSON can say whether a check actually ran.
 *
 * This is the difference between "measured, and it was zero" and "nobody
 * looked" — the distinction two false-clean incidents turned on.
 */
function fieldPresent(page: ScannedPage, field: keyof ScannedPage): boolean {
  return (page as unknown as Record<string, unknown>)[field] !== undefined;
}

/* ------------------------------------------------------------------ */
/* The defect set                                                      */
/* ------------------------------------------------------------------ */

/**
 * This page's ghost controls, filtered to the ones that count.
 *
 * There used to be two answers to that. `ghostControlCount` dropped the ones
 * the browser's listener registry disproved; the per-page breakdown four
 * hundred lines below did not — so the Runs → By check row and the per-page
 * table that expands underneath it were computing different things for the
 * same figure.
 *
 * On the three run files currently on disk the two agree, because every ghost
 * control in all of them carries `confirmedListener: true` and the filter drops
 * nothing. That is a property of the data, not of the code: `core.mjs:329`
 * sets the flag to `own.length > 0`, so the first candidate CDP disproves
 * splits the two numbers on one screen with nothing to warn anyone. A reader
 * who adds up the table and gets a different answer from the header stops
 * trusting every other figure on the page, which is a far larger loss than the
 * row itself.
 *
 * The predicate itself lives in `model.ts` with the rest of the defect set, so
 * that `compare.ts` and anything else reading a run file cannot answer "is this
 * a defect" differently from this module. This wrapper adds only the part that
 * is genuinely local: reading the field off a page, and treating a run recorded
 * before the probe existed as an empty list rather than a defect count. Where
 * that distinction has to be shown to a reader, `probeMeasured` is what says
 * the probe never ran.
 */
export function countedGhostControls(page: ScannedPage): GhostControl[] {
  return (page.ghostControls ?? []).filter(countsAsGhostControl);
}

/* ------------------------------------------------------------------ */
/* Rule totals                                                         */
/* ------------------------------------------------------------------ */

/**
 * Total failing nodes per rule id, summed across every page that scanned.
 * A rule absent from `violations` contributes nothing — absence means zero,
 * so it simply never appears as a key.
 */
export function ruleTotals(run: Run, brand: Brand): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [, page] of scannedPages(run, brand)) {
    for (const v of page.violations ?? []) {
      totals[v.id] = (totals[v.id] ?? 0) + v.n;
    }
  }
  return totals;
}

/** rule id -> page key -> node count. Only non-zero cells exist. */
export function perPageRuleTotals(
  run: Run,
  brand: Brand
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [key, page] of scannedPages(run, brand)) {
    for (const v of page.violations ?? []) {
      (out[v.id] ??= {})[key] = (out[v.id][key] ?? 0) + v.n;
    }
  }
  return out;
}

/** Every rule id seen anywhere in the run, both brands, in display order. */
export function allRuleIds(runs: Run[], brands: Brand[]): string[] {
  const seen = new Set<string>();
  for (const run of runs) {
    for (const brand of brands) {
      for (const [, page] of scannedPages(run, brand)) {
        for (const v of page.violations ?? []) seen.add(v.id);
      }
    }
  }
  return sortRuleIds([...seen]);
}

export function totalNodes(run: Run, brand: Brand): number {
  return Object.values(ruleTotals(run, brand)).reduce((a, b) => a + b, 0);
}

/** Node count restricted to rules we've committed to fixing. */
export function inScopeNodes(run: Run, brand: Brand): number {
  return Object.entries(ruleTotals(run, brand))
    .filter(([id]) => ruleMeta(id).inScope)
    .reduce((sum, [, n]) => sum + n, 0);
}

/** How many distinct rules are failing at each impact level. */
export function rulesFailingByImpact(run: Run, brand: Brand): Record<Impact, number> {
  const counts: Record<Impact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const id of Object.keys(ruleTotals(run, brand))) {
    counts[ruleMeta(id).impact] += 1;
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/* Non-axe measurements                                                */
/* ------------------------------------------------------------------ */

/**
 * The `?? 0` on each line is a sum accumulator, not a fallback for a missing
 * check — `hasNamelessData` is what answers "did this run measure these at
 * all", and every caller that renders a verdict has to ask it. A run recorded
 * before these lists existed sums to zero here, and zero nameless buttons is
 * the shape of a fixed site.
 */
export function namelessCounts(run: Run, brand: Brand) {
  let buttons = 0;
  let links = 0;
  let emptyHref = 0;
  for (const [, page] of scannedPages(run, brand)) {
    buttons += page.namelessButtons?.length ?? 0;
    links += page.namelessLinks?.length ?? 0;
    emptyHref += page.emptyHref?.length ?? 0;
  }
  return { buttons, links, emptyHref };
}

/** True when this run recorded the nameless-control lists — absence isn't zero. */
export function hasNamelessData(run: Run, brand: Brand): boolean {
  return scannedPages(run, brand).some(([, p]) => fieldPresent(p, 'emptyHref'));
}

export function mainCoverage(run: Run, brand: Brand) {
  const pages = scannedPages(run, brand);
  return {
    withMain: pages.filter(([, p]) => p.hasMain === true).length,
    scanned: pages.length,
  };
}

/**
 * The mega-menu is identical on every page of a brand, so the headline figure
 * is one page's reading, not a sum. Take the worst page — if any page still
 * exposes the closed menu, the brand is not fixed.
 */
export function worstPhantom(
  run: Run,
  brand: Brand
): { phantom: PhantomMenu | null; pageKey: string | null; pagesWithMenu: number } {
  let worst: PhantomMenu | null = null;
  let worstKey: string | null = null;
  let pagesWithMenu = 0;
  for (const [key, page] of scannedPages(run, brand)) {
    const pm = page.phantomMenu;
    if (!pm) continue; // null when the page has no mega-menu element at all
    pagesWithMenu += 1;
    if (!worst || pm.focusable > worst.focusable) {
      worst = pm;
      worstKey = key;
    }
  }
  return { phantom: worst, pageKey: worstKey, pagesWithMenu };
}

/**
 * Zero here means one of two different things and cannot tell you which:
 * every page was looked at and none has a closed menu, or the run predates the
 * check. Anything rendering a verdict off this number has to ask
 * `hasPhantomData` first — the scorecard row and `resolveMetric` both do.
 */
export function phantomFocusable(run: Run, brand: Brand): number {
  return worstPhantom(run, brand).phantom?.focusable ?? 0;
}

/**
 * True when this run recorded a `phantomMenu` reading at all.
 *
 * Note what this is *not* asking. `phantomMenu: null` is a measurement — the
 * page was looked at and has no mega-menu element — and reads as zero quite
 * correctly. The field being absent from the JSON is a different thing: that
 * run predates the check, and its zero means nobody looked. Only the second
 * case is a "not measured", and only the raw file can tell them apart, which
 * is why this reads the field's presence rather than its value.
 */
export function hasPhantomData(run: Run, brand: Brand): boolean {
  return scannedPages(run, brand).some(([, p]) => fieldPresent(p, 'phantomMenu'));
}

/* ------------------------------------------------------------------ */
/* Repeatability — how far a metric moves when nothing changed         */
/* ------------------------------------------------------------------ */

/**
 * Whether scanning the same page twice returns the same number.
 *
 * Until 12 Aug 2026 nobody had ever asked. Six investigators argued about
 * probe accuracy and not one of them scanned a page twice, so every trend line
 * this dashboard has ever drawn was drawn on the assumption that the site
 * holds still between runs. Insureon does not: eight plain `curl` fetches of
 * the home page returned documents of 394,816 / 394,824 / 434,507 / 703,895
 * bytes — a 1.78x spread, three distinct documents for identical requests.
 * TechInsurance was byte-identical over six fetches and reproduced its
 * recorded run exactly, so this is the site, not the harness.
 *
 * That splits the metrics in two, and the split is not the one anybody
 * expected. The tree-structural figures came back identical on every single
 * scan; the volume figures swung by more than their own magnitude. A metric
 * that moves by 86 between two scans of an unchanged page is not a
 * measurement, and no threshold rescues it — which is why `volatile` exists as
 * a flag the UI can act on rather than only as a wider number.
 */
export type Repeatability = 'stable' | 'volatile' | 'unknown';

/**
 * What a repeat-scan run actually observed. Every field here is a measurement.
 *
 * Nothing may be estimated into this table. If a metric has not been scanned
 * N times, it has no entry, and `metricStability` reports `unknown` — which is
 * the honest answer and the one the UI must render, rather than a
 * confident-looking tolerance nobody derived from anything.
 */
export interface RepeatEvidence {
  /** How many consecutive scans of the same page. */
  scans: number;
  /** Lowest and highest reading across those scans. */
  min: number;
  max: number;
  /** The distribution verbatim, so nobody has to trust min/max alone. */
  readings: string;
  /** Exactly what was scanned. This gets printed — keep it literal. */
  measuredOn: string;
  /**
   * true when the metric this evidence is attached to aggregates more than
   * what was repeat-scanned — one page's spread standing in for a ten-page
   * sum. The spread is then a floor, never the answer, and the UI must say
   * "at least" wherever it quotes it.
   */
  floor: boolean;
}

export interface MetricStability {
  /** The metric key this describes, or null when the caller named none. */
  metric: string | null;
  repeatability: Repeatability;
  /**
   * Movement of this size or less is indistinguishable from the site serving a
   * different document. Derived from `evidence`, never chosen.
   */
  tolerance: number;
  /** null when this metric has never been scanned twice. */
  evidence: RepeatEvidence | null;
  /** One line the UI can put beside the number or in a tooltip. */
  note: string;
}

/**
 * The old global `NOISE_TOLERANCE`, kept under a name that admits what it is.
 *
 * It was a single constant of 2 applied to every metric in the dashboard,
 * including one measured to swing by 86. It survives only so that metrics
 * nobody has repeat-scanned behave exactly as they did before this change —
 * changing their behaviour on the strength of no measurement would be the same
 * mistake in the opposite direction. `repeatability: 'unknown'` is what tells
 * a reader this number is a placeholder rather than a finding.
 */
const UNMEASURED_TOLERANCE = 2;

/**
 * Repeat-scan evidence, one entry per metric key.
 *
 * ADDING TO THIS TABLE: run the same page N times through one pinned browser,
 * record min/max/readings verbatim, and set `measuredOn` to the page, profile
 * and scan count. Do not interpolate between metrics and do not reuse one
 * metric's spread for another — `clickableNoRole` and `unfindableLinks` were
 * measured in the same sixteen scans and one of them moved by 86 while the
 * other did not move at all.
 *
 * STILL UNMEASURED, and each needs an N-of-5 run before it can be trended:
 * ghost-controls, hidden-panel-controls, phantom, in-scope, every `rule:` id,
 * and all of the above on techinsurance.com and on the mobile profile.
 */
const REPEAT_EVIDENCE: Record<string, RepeatEvidence> = {
  'clickable-no-role': {
    scans: 16,
    min: 1,
    max: 87,
    readings: '1 (x5), 36 (x6), 87 (x5)',
    measuredOn: 'insureon.com home page, desktop profile, 16 consecutive scans',
    /**
     * The evidence is one page; this key is the sum over ten. A ten-page sum
     * of an unstable per-page figure cannot be tighter than the single page,
     * so 86 is the floor of the real spread and the UI must say so.
     */
    floor: true,
  },
  total: {
    scans: 16,
    min: 28,
    max: 68,
    readings: '28-68 failing nodes',
    measuredOn: 'insureon.com home page, desktop profile, 16 consecutive scans',
    floor: true,
  },
  'unfindable-links': {
    scans: 16,
    min: 56,
    max: 56,
    readings: '56 on every scan',
    measuredOn: 'insureon.com home page, desktop profile, 16 consecutive scans',
    /**
     * Identical sixteen times out of sixteen, while everything around it swung
     * by 86. Still marked a floor: zero spread on one page is not proof of
     * zero spread on ten, and this is a defect metric (C3), so the safe
     * direction to be wrong in is alarming, not reassuring.
     */
    floor: true,
  },
  'nav-links-total': {
    scans: 16,
    min: 63,
    max: 63,
    readings: '63 on every scan',
    measuredOn: 'insureon.com home page, desktop profile, 16 consecutive scans',
    floor: true,
  },
  'nav-links-in-tree': {
    scans: 16,
    min: 7,
    max: 7,
    readings: '7 on every scan',
    measuredOn: 'insureon.com home page, desktop profile, 16 consecutive scans',
    floor: true,
  },
  'nav-links-hidden': {
    scans: 16,
    min: 56,
    max: 56,
    readings: '63 total minus 7 in tree, on every scan',
    measuredOn: 'insureon.com home page, desktop profile, 16 consecutive scans',
    floor: true,
  },
};

/**
 * What we know about how far this metric moves on its own.
 *
 * Accepts the trend chart's `rule:<id>` keys as well as the bare ids the
 * scorecard and the probe table use, so one table serves every screen and no
 * metric can end up with two different tolerances depending on who asked.
 */
export function metricStability(metric?: string | null): MetricStability {
  const key = metric ? (metric.startsWith('rule:') ? metric.slice('rule:'.length) : metric) : null;
  const evidence = key ? REPEAT_EVIDENCE[key] ?? null : null;

  if (!evidence) {
    return {
      metric: key,
      repeatability: 'unknown',
      tolerance: UNMEASURED_TOLERANCE,
      evidence: null,
      note:
        'Never scanned twice. Judged against a tolerance of 2, which is a ' +
        'placeholder inherited from before anyone measured repeatability — ' +
        'not a finding about this metric.',
    };
  }

  const spread = evidence.max - evidence.min;
  const scope = evidence.floor
    ? ` Measured on one page; this figure covers more, so treat the spread as a floor.`
    : '';

  if (spread === 0) {
    return {
      metric: key,
      repeatability: 'stable',
      tolerance: 0,
      evidence,
      note: `Identical on all ${evidence.scans} scans of ${evidence.measuredOn}. Any movement here is real.${scope}`,
    };
  }

  return {
    metric: key,
    repeatability: 'volatile',
    tolerance: spread,
    evidence,
    note:
      `Not reproducible: ${evidence.readings} across ${evidence.scans} identical ` +
      `scans of ${evidence.measuredOn}. The site serves different documents to ` +
      `identical requests, so a move of ${spread} or less is the site, not a change.${scope}`,
  };
}

/* ------------------------------------------------------------------ */
/* Deltas                                                              */
/* ------------------------------------------------------------------ */

export interface Delta {
  current: number;
  previous: number | null;
  change: number | null;
  /** true when movement on this metric is real signal rather than churn. */
  exact: boolean;
  /** true when the change should raise an eyebrow given the tolerance. */
  notable: boolean;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  /**
   * Which tolerance judged `notable`, and the repeat-scan evidence behind it.
   * Always present, so a caller that never named a metric still gets told the
   * threshold was a placeholder rather than being left to assume otherwise.
   */
  stability: MetricStability;
}

/**
 * `metric` is optional so every existing call site keeps working, but a delta
 * without it falls back to the placeholder tolerance. Pass the metric key —
 * the rule id, the scorecard row key or the probe check id — wherever one is
 * to hand.
 */
export function makeDelta(
  current: number,
  previous: number | null,
  exact: boolean,
  metric?: string | null
): Delta {
  const stability = metricStability(metric);
  if (previous === null) {
    return {
      current,
      previous: null,
      change: null,
      exact,
      notable: false,
      direction: 'unknown',
      stability,
    };
  }
  const change = current - previous;
  /**
   * `exact` and repeatability answer different questions, and both have to
   * hold before movement means anything.
   *
   * `exact` is a claim about the *rule*: it counts discrete things and cannot
   * drift by a node or two from content churn. Repeatability is a claim about
   * the *site*: that it serves the same document twice. `clickableNoRole` is
   * exact by the first definition and useless by the second — it came back 1,
   * 36 and 87 on sixteen scans of an unchanged page. So a metric measured to
   * swing cannot be treated as exact however tidy its rule is, and the
   * measurement wins over the flag.
   */
  const notable =
    stability.repeatability === 'volatile'
      ? Math.abs(change) > stability.tolerance
      : exact
      ? change !== 0
      : Math.abs(change) > stability.tolerance;
  return {
    current,
    previous,
    change,
    exact,
    notable,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    stability,
  };
}

/**
 * Rule-by-rule delta between two runs.
 *
 * Keys are the union of both runs, so a rule that stops firing entirely shows
 * as a drop to 0 rather than disappearing from the table.
 */
export function ruleDeltas(
  current: Run,
  previous: Run | null,
  brand: Brand
): Record<string, Delta> {
  const now = ruleTotals(current, brand);
  const before = previous ? ruleTotals(previous, brand) : null;
  const ids = new Set([...Object.keys(now), ...(before ? Object.keys(before) : [])]);

  const out: Record<string, Delta> = {};
  for (const id of ids) {
    /**
     * `?? 0` is correct here and almost nowhere else in this file. The data
     * contract says `violations` lists only the rules that failed, so a rule
     * absent from a scanned page genuinely fired zero times — axe looked and
     * found nothing. Contrast the probe fields, where absence means the check
     * did not exist when the run was recorded; those get a `notMeasured` flag
     * instead, never a zero.
     */
    out[id] = makeDelta(now[id] ?? 0, before ? before[id] ?? 0 : null, ruleMeta(id).exact, id);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Target scorecard (§4 of the brief)                                  */
/* ------------------------------------------------------------------ */

export interface ScorecardRow {
  key: string;
  label: string;
  value: number;
  /** Numeric target; null for rows with no hard target. */
  target: number | null;
  /** null for rows excluded from the pass ratio. */
  met: boolean | null;
  /** Direction of travel: for main coverage, higher is better. */
  higherIsBetter?: boolean;
  inScope: boolean;
  note?: string;
  /** Zero here is a measurement artefact, not health. */
  misleadingZero?: boolean;
  /** This run predates the check entirely — the value is absence, not zero. */
  notMeasured?: boolean;
  /**
   * How far this figure moves between two scans of an unchanged page. Carried
   * on the row so the UI can badge a volatile metric without having to know
   * which key maps to which evidence.
   */
  stability: MetricStability;
}

/**
 * How the scorecard reads on screen: dead ends first, structure second.
 * A row whose key is in no group still renders, under "Other" — the failure
 * mode to avoid is a defect quietly disappearing from the table because
 * somebody added a row here and forgot to file it.
 */
export const SCORECARD_GROUPS: ReadonlyArray<{ title: string; keys: readonly string[] }> = [
  {
    title: 'Dead ends',
    keys: ['button-name', 'link-name', 'emptyHref', 'label', 'ghost-controls', 'phantom'],
  },
  { title: 'Structure', keys: ['hasMain', 'unfindable-links', 'region'] },
];

export function scorecard(run: Run, brand: Brand): ScorecardRow[] {
  const totals = ruleTotals(run, brand);
  const nameless = namelessCounts(run, brand);
  const main = mainCoverage(run, brand);
  const focusable = phantomFocusable(run, brand);
  /** Safe: `violations` lists only rules that fired, so absence is a real zero. */
  const get = (id: string) => totals[id] ?? 0;

  const misleading = (id: string) => (ruleMeta(id).misleadingZeroOn ?? []).includes(brand);

  const rows: Array<Omit<ScorecardRow, 'stability'>> = [
    {
      key: 'button-name',
      label: 'Buttons with no name',
      value: get('button-name'),
      target: 0,
      met: get('button-name') === 0,
      inScope: true,
      misleadingZero: misleading('button-name') && get('button-name') === 0,
    },
    {
      key: 'link-name',
      label: 'Links with no name',
      value: get('link-name'),
      target: 0,
      met: get('link-name') === 0,
      inScope: true,
      misleadingZero: misleading('link-name') && get('link-name') === 0,
    },
    {
      key: 'emptyHref',
      label: 'Links with an empty destination',
      value: nameless.emptyHref,
      target: 0,
      /**
       * Same reasoning as ghost-controls below. These lists have shipped since
       * the first scanner, so in practice this guard never fires today — but
       * "the field has always been there" is exactly what was believed about
       * every other check the moment before a run turned up without it.
       */
      met: hasNamelessData(run, brand) ? nameless.emptyHref === 0 : null,
      inScope: true,
      notMeasured: !hasNamelessData(run, brand),
    },
    {
      key: 'label',
      label: 'Form fields with no label',
      value: get('label'),
      target: 0,
      met: get('label') === 0,
      inScope: true,
    },
    {
      key: 'hasMain',
      label: 'Pages marking their main content',
      value: main.withMain,
      target: main.scanned,
      met: main.scanned > 0 && main.withMain === main.scanned,
      higherIsBetter: true,
      inScope: true,
    },
    {
      key: 'phantom',
      label: 'Dead controls in the closed menu',
      value: focusable,
      target: 0,
      /**
       * `phantomMenu: null` is a real reading — the page has no mega-menu — and
       * zero is the right answer for it. The field being absent from the run
       * file is not: that run predates the check. Only the second case is a
       * "not measured", and only `hasPhantomData` can tell them apart.
       */
      met: hasPhantomData(run, brand) ? focusable === 0 : null,
      inScope: true,
      notMeasured: !hasPhantomData(run, brand),
    },
    {
      key: 'ghost-controls',
      label: "Controls an agent can't identify",
      value: ghostControlCount(run, brand),
      target: 0,
      /**
       * null, not `true`, on runs that predate this probe. They report zero
       * because nothing looked, and scoring "nobody measured it" as a pass is
       * exactly the mistake the † footnote exists to prevent elsewhere.
       */
      met: hasProbeData(run, brand) ? ghostControlCount(run, brand) === 0 : null,
      inScope: true,
      notMeasured: !hasProbeData(run, brand),
      note: 'Measured by our own probe — no rule engine can see these.',
    },
    {
      key: 'unfindable-links',
      label: 'Links an agent cannot find',
      /**
       * Unannounced only — and that distinction is the whole check.
       *
       * This row first shipped reading `navReach().hidden`, every link out of
       * the accessibility tree. That is wrong in the one case that matters
       * most: a menu hidden *correctly*, behind a button that says what it
       * opens, is content an agent can find and use. Measured against a fixed
       * build of Insureon, the old formula read 680 where the true figure was
       * 51 — it would have reported a completed fix as a catastrophic
       * regression, which is precisely the mistake this tool exists to avoid.
       *
       * Being out of the tree is not the defect. Being out of the tree with
       * nothing in the tree announcing it is.
       */
      value: unreachableStats(run, brand).links,
      target: 0,
      /** Same reasoning as ghost-controls: absence of the check isn't a pass. */
      met: hasReachData(run, brand) ? unreachableStats(run, brand).links === 0 : null,
      inScope: true,
      notMeasured: !hasReachData(run, brand),
      note: 'Hidden with nothing announcing them. A hover-only menu does this; a disclosure button does not.',
    },
    {
      key: 'region',
      label: 'Content outside any labelled region',
      value: get('region'),
      target: null,
      met: null,
      inScope: true,
      note: 'Target is "sharply reduced", not zero — no pass/fail line.',
    },
    {
      key: 'link-in-text-block',
      label: 'Links identified by colour only',
      value: get('link-in-text-block'),
      target: null,
      met: null,
      inScope: false,
      note: 'A styling change, not a markup fix.',
    },
    {
      key: 'color-contrast',
      label: 'Colour contrast',
      value: get('color-contrast'),
      target: null,
      met: null,
      inScope: false,
      note: 'A styling change, not a markup fix.',
    },
  ];

  /**
   * A brand where every page failed to load used to score a clean sweep.
   *
   * Failed pages are excluded from all maths, so with none left every total is
   * zero, every `met` is true, and the scorecard reads "all targets met" for a
   * run in which nothing was measured at all. That is the same shape as both
   * false-clean incidents this project has already shipped — ten stale target
   * URLs measured as error pages, which read as a 47% improvement, and the
   * scorecard scoring a probe that did not exist yet as a pass.
   *
   * Zero pages is absence, not health, so every row becomes not-measured and
   * the pass ratio comes out 0 of 0 rather than 6 of 6.
   */
  const measuredSomething = scannedPages(run, brand).length > 0;

  return rows.map((row) => {
    const stability = metricStability(row.key);
    if (measuredSomething) return { ...row, stability };
    return { ...row, met: null, notMeasured: true, stability };
  });
}

/** Passed / total across the rows that carry a hard target. */
export function passRatio(run: Run, brand: Brand): { passed: number; total: number } {
  const rows = scorecard(run, brand).filter((r) => r.met !== null);
  return { passed: rows.filter((r) => r.met).length, total: rows.length };
}

/* ------------------------------------------------------------------ */
/* Trend series                                                        */
/* ------------------------------------------------------------------ */

export type TrendMetric =
  | 'total'
  | 'in-scope'
  | 'phantom'
  | 'unfindable-links'
  | `rule:${string}`;

/**
 * One run's reading for one trend metric, or null when the run never measured
 * it.
 *
 * null rather than 0, and the caller has to drop the point rather than plot
 * it. A run recorded before a check existed plotted as zero draws a line
 * falling to the floor and then climbing back, which reads as a fix that
 * landed and then regressed — a story about the site invented entirely out of
 * when the scanner learned to look. `runAtViewport` already refuses to
 * substitute an unmeasured profile for the same reason.
 */
export function metricValue(run: Run, brand: Brand, metric: TrendMetric): number | null {
  if (scannedPages(run, brand).length === 0) return null;
  if (metric === 'total') return totalNodes(run, brand);
  if (metric === 'in-scope') return inScopeNodes(run, brand);
  if (metric === 'phantom') return hasPhantomData(run, brand) ? phantomFocusable(run, brand) : null;
  if (metric === 'unfindable-links') {
    return hasReachData(run, brand) ? unreachableStats(run, brand).links : null;
  }
  /** Rules are the one case where absence really is zero — see `ruleDeltas`. */
  return ruleTotals(run, brand)[metric.slice('rule:'.length)] ?? 0;
}

/** Small inline sparkline series. Gaps stay gaps. */
export function sparklineSeries(
  runs: Run[],
  brand: Brand,
  metric: TrendMetric
): Array<number | null> {
  return runs.map((r) => metricValue(r, brand, metric));
}

/* ------------------------------------------------------------------ */
/* Issue catalogue metrics                                             */
/* ------------------------------------------------------------------ */

export interface ResolvedMetric {
  label: string;
  value: number;
  /**
   * What this figure is scored against, or null when it has none.
   *
   * Colour on this dashboard means "a target was missed", never "the number is
   * not zero" — see `cellTone`. A descriptive magnitude like the number of
   * navigation links in the tree has no target, and printing it red says a
   * correct page is broken.
   */
  target: number | null;
  /** Only `nav-links-in-tree` — more of the nav reachable is better. */
  higherIsBetter: boolean;
  /**
   * True when a zero here is a measurement artefact rather than health —
   * Insureon reads 0 on button-name and link-name because the controls are
   * <div>s the rule structurally cannot fire on.
   */
  misleadingZero: boolean;
  /**
   * True when the run never ran the check behind this figure, so `value` is
   * zero because nothing looked. The UI must print "not measured" rather than
   * the number — a catalogue entry quoting 0 for a check that did not exist is
   * the same false-clean as the scorecard row that used to score it a pass,
   * and this layer is the one Product and SEO actually read.
   */
  notMeasured: boolean;
}

/**
 * Turn a catalogue MetricRef into a live number from the current run.
 *
 * Keeping this out of `issues.ts` is deliberate: the catalogue stays free of
 * both figures and `Run` types, so it can be edited by anyone tracking the
 * work without touching anything that computes.
 */
/**
 * Controls that carry a real activation listener but no role, no name and no
 * place in the tab order. Summed across pages — unlike the mega-menu, these
 * are per-page defects, and the same component repeated on ten pages is ten
 * places an agent hits a dead end.
 */
export function ghostControlCount(run: Run, brand: Brand, match?: string): number {
  let total = 0;
  for (const [, page] of scannedPages(run, brand)) {
    /** One definition, shared with the per-page table. See `countedGhostControls`. */
    const controls = countedGhostControls(page);
    total += match
      ? controls.filter((c) => c.selector.toLowerCase().includes(match.toLowerCase())).length
      : controls.length;
  }
  return total;
}

/**
 * Elements that respond to a click without declaring a role, across all pages.
 *
 * Not a defect — a magnitude, and a correct page has a non-zero one. Two
 * separate cautions ride on it. A run recorded before the probe existed sums to
 * zero here, so ask `probeMeasured` before rendering it. And it is the least
 * reproducible figure the scanner produces: sixteen scans of an unchanged
 * insureon.com home page returned 1, 36 and 87, so `metricStability` marks it
 * volatile and no trend may be drawn on it.
 */
export function clickableNoRoleCount(run: Run, brand: Brand): number {
  let total = 0;
  for (const [, page] of scannedPages(run, brand)) total += page.clickableNoRole ?? 0;
  return total;
}

/**
 * Distinct off-screen-but-live panels, and the controls trapped in them.
 *
 * `excludeLargest` drops each page's biggest panel, which is the mega-menu —
 * it already has its own headline figure, and leaving it in would swamp the
 * smaller components making the same mistake.
 *
 * A run that predates the panel probe sums to zero here rather than reporting
 * absence; `probeMeasured('hidden-panel-controls')` is what distinguishes the
 * two, and every caller that renders a verdict asks it.
 */
export function hiddenPanelStats(
  run: Run,
  brand: Brand,
  { excludeLargest = false } = {}
): { panels: number; controls: number; mouseOnly: number } {
  let panels = 0;
  let controls = 0;
  let mouseOnly = 0;
  for (const [, page] of scannedPages(run, brand)) {
    let list = page.hiddenPanels ?? [];
    if (excludeLargest && list.length > 0) {
      const largest = [...list].sort((a, b) => b.focusable - a.focusable)[0];
      list = list.filter((p) => p !== largest);
    }
    panels += list.length;
    for (const p of list) {
      controls += p.focusable;
      if (!p.hasKeyboardTrigger) mouseOnly += 1;
    }
  }
  return { panels, controls, mouseOnly };
}

/**
 * Content out of the accessibility tree that nothing in the tree announces.
 *
 * The counterpart to `hiddenPanelStats`, and the two never overlap: that one
 * covers regions still in the tree but off screen, this one regions genuinely
 * out of it. A page tends to fail one way or the other depending on the
 * viewport — the same menu is an off-screen drawer on mobile and a
 * `display: none` block on desktop.
 */
export function unreachableStats(
  run: Run,
  brand: Brand
): { panels: number; unannouncedPanels: number; controls: number; links: number } {
  let panels = 0;
  let unannouncedPanels = 0;
  let controls = 0;
  let links = 0;
  for (const [, page] of scannedPages(run, brand)) {
    const t = page.unreachableTotals;
    /**
     * Skipped, not counted as zero — but the sum still comes out zero for a
     * run where no page has this, which is the 10 Aug 2026 run in `data/runs/`
     * exactly. `hasReachData` is what says so, and the scorecard row, the
     * catalogue and the trend series all ask it before showing this figure.
     */
    if (!t) continue;
    panels += t.panels;
    unannouncedPanels += t.unannouncedPanels;
    controls += t.unannouncedFocusable;
    links += t.unannouncedLinks;
  }
  return { panels, unannouncedPanels, controls, links };
}

/**
 * Of everywhere the pages say you can go, how much can an agent see?
 *
 * Summed across pages, so a nav repeated on ten pages counts ten times — which
 * is right: it's ten pages from which an agent can't find its way onward.
 */
export function navReach(
  run: Run,
  brand: Brand
): { total: number; inTree: number; hidden: number } {
  let total = 0;
  let inTree = 0;
  for (const [, page] of scannedPages(run, brand)) {
    if (!page.navLinks) continue;
    total += page.navLinks.total;
    inTree += page.navLinks.inTree;
  }
  return { total, inTree, hidden: total - inTree };
}

/** True when this run measured reachability — its absence isn't a zero. */
export function hasReachData(run: Run, brand: Brand): boolean {
  return scannedPages(run, brand).some(([, p]) => p.navLinks !== undefined);
}

/** rule-style per-page breakdown for the probe-based checks. */
export function perPageProbeTotals(
  run: Run,
  brand: Brand
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {
    'ghost-controls': {},
    'hidden-panel-controls': {},
    'clickable-no-role': {},
    'unfindable-links': {},
  };
  for (const [key, page] of scannedPages(run, brand)) {
    /**
     * The same filter the brand total uses — see `countedGhostControls`.
     *
     * This line used to count every candidate, including the ones the browser's
     * listener registry disproved, while `ghostControlCount` above dropped
     * them. No run on disk contains a disproved candidate, so nothing on screen
     * changes today; the two were one CDP answer away from disagreeing.
     */
    const ghosts = countedGhostControls(page).length;
    if (ghosts) out['ghost-controls'][key] = ghosts;
    const trapped = (page.hiddenPanels ?? []).reduce((sum, h) => sum + h.focusable, 0);
    if (trapped) out['hidden-panel-controls'][key] = trapped;
    if (page.clickableNoRole) out['clickable-no-role'][key] = page.clickableNoRole;
    /**
     * Zero cells are omitted from every table in this function, so a page that
     * was never measured and a page measured at zero both render blank. That
     * is the existing convention (`perPageRuleTotals` does the same) and it is
     * safe only because it renders as nothing rather than as a number. The
     * header above it is where "not measured" has to be said out loud, which
     * is what `probeMeasured` is for.
     */
    const unfindable = page.unreachableTotals?.unannouncedLinks ?? 0;
    if (unfindable) out['unfindable-links'][key] = unfindable;
  }
  return out;
}

/**
 * The checks this scanner performs that axe does not.
 *
 * They sit in the same table as the axe rules on purpose: from a reader's
 * point of view "can an agent identify this control" is one question, and
 * splitting it across two screens by which engine happened to measure it
 * would be an implementation detail leaking into the UI.
 */
export const PROBE_CHECKS = [
  {
    id: 'ghost-controls',
    label: "Controls an agent can't identify",
    impact: 'critical' as const,
    note: 'Real click listener, no role, no name, not in the tab order. No rule engine can see these.',
    stability: metricStability('ghost-controls'),
  },
  {
    id: 'hidden-panel-controls',
    label: 'Controls trapped in off-screen panels',
    impact: 'serious' as const,
    note: 'Still in the accessibility tree and still tabbable, but not on screen.',
    stability: metricStability('hidden-panel-controls'),
  },
  {
    id: 'unfindable-links',
    label: 'Links an agent cannot find',
    impact: 'critical' as const,
    note: 'In the page, out of the accessibility tree, and nothing in the tree says they exist. A menu behind a proper disclosure button is not counted — that one can be found.',
    stability: metricStability('unfindable-links'),
  },
  {
    id: 'clickable-no-role',
    label: 'Clickable elements with no role',
    impact: 'moderate' as const,
    /**
     * Not a target, and now measured not to be a trend either: sixteen scans
     * of an unchanged insureon.com home page returned 1, 36 and 87. The
     * `stability` field is how the table says so; rendering a delta on this
     * row without it is showing a reader noise and calling it a change.
     */
    note: 'Mostly convenience click targets wrapping a real link. Context, not a target.',
    stability: metricStability('clickable-no-role'),
  },
];

export function probeTotals(run: Run, brand: Brand): Record<string, number> {
  const panels = hiddenPanelStats(run, brand);
  return {
    'ghost-controls': ghostControlCount(run, brand),
    'hidden-panel-controls': panels.controls,
    'unfindable-links': unreachableStats(run, brand).links,
    'clickable-no-role': clickableNoRoleCount(run, brand),
  };
}

/**
 * Which of the four probe checks this run actually ran, per check id.
 *
 * `probeTotals` cannot answer this and must not be asked to: it returns
 * numbers, and a run recorded before a probe existed returns zero from it —
 * which renders as a clean result for a check that never happened.
 *
 * This is not hypothetical. The 10 Aug 2026 run in `data/runs/` carries
 * `ghostControls` but no reachability fields at all, so "links an agent cannot
 * find" reads 0 on it for the sole reason that nothing looked — while the next
 * run, at the same mobile profile, measured 51 on the same brand. A single
 * `hasProbeData` boolean cannot cover this, because that run does have probe
 * data; just not this probe's.
 *
 * Each entry checks its own field rather than assuming the probes shipped
 * together, which is exactly the assumption that produced the 10 Aug gap.
 */
export function probeMeasured(run: Run, brand: Brand): Record<string, boolean> {
  const pages = scannedPages(run, brand);
  const present = (field: keyof ScannedPage) => pages.some(([, p]) => fieldPresent(p, field));
  return {
    'ghost-controls': present('ghostControls'),
    'hidden-panel-controls': present('hiddenPanels'),
    'unfindable-links': present('unreachableTotals'),
    'clickable-no-role': present('clickableNoRole'),
  };
}

/** True when this run predates the probes — their absence isn't a zero. */
export function hasProbeData(run: Run, brand: Brand): boolean {
  return scannedPages(run, brand).some(([, p]) => p.ghostControls !== undefined);
}

/**
 * What each catalogue metric is scored against — the one place that decides it.
 *
 * A defect is scored against zero. A *magnitude* is not a defect and has no
 * target: how much of the nav sits outside the tree, or how many clickable
 * elements carry no role, are readings you interpret next to the verdict
 * metrics, and a correct site has non-zero ones. Colouring those red — which
 * is what "non-zero is bad" does — reports health as breakage, and it is the
 * inverse of the false clean this tool exists to refuse.
 *
 * `rule` is absent on purpose: its target depends on the rule, not the kind.
 * `resolveMetric` reads `ruleMeta().exact` for it — a discrete-defect rule
 * scores against zero, while a drifting one (`region`, `color-contrast`,
 * `link-in-text-block`) has no target that survives content churn.
 */
const METRIC_SCORING: Record<
  Exclude<MetricRef['kind'], 'rule'>,
  { target: number | null; higherIsBetter: boolean }
> = {
  phantom: { target: 0, higherIsBetter: false },
  'phantom-links': { target: 0, higherIsBetter: false },
  'nameless-buttons': { target: 0, higherIsBetter: false },
  'nameless-links': { target: 0, higherIsBetter: false },
  'empty-href': { target: 0, higherIsBetter: false },
  'pages-missing-main': { target: 0, higherIsBetter: false },
  'ghost-controls': { target: 0, higherIsBetter: false },
  'ghost-controls-matching': { target: 0, higherIsBetter: false },
  'hidden-panels': { target: 0, higherIsBetter: false },
  'hidden-panel-controls': { target: 0, higherIsBetter: false },
  'secondary-hidden-panel-controls': { target: 0, higherIsBetter: false },
  'unfindable-links': { target: 0, higherIsBetter: false },
  'unannounced-panels': { target: 0, higherIsBetter: false },
  'clickable-no-role': { target: null, higherIsBetter: false },
  'nav-links-hidden': { target: null, higherIsBetter: false },
  'nav-links-total': { target: null, higherIsBetter: false },
  'nav-links-in-tree': { target: null, higherIsBetter: true },
};

export function resolveMetric(run: Run, brand: Brand, ref: MetricRef): ResolvedMetric {
  const nameless = namelessCounts(run, brand);

  /**
   * Which underlying checks this run actually ran.
   *
   * Every branch below has to name one. The catalogue is the layer Product and
   * SEO read, so a zero here is the one most likely to be quoted in a meeting
   * as "that one's fixed" — and a check that never ran must never be able to
   * produce that sentence.
   */
  const probes = probeMeasured(run, brand);
  const reach = hasReachData(run, brand);
  const anyPage = scannedPages(run, brand).length > 0;

  const scoring =
    ref.kind === 'rule'
      ? { target: ruleMeta(ref.ruleId).exact ? 0 : null, higherIsBetter: false }
      : METRIC_SCORING[ref.kind];

  const out = (value: number, measured: boolean, misleadingZero = false): ResolvedMetric => ({
    label: ref.label,
    value,
    target: scoring.target,
    higherIsBetter: scoring.higherIsBetter,
    misleadingZero,
    notMeasured: !anyPage || !measured,
  });

  switch (ref.kind) {
    case 'rule': {
      const value = ruleTotals(run, brand)[ref.ruleId] ?? 0;
      const meta = ruleMeta(ref.ruleId);
      /**
       * axe has run on every page of every run on file, and the data contract
       * says an absent rule fired zero times. This is the one family where a
       * zero is always a measurement.
       */
      return out(value, true, value === 0 && (meta.misleadingZeroOn ?? []).includes(brand));
    }
    case 'phantom':
      return out(phantomFocusable(run, brand), hasPhantomData(run, brand));
    case 'phantom-links':
      return out(worstPhantom(run, brand).phantom?.links ?? 0, hasPhantomData(run, brand));
    case 'nameless-buttons':
      return out(nameless.buttons, hasNamelessData(run, brand));
    case 'nameless-links':
      return out(nameless.links, hasNamelessData(run, brand));
    case 'empty-href':
      return out(nameless.emptyHref, hasNamelessData(run, brand));
    case 'pages-missing-main': {
      const { withMain, scanned } = mainCoverage(run, brand);
      return out(scanned - withMain, true);
    }
    case 'ghost-controls':
      return out(ghostControlCount(run, brand), probes['ghost-controls']);
    case 'ghost-controls-matching':
      return out(ghostControlCount(run, brand, ref.match), probes['ghost-controls']);
    case 'clickable-no-role':
      return out(clickableNoRoleCount(run, brand), probes['clickable-no-role']);
    case 'hidden-panels':
      return out(hiddenPanelStats(run, brand).panels, probes['hidden-panel-controls']);
    case 'hidden-panel-controls':
      return out(hiddenPanelStats(run, brand).controls, probes['hidden-panel-controls']);
    case 'secondary-hidden-panel-controls':
      return out(
        hiddenPanelStats(run, brand, { excludeLargest: true }).controls,
        probes['hidden-panel-controls']
      );
    case 'unfindable-links':
      return out(unreachableStats(run, brand).links, probes['unfindable-links']);
    case 'nav-links-hidden':
      /**
       * Descriptive, not a verdict: how much of the nav is out of the tree,
       * whether or not something announces it. Read it next to
       * `unfindable-links` — a big number here with a zero there is a menu that
       * is correctly closed, which is the shape a fixed site has.
       */
      return out(navReach(run, brand).hidden, reach);
    case 'nav-links-in-tree':
      return out(navReach(run, brand).inTree, reach);
    case 'nav-links-total':
      return out(navReach(run, brand).total, reach);
    case 'unannounced-panels':
      return out(unreachableStats(run, brand).unannouncedPanels, probes['unfindable-links']);
  }
}
