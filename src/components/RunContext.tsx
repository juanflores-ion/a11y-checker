'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Environment } from '@/lib/environment';
import {
  BRANDS,
  DEFAULT_VIEWPORT,
  VIEWPORT_NAMES,
  viewKey,
  type Brand,
  type ViewportName,
} from '@/lib/model';

/**
 * One brand: the site every data page shows. There is no "both" — two sites
 * side by side doubled every figure, and the one reader who wants the
 * comparison can open two tabs.
 */
export type SiteSelection = Brand;
export const SITE_SELECTIONS: readonly SiteSelection[] = BRANDS;

export interface RunSummary {
  id: string;
  label?: string;
  startedAt: string;
  finishedAt?: string;
  axeVersion?: string;
  /** Instrument stamp for the context bar. Absent = the run did not record it. */
  probeVersion?: string;
  /** True when that stamp was worked out afterwards rather than recorded. */
  probeVersionInferred?: boolean;
  browserVersion?: string;
  display: string;
  short: string;
  /** Which device profiles this run measured. Pre-profile runs are mobile-only. */
  viewports: ViewportName[];
  /**
   * Which sites this run actually scanned. A run can cover one brand now, so
   * a picker offering every run for every site offers runs with nothing in
   * them. See `sitesCovered` in lib/model.ts.
   */
  sites: Brand[];
  /**
   * Production or staging, derived from the URLs the run recorded. Shown in
   * the picker because the two are not interchangeable: cd-preview serves
   * different content from www, so a staging run read as production would put
   * content differences on the dashboard as if they were site changes.
   */
  environment: Environment;
}

interface RunSelection {
  /**
   * The runs that scanned the selected site, and only those.
   *
   * Every run picker in the app reads this, so the filter is written once
   * here rather than in each control. Picking TechInsurance used to leave
   * Insureon-only runs in the list, and choosing one gave a page of blanks.
   */
  runs: RunSummary[];
  /** Every run on file, whatever it scanned. Only for "is there anything at all". */
  totalRuns: number;
  currentId: string;
  compareId: string | null;
  current: RunSummary | null;
  compare: RunSummary | null;
  setCurrentId: (id: string) => void;
  setCompareId: (id: string | null) => void;
  /* --- viewport --------------------------------------------------- */
  viewport: ViewportName;
  setViewport: (v: ViewportName) => void;
  /** Profiles the current run measured, so the picker can't offer a missing one. */
  availableViewports: ViewportName[];
  /** Composite keys for the server-computed lookups. */
  currentKey: string;
  compareKey: string | null;
  /**
   * Set when the run being compared against never measured the selected
   * viewport. The comparison is dropped rather than silently taken against the
   * other profile, which would diff two different pages.
   */
  compareMissingViewport: boolean;
  /* --- site ------------------------------------------------------- */
  /** Which site's figures are on screen. The first brand until chosen otherwise. */
  site: SiteSelection;
  setSite: (s: SiteSelection) => void;
  /** Always exactly the selected site — a one-element array so tables map over it unchanged. */
  brands: Brand[];
}

const Ctx = createContext<RunSelection | null>(null);

/** Read "#current=…&compare=…&viewport=…&site=…" so a link to a view is shareable. */
function readHash(): { current?: string; compare?: string; viewport?: string; site?: string } {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return {
    current: params.get('current') ?? undefined,
    compare: params.get('compare') ?? undefined,
    viewport: params.get('viewport') ?? undefined,
    site: params.get('site') ?? undefined,
  };
}

function isViewport(v: string | undefined): v is ViewportName {
  return !!v && (VIEWPORT_NAMES as readonly string[]).includes(v);
}

function isSite(v: string | undefined): v is SiteSelection {
  return !!v && (SITE_SELECTIONS as readonly string[]).includes(v);
}

export function RunProvider({
  runs,
  children,
}: {
  runs: RunSummary[];
  children: React.ReactNode;
}) {
  /**
   * The dashboard opens on the latest *production* run.
   *
   * "Latest run" was fine while production was the only kind. The moment a
   * staging baseline landed it became wrong: staging was newer, so Overview
   * silently started reporting cd-preview's figures as where the sites stand
   * — 3 of 8 instead of 4 of 8 on the first pair recorded. Staging runs exist
   * to be compared against a later staging run, never to be the headline.
   */
  const production = runs.filter((r) => r.environment === 'production');
  const latest = (production.length ? production : runs).slice(-1)[0]?.id ?? '';

  const [currentId, setCurrentIdState] = useState(latest);
  /**
   * No baseline-to-baseline deltas in the dashboard.
   *
   * The views used to show "since the previous run" chips driven by a second
   * run picked in the context bar. Two problems ended it: with staging runs on
   * file that picker would happily pair production against staging and print
   * content differences as movement, and the dashboard's job is to say where
   * the sites stand now, not to carry history. Comparing two runs is a
   * deliberate act with its own screen — Scan → Compare runs — where the
   * environment and instrument guards live.
   */
  const [compareId, setCompareIdState] = useState<string | null>(null);
  const [viewport, setViewportState] = useState<ViewportName>(DEFAULT_VIEWPORT);
  const [site, setSiteState] = useState<SiteSelection>(BRANDS[0]);

  // Hydrate from the URL after mount so the static HTML stays deterministic.
  useEffect(() => {
    const { current, compare, viewport: vp, site: st } = readHash();
    if (current && runs.some((r) => r.id === current)) setCurrentIdState(current);
    if (compare === 'none') setCompareIdState(null);
    else if (compare && runs.some((r) => r.id === compare)) setCompareIdState(compare);
    if (isViewport(vp)) setViewportState(vp);
    if (isSite(st)) setSiteState(st);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeHash = useCallback(
    (cur: string, cmp: string | null, vp: ViewportName, st: SiteSelection) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams({ current: cur, compare: cmp ?? 'none', viewport: vp, site: st });
      window.history.replaceState(null, '', `${window.location.pathname}#${params}`);
    },
    []
  );

  const setCurrentId = useCallback(
    (id: string) => {
      setCurrentIdState(id);
      writeHash(id, compareId, viewport, site);
    },
    [compareId, viewport, site, writeHash]
  );

  const setCompareId = useCallback(
    (id: string | null) => {
      setCompareIdState(id);
      writeHash(currentId, id, viewport, site);
    },
    [currentId, viewport, site, writeHash]
  );

  const setViewport = useCallback(
    (v: ViewportName) => {
      setViewportState(v);
      writeHash(currentId, compareId, v, site);
    },
    [currentId, compareId, site, writeHash]
  );

  const setSite = useCallback(
    (s: SiteSelection) => {
      setSiteState(s);
      writeHash(currentId, compareId, viewport, s);
    },
    [currentId, compareId, viewport, writeHash]
  );

  const value = useMemo<RunSelection>(() => {
    /**
     * The site filter, applied once, here.
     *
     * A run covers one site or both, so "every run" is not the list of runs
     * that can answer for the site on screen. Filtering at the source means
     * the context bar's picker, and anything else reading `runs`, cannot
     * offer a run that has nothing to say.
     */
    const visible = runs.filter((r) => r.sites.includes(site));

    /**
     * When the selected run does not cover the newly selected site, fall back
     * the same way the first load does: the newest production run, or the
     * newest of anything if there is no production run. Falling back rather
     * than clearing keeps a site switch from emptying the page; `currentId`
     * below reports the run actually in use, so the picker never shows a
     * value that is not in its own list.
     */
    const production = visible.filter((r) => r.environment === 'production');
    const fallbackId = (production.length ? production : visible).slice(-1)[0]?.id ?? '';
    const effectiveId = visible.some((r) => r.id === currentId) ? currentId : fallbackId;

    const current = visible.find((r) => r.id === effectiveId) ?? null;
    const compare =
      compareId && compareId !== effectiveId
        ? visible.find((r) => r.id === compareId) ?? null
        : null;

    const availableViewports = current?.viewports ?? [];
    /**
     * Fall back only when the selected profile genuinely wasn't measured — a
     * run recorded before the desktop profile existed has mobile numbers only.
     * Showing those under a "Desktop" heading would be the same lie as
     * charting a mobile run next to a desktop one.
     */
    const effective: ViewportName = availableViewports.includes(viewport)
      ? viewport
      : availableViewports[0] ?? viewport;

    const compareHasViewport = !compare || compare.viewports.includes(effective);

    return {
      runs: visible,
      totalRuns: runs.length,
      currentId: effectiveId,
      compareId: compare?.id ?? null,
      current,
      compare: compareHasViewport ? compare : null,
      setCurrentId,
      setCompareId,
      viewport: effective,
      setViewport,
      availableViewports,
      currentKey: viewKey(effectiveId, effective),
      compareKey:
        compare && compareHasViewport ? viewKey(compare.id, effective) : null,
      compareMissingViewport: !!compare && !compareHasViewport,
      site,
      setSite,
      brands: [site],
    };
  }, [runs, currentId, compareId, viewport, site, setCurrentId, setCompareId, setViewport, setSite]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRuns(): RunSelection {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRuns must be used inside <RunProvider>');
  return ctx;
}
