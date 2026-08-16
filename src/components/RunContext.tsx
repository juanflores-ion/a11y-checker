'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_VIEWPORT,
  VIEWPORT_NAMES,
  viewKey,
  type ViewportName,
} from '@/lib/model';

export interface RunSummary {
  id: string;
  label?: string;
  startedAt: string;
  finishedAt?: string;
  axeVersion?: string;
  /** Instrument stamp for the context bar. Absent = the run did not record it. */
  probeVersion?: string;
  browserVersion?: string;
  display: string;
  short: string;
  /** Which device profiles this run measured. Pre-profile runs are mobile-only. */
  viewports: ViewportName[];
}

interface RunSelection {
  runs: RunSummary[];
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
}

const Ctx = createContext<RunSelection | null>(null);

/** Read "#current=…&compare=…&viewport=…" so a link to a view is shareable. */
function readHash(): { current?: string; compare?: string; viewport?: string } {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return {
    current: params.get('current') ?? undefined,
    compare: params.get('compare') ?? undefined,
    viewport: params.get('viewport') ?? undefined,
  };
}

function isViewport(v: string | undefined): v is ViewportName {
  return !!v && (VIEWPORT_NAMES as readonly string[]).includes(v);
}

export function RunProvider({
  runs,
  children,
}: {
  runs: RunSummary[];
  children: React.ReactNode;
}) {
  const latest = runs.length ? runs[runs.length - 1].id : '';
  const previous = runs.length > 1 ? runs[runs.length - 2].id : null;

  const [currentId, setCurrentIdState] = useState(latest);
  const [compareId, setCompareIdState] = useState<string | null>(previous);
  const [viewport, setViewportState] = useState<ViewportName>(DEFAULT_VIEWPORT);

  // Hydrate from the URL after mount so the static HTML stays deterministic.
  useEffect(() => {
    const { current, compare, viewport: vp } = readHash();
    if (current && runs.some((r) => r.id === current)) setCurrentIdState(current);
    if (compare === 'none') setCompareIdState(null);
    else if (compare && runs.some((r) => r.id === compare)) setCompareIdState(compare);
    if (isViewport(vp)) setViewportState(vp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeHash = useCallback((cur: string, cmp: string | null, vp: ViewportName) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams({ current: cur, compare: cmp ?? 'none', viewport: vp });
    window.history.replaceState(null, '', `${window.location.pathname}#${params}`);
  }, []);

  const setCurrentId = useCallback(
    (id: string) => {
      setCurrentIdState(id);
      writeHash(id, compareId, viewport);
    },
    [compareId, viewport, writeHash]
  );

  const setCompareId = useCallback(
    (id: string | null) => {
      setCompareIdState(id);
      writeHash(currentId, id, viewport);
    },
    [currentId, viewport, writeHash]
  );

  const setViewport = useCallback(
    (v: ViewportName) => {
      setViewportState(v);
      writeHash(currentId, compareId, v);
    },
    [currentId, compareId, writeHash]
  );

  const value = useMemo<RunSelection>(() => {
    const current = runs.find((r) => r.id === currentId) ?? null;
    const compare =
      compareId && compareId !== currentId
        ? runs.find((r) => r.id === compareId) ?? null
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
      runs,
      currentId,
      compareId: compareId === currentId ? null : compareId,
      current,
      compare: compareHasViewport ? compare : null,
      setCurrentId,
      setCompareId,
      viewport: effective,
      setViewport,
      availableViewports,
      currentKey: viewKey(currentId, effective),
      compareKey:
        compare && compareHasViewport ? viewKey(compare.id, effective) : null,
      compareMissingViewport: !!compare && !compareHasViewport,
    };
  }, [runs, currentId, compareId, viewport, setCurrentId, setCompareId, setViewport]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRuns(): RunSelection {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRuns must be used inside <RunProvider>');
  return ctx;
}
