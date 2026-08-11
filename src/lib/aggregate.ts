import type { MetricRef } from './issues';
import {
  Brand,
  PageResult,
  PhantomMenu,
  Run,
  ScannedPage,
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

export function phantomFocusable(run: Run, brand: Brand): number {
  return worstPhantom(run, brand).phantom?.focusable ?? 0;
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
}

const NOISE_TOLERANCE = 2;

export function makeDelta(current: number, previous: number | null, exact: boolean): Delta {
  if (previous === null) {
    return { current, previous: null, change: null, exact, notable: false, direction: 'unknown' };
  }
  const change = current - previous;
  const notable = exact ? change !== 0 : Math.abs(change) > NOISE_TOLERANCE;
  return {
    current,
    previous,
    change,
    exact,
    notable,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
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
    out[id] = makeDelta(now[id] ?? 0, before ? before[id] ?? 0 : null, ruleMeta(id).exact);
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
}

export function scorecard(run: Run, brand: Brand): ScorecardRow[] {
  const totals = ruleTotals(run, brand);
  const nameless = namelessCounts(run, brand);
  const main = mainCoverage(run, brand);
  const focusable = phantomFocusable(run, brand);
  const get = (id: string) => totals[id] ?? 0;

  const misleading = (id: string) => (ruleMeta(id).misleadingZeroOn ?? []).includes(brand);

  return [
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
      met: nameless.emptyHref === 0,
      inScope: true,
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
      met: focusable === 0,
      inScope: true,
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
      key: 'unreachable-nav',
      label: 'Navigation links an agent cannot find',
      value: navReach(run, brand).hidden,
      target: 0,
      /** Same reasoning as ghost-controls: absence of the check isn't a pass. */
      met: hasReachData(run, brand) ? navReach(run, brand).hidden === 0 : null,
      inScope: true,
      notMeasured: !hasReachData(run, brand),
      note: 'Out of the accessibility tree with nothing announcing them. Hover-only menus do this.',
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
}

/** Passed / total across the rows that carry a hard target. */
export function passRatio(run: Run, brand: Brand): { passed: number; total: number } {
  const rows = scorecard(run, brand).filter((r) => r.met !== null);
  return { passed: rows.filter((r) => r.met).length, total: rows.length };
}

/* ------------------------------------------------------------------ */
/* Trend series                                                        */
/* ------------------------------------------------------------------ */

export type TrendMetric = 'total' | 'in-scope' | 'phantom' | `rule:${string}`;

export function metricValue(run: Run, brand: Brand, metric: TrendMetric): number {
  if (metric === 'total') return totalNodes(run, brand);
  if (metric === 'in-scope') return inScopeNodes(run, brand);
  if (metric === 'phantom') return phantomFocusable(run, brand);
  return ruleTotals(run, brand)[metric.slice('rule:'.length)] ?? 0;
}

/** Small inline sparkline series. */
export function sparklineSeries(runs: Run[], brand: Brand, metric: TrendMetric): number[] {
  return runs.map((r) => metricValue(r, brand, metric));
}

/* ------------------------------------------------------------------ */
/* Issue catalogue metrics                                             */
/* ------------------------------------------------------------------ */

export interface ResolvedMetric {
  label: string;
  value: number;
  /**
   * True when a zero here is a measurement artefact rather than health —
   * Insureon reads 0 on button-name and link-name because the controls are
   * <div>s the rule structurally cannot fire on.
   */
  misleadingZero: boolean;
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
    const controls = page.ghostControls ?? [];
    total += match
      ? controls.filter((c) => c.selector.toLowerCase().includes(match.toLowerCase())).length
      : controls.length;
  }
  return total;
}

/** Elements that respond to a click without declaring a role, across all pages. */
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
    'unreachable-nav': {},
  };
  for (const [key, page] of scannedPages(run, brand)) {
    const ghosts = (page.ghostControls ?? []).length;
    if (ghosts) out['ghost-controls'][key] = ghosts;
    const trapped = (page.hiddenPanels ?? []).reduce((sum, h) => sum + h.focusable, 0);
    if (trapped) out['hidden-panel-controls'][key] = trapped;
    if (page.clickableNoRole) out['clickable-no-role'][key] = page.clickableNoRole;
    const hidden = page.navLinks ? page.navLinks.total - page.navLinks.inTree : 0;
    if (hidden) out['unreachable-nav'][key] = hidden;
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
  },
  {
    id: 'hidden-panel-controls',
    label: 'Controls trapped in off-screen panels',
    impact: 'serious' as const,
    note: 'Still in the accessibility tree and still tabbable, but not on screen.',
  },
  {
    id: 'unreachable-nav',
    label: 'Navigation links an agent cannot find',
    impact: 'critical' as const,
    note: 'In the page, out of the accessibility tree, and nothing in the tree says they exist.',
  },
  {
    id: 'clickable-no-role',
    label: 'Clickable elements with no role',
    impact: 'moderate' as const,
    note: 'Mostly convenience click targets wrapping a real link. Context, not a target.',
  },
];

export function probeTotals(run: Run, brand: Brand): Record<string, number> {
  const panels = hiddenPanelStats(run, brand);
  return {
    'ghost-controls': ghostControlCount(run, brand),
    'hidden-panel-controls': panels.controls,
    'unreachable-nav': navReach(run, brand).hidden,
    'clickable-no-role': clickableNoRoleCount(run, brand),
  };
}

/** True when this run predates the probes — their absence isn't a zero. */
export function hasProbeData(run: Run, brand: Brand): boolean {
  return scannedPages(run, brand).some(([, p]) => p.ghostControls !== undefined);
}

export function resolveMetric(run: Run, brand: Brand, ref: MetricRef): ResolvedMetric {
  const nameless = namelessCounts(run, brand);

  switch (ref.kind) {
    case 'rule': {
      const value = ruleTotals(run, brand)[ref.ruleId] ?? 0;
      const meta = ruleMeta(ref.ruleId);
      return {
        label: ref.label,
        value,
        misleadingZero: value === 0 && (meta.misleadingZeroOn ?? []).includes(brand),
      };
    }
    case 'phantom':
      return { label: ref.label, value: phantomFocusable(run, brand), misleadingZero: false };
    case 'phantom-links':
      return {
        label: ref.label,
        value: worstPhantom(run, brand).phantom?.links ?? 0,
        misleadingZero: false,
      };
    case 'nameless-buttons':
      return { label: ref.label, value: nameless.buttons, misleadingZero: false };
    case 'nameless-links':
      return { label: ref.label, value: nameless.links, misleadingZero: false };
    case 'empty-href':
      return { label: ref.label, value: nameless.emptyHref, misleadingZero: false };
    case 'pages-missing-main': {
      const { withMain, scanned } = mainCoverage(run, brand);
      return { label: ref.label, value: scanned - withMain, misleadingZero: false };
    }
    case 'ghost-controls':
      return { label: ref.label, value: ghostControlCount(run, brand), misleadingZero: false };
    case 'ghost-controls-matching':
      return {
        label: ref.label,
        value: ghostControlCount(run, brand, ref.match),
        misleadingZero: false,
      };
    case 'clickable-no-role':
      return { label: ref.label, value: clickableNoRoleCount(run, brand), misleadingZero: false };
    case 'hidden-panels':
      return {
        label: ref.label,
        value: hiddenPanelStats(run, brand).panels,
        misleadingZero: false,
      };
    case 'hidden-panel-controls':
      return {
        label: ref.label,
        value: hiddenPanelStats(run, brand).controls,
        misleadingZero: false,
      };
    case 'secondary-hidden-panel-controls':
      return {
        label: ref.label,
        value: hiddenPanelStats(run, brand, { excludeLargest: true }).controls,
        misleadingZero: false,
      };
    case 'nav-links-hidden':
      return { label: ref.label, value: navReach(run, brand).hidden, misleadingZero: false };
    case 'nav-links-in-tree':
      return { label: ref.label, value: navReach(run, brand).inTree, misleadingZero: false };
    case 'nav-links-total':
      return { label: ref.label, value: navReach(run, brand).total, misleadingZero: false };
    case 'unannounced-panels':
      return {
        label: ref.label,
        value: unreachableStats(run, brand).unannouncedPanels,
        misleadingZero: false,
      };
  }
}
