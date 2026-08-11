import { notFound } from 'next/navigation';

import { PageDetailClient, type PageDetailByRun } from '@/components/PageDetailClient';
import { worstPhantom } from '@/lib/aggregate';
import { BRANDS, loadRuns, pageKeysUnion, runAtViewport, viewKey, type Brand } from '@/lib/loadRuns';

/**
 * Static export needs every brand/page combination enumerated up front. Build
 * from the union of keys actually present in the data, not the canonical ten —
 * an interrupted scan is allowed to have fewer.
 */
export function generateStaticParams() {
  const runs = loadRuns();
  const keys = pageKeysUnion(runs);
  return BRANDS.flatMap((brand) => keys.map((page) => ({ brand, page })));
}

export default function PageDetail({ params }: { params: { brand: string; page: string } }) {
  const brand = params.brand as Brand;
  if (!BRANDS.includes(brand)) notFound();

  const runs = loadRuns();
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
