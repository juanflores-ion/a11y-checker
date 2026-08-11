/**
 * Types, constants and pure helpers shared by server and client code.
 * Deliberately free of `node:fs` so client components can import from here
 * without dragging the filesystem into the browser bundle.
 */
export const BRANDS = ['insureon', 'techinsurance'] as const;
export type Brand = (typeof BRANDS)[number];

export const BRAND_LABEL: Record<Brand, string> = {
  insureon: 'Insureon',
  techinsurance: 'TechInsurance',
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
  insureon: '#1F3FD8',
  techinsurance: '#0F766E',
};

/** Shared chart chrome, matching the `rule`, `muted` and `phantom` tokens. */
export const CHART = {
  grid: '#E6E9EE',
  axis: '#5A6472',
  marker: '#6D28D9',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
} as const;

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
 * Deliberately not a weighted score out of 100 — that invites treating an
 * arbitrary formula as ground truth. This is three honest buckets: is there
 * a critical failure or a reachable-but-dead control (the phantom menu),
 * is there a serious one, or neither.
 */
export function verdictForPage(page: ScannedPage): Verdict {
  const hasImpact = (impact: string) => (page.violations ?? []).some((v) => v.impact === impact);
  const phantomBlocking = (page.phantomMenu?.focusable ?? 0) > 0;
  if (hasImpact('critical') || phantomBlocking) return 'blocking';
  if (hasImpact('serious')) return 'needs-work';
  return 'clear';
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
