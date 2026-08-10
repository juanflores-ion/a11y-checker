import fs from 'node:fs';
import path from 'node:path';

import type { Run, RunFile } from './model';

export * from './model';

const RUNS_DIR = path.join(process.cwd(), 'data', 'runs');

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
    runs.push({
      id: file.replace(/\.json$/, ''),
      meta: parsed.meta,
      insureon: parsed.insureon ?? {},
      techinsurance: parsed.techinsurance ?? {},
    });
  }

  runs.sort((a, b) => Date.parse(a.meta.startedAt) - Date.parse(b.meta.startedAt));
  return runs;
}

