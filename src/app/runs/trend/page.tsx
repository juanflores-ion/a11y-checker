import { RunsHeader } from '@/components/RunsHeader';
import { TrendClient, type TrendPoint } from '@/components/TrendClient';
import {
  allRuleIds,
  inScopeNodes,
  phantomFocusable,
  ruleTotals,
  totalNodes,
  unreachableStats,
} from '@/lib/aggregate';
import { BRANDS, formatRunShort, loadRuns, runAtViewport, viewKey } from '@/lib/loadRuns';

export default function TrendPage() {
  const runs = loadRuns();
  const ruleIds = allRuleIds(runs, [...BRANDS]);

  /**
   * One point per run *per viewport*, and the chart plots a single viewport at
   * a time.
   *
   * A line joining a mobile reading to a desktop one would be the most
   * convincing wrong number this tool could produce: the desktop nav alone
   * differs by ~56 links, so a viewport change would read as a dramatic
   * regression or fix that nobody made. Runs that never measured the selected
   * profile are absent from the series rather than interpolated.
   */
  const points: TrendPoint[] = [];
  for (const run of runs) {
    for (const viewport of run.viewports) {
      const view = runAtViewport(run, viewport);
      if (!view) continue;
      const point: TrendPoint = {
        runId: run.id,
        key: viewKey(run.id, viewport),
        viewport,
        short: formatRunShort(run),
        startedAt: run.meta.startedAt,
        label: run.meta.label ?? null,
        values: {},
      };
      for (const brand of BRANDS) {
        const totals = ruleTotals(view, brand);
        point.values[brand] = {
          total: totalNodes(view, brand),
          'in-scope': inScopeNodes(view, brand),
          phantom: phantomFocusable(view, brand),
          'unfindable-links': unreachableStats(view, brand).links,
          ...Object.fromEntries(ruleIds.map((id) => [`rule:${id}`, totals[id] ?? 0])),
        };
      }
      points.push(point);
    }
  }

  return (
    <>
      <RunsHeader />
      <TrendClient points={points} ruleIds={ruleIds} />
    </>
  );
}
