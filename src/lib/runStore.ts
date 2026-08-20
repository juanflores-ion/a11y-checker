/**
 * Runs taken from the dashboard, stored where the dashboard can read them back.
 *
 * The Full run screen used to end with four manual steps: download the file,
 * find it, move it into `data/runs/`, commit. That is fine for the person who
 * has the repo checked out and impossible for everyone else, which is most of
 * the people the scan page was built for.
 *
 * Two places a run can live, and the difference is not a preference:
 *
 *   `data/runs/`  the committed baselines. Written when the filesystem is
 *                 writable, which means a local checkout. These survive a
 *                 redeploy because they are in git.
 *   the KV store  everything taken from the hosted dashboard. Vercel's
 *                 filesystem is read-only and per-invocation, so this is the
 *                 only place a hosted run can go.
 *
 * Both are read back together, so a run is a run wherever it was taken. A
 * deployment with neither a writable checkout nor a KV store says so rather
 * than accepting a run and dropping it.
 */
import type { RunFile } from './model';

const KV_URL = () => process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const INDEX_KEY = 'agent-readiness:runs';
const runKey = (id: string) => `agent-readiness:run:${id}`;

export function storeAvailable(): boolean {
  return Boolean(KV_URL() && KV_TOKEN());
}

/** A run id is a filename and a KV key, so it may only ever be one shape. */
export function isRunId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{4}-\d{2}-\d{2}-\d{4}(-[a-z]+)?$/.test(id);
}

async function kv(path: string, init?: RequestInit): Promise<unknown | null> {
  if (!storeAvailable()) return null;
  try {
    const res = await fetch(`${KV_URL()}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${KV_TOKEN()}`, ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: unknown };
    return body.result ?? null;
  } catch {
    return null;
  }
}

/** The ids held in the store, oldest first. */
export async function storedIds(): Promise<string[]> {
  const raw = await kv(`get/${encodeURIComponent(INDEX_KEY)}`);
  if (typeof raw !== 'string') return [];
  try {
    const ids = JSON.parse(raw) as unknown;
    return Array.isArray(ids) ? ids.filter(isRunId) : [];
  } catch {
    return [];
  }
}

export async function readStoredRun(id: string): Promise<RunFile | null> {
  if (!isRunId(id)) return null;
  const raw = await kv(`get/${encodeURIComponent(runKey(id))}`);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as RunFile;
  } catch {
    return null;
  }
}

/**
 * Keep a run. Returns false when there is no store to keep it in, which the
 * caller reports — a save that quietly went nowhere is the failure this whole
 * module exists to remove.
 */
export async function writeStoredRun(id: string, run: RunFile): Promise<boolean> {
  if (!isRunId(id) || !storeAvailable()) return false;
  const set = await fetch(`${KV_URL()}/set/${encodeURIComponent(runKey(id))}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  }).catch(() => null);
  if (!set?.ok) return false;

  const ids = await storedIds();
  if (!ids.includes(id)) {
    const next = [...ids, id].sort();
    await fetch(`${KV_URL()}/set/${encodeURIComponent(INDEX_KEY)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => null);
  }
  return true;
}
