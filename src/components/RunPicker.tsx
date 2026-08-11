'use client';

import { usePathname } from 'next/navigation';

import { VIEWPORT_LABEL, type ViewportName } from '@/lib/model';
import { useRuns } from './RunContext';

function optionText(run: { label?: string; display: string }) {
  return run.label ? `${run.display} — ${run.label}` : run.display;
}

const selectClass =
  'bg-card border border-rule rounded-card px-2 py-1.5 text-sm font-mono text-ink ' +
  'hover:border-accent focus-visible:border-accent max-w-[16rem] truncate';

export function RunPicker() {
  const {
    runs,
    currentId,
    compareId,
    setCurrentId,
    setCompareId,
    viewport,
    setViewport,
    availableViewports,
    compareMissingViewport,
  } = useRuns();
  const pathname = usePathname() ?? '';

  // The run archive only means something under Measurements. Findings always
  // reads the latest measured run, and Scan works against whatever URL you typed
  // in rather than a saved run, so the picker has nothing to offer on either.
  if (!pathname.startsWith('/runs')) return null;

  // Each control hides itself when it has nothing to offer, so a single-run,
  // single-profile deployment shows no chrome at all.
  const showRuns = runs.length >= 2;
  const showViewports = availableViewports.length >= 2;
  if (!showRuns && !showViewports) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {showViewports ? (
        <label className="flex items-center gap-2">
          <span className="text-eyebrow font-medium text-muted">Device</span>
          <select
            className={selectClass}
            value={viewport}
            onChange={(e) => setViewport(e.target.value as ViewportName)}
          >
            {availableViewports.map((v) => (
              <option key={v} value={v}>
                {VIEWPORT_LABEL[v]}
                {v === 'desktop' ? ' — what agents get' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showRuns ? (
        <>
          <label className="flex items-center gap-2">
            <span className="text-eyebrow font-medium text-muted">Showing</span>
            <select
              className={selectClass}
              value={currentId}
              onChange={(e) => setCurrentId(e.target.value)}
            >
              {[...runs].reverse().map((r) => (
                <option key={r.id} value={r.id}>
                  {optionText(r)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-eyebrow font-medium text-muted">Compared to</span>
            <select
              className={selectClass}
              value={compareId ?? 'none'}
              onChange={(e) => setCompareId(e.target.value === 'none' ? null : e.target.value)}
            >
              <option value="none">Nothing — hide deltas</option>
              {[...runs]
                .reverse()
                .filter((r) => r.id !== currentId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {optionText(r)}
                  </option>
                ))}
            </select>
          </label>
        </>
      ) : null}

      {/*
        Deltas disappearing with no explanation reads as "nothing changed",
        which is the one thing it must never be mistaken for. The comparison is
        dropped because the other run never measured this profile — taking it
        against the profile it did measure would diff two different pages.
      */}
      {compareMissingViewport ? (
        <p className="text-eyebrow text-critical">
          No deltas — that run never measured {VIEWPORT_LABEL[viewport].toLowerCase()}
        </p>
      ) : null}
    </div>
  );
}
