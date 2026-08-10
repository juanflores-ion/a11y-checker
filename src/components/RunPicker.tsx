'use client';

import { usePathname } from 'next/navigation';

import { useRuns } from './RunContext';

function optionText(run: { label?: string; display: string }) {
  return run.label ? `${run.display} — ${run.label}` : run.display;
}

export function RunPicker() {
  const { runs, currentId, compareId, setCurrentId, setCompareId } = useRuns();
  const pathname = usePathname() ?? '';

  // The run archive only means something under Measurements. Findings always
  // reads the latest measured run, and Scan works against whatever URL you typed
  // in rather than a saved run, so the picker has nothing to offer on either.
  if (!pathname.startsWith('/runs')) return null;
  // With a single run there is nothing to switch between and nothing to
  // compare against, so both controls would be inert. The page heading
  // already says which run is on screen.
  if (runs.length < 2) return null;

  const selectClass =
    'bg-card border border-rule rounded-card px-2 py-1.5 text-sm font-mono text-ink ' +
    'hover:border-accent focus-visible:border-accent max-w-[16rem] truncate';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
    </div>
  );
}
