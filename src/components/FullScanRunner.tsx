'use client';

import { useState } from 'react';

import {
  BRAND_LABEL,
  BRANDS,
  DEFAULT_VIEWPORT,
  VIEWPORT_LABEL,
  VIEWPORT_NAMES,
  type Brand,
  type PageResult,
  type ViewportName,
  type ViewportSpec,
} from '@/lib/model';
import { stagingTwin } from '@/lib/sites';
import { Arrow, Eyebrow } from './Primitives';
import { endpoints, useScanner } from './scan/useScanner';
import { ServerStatus } from './scan/ServerStatus';

export interface ScanTarget {
  brand: string;
  key: string;
  url: string;
  /** Present when this URL serves more than one document. */
  identity?: { key: string; why: string; variants?: string[] };
}

/**
 * Which deployment this run measures.
 *
 * Production is the default and what the scheduled run records. Staging is
 * the same paths on each site's preview origin — and the reason this control
 * exists: a before/after between production and staging cannot separate a fix
 * from a difference between the two environments, so a staging fix has to be
 * measured against an earlier *staging* run. That needs staging runs to exist.
 */
type Target = 'production' | 'staging';

/**
 * How many loads one multi-document URL may take before the run moves on.
 *
 * Variants come at random, so collecting three takes five or six loads on
 * average and occasionally many more. Eight keeps a full run inside a few
 * minutes and keeps the tail bounded; whatever was seen by then is recorded,
 * along with the count of attempts.
 */
const MAX_VARIANT_LOADS = 8;

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
  const scanner = useScanner();
  const [target, setTarget] = useState<Target>('production');
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
  /** Which site to scan. 'all' keeps the run a whole-estate baseline. */
  const [site, setSite] = useState<'all' | Brand>('all');
  const [saved, setSaved] = useState<{ path: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [engine, setEngine] = useState<RunProvenance | null>(null);
  const [engineChanged, setEngineChanged] = useState(false);

  /**
   * Staging is the same path on the site's preview origin. A target with no
   * staging origin configured is dropped rather than scanned against
   * production by accident — a run that quietly mixed the two would be
   * exactly the thing this control exists to prevent.
   */
  const chosen = site === 'all' ? targets : targets.filter((t) => t.brand === site);

  const scanTargets: ScanTarget[] =
    target === 'production'
      ? chosen
      : chosen
          .map((t) => {
            const url = stagingTwin(t.brand as never, t.url);
            return url ? { ...t, url } : null;
          })
          .filter((t): t is ScanTarget => t !== null);

  /**
   * The variants the most recent run of this environment recorded, keyed
   * `viewport/brand/page`.
   *
   * Insureon's homepage is one Sitecore item under a content test that serves
   * three documents from one URL. Two staging runs an hour apart, nothing
   * deployed, read 47 and 28 failing elements on it — the whole difference was
   * which hero the test served. Landing on the same variant as the previous
   * run is what makes the two runs comparable at all, so the run asks for it
   * and retries when it gets something else.
   */
  async function previousIdentities(): Promise<Map<string, string>> {
    const wanted = new Map<string, string>();
    try {
      const index = await fetch('/api/runs', { cache: 'no-store' }).then((r) => r.json());
      const previous = (index?.runs ?? [])
        .filter((r: { environment: string }) => r.environment === target)
        .pop();
      if (!previous) return wanted;
      const full = await fetch(`/api/runs?id=${encodeURIComponent(previous.id)}`, { cache: 'no-store' }).then((r) => r.json());
      for (const [vp, brands] of Object.entries(full?.byViewport ?? {})) {
        for (const [brand, pages] of Object.entries(brands as Record<string, Record<string, PageResult>>)) {
          for (const [key, page] of Object.entries(pages)) {
            const value = page && 'identity' in page ? page.identity?.value : null;
            if (value) wanted.set(`${vp}/${brand}/${key}`, value);
          }
        }
      }
    } catch {
      // No index, no previous run, no network — the run simply records what it gets.
    }
    return wanted;
  }

  async function run() {
    const total = scanTargets.length * viewports.length;
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
      const wanted = await previousIdentities();

      for (const viewport of viewports) {
        const byBrand: Record<string, Record<string, PageResult>> = {};

        const batchSize = endpoints(scanner.serverUrl).maxUrls;
        for (let i = 0; i < scanTargets.length; i += batchSize) {
          const batch = scanTargets.slice(i, i + batchSize);
          setProgress((p) => ({ ...p, current: batch[0].url, currentViewport: viewport }));

          /**
           * Brand and page key travel with each URL so the scanner can look up
           * that target's identity reader — the thing that says which of the
           * three Insureon homepages was served. Without them it has only a
           * URL, which is why runs taken here carried no identity at all.
           */
          const body = await scanner.scan({
            urls: batch.map((t) => ({ url: t.url, brand: t.brand, key: t.key })),
            viewport,
          });

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
          for (const [n, scanned] of batch.entries()) {
            let result = body.results?.[n];
            if (!result) continue;

            /**
             * A URL that serves several documents gets scanned until it has
             * shown all of them, or until the cap.
             *
             * Insureon's homepage is three materially different pages behind
             * one address — about 28, 47 and 70 failing elements — so a single
             * load measures whichever one the content test felt like serving.
             * Collecting them all removes the choice: the page of record keeps
             * feeding the totals (the previous run's variant where there is
             * one, so runs stay comparable; otherwise the first seen), and the
             * others are kept beside it. Variants arrive at random, so this is
             * capped and records how many loads it took — a run says what it
             * did, including when it gave up.
             */
            const declared = scanned.identity?.variants;
            const want = wanted.get(`${viewport}/${scanned.brand}/${scanned.key}`);
            const variantOf = (r: typeof result): string | null =>
              r && !('error' in r) && 'identity' in r ? r.identity?.value ?? null : null;

            let attempts = 1;
            if (declared && declared.length > 1 && variantOf(result)) {
              const seen = new Map<string, typeof result>([[variantOf(result)!, result]]);
              while (seen.size < declared.length && attempts < MAX_VARIANT_LOADS) {
                setProgress((p) => ({
                  ...p,
                  current: `${scanned.url} · ${seen.size} of ${declared.length} variants seen`,
                }));
                const again = await scanner.scan({
                  urls: [{ url: scanned.url, brand: scanned.brand, key: scanned.key }],
                  viewport,
                });
                attempts += 1;
                const next = again.results?.[0];
                const v = variantOf(next);
                if (next && v && !seen.has(v)) seen.set(v, next);
              }
              const ofRecord = want && seen.has(want) ? want : [...seen.keys()][0];
              const primary = seen.get(ofRecord)!;
              const others = Object.fromEntries([...seen].filter(([v]) => v !== ofRecord));
              result = { ...primary, ...(Object.keys(others).length ? { variants: others } : {}) } as typeof result;
            }

            /**
             * How many loads this page took. Recorded whenever it was more
             * than one — including when the cap was hit and a variant never
             * appeared — because a run has to say what it did, not only what
             * it found.
             */
            if (attempts > 1 && !('error' in result)) {
              result = { ...result, identityAttempts: attempts };
            }

            axeVersion ??= result.axeVersion ?? null;
            if (result.error) failures += 1;
            (byBrand[scanned.brand] ??= {})[scanned.key] = result;
          }

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
          /**
           * Recorded for the reader; the app derives the same value from the
           * URLs at load time and trusts that one, because a declared field
           * can drift from what was actually scanned.
           */
          environment: target,
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
      const text = JSON.stringify(run, null, 2);
      setRunFile(text);
      setEngine(provenance);
      setEngineChanged(mixedEngine);
      setStatus('done');

      /*
        Save it where the dashboard reads from, rather than leaving four manual
        steps between measuring something and being able to look at it. A
        deployment with a read-only filesystem answers 501 and the download
        button below stays; the reason is shown rather than swallowed.
      */
      const id = runId(target);
      try {
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, run }),
        });
        const body = (await res.json().catch(() => null)) as
          | { saved?: boolean; path?: string; error?: string }
          | null;
        if (res.ok && body?.saved) setSaved({ path: body.path ?? `data/runs/${id}.json` });
        else setSaveError(body?.error ?? 'Could not save the run file.');
      } catch {
        setSaveError('Could not reach this site to save the run file.');
      }
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

  /**
   * `2026-08-19-1611` for production, `-staging` appended for the other, which
   * is the shape every file already in `data/runs` carries. The environment is
   * in the name because two runs taken minutes apart are otherwise told apart
   * only by opening them.
   */
  function runId(env: Target): string {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, (m) =>
      m === 'T' ? '-' : m === ':' ? '' : '-'
    );
    return env === 'staging' ? `${stamp}-staging` : stamp;
  }

  function download() {
    if (!runFile) return;
    const stamp = runId(target);
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
        Scans every tracked page on both sites, {endpoints(scanner.serverUrl).maxUrls} at a time,
        and hands back a run file. <strong className="text-ink">A baseline is one run per
        environment</strong>: take production, then switch Measure to Staging and take that
        one too, so a later deploy has something of its own to be compared against.{' '}
        <span className="text-muted">
          Drop it in <code className="font-mono text-xs">data/runs/</code> and commit it. Takes a
          couple of minutes, so keep this tab open.
        </span>
      </p>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs text-muted">
            Site
            <select
              value={site}
              onChange={(e) => setSite(e.target.value as 'all' | Brand)}
              disabled={status === 'running'}
              className="mt-1.5 block appearance-none rounded-[7px] border border-rule bg-card py-1.5 pl-2.5 pr-7 text-xs text-ink hover:border-accent disabled:opacity-55"
            >
              <option value="all">Both sites</option>
              {BRANDS.map((b) => (
                <option key={b} value={b}>
                  {BRAND_LABEL[b]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-muted">
            Measure
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as Target)}
              disabled={status === 'running'}
              className="mt-1.5 block appearance-none rounded-[7px] border border-rule bg-card py-1.5 pl-2.5 pr-7 text-xs text-ink hover:border-accent disabled:opacity-55"
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
            </select>
          </label>

          <p className="pb-1.5 text-[11.5px] text-faint">
            {target === 'production'
              ? `${scanTargets.length} pages on the live sites.`
              : `${scanTargets.length} pages on the preview origins. Needs a scanner inside the network.`}
          </p>
        </div>

        <div className="text-xs text-muted">
          Scanner
          <div className="mt-1">
            <ServerStatus
              serverUrl={scanner.serverUrl}
              token={scanner.token}
              health={scanner.health}
              published={scanner.published}
              onServerUrlChange={scanner.setServerUrl}
              onTokenChange={scanner.setToken}
              onRecheck={scanner.recheck}
            />
          </div>
        </div>
      </div>

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
                <span className="text-faint">(what agents get)</span>
              ) : null}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1">
          <span className="text-eyebrow font-medium text-muted">
            Label{' '}
            <span className="text-faint">
              · optional. The picker already shows the environment and the time, so leave this
              empty unless the run needs a name a date can&apos;t give it
            </span>
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
              ? ' The pages that failed contribute zero and are flagged in the file, so treat the totals as incomplete, and check targets.mjs, since a failure usually means a URL moved.'
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
              The server reported more than one engine during this run. A deploy probably landed
              mid-scan. The fields that disagreed are stored as not recorded, because the pages in
              this file were not all measured by the same code.
            </p>
          ) : null}
          {saved ? (
            <p className="mt-3 rounded-card border border-good/25 bg-good/[0.05] px-3 py-2 text-sm text-good">
              Saved to <span className="font-mono text-xs">{saved.path}</span>. It is on the run
              picker now; commit the file to keep it.
            </p>
          ) : saveError ? (
            <p className="mt-3 rounded-card border border-serious/25 bg-serious/[0.05] px-3 py-2 text-sm text-serious">
              Not saved automatically. {saveError}
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
            <code className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
              <Arrow /> data/runs/ <Arrow /> commit <Arrow /> push
            </code>
          </div>
        </div>
      ) : null}
    </section>
  );
}
