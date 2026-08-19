/**
 * Types, constants and pure helpers shared by server and client code.
 * Deliberately free of `node:fs` so client components can import from here
 * without dragging the filesystem into the browser bundle.
 */
import type { Environment } from './environment';

export const BRANDS = ['insureon', 'techinsurance'] as const;
export type Brand = (typeof BRANDS)[number];

export const BRAND_LABEL: Record<Brand, string> = {
  insureon: 'Insureon',
  techinsurance: 'TechInsurance',
};

/** Three-letter site tags for dense tables and chips. */
export const BRAND_SHORT: Record<Brand, string> = {
  insureon: 'ION',
  techinsurance: 'TIG',
};

/**
 * Line colours for the charts, which need literal values rather than Tailwind
 * classes. Kept here so the chart, its legend and anything else that needs to
 * identify a brand by colour can never disagree.
 *
 * Deliberately not drawn from the severity palette: red and orange mean
 * "something is wrong" everywhere else in this UI, and a brand isn't a
 * severity. Cobalt matches the accent token; teal is the furthest distinct
 * hue that still reads as neutral. Mirrored in tailwind.config.ts.
 */
export const BRAND_COLOR: Record<Brand, string> = {
  insureon: '#7C96FF',
  techinsurance: '#2DD4BF',
};

/** Canonical order. A run may legitimately contain fewer than all ten. */
export const PAGE_KEYS = [
  'home',
  'policy',
  'major',
  'minor',
  'article',
  'resources',
  'about',
  'contact',
  'legal',
  'a11y-stmt',
] as const;
export type PageKey = string;

export const PAGE_LABEL: Record<string, string> = {
  home: 'Home',
  policy: 'Policy',
  major: 'Major category',
  minor: 'Minor category',
  article: 'Article',
  resources: 'Resources',
  about: 'About',
  contact: 'Contact',
  legal: 'Legal',
  'a11y-stmt': 'Accessibility statement',
};

export interface ViolationSample {
  t: string[];
  h: string;
}

export interface Violation {
  id: string;
  impact: string;
  n: number;
  sample?: ViolationSample[];
}

export interface PhantomMenu {
  transform: string | null;
  display: string | null;
  visibility: string | null;
  ariaHidden: string | null;
  inert: boolean;
  pointerEvents: string | null;
  exposedInTree: boolean;
  links: number;
  buttons: number;
  focusable: number;
  tabbable: number;
  /**
   * Whether anything announces this panel. Optional because no run on disk
   * carries them: `phantomMenu` is a projection of the largest `hiddenPanel`
   * (probes.mjs:497) and the projection drops the two trigger fields the panel
   * itself records. Until the scanner carries them through,
   * `phantomPanelState()` recovers them by matching this projection back to the
   * panel it came from — and returns null, not "fine", when it cannot.
   *
   * Names deliberately identical to `HiddenPanel`'s, so a future
   * carry-through is a copy rather than a translation.
   */
  hasKeyboardTrigger?: boolean;
  triggerHasAriaExpanded?: boolean;
}

/**
 * An element that behaves as a control — it carries a real activation
 * listener — while declaring no role, no accessible name, and no place in the
 * tab order. Invisible to every automated audit, because there is nothing
 * there for a rule about buttons to fire on. The mobile hamburger is the
 * canonical example.
 */
export interface GhostControl {
  selector: string;
  html: string;
  tag: string;
  testId: string | null;
  hasOnClickAttr: boolean;
  cursorPointer: boolean;
  keyboardReachable: boolean;
  /** true = confirmed against the browser's listener registry; null = not checked. */
  confirmedListener: boolean | null;
  /** Which script attached the listener, so a finding can be traced or dismissed. */
  listenerScript?: string | null;
  /**
   * True when the only handlers here are ones bound across most of the page —
   * an analytics script, not this element's behaviour.
   */
  listenerIsShared?: boolean;
}

/**
 * A region still in the accessibility tree, still full of tabbable controls,
 * that isn't on screen. Found by property rather than by selector, so it
 * catches any component making this mistake, not only the known one.
 */
export interface HiddenPanel {
  selector: string;
  /** Plain-language reasons it isn't visible, e.g. "collapsed to zero size". */
  why: string[];
  transform: string | null;
  display: string | null;
  visibility: string | null;
  opacity: string | null;
  maxHeight: string | null;
  ariaHidden: string | null;
  inert: boolean;
  pointerEvents: string | null;
  exposedInTree: boolean;
  links: number;
  buttons: number;
  focusable: number;
  tabbable: number;
  /** false = nothing keyboard-reachable opens it, so it's mouse-only. */
  hasKeyboardTrigger: boolean;
  triggerHasAriaExpanded: boolean;
  sample: string;
}

/**
 * A region genuinely out of the accessibility tree. That is not a fault by
 * itself — it is how a closed menu should behave — so the field that matters
 * is `announced`: whether anything still in the tree tells an agent it exists.
 */
export interface UnreachablePanel {
  selector: string;
  /** e.g. ["display: none"] */
  why: string[];
  inNav: boolean;
  links: number;
  buttons: number;
  focusable: number;
  hasTrigger: boolean;
  triggerInTree: boolean;
  /** A trigger in the tree that carries aria-expanded/haspopup/controls. */
  announced: boolean;
  triggerSelector: string | null;
  sample: string;
}

export interface UnreachableTotals {
  panels: number;
  unannouncedPanels: number;
  /** Controls an agent can neither see nor discover. The number that matters. */
  unannouncedFocusable: number;
  unannouncedLinks: number;
}

/** Of everywhere the page says you can go, how much can an agent see? */
export interface NavLinkReach {
  total: number;
  inTree: number;
}

export interface ScannedPage {
  url: string;
  error?: undefined;
  violations: Violation[];
  namelessButtons: string[];
  namelessLinks: string[];
  emptyHref: string[];
  hasMain: boolean;
  phantomMenu: PhantomMenu | null;
  /** Added after the probe rewrite; absent on runs scanned before it. */
  ghostControls?: GhostControl[];
  clickableNoRole?: number;
  hiddenPanels?: HiddenPanel[];
  httpStatus?: number;
  /** Added with the desktop profile; absent on runs scanned before it. */
  unreachablePanels?: UnreachablePanel[];
  unreachableTotals?: UnreachableTotals;
  navLinks?: NavLinkReach;
  /**
   * Which variant of itself this URL served, where the target declared how to
   * ask. Absent means no identity was declared, or the run predates the field.
   *
   * A URL is assumed to name a page and sometimes does not: Insureon's homepage
   * is one item under a content test and returns one of three materially
   * different documents. Comparing two figures taken from different documents
   * is the same fault as comparing two device profiles, and it is guarded the
   * same way — see `identityMismatch` in compare.ts.
   *
   * Provenance, not measurement. Nothing in PAGE_DEFECTS reads it, so it can
   * never move a defect count.
   */
  identity?: PageIdentity;
  /**
   * How many loads this page took before it served the variant the previous
   * run recorded. Absent means one — the normal case. Present means the run
   * asked again, and the number is here rather than implied, because
   * re-loading until you like the answer is a selection you have to declare.
   */
  identityAttempts?: number;
  /**
   * The other documents this URL served, keyed by variant name.
   *
   * Deliberately *beside* the page rather than as extra pages: the dashboard
   * aggregates on page key, so three homepages stored as three pages would
   * count the home page three times in a site total. The page this field
   * hangs off is the page of record — it alone feeds every figure — and these
   * are reference copies for anyone asking how the variants differ.
   */
  variants?: Record<string, ScannedPage>;
}

export interface PageIdentity {
  /** The question, stable across runs so two runs can be compared on it. */
  key: string;
  /** The answer, or null when the page was asked and could not tell. */
  value: string | null;
  /** Set when the reader threw. The scan still stands; the identity does not. */
  error?: string;
}

/**
 * Two pages are comparable on identity when they answered the same question the
 * same way, or when neither was asked.
 *
 * `null` is deliberately NOT equal to `null` here. Two pages that both failed to
 * identify themselves are not known to be the same page — they are two unknowns,
 * and treating unknown as a match is how a comparison of variant A against
 * variant C would render as a confident delta. Same rule as everywhere else in
 * this codebase: absence of a measurement is not a value.
 */
export function sameIdentity(a?: PageIdentity, b?: PageIdentity): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.key !== b.key) return false;
  return a.value !== null && a.value === b.value;
}

export interface FailedPage {
  url: string;
  error: string;
}

export type PageResult = ScannedPage | FailedPage;

/**
 * These sites branch their markup on the device, on the server, so the profile
 * a scan ran at decides which page was measured — not merely how it was framed.
 * Every figure is therefore reported against a named viewport, and two runs are
 * only comparable at the same one.
 */
export const VIEWPORT_NAMES = ['desktop', 'mobile'] as const;
export type ViewportName = (typeof VIEWPORT_NAMES)[number];

export const VIEWPORT_LABEL: Record<ViewportName, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
};

/**
 * Desktop leads because it is the markup agents are served: measured against
 * production, a desktop UA, an unrecognised UA and no UA at all all resolve to
 * the desktop layout, and only a recognised mobile UA gets the mobile one.
 */
export const DEFAULT_VIEWPORT: ViewportName = 'desktop';

export interface ViewportSpec {
  width: number;
  height: number;
  isMobile: boolean;
}

export interface BrandResults {
  insureon: Record<string, PageResult>;
  techinsurance: Record<string, PageResult>;
}

export interface RunMeta {
  startedAt: string;
  finishedAt?: string;
  axeVersion?: string;
  /** Legacy single-profile runs. Present only on files written before profiles. */
  viewport?: ViewportSpec;
  /** What each measured profile actually was. */
  viewports?: Partial<Record<ViewportName, ViewportSpec>>;
  primaryViewport?: ViewportName;
  label?: string;
  /* ----------------------------------------------------------------
   * Provenance: which engine produced these numbers.
   *
   * Every one of these is optional, and every one of them must render as
   * "not recorded" rather than as a value, because the three run files in
   * `data/runs` predate the fields entirely.
   *
   * They exist because of a discovery that invalidates comparison across the
   * existing series: three Chromium majors (148, 149 and 151) were driven
   * against these sites inside a single session, and no run file anywhere says
   * which one wrote it. Both published runs were also produced by probe code
   * that no longer exists — `a2cd211` rewrote five predicates underneath them —
   * so a trend line drawn through them is joining measurements taken with
   * different instruments. `axeVersion` above records the rule engine and
   * always has; these record the browser and the probes, which is where the
   * rest of the movement comes from.
   *
   * Recording them does not repair the historical runs. It makes the
   * discontinuity visible, so the first run that carries a `probeVersion` can
   * be marked as a new baseline rather than read as a regression.
   * ---------------------------------------------------------------- */
  /** Short git SHA of the `scanner/` directory contents at scan time. */
  probeVersion?: string;
  /** Full browser version string, e.g. "Chromium 149.0.7827.55". */
  browserVersion?: string;
  /** The executable actually launched — the default download or an override. */
  browserPath?: string;
}

/**
 * As stored on disk. Either the legacy single-viewport shape (brands at the top
 * level, implicitly mobile) or the current one (`byViewport`). The loader
 * normalises both; nothing downstream should read this type directly.
 */
export interface RunFile {
  meta: RunMeta;
  insureon?: Record<string, PageResult>;
  techinsurance?: Record<string, PageResult>;
  byViewport?: Partial<Record<ViewportName, BrandResults>>;
}

export interface Run {
  /** Filename without extension, e.g. "2026-08-07-0914". Stable id for the UI. */
  id: string;
  meta: RunMeta;
  /**
   * The primary viewport's results, so the aggregate helpers need no viewport
   * argument. To read a different one, project the run with `runAtViewport`
   * rather than reaching into `byViewport` — the projection is what stops a
   * caller comparing one run's desktop against another's mobile.
   */
  insureon: Record<string, PageResult>;
  techinsurance: Record<string, PageResult>;
  byViewport: Partial<Record<ViewportName, BrandResults>>;
  /** Which profiles this run actually measured, in canonical order. */
  viewports: ViewportName[];
  primaryViewport: ViewportName;
  /**
   * Production or staging, derived from the URLs the run recorded — never
   * from a declared field, because this is what decides whether two runs may
   * be compared. See `lib/environment.ts` for why that distinction earned its
   * own module.
   */
  environment: Environment;
}

/**
 * Re-point a run at one of its viewports so every existing helper reads that
 * profile's numbers. Returns null when the run never measured it — which is a
 * real answer ("not measured"), never a silent fallback to a different profile.
 */
export function runAtViewport(run: Run, viewport: ViewportName): Run | null {
  const results = run.byViewport[viewport];
  if (!results) return null;
  return {
    ...run,
    insureon: results.insureon,
    techinsurance: results.techinsurance,
    primaryViewport: viewport,
  };
}

/** Viewports measured by every one of these runs — the only comparable set. */
export function sharedViewports(runs: Run[]): ViewportName[] {
  if (runs.length === 0) return [];
  return VIEWPORT_NAMES.filter((v) => runs.every((r) => !!r.byViewport[v]));
}

/**
 * Key for the server-computed lookups the client indexes into.
 *
 * A run id alone used to be enough. It isn't any more: the same run holds two
 * sets of numbers, and keying on the id would hand whichever one happened to be
 * primary to a caller asking for the other.
 */
export function viewKey(runId: string, viewport: ViewportName): string {
  return `${runId}::${viewport}`;
}

/** The most recent run, or null when nothing has been scanned yet. */
export function latestRun(runs: Run[]): Run | null {
  return runs.length ? runs[runs.length - 1] : null;
}

export function isFailedPage(page: PageResult | undefined): page is FailedPage {
  return !!page && typeof (page as FailedPage).error === 'string';
}

export function isScannedPage(page: PageResult | undefined): page is ScannedPage {
  return !!page && !isFailedPage(page);
}

export type Verdict = 'clear' | 'needs-work' | 'blocking';

export const VERDICT_LABEL: Record<Verdict, string> = {
  clear: 'Clear',
  'needs-work': 'Needs work',
  blocking: 'Blocking issues',
};

/**
 * What the largest off-screen panel on this page actually is.
 *
 * - `none` — nothing off-screen holds a focusable control. Not a finding.
 * - `announced` — the controls are off screen, but a keyboard-reachable
 *   trigger carrying `aria-expanded` says the region exists and how to open
 *   it. This is what a *correct* closed menu looks like.
 * - `unannounced` — controls are off screen and nothing in the tree says so.
 *   An agent cannot find them; this is the dead end the tool exists to report.
 *
 * `null` means the run never recorded enough to tell, which is not the same
 * as `none` and must never be rendered as one.
 */
export type PhantomPanelState = 'none' | 'announced' | 'unannounced';

/** A keyboard-reachable trigger that declares the panel's state. */
export function hiddenPanelAnnounced(panel: HiddenPanel): boolean | null {
  /**
   * The type promises two booleans; a JSON file read off disk promises
   * nothing. Every panel in the four run files present today carries both
   * (checked), and both have been in `probes.mjs` since the first commit — but
   * run files arrive from a client-assembled full scan and from whatever
   * scanner build produced them, and this codebase is one field rename away
   * from reading `undefined` here.
   *
   * A panel that records no trigger measured the panel, not the trigger. The
   * answer is "unknown", never "no trigger" — the second would manufacture a
   * defect out of a missing field.
   */
  if (typeof panel.hasKeyboardTrigger !== 'boolean') return null;
  if (typeof panel.triggerHasAriaExpanded !== 'boolean') return null;
  /**
   * Both halves are required, and that is the definition the README already
   * states: "a closed dialog with an `aria-expanded` trigger is fine; a
   * `:hover` mega-menu is not." A trigger that is keyboard-reachable but
   * silent about state still leaves an agent with no way to know there is
   * anything behind it — which is the live production case on both brands'
   * mobile drawers, and it stays reported.
   */
  return panel.hasKeyboardTrigger && panel.triggerHasAriaExpanded;
}

export function phantomPanelState(page: ScannedPage): PhantomPanelState | null {
  const pm = page.phantomMenu;
  if (!pm) return 'none'; // no off-screen panel at all — measured, and clean
  if (pm.focusable === 0) return 'none'; // an empty region traps nobody

  // Prefer the panel's own answer if the scanner ever carries it through.
  if (typeof pm.hasKeyboardTrigger === 'boolean' && typeof pm.triggerHasAriaExpanded === 'boolean') {
    return pm.hasKeyboardTrigger && pm.triggerHasAriaExpanded ? 'announced' : 'unannounced';
  }

  /**
   * Otherwise recover it from `hiddenPanels`, which `phantomMenu` is derived
   * from: probes.mjs takes the panel with the most focusable controls and
   * copies a subset of its fields. Match on that same "largest" rule and
   * verify the identity on `focusable` + `links` before trusting it — replayed
   * over all three files in `data/runs`, the two agree on 64 of the 64 pages
   * that carry both. If they ever disagree, the projection is not this panel
   * and the honest answer is that we do not know.
   */
  const panels = page.hiddenPanels;
  if (!panels || panels.length === 0) return null;
  const largest = [...panels].sort((a, b) => b.focusable - a.focusable)[0];
  if (largest.focusable !== pm.focusable || largest.links !== pm.links) return null;

  const announced = hiddenPanelAnnounced(largest);
  if (announced === null) return null;
  return announced ? 'announced' : 'unannounced';
}

/**
 * False-positive class 1, at the verdict layer.
 *
 * This was `(page.phantomMenu?.focusable ?? 0) > 0` — every page holding a
 * closed panel with anything focusable inside it was declared blocking. That
 * is the same definition error `c354f70` removed from `aggregate.ts`, one
 * layer up: it counts *hidden*, when the defect is *unannounced*. Replayed
 * over every page of every run file, it is wrong on exactly two of them — both
 * 11 Aug runs call Insureon's desktop home page blocking on the strength of a
 * four-control accordion whose trigger carries `aria-expanded`. A correct
 * disclosure, reported as an agent dead end. Nothing else moves: the mobile
 * drawers holding 68 and 69 controls have a keyboard trigger that says nothing
 * about state, and they stay blocking.
 *
 * Hidden is not unfindable. Only unfindable is a defect.
 *
 * `null` is a real answer: the run recorded trapped controls but nothing about
 * what opens them. Do not collapse it to `false` — a check that did not run is
 * not a check that passed.
 */
export function phantomBlocking(page: ScannedPage): boolean | null {
  const state = phantomPanelState(page);
  if (state === null) return null;
  return state === 'unannounced';
}

/**
 * The page verdict with its inputs kept visible.
 *
 * `verdict` is `null` when an input was never measured and the answer genuinely
 * turns on it. That is the same shape `ScorecardRow.met` uses for a check a run
 * predates, and for the same reason: "nobody looked" is not a pass.
 */
export interface PageVerdict {
  verdict: Verdict | null;
  /** null = this run never recorded what announces the panel. */
  phantomBlocking: boolean | null;
  /** True when any input to the verdict was absent from the run. */
  notMeasured: boolean;
}

/**
 * Deliberately not a weighted score out of 100 — that invites treating an
 * arbitrary formula as ground truth. This is three honest buckets, plus the
 * absence of one: is there a critical failure or a control an agent cannot
 * find, is there a serious one, neither, or did the run not measure enough to
 * say.
 */
export function pageVerdict(page: ScannedPage): PageVerdict {
  const hasImpact = (impact: string) => (page.violations ?? []).some((v) => v.impact === impact);
  const phantom = phantomPanelState(page);
  const blocking = phantom === null ? null : phantom === 'unannounced';
  const notMeasured = phantom === null;

  // A critical violation settles it whatever the panel turns out to be, so
  // this branch stays answerable even on a run with no panel data.
  if (hasImpact('critical') || blocking === true) {
    return { verdict: 'blocking', phantomBlocking: blocking, notMeasured };
  }
  if (blocking === null) {
    return { verdict: null, phantomBlocking: null, notMeasured };
  }
  /**
   * An announced panel is not a dead end, but controls that stay in the tab
   * order while off screen are still a degraded experience — which is exactly
   * how `PROBE_CHECKS` grades `hidden-panel-controls`: serious, not critical.
   * Going straight from "blocking" to "clear" would overcorrect the false
   * positive into a false clean.
   */
  if (hasImpact('serious') || phantom === 'announced') {
    return { verdict: 'needs-work', phantomBlocking: blocking, notMeasured };
  }
  return { verdict: 'clear', phantomBlocking: blocking, notMeasured };
}

/**
 * The three-bucket verdict, for callers that must render something.
 *
 * The indeterminate case resolves to `blocking`, and that is a refusal to
 * certify rather than a claim: on a run with no panel data we know controls are
 * trapped off screen and know nothing about what announces them. Calling it
 * clear is the false-clean pattern that has already shipped twice here.
 * Callers that can show a caveat should use `pageVerdict()` and render
 * `verdict === null` as "not measured".
 *
 * In practice this branch is unreachable on anything the dashboard renders:
 * all three files in `data/runs/` carry `hiddenPanels`, and the only run that
 * does not is the retired 7 Aug baseline in `src/lib/fixtures/`, which nothing
 * displays. Every page it affects keeps the verdict it has today.
 */
export function verdictForPage(page: ScannedPage): Verdict {
  return pageVerdict(page).verdict ?? 'blocking';
}

/* ------------------------------------------------------------------ */
/* What counts as a defect                                             */
/* ------------------------------------------------------------------ */

/**
 * Does this ghost control count?
 *
 * `cursor: pointer` is a style; the browser's listener registry is the
 * authority. An element the registry says has no handler of its own is not a
 * control however it looks, so `confirmedListener === false` drops out.
 * `null` still counts — that means CDP could not answer, which is uncertainty,
 * not absence, and uncertainty is not allowed to shrink a defect count.
 *
 * Exported because this predicate was written out by hand in two places and
 * the two drifted: `aggregate.ts:432` filtered on it and `aggregate.ts:543`
 * did not, so one screen showed two different numbers for the same row.
 * One definition, imported.
 */
export function countsAsGhostControl(control: GhostControl): boolean {
  return control.confirmedListener !== false;
}

export type PageDefectKey =
  | 'namelessButtons'
  | 'namelessLinks'
  | 'emptyHref'
  | 'noMain'
  | 'ghostControls'
  | 'hiddenPanels'
  | 'unannouncedPanels'
  | 'unannouncedFocusable'
  | 'unannouncedLinks';

export interface PageDefectDefinition {
  key: PageDefectKey;
  label: string;
  /** What an agent hits, in one line. */
  why: string;
  /**
   * The count for one page — or `null` when this run never measured it, which
   * is not zero and must not render as one.
   */
  count: (page: ScannedPage) => number | null;
}

/**
 * The defect set. A correct page has every one of these at zero.
 *
 * This list exists because "what counts as a defect" had been restated in nine
 * separate comment blocks across `aggregate.ts`, `compare.ts` and `issues.ts`,
 * and restatements drift: two of the five false-positive classes were a metric
 * counting *hidden* where the defect is *unannounced*, and each had to be
 * found and fixed separately because no two call sites shared a definition.
 *
 * Deliberately not summed. These count different entities — controls, links
 * and regions — and `unannouncedLinks` is a subset of `unannouncedFocusable`,
 * so any total is double counting dressed up as a score. The same reasoning
 * that keeps `verdictForPage` down to three buckets applies here.
 */
export const PAGE_DEFECTS: readonly PageDefectDefinition[] = [
  {
    key: 'namelessButtons',
    label: 'Buttons with no accessible name',
    why: 'An agent can see the control and cannot say what it does.',
    count: (p) => p.namelessButtons?.length ?? null,
  },
  {
    key: 'namelessLinks',
    label: 'Links with no accessible name',
    why: 'A destination with nothing to identify it by.',
    count: (p) => p.namelessLinks?.length ?? null,
  },
  {
    key: 'emptyHref',
    label: 'Links with an empty destination',
    why: 'Announced as a link, goes nowhere.',
    count: (p) => p.emptyHref?.length ?? null,
  },
  {
    key: 'noMain',
    label: 'Missing main landmark',
    why: 'Nothing marks where the content starts, so an agent reads the chrome first.',
    /** Absence is unknown; only an explicit `false` is the defect. */
    count: (p) => (typeof p.hasMain === 'boolean' ? (p.hasMain ? 0 : 1) : null),
  },
  {
    key: 'ghostControls',
    label: "Controls an agent can't identify",
    why: 'Real click listener, no role, no name, not in the tab order. No rule engine can see these.',
    count: (p) => (p.ghostControls ? p.ghostControls.filter(countsAsGhostControl).length : null),
  },
  {
    key: 'hiddenPanels',
    label: 'Off-screen panels still in the tab order',
    why: 'Still in the tree, still tabbable, not on screen — focus lands somewhere invisible.',
    count: (p) => p.hiddenPanels?.length ?? null,
  },
  {
    key: 'unannouncedPanels',
    label: 'Regions nothing announces',
    why: 'Out of the tree with nothing in the tree saying they exist.',
    count: (p) => p.unreachableTotals?.unannouncedPanels ?? null,
  },
  {
    key: 'unannouncedFocusable',
    label: 'Controls an agent cannot find',
    why: 'The number that matters: controls an agent can neither see nor discover.',
    count: (p) => p.unreachableTotals?.unannouncedFocusable ?? null,
  },
  {
    key: 'unannouncedLinks',
    label: 'Links an agent cannot find',
    why: 'Hidden with nothing announcing them. A hover-only menu does this; a disclosure button does not.',
    count: (p) => p.unreachableTotals?.unannouncedLinks ?? null,
  },
];

/**
 * Measurements that are expected to be non-zero on a page with nothing wrong,
 * written down so nobody promotes one back into the defect set. Every entry
 * here has been reported as a defect at some point, and each time the fix was
 * to remember what the number actually describes.
 */
export const NON_DEFECT_METRICS: ReadonlyArray<{ key: string; why: string }> = [
  {
    key: 'clickableNoRole',
    why: 'A magnitude, not a target: mostly convenience click targets wrapping a real link.',
  },
  {
    key: 'unreachableTotals.panels',
    why: 'Every region out of the tree, announced ones included. A closed menu behind a disclosure button lives here and is correct.',
  },
  {
    key: 'unreachablePanels',
    why: 'The list behind the totals — it carries announced panels too. Filter on `announced === false` before counting anything.',
  },
  {
    key: 'navLinks.inTree < navLinks.total',
    why: 'Descriptive. A correctly closed menu is out of the tree by design; the defect is `unannouncedLinks`, not the gap.',
  },
];

/**
 * Every defect count for one page, plus what this run could not answer.
 *
 * `clean` is `boolean | null` on purpose, mirroring `ScorecardRow.met`: true
 * only when everything was measured and everything was zero, and `null` — not
 * `false`, and never `true` — when something was not measured at all.
 */
export function pageDefectCounts(page: ScannedPage): Record<PageDefectKey, number | null> {
  const out = {} as Record<PageDefectKey, number | null>;
  for (const defect of PAGE_DEFECTS) out[defect.key] = defect.count(page);
  return out;
}

export function pageDefectSummary(page: ScannedPage): {
  counts: Record<PageDefectKey, number | null>;
  /** Non-zero defects, in the canonical order of `PAGE_DEFECTS`. */
  present: Array<{ key: PageDefectKey; label: string; count: number }>;
  /** Defects this run never measured. Render as "not measured", never as 0. */
  notMeasured: PageDefectKey[];
  clean: boolean | null;
} {
  const counts = pageDefectCounts(page);
  const present: Array<{ key: PageDefectKey; label: string; count: number }> = [];
  const notMeasured: PageDefectKey[] = [];
  for (const defect of PAGE_DEFECTS) {
    const count = counts[defect.key];
    if (count === null) notMeasured.push(defect.key);
    else if (count > 0) present.push({ key: defect.key, label: defect.label, count });
  }
  const clean = present.length > 0 ? false : notMeasured.length > 0 ? null : true;
  return { counts, present, notMeasured, clean };
}

/**
 * Every page key seen across the given runs, canonical order first and any
 * unexpected keys appended. A run may have fewer than ten pages if a scan was
 * interrupted, so nothing may assume the full set.
 */
export function pageKeysUnion(runs: Run[]): string[] {
  const seen = new Set<string>();
  for (const run of runs) {
    for (const brand of BRANDS) {
      for (const key of Object.keys(run[brand] ?? {})) seen.add(key);
    }
  }
  const canonical = PAGE_KEYS.filter((k) => seen.has(k));
  const extra = [...seen].filter((k) => !PAGE_KEYS.includes(k as never)).sort();
  return [...canonical, ...extra];
}

/** "2026-08-07-0914" -> "7 Aug 2026, 09:14" */
export function formatRunTime(run: Run): string {
  const d = new Date(run.meta.startedAt);
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/** Short axis label for the trend chart. */
export function formatRunShort(run: Run): string {
  const d = new Date(run.meta.startedAt);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
