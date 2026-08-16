import { RulesClient, type RulesRunData } from '@/components/RulesClient';
import { RunsHeader } from '@/components/RunsHeader';
import {
  allRuleIds,
  hasProbeData,
  perPageProbeTotals,
  perPageRuleTotals,
  probeTotals,
  rulesFailingByImpact,
  ruleTotals,
} from '@/lib/aggregate';
import { BRANDS, loadRuns, pageKeysUnion, runAtViewport, viewKey, type Brand } from '@/lib/loadRuns';

/**
 * Runs → By check. Keyed by run and viewport — the same run holds two
 * different sets of numbers, because the sites serve different markup per
 * device.
 */
export default function RunsPage() {
  const runs = loadRuns();

  const byRun: Record<string, RulesRunData> = {};
  for (const run of runs) {
    for (const viewport of run.viewports) {
      const view = runAtViewport(run, viewport);
      if (!view) continue;
      /**
       * `Object.fromEntries` types its result by the string index, not by the
       * keys it was handed. The cast says what the loop guarantees — one entry
       * per brand — so the client can index these by `Brand` and not by any
       * string that happens to be lying around.
       */
      const byBrand = <T,>(f: (b: Brand) => T) =>
        Object.fromEntries(BRANDS.map((b) => [b, f(b)])) as Record<Brand, T>;

      byRun[viewKey(run.id, viewport)] = {
        totals: byBrand((b) => ruleTotals(view, b)),
        perPage: byBrand((b) => perPageRuleTotals(view, b)),
        pageKeys: byBrand((b) => Object.keys(view[b] ?? {})),
        probeTotals: byBrand((b) => probeTotals(view, b)),
        probePerPage: byBrand((b) => perPageProbeTotals(view, b)),
        impacts: byBrand((b) => rulesFailingByImpact(view, b)),
        hasProbes: BRANDS.some((b) => hasProbeData(view, b)),
      };
    }
  }

  return (
    <>
      <RunsHeader />
      <RulesClient byRun={byRun} ruleIds={allRuleIds(runs, [...BRANDS])} pageOrder={pageKeysUnion(runs)} />
    </>
  );
}
