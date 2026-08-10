'use client';

import { useEffect, useRef, useState } from 'react';

import { diffPages, pairUrls, type PageDiff } from '@/lib/compare';
import { isFailedPage, type PageResult } from '@/lib/model';
import { SITES, productionUrls } from '@/lib/sites';
import { CompareCard } from './CompareCard';
import { Eyebrow } from './Primitives';
import { ScanResultCard } from './ScanResultCard';

/**
 * Empty string means "this site's own /api/scan" — the hosted scanner, which
 * works for anyone who opens the dashboard. Setting an address here switches
 * to a scanner running on your own machine instead: slower to set up, but no
 * host allowlist and a higher per-request cap, which is what you want for a
 * staging URL that isn't on our domains yet.
 */
const HOSTED = '';
const MAX_URLS_HOSTED = 3;
const MAX_URLS_LOCAL = 10;
const MAX_COMPARE_PAIRS = 5;
const STORAGE_KEY = 'agent-readiness:scan-server';

/** Where a scan request goes, given the configured server address. */
function endpoints(serverUrl: string) {
  const base = serverUrl.trim().replace(/\/+$/, '');
  return base
    ? { health: `${base}/health`, scan: `${base}/scan`, hosted: false, maxUrls: MAX_URLS_LOCAL }
    : { health: '/api/scan', scan: '/api/scan', hosted: true, maxUrls: MAX_URLS_HOSTED };
}

type LiveScanResult = PageResult & { axeVersion?: string | null };
type Health = 'unknown' | 'checking' | 'online' | 'offline';
type Mode = 'scan' | 'compare';

const SCAN_EXAMPLES = productionUrls();

/** What the scan actually measures — used as the empty state, because an
 * empty screen should explain the value, not sit blank. */
const CHECKS = [
  {
    title: 'Controls an agent can name',
    body: 'Buttons and links with no accessible name are dead ends — an agent can see them but can’t say what they do.',
  },
  {
    title: 'Keyboard reachability',
    body: 'Anything focusable but unclickable, or clickable but unreachable, breaks both keyboard users and automation.',
  },
  {
    title: 'Page structure',
    body: 'Landmarks and heading order are how an agent finds the main content instead of re-reading the nav on every page.',
  },
  {
    title: 'Hidden but exposed',
    body: 'Closed menus that stay in the accessibility tree flood the tab order with controls that go nowhere.',
  },
];

function trimSlash(url: string) {
  return url.replace(/\/+$/, '');
}

/** http(s) only, normalised the same way the scan server normalises input, so
 * results can be matched back up by exact URL string. */
function normaliseUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function parseUrlLines(text: string): { urls: string[]; invalid: string | null } {
  const raw = Array.from(
    new Set(
      text
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
  const urls: string[] = [];
  for (const line of raw) {
    const normalised = normaliseUrl(line);
    if (normalised === null) return { urls: [], invalid: line };
    urls.push(normalised);
  }
  return { urls, invalid: null };
}

function describeFetchError(err: unknown, serverUrl: string): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'Timed out waiting for the scan server.';
  }
  const message = err instanceof Error ? err.message : String(err);
  return message || `Couldn’t reach the scan server at ${serverUrl}. Is it running?`;
}

export function LiveScanClient({ mode }: { mode: Mode }) {
  const [serverUrl, setServerUrl] = useState(HOSTED);
  const [health, setHealth] = useState<Health>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [urlsText, setUrlsText] = useState('');
  const [results, setResults] = useState<LiveScanResult[] | null>(null);

  const [beforeText, setBeforeText] = useState('');
  const [afterText, setAfterText] = useState('');
  const [diffs, setDiffs] = useState<PageDiff[] | null>(null);

  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // `localStorage` and `fetch` don't exist while this page is prerendered for
  // the static export — both wait for a real client mount.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // No persisted value — fall back to the default silently.
    }
    if (saved) setServerUrl(saved);
    checkHealth(saved ?? HOSTED);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkHealth(url: string) {
    setHealth('checking');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(endpoints(url).health, { signal: controller.signal });
      clearTimeout(timeout);
      setHealth(res.ok ? 'online' : 'offline');
    } catch {
      setHealth('offline');
    }
  }

  function saveServerUrl(next: string) {
    setServerUrl(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Value still works for this session even if it can't be persisted.
    }
  }

  async function callScanServer(urls: string[]): Promise<LiveScanResult[]> {
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 3 * 60 * 1000);
    try {
      const res = await fetch(endpoints(serverUrl).scan, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Scan server returned ${res.status}`);
      setHealth('online');
      setScannedAt((body.finishedAt as string) ?? new Date().toISOString());
      return body.results as LiveScanResult[];
    } finally {
      clearTimeout(timeout);
    }
  }

  async function runScan() {
    const { urls, invalid } = parseUrlLines(urlsText);
    if (invalid !== null) {
      setError(`Not a valid URL: “${invalid}”`);
      return;
    }
    if (urls.length === 0) {
      setError('Enter at least one URL.');
      return;
    }
    const { maxUrls, hosted } = endpoints(serverUrl);
    if (urls.length > maxUrls) {
      setError(
        `That’s ${urls.length} URLs — this scanner takes ${maxUrls} at a time` +
          (hosted ? '. Run the scanner locally to raise that.' : '.')
      );
      return;
    }

    setBusy(true);
    setError(null);
    setResults(null);
    setDiffs(null);
    try {
      setResults(await callScanServer(urls));
    } catch (err) {
      setError(describeFetchError(err, serverUrl));
      setHealth('offline');
    } finally {
      setBusy(false);
    }
  }

  async function runCompare() {
    const before = parseUrlLines(beforeText);
    const after = parseUrlLines(afterText);
    if (before.invalid !== null) {
      setError(`Not a valid Current URL: “${before.invalid}”`);
      return;
    }
    if (after.invalid !== null) {
      setError(`Not a valid Fixed URL: “${after.invalid}”`);
      return;
    }
    if (before.urls.length === 0 && after.urls.length === 0) {
      setError('Enter at least one URL, on either side.');
      return;
    }

    const pairs = pairUrls(before.urls, after.urls).slice(0, MAX_COMPARE_PAIRS);
    const allUrls = Array.from(
      new Set(pairs.flatMap((p) => [p.beforeUrl, p.afterUrl]).filter((u): u is string => !!u))
    );
    const { maxUrls } = endpoints(serverUrl);
    if (allUrls.length > maxUrls) {
      setError(
        `That’s ${allUrls.length} URLs across both sides — keep it to ${maxUrls} or fewer.`
      );
      return;
    }

    setBusy(true);
    setError(null);
    setResults(null);
    setDiffs(null);
    try {
      const scanned = await callScanServer(allUrls);
      const byUrl = new Map(scanned.map((r) => [r.url, r] as const));
      setDiffs(
        pairs.map((p) =>
          diffPages(
            p.beforeUrl ?? '',
            p.afterUrl ?? '',
            p.beforeUrl ? byUrl.get(p.beforeUrl) ?? null : null,
            p.afterUrl ? byUrl.get(p.afterUrl) ?? null : null
          )
        )
      );
    } catch (err) {
      setError(describeFetchError(err, serverUrl));
      setHealth('offline');
    } finally {
      setBusy(false);
    }
  }

  function downloadJson(data: unknown, prefix: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}-${(scannedAt ?? new Date().toISOString()).replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const run = mode === 'scan' ? runScan : runCompare;
  const hasOutput = (results && results.length > 0) || (diffs && diffs.length > 0);

  return (
    <div className="space-y-10">
      <section className="max-w-measure">
        <h1 className="font-display text-[2rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-hero">
          {mode === 'scan'
            ? 'Measure a site right now.'
            : 'Check the fix actually landed.'}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          {mode === 'scan' ? (
            <>
              Point the scanner at any URL — production, staging, a preview build — and get the
              same numbers the scheduled runs produce. Nothing is saved to the run history, so
              this is safe to use as much as you like.
            </>
          ) : (
            <>
              Put the current site on one side and the fixed one on the other. Both are scanned
              in the same session with identical settings, then diffed check by check, so you
              can see exactly what resolved, what didn&apos;t move, and whether anything new
              appeared.
            </>
          )}
        </p>
      </section>

      <section className="overflow-hidden rounded-lg border border-rule bg-card shadow-raised">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
          <p className="text-eyebrow font-medium text-muted">
            {mode === 'scan' ? 'URLs to measure' : 'Two versions of the same pages'}
          </p>
          <ServerStatus
            serverUrl={serverUrl}
            health={health}
            onServerUrlChange={saveServerUrl}
            onRecheck={() => checkHealth(serverUrl)}
          />
        </div>

        <div className="p-5">
          {mode === 'scan' ? (
            <div className="space-y-3">
              <label htmlFor="scan-urls" className="sr-only">
                URLs to scan
              </label>
              <textarea
                id="scan-urls"
                rows={3}
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                placeholder={`https://www.example.com/\nhttps://staging.example.com/pricing`}
                className="w-full resize-none rounded-card border border-rule bg-paper px-3.5 py-3 font-mono text-sm leading-relaxed text-ink transition-shadow"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ExampleChips
                  examples={SCAN_EXAMPLES}
                  onPick={(url) => setUrlsText((t) => (t.trim() ? `${t.trim()}\n${url}` : url))}
                />
                <span className="text-xs text-faint">
                  One URL per line, up to {endpoints(serverUrl).maxUrls}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="compare-before" className="mb-1.5 block text-eyebrow font-medium text-muted">
                    Current <span className="text-faint">· live production</span>
                  </label>
                  <textarea
                    id="compare-before"
                    rows={3}
                    value={beforeText}
                    onChange={(e) => setBeforeText(e.target.value)}
                    placeholder="https://www.example.com/"
                    className="w-full resize-none rounded-card border border-rule bg-paper px-3.5 py-3 font-mono text-sm leading-relaxed text-ink transition-shadow"
                  />
                </div>
                <div>
                  <label htmlFor="compare-after" className="mb-1.5 block text-eyebrow font-medium text-muted">
                    Fixed <span className="text-faint">· staging or a preview build</span>
                  </label>
                  <textarea
                    id="compare-after"
                    rows={3}
                    value={afterText}
                    onChange={(e) => setAfterText(e.target.value)}
                    placeholder="https://staging.example.com/"
                    className="w-full resize-none rounded-card border border-rule bg-paper px-3.5 py-3 font-mono text-sm leading-relaxed text-ink transition-shadow"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-faint">Fill Current with</span>
                  {Object.entries(SITES).map(([brand, site]) => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() =>
                        setBeforeText((t) => (t.trim() ? `${t.trim()}\n${site.url}` : site.url))
                      }
                      className="rounded-pill border border-rule bg-paper px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      {site.host}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-faint">
                  Paired line by line, up to {MAX_COMPARE_PAIRS} pairs
                </span>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-card bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {busy ? (
                <>
                  <Spinner />
                  Scanning…
                </>
              ) : mode === 'scan' ? (
                'Run scan'
              ) : (
                'Run comparison'
              )}
            </button>
            {busy ? (
              <span className="text-sm text-muted">
                Loading each page in a real browser. Usually under a minute.
              </span>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-card border border-critical/25 bg-critical/[0.04] px-3.5 py-2.5 text-sm text-critical"
            >
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {!hasOutput && !busy ? <WhatWeCheck /> : null}

      {mode === 'scan' && results && results.length > 0 ? (
        <ScanResults
          results={results}
          onDownload={() => downloadJson({ scannedAt, results }, 'scan')}
        />
      ) : null}

      {mode === 'compare' && diffs && diffs.length > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold tracking-tight">
              {diffs.length} pair{diffs.length === 1 ? '' : 's'} compared
            </h2>
            <button
              type="button"
              onClick={() => downloadJson({ scannedAt, diffs }, 'compare')}
              className="text-sm font-medium text-accent hover:underline"
            >
              Download JSON
            </button>
          </div>
          {diffs.map((diff, i) => (
            <CompareCard key={`${diff.beforeUrl}-${diff.afterUrl}-${i}`} diff={diff} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white"
    />
  );
}

function WhatWeCheck() {
  return (
    <section>
      <h2 className="text-eyebrow font-medium text-muted">What each scan looks at</h2>
      <div className="mt-3 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-2">
        {CHECKS.map((check) => (
          <div key={check.title} className="bg-card p-5">
            <h3 className="font-display text-base font-bold tracking-tight text-ink">
              {check.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{check.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExampleChips({
  examples,
  onPick,
}: {
  examples: string[];
  onPick: (url: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-faint">Try</span>
      {examples.map((url) => (
        <button
          key={url}
          type="button"
          onClick={() => onPick(url)}
          className="rounded-pill border border-rule bg-paper px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent"
        >
          {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </button>
      ))}
    </div>
  );
}

function ServerStatus({
  serverUrl,
  health,
  onServerUrlChange,
  onRecheck,
}: {
  serverUrl: string;
  health: Health;
  onServerUrlChange: (url: string) => void;
  onRecheck: () => void;
}) {
  const dotClass =
    health === 'online' ? 'bg-good' : health === 'offline' ? 'bg-critical' : 'bg-faint';
  const hosted = !serverUrl.trim();
  const labelText =
    health === 'online'
      ? hosted
        ? 'Scanner ready'
        : 'Local scanner ready'
      : health === 'offline'
      ? hosted
        ? 'Scanner unavailable'
        : 'Local scanner offline'
      : health === 'checking'
      ? 'Checking…'
      : 'Scanner';

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-pill border border-rule bg-paper px-2.5 py-1 text-xs text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {labelText}
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-96 space-y-3 rounded-lg border border-rule bg-card p-4 shadow-pop">
        <div>
          <Eyebrow>Which scanner</Eyebrow>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {hosted
              ? 'Running on this site — nothing to install. Limited to our own domains and a few URLs per scan.'
              : 'Running on your machine. No domain restrictions and a higher cap, so use this for a staging host that isn’t on our domains yet.'}
          </p>
        </div>

        <label className="block">
          <span className="text-eyebrow font-medium text-muted">
            Local scanner address <span className="text-faint">· blank uses this site</span>
          </span>
          <input
            type="text"
            value={serverUrl}
            placeholder="http://localhost:4790"
            onChange={(e) => onServerUrlChange(e.target.value)}
            className="mt-1 w-full rounded-card border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs transition-shadow"
          />
        </label>

        <button
          type="button"
          onClick={onRecheck}
          className="text-sm font-medium text-accent hover:underline"
        >
          Check again
        </button>

        {health === 'offline' ? (
          <p className="text-xs leading-relaxed text-muted">
            {hosted ? (
              'This site’s scanner didn’t respond. Try again, or point this at a local scanner:'
            ) : (
              <>Nothing is answering there. Start it with:</>
            )}
            <code className="mt-1.5 block rounded-card border border-rule bg-paper px-2 py-1.5 font-mono text-[11px] text-ink">
              npm run scan-server
            </code>
          </p>
        ) : null}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */

function ScanResults({
  results,
  onDownload,
}: {
  results: LiveScanResult[];
  onDownload: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          {results.length} page{results.length === 1 ? '' : 's'} scanned
        </h2>
        <button
          type="button"
          onClick={onDownload}
          className="text-sm font-medium text-accent hover:underline"
        >
          Download JSON
        </button>
      </div>

      {results.length > 1 ? <ComparisonTable results={results} /> : null}

      <div className="space-y-8">
        {results.map((r, i) => (
          <div key={`${r.url}-${i}`}>
            {isFailedPage(r) ? (
              <div className="rounded-lg border border-critical/25 bg-critical/[0.04] p-5">
                <p className="text-eyebrow font-semibold text-critical">Couldn’t load this page</p>
                <p className="mt-1 font-mono text-xs text-muted">{r.url}</p>
                <p className="mt-2 text-sm text-ink">{r.error}</p>
              </div>
            ) : (
              <ScanResultCard page={r} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonTable({ results }: { results: LiveScanResult[] }) {
  const rows = results.map((r) => {
    if (isFailedPage(r)) {
      return { url: r.url, failed: true as const, nodes: 0, phantom: 0 };
    }
    const nodes = (r.violations ?? []).reduce((sum, v) => sum + v.n, 0);
    return { url: r.url, failed: false as const, nodes, phantom: r.phantomMenu?.focusable ?? 0 };
  });
  const maxNodes = Math.max(...rows.map((r) => r.nodes), 1);

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-card shadow-card">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Failing nodes and phantom controls per scanned page</caption>
        <thead>
          <tr className="border-b border-rule bg-paper/60">
            <th scope="col" className="px-5 py-2.5 text-left text-eyebrow font-medium text-muted">
              Page
            </th>
            <th scope="col" className="px-5 py-2.5 text-right text-eyebrow font-medium text-muted">
              Failing nodes
            </th>
            <th scope="col" className="px-5 py-2.5 text-right text-eyebrow font-medium text-muted">
              Phantom controls
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.url} className="border-b border-rule last:border-0">
              <th scope="row" className="max-w-xs truncate px-5 py-3 text-left font-mono text-xs font-normal text-ink">
                {r.url}
              </th>
              <td className="px-5 py-3 text-right">
                {r.failed ? (
                  <span className="text-xs text-critical">Couldn’t load</span>
                ) : (
                  <span className="inline-flex items-center justify-end gap-2.5">
                    <span
                      aria-hidden="true"
                      className="h-1.5 rounded-pill bg-serious/70"
                      style={{ width: `${Math.max(6, (r.nodes / maxNodes) * 72)}px` }}
                    />
                    <span className="w-8 text-right font-medium tnum">{r.nodes}</span>
                  </span>
                )}
              </td>
              <td className="px-5 py-3 text-right tnum">
                {r.failed ? <span className="text-faint">—</span> : r.phantom}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
