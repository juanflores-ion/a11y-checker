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
import { navReach } from '@/lib/aggregate';
import { BRANDS, loadRuns, runAtViewport, viewKey } from '@/lib/loadRuns';

export default function OverviewPage() {
  const runs = loadRuns();

  /**
   * Keyed by run *and* viewport. These sites serve different markup per device,
   * so one run holds two independent sets of numbers — not one set viewed two
   * ways — and the client has to be able to ask for a specific one.
   */
  const snapshots: Record<string, Record<string, BrandSnapshot>> = {};
  for (const run of runs) {
    for (const viewport of run.viewports) {
      const view = runAtViewport(run, viewport);
      if (!view) continue;
      const key = viewKey(run.id, viewport);
      snapshots[key] = {};
      for (const brand of BRANDS) {
        const { phantom, pagesWithMenu } = worstPhantom(view, brand);
        snapshots[key][brand] = {
          totalNodes: totalNodes(view, brand),
          inScopeNodes: inScopeNodes(view, brand),
          impacts: rulesFailingByImpact(view, brand),
          ruleTotals: ruleTotals(view, brand),
          phantom,
          pagesWithMenu,
          scorecard: scorecard(view, brand),
          passRatio: passRatio(view, brand),
          mainCoverage: mainCoverage(view, brand),
          nameless: namelessCounts(view, brand),
          navReach: navReach(view, brand),
          failed: failedPages(view, brand).map(([key, page]) => ({
            key,
            url: page.url,
            error: page.error,
          })),
        };
      }
    }
  }

  const runOrder = runs.map((r) => r.id);

  return <OverviewClient snapshots={snapshots} runOrder={runOrder} />;
}
