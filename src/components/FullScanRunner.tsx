'use client';

import { useState } from 'react';

import {
  DEFAULT_VIEWPORT,
  VIEWPORT_LABEL,
  VIEWPORT_NAMES,
  type PageResult,
  type ViewportName,
  type ViewportSpec,
} from '@/lib/model';
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
  currentViewport: ViewportName | null;
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
  const [viewports, setViewports] = useState<ViewportName[]>([...VIEWPORT_NAMES]);
  const [progress, setProgress] = useState<Progress>({
    done: 0,
    total: targets.length * VIEWPORT_NAMES.length,
    current: null,
    currentViewport: null,
    failures: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [runFile, setRunFile] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  async function run() {
    const total = targets.length * viewports.length;
    setStatus('running');
    setError(null);
    setRunFile(null);
    setProgress({ done: 0, total, current: null, currentViewport: null, failures: 0 });

    const startedAt = new Date().toISOString();
    const byViewport: Record<string, Record<string, Record<string, PageResult>>> = {};
    const viewportSpecs: Record<string, ViewportSpec> = {};
    let axeVersion: string | null = null;
    let failures = 0;
    let done = 0;

    try {
      /**
       * Profile is the outer loop, matching the CLI. Each request names the
       * profile it wants, and the server pairs the user-agent with the viewport
       * — these sites pick their markup from the user-agent server-side, so a
       * mismatched pair measures a page no visitor is ever served.
       */
      for (const viewport of viewports) {
        const byBrand: Record<string, Record<string, PageResult>> = {};

        for (let i = 0; i < targets.length; i += BATCH_SIZE) {
          const batch = targets.slice(i, i + BATCH_SIZE);
          setProgress((p) => ({ ...p, current: batch[0].url, currentViewport: viewport }));

          const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: batch.map((t) => t.url), viewport }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) throw new Error(body?.error ?? `Scan failed with ${res.status}`);

          if (body.viewportSpec) viewportSpecs[viewport] = body.viewportSpec;
          // Results come back in request order, so they pair positionally.
          batch.forEach((target, n) => {
            const result = body.results?.[n];
            if (!result) return;
            axeVersion ??= result.axeVersion ?? null;
            if (result.error) failures += 1;
            (byBrand[target.brand] ??= {})[target.key] = result;
          });

          done += batch.length;
          setProgress((p) => ({ ...p, done: Math.min(done, total), failures }));
        }

        byViewport[viewport] = byBrand;
      }

      // Exactly the shape data/runs/*.json uses — see the data contract in the
      // README. Anything else here would not load.
      const primaryViewport = viewports.includes(DEFAULT_VIEWPORT)
        ? DEFAULT_VIEWPORT
        : viewports[0];
      const run = {
        meta: {
          startedAt,
          finishedAt: new Date().toISOString(),
          axeVersion,
          primaryViewport,
          viewports: viewportSpecs,
          ...(label.trim() ? { label: label.trim() } : {}),
        },
        byViewport,
      };
      setRunFile(JSON.stringify(run, null, 2));
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('failed');
    } finally {
      setProgress((p) => ({ ...p, current: null, currentViewport: null }));
    }
  }

  function toggleViewport(v: ViewportName) {
    setViewports((current) =>
      current.includes(v)
        ? current.filter((x) => x !== v)
        : VIEWPORT_NAMES.filter((n) => n === v || current.includes(n))
    );
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

      <fieldset className="mt-4">
        <legend className="text-eyebrow font-medium text-muted">Device profiles</legend>
        <p className="mt-1 max-w-measure text-xs leading-relaxed text-faint">
          These sites serve different markup per device, so each profile is a separate
          measurement rather than the same page at another width. Desktop is what agents are
          served; mobile is what most people get. Scanning both doubles the time.
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          {VIEWPORT_NAMES.map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={viewports.includes(v)}
                disabled={status === 'running' || (viewports.length === 1 && viewports.includes(v))}
                onChange={() => toggleViewport(v)}
                className="accent-accent"
              />
              {VIEWPORT_LABEL[v]}
              {v === 'desktop' ? (
                <span className="text-faint">— what agents get</span>
              ) : null}
            </label>
          ))}
        </div>
      </fieldset>

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
              {progress.done} of {progress.total} page scans
            </span>
            {progress.currentViewport ? (
              <span className="text-faint">{VIEWPORT_LABEL[progress.currentViewport]}</span>
            ) : null}
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
            {progress.total - progress.failures} of {progress.total} page scans measured, across{' '}
            {viewports.map((v) => VIEWPORT_LABEL[v]).join(' and ')}.
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
