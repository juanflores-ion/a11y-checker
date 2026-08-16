'use client';

import { Fragment, useEffect, useRef, useState } from 'react';

import { countedGhostControls } from '@/lib/aggregate';
import { diffPages, pairUrls, type PageDiff } from '@/lib/compare';
import {
  DEFAULT_VIEWPORT,
  VERDICT_LABEL,
  VIEWPORT_LABEL,
  VIEWPORT_NAMES,
  isFailedPage,
  verdictForPage,
  type PageResult,
  type ViewportName,
} from '@/lib/model';
import { SITES, productionUrls } from '@/lib/sites';
import { CompareCard } from './CompareCard';
import { Eyebrow } from './Primitives';
import { ScanResultCard } from './ScanResultCard';
import { StatusDot } from './ui/StatusDot';
import { NumCell, Table, TBody, Td, Th, THead, ToggleCell } from './ui/Table';

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
  /**
   * One profile for the whole scan, and in Compare both sides use it.
   *
   * These sites branch their markup on the device server-side, so a before/after
   * taken at two profiles would diff two different pages — the desktop nav alone
   * accounts for ~56 links — and every row of that diff would be noise dressed
   * up as a result.
   */
  const [viewport, setViewport] = useState<ViewportName>(DEFAULT_VIEWPORT);
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
        body: JSON.stringify({ urls, viewport }),
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

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-rule bg-card shadow-card">
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_16rem]">
          {mode === 'scan' ? (
            <div>
              <label htmlFor="scan-urls" className="mb-1 block text-xs text-muted">
                <span className="font-medium text-ink">URLs</span> · one per line, up to {endpoints(serverUrl).maxUrls}
              </label>
              <textarea
                id="scan-urls"
                rows={3}
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                placeholder={`https://www.example.com/\nhttps://staging.example.com/pricing`}
                className="w-full resize-y rounded-card border border-rule bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink"
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="compare-before" className="mb-1 block text-xs text-muted">
                  <span className="font-medium text-ink">Before</span> · live production
                </label>
                <textarea id="compare-before" rows={3} value={beforeText} onChange={(e) => setBeforeText(e.target.value)} placeholder="https://www.example.com/" className="w-full resize-y rounded-card border border-rule bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink" />
              </div>
              <div>
                <label htmlFor="compare-after" className="mb-1 block text-xs text-muted">
                  <span className="font-medium text-ink">After</span> · staging or a preview build
                </label>
                <textarea id="compare-after" rows={3} value={afterText} onChange={(e) => setAfterText(e.target.value)} placeholder="https://staging.example.com/" className="w-full resize-y rounded-card border border-rule bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink" />
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <label className="block text-xs text-muted">
              Device
              <select
                value={viewport}
                onChange={(e) => setViewport(e.target.value as ViewportName)}
                disabled={busy}
                className="mt-1 w-full appearance-none rounded-[7px] border border-rule bg-card py-1.5 pl-2 pr-6 font-mono text-xs text-ink hover:border-accent disabled:opacity-60"
              >
                {VIEWPORT_NAMES.map((v) => (
                  <option key={v} value={v}>
                    {VIEWPORT_LABEL[v]}
                    {v === 'desktop' ? ' — what agents get' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-xs text-muted">
              Scanner
              <div className="mt-1">
                <ServerStatus serverUrl={serverUrl} health={health} onServerUrlChange={saveServerUrl} onRecheck={() => checkHealth(serverUrl)} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3">
          {mode === 'scan' ? (
            <ExampleChips examples={SCAN_EXAMPLES} onPick={(url) => setUrlsText((t) => (t.trim() ? `${t.trim()}\n${url}` : url))} />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint">
              <span>Fill Before with</span>
              {Object.entries(SITES).map(([brand, site]) => (
                <button key={brand} type="button" onClick={() => setBeforeText((t) => (t.trim() ? `${t.trim()}\n${site.url}` : site.url))} className="rounded-[6px] border border-rule bg-paper px-2 py-0.5 font-mono text-[11px] text-muted hover:border-accent/40 hover:text-accent">
                  {site.host}
                </button>
              ))}
              <span className="ml-2">Paired line by line, up to {MAX_COMPARE_PAIRS} pairs</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            {busy ? <span className="text-xs text-muted">Loading each page in a real browser — usually under a minute.</span> : null}
            <button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white shadow-card hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55">
              {busy ? (<><Spinner />Scanning…</>) : mode === 'scan' ? 'Run scan' : 'Run comparison'}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="border-t border-critical/25 bg-critical/[0.04] px-4 py-2 text-sm text-critical">{error}</p>
        ) : null}
      </section>

      {mode === 'scan' && results ? (
        results.length > 0 ? (
          <ScanResults
            results={results}
            onDownload={() => downloadJson({ scannedAt, results }, 'scan')}
          />
        ) : (
          <p className="text-sm text-muted">Nothing came back — the scanner returned no pages.</p>
        )
      ) : null}

      {mode === 'compare' && diffs && diffs.length > 0 ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold text-ink">
              {diffs.length} pair{diffs.length === 1 ? '' : 's'} compared
            </h2>
            <button
              type="button"
              onClick={() => downloadJson({ scannedAt, diffs }, 'compare')}
              className="text-xs font-medium text-accent hover:underline"
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
          className="rounded-[6px] border border-rule bg-paper px-2 py-0.5 font-mono text-[11px] text-muted hover:border-accent/40 hover:text-accent"
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
      <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {labelText}
        <span className="text-faint">· change</span>
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

function ScanResults({ results, onDownload }: { results: LiveScanResult[]; onDownload: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-labelledby="scan-results" aria-live="polite">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="scan-results" className="text-sm font-semibold text-ink">
          Results <span className="font-normal text-faint">· {results.length} page{results.length === 1 ? '' : 's'} · same checks as the scheduled runs · expand a row for the sample markup</span>
        </h2>
        <button type="button" onClick={onDownload} className="text-xs font-medium text-accent hover:underline">Download JSON</button>
      </div>
      <Table label="Scan results">
        <THead>
          <tr>
            <Th>Page</Th>
            <Th align="right">Failing</Th>
            <Th align="right">Rules</Th>
            <Th align="right">Main</Th>
            <Th align="right">Unnamed</Th>
            <Th align="right">Ghost</Th>
            <Th align="right">Unfindable links</Th>
            <Th className="w-28">Verdict</Th>
            <Th className="w-8"><span className="sr-only">Detail</span></Th>
          </tr>
        </THead>
        <TBody>
          {results.map((r, i) => {
            const key = `${r.url}-${i}`;
            if (isFailedPage(r)) {
              return (
                <tr key={key}>
                  <Td className="font-mono text-xs">{r.url}</Td>
                  <Td colSpan={8} className="text-critical">Couldn’t load — {r.error}</Td>
                </tr>
              );
            }
            const nodes = (r.violations ?? []).reduce((s, v) => s + v.n, 0);
            const unnamed = (r.namelessButtons?.length ?? 0) + (r.namelessLinks?.length ?? 0);
            const ghosts = r.ghostControls ? countedGhostControls(r).length : null;
            const unfindable = r.unreachableTotals?.unannouncedLinks ?? null;
            const verdict = verdictForPage(r);
            const isOpen = open === key;
            const detailId = `scan-detail-${i}`;
            return (
              <Fragment key={key}>
                <tr>
                  <Td className="font-mono text-xs">{r.url}</Td>
                  <NumCell tone="neutral" text={nodes.toLocaleString()} />
                  <NumCell tone="neutral" text={String((r.violations ?? []).length)} />
                  <Td align="right">
                    <span className={r.hasMain ? 'text-ink' : 'font-medium text-critical'}>
                      {r.hasMain ? 'present' : 'missing'}
                    </span>
                  </Td>
                  <NumCell tone={unnamed > 0 ? 'bad' : 'ok'} text={String(unnamed)} />
                  <NumCell tone={ghosts === null ? 'na' : ghosts > 0 ? 'bad' : 'ok'} text={String(ghosts ?? 0)} />
                  <NumCell tone={unfindable === null ? 'na' : unfindable > 0 ? 'bad' : 'ok'} text={String(unfindable ?? 0)} />
                  <Td>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${verdict === 'blocking' ? 'text-critical' : verdict === 'needs-work' ? 'text-serious' : 'text-good'}`}>
                      <StatusDot tone={verdict === 'blocking' ? 'bad' : verdict === 'needs-work' ? 'serious' : 'ok'} />
                      {VERDICT_LABEL[verdict]}
                    </span>
                  </Td>
                  <ToggleCell
                    open={isOpen}
                    onToggle={() => setOpen(isOpen ? null : key)}
                    controls={detailId}
                  />
                </tr>
                {isOpen ? (
                  <tr id={detailId}>
                    <Td colSpan={9} className="h-auto bg-paper/40 px-4 py-4">
                      <ScanResultCard page={r} compact />
                    </Td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </TBody>
      </Table>
    </section>
  );
}
