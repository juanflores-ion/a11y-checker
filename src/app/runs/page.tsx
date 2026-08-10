import { OverviewClient, type BrandSnapshot } from '@/components/OverviewClient';
import {
  inScopeNodes,
  mainCoverage,
  namelessCounts,
  passRatio,
  rulesFailingByImpact,
  ruleTotals,
  scorecard,
  totalNodes,
  worstPhantom,
  failedPages,
} from '@/lib/aggregate';
import { BRANDS, loadRuns } from '@/lib/loadRuns';

export default function OverviewPage() {
  const runs = loadRuns();

  const snapshots: Record<string, Record<string, BrandSnapshot>> = {};
  for (const run of runs) {
    snapshots[run.id] = {};
    for (const brand of BRANDS) {
      const { phantom, pagesWithMenu } = worstPhantom(run, brand);
      snapshots[run.id][brand] = {
        totalNodes: totalNodes(run, brand),
        inScopeNodes: inScopeNodes(run, brand),
        impacts: rulesFailingByImpact(run, brand),
        ruleTotals: ruleTotals(run, brand),
        phantom,
        pagesWithMenu,
        scorecard: scorecard(run, brand),
        passRatio: passRatio(run, brand),
        mainCoverage: mainCoverage(run, brand),
        nameless: namelessCounts(run, brand),
        failed: failedPages(run, brand).map(([key, page]) => ({
          key,
          url: page.url,
          error: page.error,
        })),
      };
    }
  }

  const runOrder = runs.map((r) => r.id);

  return <OverviewClient snapshots={snapshots} runOrder={runOrder} />;
}
