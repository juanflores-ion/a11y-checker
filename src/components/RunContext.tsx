'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface RunSummary {
  id: string;
  label?: string;
  startedAt: string;
  finishedAt?: string;
  axeVersion?: string;
  display: string;
  short: string;
}

interface RunSelection {
  runs: RunSummary[];
  currentId: string;
  compareId: string | null;
  current: RunSummary | null;
  compare: RunSummary | null;
  setCurrentId: (id: string) => void;
  setCompareId: (id: string | null) => void;
}

const Ctx = createContext<RunSelection | null>(null);

/** Read "#current=…&compare=…" so a link to a specific comparison is shareable. */
function readHash(): { current?: string; compare?: string } {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return {
    current: params.get('current') ?? undefined,
    compare: params.get('compare') ?? undefined,
  };
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

  // Hydrate from the URL after mount so the static HTML stays deterministic.
  useEffect(() => {
    const { current, compare } = readHash();
    if (current && runs.some((r) => r.id === current)) setCurrentIdState(current);
    if (compare === 'none') setCompareIdState(null);
    else if (compare && runs.some((r) => r.id === compare)) setCompareIdState(compare);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeHash = useCallback((cur: string, cmp: string | null) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams({ current: cur, compare: cmp ?? 'none' });
    window.history.replaceState(null, '', `${window.location.pathname}#${params}`);
  }, []);

  const setCurrentId = useCallback(
    (id: string) => {
      setCurrentIdState(id);
      writeHash(id, compareId);
    },
    [compareId, writeHash]
  );

  const setCompareId = useCallback(
    (id: string | null) => {
      setCompareIdState(id);
      writeHash(currentId, id);
    },
    [currentId, writeHash]
  );

  const value = useMemo<RunSelection>(
    () => ({
      runs,
      currentId,
      compareId: compareId === currentId ? null : compareId,
      current: runs.find((r) => r.id === currentId) ?? null,
      compare: compareId && compareId !== currentId
        ? runs.find((r) => r.id === compareId) ?? null
        : null,
      setCurrentId,
      setCompareId,
    }),
    [runs, currentId, compareId, setCurrentId, setCompareId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRuns(): RunSelection {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRuns must be used inside <RunProvider>');
  return ctx;
}

/** Pick this run's slice out of a server-computed `Record<runId, T>`. */
export function pick<T>(byRun: Record<string, T>, id: string | null): T | null {
  if (!id) return null;
  return byRun[id] ?? null;
}
