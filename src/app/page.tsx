import { OverviewClient } from '@/components/overview/OverviewClient';
import type { OverviewBrandSnapshot, OverviewSnapshots } from '@/components/overview/types';
import { failedPages, inScopeNodes, passRatio, resolveMetric, scorecard } from '@/lib/aggregate';
import { ISSUES } from '@/lib/issues';
import { BRANDS, runAtViewport, viewKey, type Brand } from '@/lib/loadRuns';
import { loadAllRuns } from '@/lib/runStore';

/**
 * Rendered per request, not baked at build.
 *
 * Runs are no longer only files on disk: one taken from the dashboard lives in
 * the run store, and a page prerendered at build time cannot know about it.
 * This is the cost of runs that appear the moment they are taken.
 */
export const dynamic = 'force-dynamic';


/**
 * Overview: where the sites stand for an AI agent, and what is wrong.
 *
 * Precomputed for every run × device profile so the client can switch context
 * without a request — the same shape Runs uses. These sites serve different
 * markup per device, so one run holds two independent sets of numbers.
 */
export default async function OverviewPage() {
  const runs = await loadAllRuns();

  const snapshots: OverviewSnapshots = {};
  for (const run of runs) {
    for (const viewport of run.viewports) {
      const view = runAtViewport(run, viewport);
      if (!view) continue;
      const perBrand = {} as Record<Brand, OverviewBrandSnapshot>;
      for (const brand of BRANDS) {
        const issueMetrics: Record<string, ReturnType<typeof resolveMetric>[]> = {};
        for (const issue of ISSUES) {
          issueMetrics[issue.id] = issue.metrics.map((ref) => resolveMetric(view, brand, ref));
        }
        perBrand[brand] = {
          scorecard: scorecard(view, brand),
          passRatio: passRatio(view, brand),
          inScopeNodes: inScopeNodes(view, brand),
          failed: failedPages(view, brand).map(([key, page]) => ({
            key,
            url: page.url,
            error: page.error,
          })),
          issueMetrics,
        };
      }
      snapshots[viewKey(run.id, viewport)] = perBrand;
    }
  }

  return <OverviewClient snapshots={snapshots} />;
}
