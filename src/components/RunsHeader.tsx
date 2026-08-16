'use client';

import { usePathname } from 'next/navigation';

import { useRuns } from './RunContext';
import { PageHeader } from './ui/PageHeader';
import { Tabs } from './ui/Tabs';

/**
 * "Over time" needs THREE runs, not two. Two scans are a before and an after
 * — a step change with a cause somebody can name, and the scorecard already
 * states it with delta chips. A line through two points reads as a trajectory
 * and invites the eye to extrapolate; the third point is the first that can
 * show a direction. The tab stays visible but disabled, so nobody wonders
 * where the trend went.
 */
export const TREND_MIN_RUNS = 3;

export function RunsHeader({ aside }: { aside?: React.ReactNode } = {}) {
  const pathname = usePathname() ?? '/runs';
  const { runs } = useRuns();
  const trendReady = runs.length >= TREND_MIN_RUNS;

  return (
    <PageHeader
      title="Runs"
      description="Every figure the scanner produced for the selected run, by check and by page."
      aside={
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          {aside ? <div className="pb-2">{aside}</div> : null}
          <Tabs
          ariaLabel="Run views"
          items={[
            { href: '/runs', label: 'By check', active: pathname === '/runs' || pathname === '/runs/' },
            { href: '/runs/pages', label: 'By page', active: pathname.startsWith('/runs/pages') },
            {
              href: '/runs/trend',
              label: 'Over time',
              active: pathname.startsWith('/runs/trend'),
              disabled: !trendReady,
              title: trendReady ? undefined : `needs ${TREND_MIN_RUNS} runs, ${runs.length} on file`,
            },
          ]}
          />
        </div>
      }
    />
  );
}
