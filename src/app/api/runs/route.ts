import { NextResponse } from 'next/server';

import { loadRuns, normaliseRun } from '@/lib/loadRuns';
import { isRunId, readStoredRun, storeAvailable, storedIds, writeStoredRun } from '@/lib/runStore';
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

/**
 * Committed runs and stored ones, as one list, oldest first.
 *
 * A run taken from the hosted dashboard lives in the KV store; a baseline lives
 * in `data/runs/`. The reader does not care which, and neither should anything
 * downstream of it. A committed run wins a clash, because that is the one in
 * git.
 */
async function allRuns() {
  const committed = loadRuns();
  const have = new Set(committed.map((r) => r.id));
  const stored = [];
  for (const id of await storedIds()) {
    if (have.has(id)) continue;
    const file = await readStoredRun(id);
    if (file) stored.push(normaliseRun(id, file));
  }
  return [...committed, ...stored].sort((a, b) => a.id.localeCompare(b.id));
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  const runs = await allRuns();

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
  const id = body?.id;

  if (!isRunId(id)) return Response.json({ error: 'Not a run id.' }, { status: 400 });
  if (!body?.run || typeof body.run !== 'object') {
    return Response.json({ error: 'No run to save.' }, { status: 400 });
  }

  const text = `${JSON.stringify(body.run, null, 2)}\n`;

  /*
    A checkout gets the file, because a file can be committed and a committed
    run is the only kind that survives a redeploy. `wx` so two runs a minute
    apart cannot silently overwrite each other.
  */
  try {
    const dir = path.join(process.cwd(), 'data', 'runs');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${id}.json`), text, { flag: 'wx' });
    return Response.json({ saved: true, id, where: 'file', path: `data/runs/${id}.json` });
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
      return Response.json({ error: `A run called ${id} already exists.` }, { status: 409 });
    }
    // Read-only filesystem: the hosted deployment. Fall through to the store.
  }

  if (await writeStoredRun(id, body.run as never)) {
    return Response.json({ saved: true, id, where: 'store' });
  }

  return Response.json(
    {
      error: storeAvailable()
        ? 'The run store could not be written to.'
        : 'This deployment has nowhere to keep runs. Connect a KV store (Vercel, Storage) and redeploy.',
    },
    { status: 503 }
  );
}
