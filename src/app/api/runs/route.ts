import { NextResponse } from 'next/server';

import { loadRuns } from '@/lib/loadRuns';
import { promises as fs } from 'node:fs';
import path from 'node:path';

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

/**
 * Save a completed run straight into `data/runs/`.
 *
 * The alternative is what this replaced: download the file, find it, move it
 * into the repo, commit. Four manual steps between measuring something and the
 * dashboard being able to read it, and every one of them a chance to drop a
 * run on the floor.
 *
 * **This only works where the filesystem is writable**, which means a checkout
 * running `npm start` or `npm run dev`. On Vercel the deployment is read-only,
 * so this answers 501 and the caller keeps the download button. That is stated
 * rather than hidden: a save button that silently does nothing on the hosted
 * copy would be worse than no save button.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: string; run?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id.trim() : '';

  // The id becomes a filename, so it may only be what a run id actually is.
  if (!/^\d{4}-\d{2}-\d{2}-\d{4}(-[a-z]+)?$/.test(id)) {
    return Response.json({ error: 'Not a run id.' }, { status: 400 });
  }
  if (!body?.run || typeof body.run !== 'object') {
    return Response.json({ error: 'No run to save.' }, { status: 400 });
  }

  const dir = path.join(process.cwd(), 'data', 'runs');
  const file = path.join(dir, `${id}.json`);
  try {
    await fs.mkdir(dir, { recursive: true });
    // Never clobber a run that already exists; two runs a minute apart share a
    // stamp, and losing the first one silently is not a trade worth making.
    await fs.writeFile(file, `${JSON.stringify(body.run, null, 2)}\n`, { flag: 'wx' });
    return Response.json({ saved: true, id, path: `data/runs/${id}.json` });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'EEXIST') {
      return Response.json({ error: `data/runs/${id}.json already exists.` }, { status: 409 });
    }
    // EROFS / EACCES / ENOENT on a read-only deployment.
    return Response.json(
      {
        error:
          'This deployment cannot write run files. Download the file and commit it, or take the run from a local checkout.',
      },
      { status: 501 }
    );
  }
}
