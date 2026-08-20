import { notFound } from 'next/navigation';

import { PageDetailClient, type PageDetailByRun } from '@/components/PageDetailClient';
import { worstPhantom } from '@/lib/aggregate';
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


export default async function PageDetail({ params }: { params: { brand: string; page: string } }) {
  const brand = params.brand as Brand;
  if (!BRANDS.includes(brand)) notFound();

  const runs = await loadAllRuns();
  const pageKeys = pageKeysUnion(runs);
  if (!pageKeys.includes(params.page)) notFound();

  const byRun: PageDetailByRun = {};
  for (const run of runs) {
    for (const viewport of run.viewports) {
      const view = runAtViewport(run, viewport);
      if (!view) continue;
      const result = view[brand]?.[params.page];
      byRun[viewKey(run.id, viewport)] = {
        present: result !== undefined,
        result: result ?? null,
        brandPhantomPages: worstPhantom(view, brand).pagesWithMenu,
      };
    }
  }

  return (
    <PageDetailClient
      brand={brand}
      pageKey={params.page}
      byRun={byRun}
      allPageKeys={pageKeys}
    />
  );
}
