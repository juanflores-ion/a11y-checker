import { RulesClient, type RulesRunData } from '@/components/RulesClient';
import {
  allRuleIds,
  hasProbeData,
  perPageProbeTotals,
  perPageRuleTotals,
  probeTotals,
  ruleTotals,
} from '@/lib/aggregate';
import { BRANDS, loadRuns, pageKeysUnion } from '@/lib/loadRuns';

export default function RulesPage() {
  const runs = loadRuns();

  const byRun: Record<string, RulesRunData> = {};
  for (const run of runs) {
    byRun[run.id] = {
      totals: Object.fromEntries(BRANDS.map((b) => [b, ruleTotals(run, b)])),
      perPage: Object.fromEntries(BRANDS.map((b) => [b, perPageRuleTotals(run, b)])),
      pageKeys: Object.fromEntries(BRANDS.map((b) => [b, Object.keys(run[b] ?? {})])),
      probeTotals: Object.fromEntries(BRANDS.map((b) => [b, probeTotals(run, b)])),
      probePerPage: Object.fromEntries(BRANDS.map((b) => [b, perPageProbeTotals(run, b)])),
      hasProbes: BRANDS.some((b) => hasProbeData(run, b)),
    };
  }

  return (
    <RulesClient
      byRun={byRun}
      ruleIds={allRuleIds(runs, [...BRANDS])}
      pageOrder={pageKeysUnion(runs)}
    />
  );
}
