import { PagesMatrixClient } from '@/components/runs/PagesMatrixClient';
import { RunsHeader } from '@/components/RunsHeader';
import { matrixCell, type MatrixCell } from '@/lib/pageMatrix';
import { BRANDS, loadRuns, pageKeysUnion, runAtViewport, viewKey, type Brand } from '@/lib/loadRuns';

export default function PagesIndex() {
  const runs = loadRuns();
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
