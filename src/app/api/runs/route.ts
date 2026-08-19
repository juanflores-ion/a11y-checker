import { NextResponse } from 'next/server';

import { loadRuns } from '@/lib/loadRuns';

/**
 * Recorded runs, for the comparison the Scan page draws between two of them.
 *
 *   GET /api/runs            → the index: one line per run, no page data
 *   GET /api/runs?id=<id>    → that run in full
 *
 * The index exists because run files are half a megabyte each. Shipping every
 * run to the browser so a dropdown can list them would put megabytes on a page
 * that usually compares two; the client picks from the index and fetches only
 * the pair it needs.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  const runs = loadRuns();

  if (!id) {
    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        startedAt: r.meta.startedAt,
        label: r.meta.label ?? null,
        environment: r.environment,
        viewports: r.viewports,
        primaryViewport: r.primaryViewport,
        axeVersion: r.meta.axeVersion ?? null,
        probeVersion: r.meta.probeVersion ?? null,
        browserVersion: r.meta.browserVersion ?? null,
      })),
    });
  }

  const run = runs.find((r) => r.id === id);
  if (!run) return NextResponse.json({ error: `No run “${id}”.` }, { status: 404 });

  /**
   * The same fields the index carries, plus the page data. The client types
   * a full run as the index entry extended, so leaving these out here is how
   * a comparison ended up captioned "Invalid Date against Invalid Date".
   */
  return NextResponse.json({
    id: run.id,
    startedAt: run.meta.startedAt,
    label: run.meta.label ?? null,
    environment: run.environment,
    viewports: run.viewports,
    primaryViewport: run.primaryViewport,
    axeVersion: run.meta.axeVersion ?? null,
    probeVersion: run.meta.probeVersion ?? null,
    browserVersion: run.meta.browserVersion ?? null,
    meta: run.meta,
    byViewport: run.byViewport,
  });
}
