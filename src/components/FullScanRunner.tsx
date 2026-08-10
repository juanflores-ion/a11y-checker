'use client';

import { useState } from 'react';

import type { PageResult } from '@/lib/model';
import { Eyebrow } from './Primitives';

export interface ScanTarget {
  brand: string;
  key: string;
  url: string;
}

/** How many URLs go in one request. Must not exceed the API route's own cap. */
const BATCH_SIZE = 3;

type Status = 'idle' | 'running' | 'done' | 'failed';

interface Progress {
  done: number;
  total: number;
  current: string | null;
  failures: number;
}

/**
 * The full 20-page scan, run from the browser in small batches.
 *
 * A scheduled scan takes ~100 seconds and writes a file, which is why it
 * couldn't run on the host: serverless functions have an execution ceiling and
 * a read-only filesystem. Both objections dissolve if the browser drives it —
 * each request scans a few pages well inside the limit, and the run file is
 * assembled here and downloaded rather than written server-side.
 *
 * So nobody needs a local scanner any more, even for the scheduled run. Drop
 * the downloaded file into data/runs/ and commit it; the push redeploys the
 * dashboard with the new numbers, and every measurement gets a commit and a
 * diff for free.
 */
export function FullScanRunner({ targets }: { targets: ScanTarget[] }) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<Progress>({
    done: 0,
    total: targets.length,
    current: null,
    failures: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [runFile, setRunFile] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  async function run() {
    setStatus('running');
    setError(null);
    setRunFile(null);
    setProgress({ done: 0, total: targets.length, current: null, failures: 0 });

    const startedAt = new Date().toISOString();
    const byBrand: Record<string, Record<string, PageResult>> = {};
    let axeVersion: string | null = null;
    let viewport: unknown = null;
    let failures = 0;

    try {
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);
        setProgress((p) => ({ ...p, current: batch[0].url }));

        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: batch.map((t) => t.url) }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `Scan failed with ${res.status}`);

        viewport ??= body.viewport ?? null;
        // Results come back in request order, so they pair positionally.
        batch.forEach((target, n) => {
          const result = body.results?.[n];
          if (!result) return;
          axeVersion ??= result.axeVersion ?? null;
          if (result.error) failures += 1;
          (byBrand[target.brand] ??= {})[target.key] = result;
        });

        setProgress((p) => ({
          ...p,
          done: Math.min(i + batch.length, targets.length),
          failures,
        }));
      }

      // Exactly the shape data/runs/*.json uses — see the data contract in the
      // README. Anything else here would not load.
      const run = {
        meta: {
          startedAt,
          finishedAt: new Date().toISOString(),
          axeVersion,
          viewport,
          ...(label.trim() ? { label: label.trim() } : {}),
        },
        ...byBrand,
      };
      setRunFile(JSON.stringify(run, null, 2));
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('failed');
    } finally {
      setProgress((p) => ({ ...p, current: null }));
    }
  }

  function download() {
    if (!runFile) return;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, (m) =>
      m === 'T' ? '-' : m === ':' ? '' : '-'
    );
    const blob = new Blob([runFile], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <section className="rounded-lg border border-rule bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="max-w-measure">
          <h2 className="font-display text-base font-bold tracking-tight text-ink">
            Record a full run — all {targets.length} tracked pages
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Scans every page both sites are tracked on, {BATCH_SIZE} at a time, and hands back a
            run file. Drop it in <code className="font-mono text-xs">data/runs/</code> and commit
            it to add it to the history. Takes a couple of minutes — keep this tab open.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1">
          <span className="text-eyebrow font-medium text-muted">
            Label <span className="text-faint">· optional, shown on the trend chart</span>
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="after phase 1"
            disabled={status === 'running'}
            className="mt-1 w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm transition-shadow disabled:opacity-60"
          />
        </label>
        <button
          type="button"
          onClick={run}
          disabled={status === 'running'}
          className="rounded-card bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {status === 'running' ? `Scanning… ${pct}%` : 'Run full scan'}
        </button>
      </div>

      {status === 'running' || status === 'done' ? (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-rule">
            <div
              className="h-full rounded-pill bg-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-muted">
            <span className="tnum">
              {progress.done} of {progress.total} pages
            </span>
            {progress.failures > 0 ? (
              <span className="text-critical tnum">
                {progress.failures} couldn&apos;t be measured
              </span>
            ) : null}
            {progress.current ? (
              <span className="truncate font-mono text-faint">{progress.current}</span>
            ) : null}
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-card border border-critical/25 bg-critical/[0.04] px-3.5 py-2.5 text-sm text-critical"
        >
          {error}
        </p>
      ) : null}

      {status === 'done' && runFile ? (
        <div className="mt-4 rounded-card border border-good/25 bg-good/[0.04] p-4">
          <Eyebrow className="text-good">Run complete</Eyebrow>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">
            {progress.total - progress.failures} of {progress.total} pages measured.
            {progress.failures > 0
              ? ' The pages that failed contribute zero and are flagged in the file — treat the totals as incomplete, and check targets.mjs, since a failure usually means a URL moved.'
              : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={download}
              className="rounded-card border border-rule bg-card px-4 py-2 text-sm font-medium text-ink shadow-card hover:border-accent/40"
            >
              Download run file
            </button>
            <code className="font-mono text-xs text-muted">
              → data/runs/ → commit → push
            </code>
          </div>
        </div>
      ) : null}
    </section>
  );
}
