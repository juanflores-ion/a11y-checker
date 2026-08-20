import { PagesMatrixClient } from '@/components/runs/PagesMatrixClient';
import { RunsHeader } from '@/components/RunsHeader';
import { matrixCell, type MatrixCell } from '@/lib/pageMatrix';
import { BRANDS, pageKeysUnion, runAtViewport, viewKey, type Brand } from '@/lib/loadRuns';
import { loadAllRuns } from '@/lib/runStore';

/**
 * Rendered per request, not baked at build.
 *
 * Runs are no longer only files on disk: one taken from the dashboard lives in
 * the run store, and a page prerendered at build time cannot know about it.
 * This is the cost of runs that appear the moment they are taken.
 */
export const dynamic = 'force-dynamic';


export default async function PagesIndex() {
  const runs = await loadAllRuns();
  const pageOrder = pageKeysUnion(runs);

  const byRun: Record<string, Record<Brand, Record<string, MatrixCell>>> = {};
  for (const run of runs) {
    for (const viewport of run.viewports) {
      const view = runAtViewport(run, viewport);
      if (!view) continue;
      const perBrand = {} as Record<Brand, Record<string, MatrixCell>>;
      for (const brand of BRANDS) {
        perBrand[brand] = Object.fromEntries(pageOrder.map((key) => [key, matrixCell(view[brand]?.[key])]));
      }
      byRun[viewKey(run.id, viewport)] = perBrand;
    }
  }

  return (
    <>
      <RunsHeader />
      <PagesMatrixClient byRun={byRun} pageOrder={pageOrder} />
    </>
  );
}
