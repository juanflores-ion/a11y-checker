import fs from 'node:fs';
import path from 'node:path';

import { VIEWPORT_NAMES, type BrandResults, type Run, type RunFile, type ViewportName } from './model';

export * from './model';

const RUNS_DIR = path.join(process.cwd(), 'data', 'runs');

/**
 * Turn either on-disk shape into the one the app reads.
 *
 * Runs recorded before the desktop profile existed put the brands at the top
 * level with no viewport dimension at all. They were all scanned at 390×844
 * with an iPhone user-agent, so they are mobile runs — and saying so explicitly
 * is what stops a later desktop run being charted as though it continued the
 * same series. That silent kind of mismatch is exactly how ten 404s once read
 * as a 47% improvement.
 */
function normalise(file: string, parsed: RunFile): Run {
  const byViewport: Partial<Record<ViewportName, BrandResults>> = {};

  if (parsed.byViewport) {
    for (const name of VIEWPORT_NAMES) {
      const results = parsed.byViewport[name];
      if (!results) continue;
      byViewport[name] = {
        insureon: results.insureon ?? {},
        techinsurance: results.techinsurance ?? {},
      };
    }
  } else {
    byViewport.mobile = {
      insureon: parsed.insureon ?? {},
      techinsurance: parsed.techinsurance ?? {},
    };
  }

  const viewports = VIEWPORT_NAMES.filter((v) => !!byViewport[v]);
  if (viewports.length === 0) {
    throw new Error(`data/runs/${file} contains no measured viewport`);
  }

  // Honour the recorded primary, but only if it was actually measured.
  const declared = parsed.meta.primaryViewport;
  const primaryViewport = declared && byViewport[declared] ? declared : viewports[0];

  return {
    id: file.replace(/\.json$/, ''),
    meta: parsed.meta,
    insureon: byViewport[primaryViewport]!.insureon,
    techinsurance: byViewport[primaryViewport]!.techinsurance,
    byViewport,
    viewports,
    primaryViewport,
  };
}

/**
 * Read every run file, oldest first. Called only from server components at
 * build time — nothing here ships to the browser.
 */
export function loadRuns(dir: string = RUNS_DIR): Run[] {
  if (!fs.existsSync(dir)) return [];

  const runs: Run[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    let parsed: RunFile;
    try {
      parsed = JSON.parse(raw) as RunFile;
    } catch (err) {
      throw new Error(`data/runs/${file} is not valid JSON: ${(err as Error).message}`);
    }
    if (!parsed.meta?.startedAt) {
      throw new Error(`data/runs/${file} has no meta.startedAt`);
    }
    runs.push(normalise(file, parsed));
  }

  runs.sort((a, b) => Date.parse(a.meta.startedAt) - Date.parse(b.meta.startedAt));
  return runs;
}

