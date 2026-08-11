import { RulesClient, type RulesRunData } from '@/components/RulesClient';
import {
  allRuleIds,
  hasProbeData,
  perPageProbeTotals,
  perPageRuleTotals,
  probeTotals,
  ruleTotals,
} from '@/lib/aggregate';
import { BRANDS, loadRuns, pageKeysUnion, runAtViewport, viewKey } from '@/lib/loadRuns';

export default function RulesPage() {
  const runs = loadRuns();

  // Keyed by run and viewport — the same run holds two different sets of
  // numbers, because the sites serve different markup per device.
  const byRun: Record<string, RulesRunData> = {};
  for (const run of runs) {
    for (const viewport of run.viewports) {
      const view = runAtViewport(run, viewport);
      if (!view) continue;
      byRun[viewKey(run.id, viewport)] = {
        totals: Object.fromEntries(BRANDS.map((b) => [b, ruleTotals(view, b)])),
        perPage: Object.fromEntries(BRANDS.map((b) => [b, perPageRuleTotals(view, b)])),
        pageKeys: Object.fromEntries(BRANDS.map((b) => [b, Object.keys(view[b] ?? {})])),
        probeTotals: Object.fromEntries(BRANDS.map((b) => [b, probeTotals(view, b)])),
        probePerPage: Object.fromEntries(BRANDS.map((b) => [b, perPageProbeTotals(view, b)])),
        hasProbes: BRANDS.some((b) => hasProbeData(view, b)),
      };
    }
  }

  return (
    <RulesClient
      byRun={byRun}
      ruleIds={allRuleIds(runs, [...BRANDS])}
      pageOrder={pageKeysUnion(runs)}
    />
  );
}
