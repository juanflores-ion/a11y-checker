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
 * Which engine measured a batch, as the API route reports it.
 *
 * Mirrors the provenance block on `RunMeta` — `probeVersion`, `browserVersion`,
 * `browserPath` — plus `scannedBy`, which the route has always computed and
 * this component has always thrown away. That is why it is here: a run file
 * assembled in the browser used to name its axe version and nothing else, so
 * it was indistinguishable from a run taken on a laptop with a different
 * Chromium and probe code from a different week. Three Chromium majors were
 * driven against these sites in one session, and not one run file says which.
 *
 * Every field is `string | null` and never optional. `null` means the server
 * answered and could not establish it; the field being *missing from the run
 * file altogether* is reserved for runs written before provenance existed.
 */
interface RunProvenance {
  probeVersion: string | null;
  browserVersion: string | null;
  browserPath: string | null;
  scannedBy: string | null;
}

const PROVENANCE_KEYS = ['probeVersion', 'browserVersion', 'browserPath', 'scannedBy'] as const;

const NOT_RECORDED = 'not recorded';

/**
 * A response from a deployment older than the provenance block has no
 * `provenance` key at all, and reads as all-null rather than as an error. That
 * is the right answer: nothing was recorded, and nothing is claimed.
 */
function readProvenance(body: { provenance?: Partial<RunProvenance>; scannedBy?: string }): RunProvenance {
  return {
    probeVersion: body?.provenance?.probeVersion ?? null,
    browserVersion: body?.provenance?.browserVersion ?? null,
    browserPath: body?.provenance?.browserPath ?? null,
    scannedBy: body?.scannedBy ?? null,
  };
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
  const [engine, setEngine] = useState<RunProvenance | null>(null);
  const [engineChanged, setEngineChanged] = useState(false);

  async function run() {
    const total = targets.length * viewports.length;
    setStatus('running');
    setError(null);
    setRunFile(null);
    setEngine(null);
    setEngineChanged(false);
    setProgress({ done: 0, total, current: null, currentViewport: null, failures: 0 });

    const startedAt = new Date().toISOString();
    const byViewport: Record<string, Record<string, Record<string, PageResult>>> = {};
    const viewportSpecs: Record<string, ViewportSpec> = {};
    let axeVersion: string | null = null;
    let provenance: RunProvenance | null = null;
    let mixedEngine = false;
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

          /**
           * One run file, ~14 requests, and no guarantee they all land on the
           * same server process. A deploy that lands mid-run genuinely swaps
           * the engine underneath a scan, which is the very thing this field
           * exists to expose — so a disagreement between batches is recorded
           * as "not recorded" for whichever field disagreed, rather than as
           * whichever answer happened to arrive first. A single wrong-looking
           * SHA in a run file is worse than no SHA: it would be read as
           * evidence that every page in the file was measured by that code.
           */
          const seen = readProvenance(body);
          if (!provenance) {
            provenance = seen;
          } else {
            for (const key of PROVENANCE_KEYS) {
              if (provenance[key] !== seen[key]) {
                provenance[key] = null;
                mixedEngine = true;
              }
            }
          }
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
          /* --------------------------------------------------------------
           * Which engine produced these numbers. Same four keys the CLI
           * writes, so a run taken here and a run taken by the scheduled
           * scan are attributable in exactly the same way — the file should
           * not be able to say how it was taken only by implication.
           *
           * `scannedBy` will read "hosted" here and "cli" from scan.mjs.
           * That is not bookkeeping about who ran it: the two paths launch
           * different Chromium builds, @sparticuz's here and the full
           * Playwright download there.
           * -------------------------------------------------------------- */
          probeVersion: provenance?.probeVersion ?? null,
          browserVersion: provenance?.browserVersion ?? null,
          browserPath: provenance?.browserPath ?? null,
          scannedBy: provenance?.scannedBy ?? null,
          ...(label.trim() ? { label: label.trim() } : {}),
        },
        byViewport,
      };
      setRunFile(JSON.stringify(run, null, 2));
      setEngine(provenance);
      setEngineChanged(mixedEngine);
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
    <section className="rounded-lg border border-rule bg-card p-4 shadow-card">
      <p className="text-sm text-ink">
        Scans every tracked page on both sites, {BATCH_SIZE} at a time, and hands back a run file.{' '}
        <span className="text-muted">
          Drop it in <code className="font-mono text-xs">data/runs/</code> and commit it. Takes a
          couple of minutes — keep this tab open.
        </span>
      </p>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-muted">Device profiles</legend>
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
            Label <span className="text-faint">· optional, names this run in the run picker</span>
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
          className="rounded-card bg-accent px-5 py-2.5 text-sm font-medium text-paper shadow-card transition-all hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
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
        <div className="mt-4 rounded-card border border-rule bg-paper/60 p-4">
          <Eyebrow className="text-xs font-medium text-good">Run complete</Eyebrow>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">
            {progress.total - progress.failures} of {progress.total} page scans measured, across{' '}
            {viewports.map((v) => VIEWPORT_LABEL[v]).join(' and ')}.
            {progress.failures > 0
              ? ' The pages that failed contribute zero and are flagged in the file — treat the totals as incomplete, and check targets.mjs, since a failure usually means a URL moved.'
              : ''}
          </p>
          {/*
            Shown, not just written, because the point of recording the engine
            is that somebody notices when it is the wrong one. Anything the
            server could not establish reads "not recorded" and is stored as
            null — never blank, never a plausible-looking guess.
          */}
          <p className="mt-2 text-xs leading-relaxed text-faint">
            Engine ·{' '}
            <span className="font-mono">probes {engine?.probeVersion ?? NOT_RECORDED}</span> ·{' '}
            <span className="font-mono">{engine?.browserVersion ?? NOT_RECORDED}</span> ·{' '}
            <span className="font-mono">{engine?.scannedBy ?? NOT_RECORDED}</span>
          </p>
          {engineChanged ? (
            <p className="mt-1.5 text-xs leading-relaxed text-critical">
              The server reported more than one engine during this run — a deploy probably landed
              mid-scan. The fields that disagreed are stored as not recorded, because the pages in
              this file were not all measured by the same code.
            </p>
          ) : null}
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
