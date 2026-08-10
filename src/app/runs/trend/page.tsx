import { TrendClient, type TrendPoint } from '@/components/TrendClient';
import { allRuleIds, inScopeNodes, phantomFocusable, ruleTotals, totalNodes } from '@/lib/aggregate';
import { BRANDS, formatRunShort, loadRuns } from '@/lib/loadRuns';

export default function TrendPage() {
  const runs = loadRuns();
  const ruleIds = allRuleIds(runs, [...BRANDS]);

  const points: TrendPoint[] = runs.map((run) => {
    const point: TrendPoint = {
      runId: run.id,
      short: formatRunShort(run),
      startedAt: run.meta.startedAt,
      label: run.meta.label ?? null,
      values: {},
    };
    for (const brand of BRANDS) {
      const totals = ruleTotals(run, brand);
      point.values[brand] = {
        total: totalNodes(run, brand),
        'in-scope': inScopeNodes(run, brand),
        phantom: phantomFocusable(run, brand),
        ...Object.fromEntries(ruleIds.map((id) => [`rule:${id}`, totals[id] ?? 0])),
      };
    }
    return point;
  });

  return <TrendClient points={points} ruleIds={ruleIds} />;
}
