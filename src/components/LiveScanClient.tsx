'use client';

import { Fragment, useEffect, useRef, useState } from 'react';

import { countedGhostControls } from '@/lib/aggregate';
import { diffPages, pairUrls, type PageDiff } from '@/lib/compare';
import {
  BRANDS,
  DEFAULT_VIEWPORT,
  VERDICT_LABEL,
  VIEWPORT_LABEL,
  VIEWPORT_NAMES,
  isFailedPage,
  verdictForPage,
  type Brand,
  type PageResult,
  type ViewportName,
} from '@/lib/model';
import { SITES, productionUrls } from '@/lib/sites';
import { CompareCard } from './CompareCard';
import type { ScanTarget } from './FullScanRunner';
import { ComparePages, pagesFor } from './scan/ComparePages';
import { Eyebrow } from './Primitives';
import { ScanResultCard } from './ScanResultCard';
import { StatusDot } from './ui/StatusDot';
import { NumCell, Table, TBody, Td, Th, THead, ToggleCell } from './ui/Table';

/**
 * Empty string means "this site's own /api/scan" — the hosted scanner, which
 * works for anyone who opens the dashboard but can only reach the public
 * internet. Setting an address switches to a scanner someone is running
 * inside the network — on this machine (localhost) or on a colleague's,
 * reached through a tunnel URL — which is how a staging host gets scanned.
 * A tunnelled scanner is started with a token; the token travels with every
 * request as a bearer header and is kept next to the address.
 */
const HOSTED = '';
const MAX_URLS_HOSTED = 3;
const MAX_URLS_LOCAL = 10;
const MAX_COMPARE_PAIRS = 12;
const STORAGE_KEY = 'agent-readiness:scan-server';
const TOKEN_STORAGE_KEY = 'agent-readiness:scan-token';

/** Where a scan request goes, given the configured server address. */
function endpoints(serverUrl: string) {
  const base = serverUrl.trim().replace(/\/+$/, '');
  return base
    ? { health: `${base}/health`, scan: `${base}/scan`, hosted: false, maxUrls: MAX_URLS_LOCAL }
    : { health: '/api/scan', scan: '/api/scan', hosted: true, maxUrls: MAX_URLS_HOSTED };
}

type LiveScanResult = PageResult & { axeVersion?: string | null };
/** `token`: the scanner answered, but wants a token we don't have or rejected the one we sent. */
type Health = 'unknown' | 'checking' | 'online' | 'offline' | 'token';

/** The scanner answered with an error of its own — the network is fine, so it is not "offline". */
class ScanRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function authHeaders(serverUrl: string, token: string): Record<string, string> {
  return !endpoints(serverUrl).hosted && token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {};
}
type Mode = 'scan' | 'compare';

const SCAN_EXAMPLES = productionUrls();
/** Real addresses in the placeholders, so nobody has to guess the staging shape. */
const FIRST_SITE = Object.values(SITES)[0];
const PLACEHOLDER_PROD = FIRST_SITE.url;
const PLACEHOLDER_STAGING = Object.values(SITES).find((s) => s.staging)?.staging ?? 'https://staging.example.com/';

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

export function LiveScanClient({ mode, targets = [] }: { mode: Mode; targets?: ScanTarget[] }) {
  const [serverUrl, setServerUrl] = useState(HOSTED);
  const [token, setToken] = useState('');
  const [health, setHealth] = useState<Health>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [urlsText, setUrlsText] = useState('');
  const [results, setResults] = useState<LiveScanResult[] | null>(null);

  const [beforeText, setBeforeText] = useState('');
  const [afterText, setAfterText] = useState('');
  const [diffs, setDiffs] = useState<PageDiff[] | null>(null);

  /**
   * Which tracked pages to compare. Ticking page types beats typing twenty
   * URLs in two columns in matching order, which is what this form used to
   * ask for. Page keys are the same on both sites, so switching site keeps
   * the selection.
   */
  const [site, setSite] = useState<Brand>(BRANDS[0]);
  /** Every tracked page, ticked: the common job is "check them all after a
   *  fix", so the form arrives ready to run and unticking is the edit. */
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(pagesFor(targets, BRANDS[0]).map((p) => p.key))
  );
  const [progress, setProgress] = useState<{ done: number; active: number; total: number } | null>(null);

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
    let savedToken: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
      savedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      // No persisted value — fall back to the default silently.
    }
    if (saved) setServerUrl(saved);
    if (savedToken) setToken(savedToken);
    checkHealth(saved ?? HOSTED, savedToken ?? '');
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkHealth(url: string, tok: string) {
    setHealth('checking');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(endpoints(url).health, {
        headers: authHeaders(url, tok),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        setHealth('offline');
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { authRequired?: boolean; tokenAccepted?: boolean }
        | null;
      const tokenProblem = Boolean(body?.authRequired) && (!tok.trim() || body?.tokenAccepted === false);
      setHealth(tokenProblem ? 'token' : 'online');
    } catch {
      setHealth('offline');
    }
  }

  function persist(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Value still works for this session even if it can't be persisted.
    }
  }

  function saveServerUrl(next: string) {
    setServerUrl(next);
    persist(STORAGE_KEY, next);
  }

  function saveToken(next: string) {
    setToken(next);
    persist(TOKEN_STORAGE_KEY, next);
  }

  async function callScanServer(urls: string[]): Promise<LiveScanResult[]> {
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 3 * 60 * 1000);
    try {
      const res = await fetch(endpoints(serverUrl).scan, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(serverUrl, token) },
        body: JSON.stringify({ urls, viewport }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      // It answered, so it is reachable: a 401 means the token, anything else
      // is a complaint about the request, not an outage.
      setHealth(res.status === 401 ? 'token' : 'online');
      if (!res.ok) throw new ScanRequestError(body?.error ?? `Scan server returned ${res.status}`, res.status);
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
          (hosted ? '. A scanner inside your network takes ten.' : '.')
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
      if (!(err instanceof ScanRequestError)) setHealth('offline');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Every URL a comparison needs, in batches the scanner will accept.
   *
   * A ten-page comparison is twenty URLs, and no scanner takes twenty at once
   * — the hosted route takes three, one inside the network takes ten. So the
   * page splits the work rather than making someone run it four times: same
   * session, same device profile, one progress count. Results are keyed by
   * the URL that was requested, because that is what the pairs hold; the
   * server echoes it back, and request order is the fallback.
   */
  async function scanInBatches(urls: string[]): Promise<Map<string, LiveScanResult>> {
    const { maxUrls } = endpoints(serverUrl);
    const byUrl = new Map<string, LiveScanResult>();
    setProgress({ done: 0, active: Math.min(maxUrls, urls.length), total: urls.length });
    for (let i = 0; i < urls.length; i += maxUrls) {
      const batch = urls.slice(i, i + maxUrls);
      setProgress({ done: i, active: batch.length, total: urls.length });
      const scanned = await callScanServer(batch);
      batch.forEach((url, n) => {
        const result = scanned[n];
        if (!result) return;
        byUrl.set(url, result);
        if (result.url && result.url !== url) byUrl.set(result.url, result);
      });
      setProgress({ done: Math.min(i + batch.length, urls.length), active: 0, total: urls.length });
    }
    return byUrl;
  }

  /** The picked pages first, then any one-off URLs typed underneath. */
  function comparePairs(): { pairs: Array<{ beforeUrl: string | null; afterUrl: string | null }>; error: string | null } {
    const chosen = pagesFor(targets, site).filter((p) => picked.has(p.key));
    const before = parseUrlLines(beforeText);
    const after = parseUrlLines(afterText);
    if (before.invalid !== null) return { pairs: [], error: `Not a valid Before URL: “${before.invalid}”` };
    if (after.invalid !== null) return { pairs: [], error: `Not a valid After URL: “${after.invalid}”` };
    const pairs = [
      ...chosen.map((p) => ({ beforeUrl: p.beforeUrl, afterUrl: p.afterUrl })),
      ...pairUrls(before.urls, after.urls),
    ];
    if (pairs.length === 0) {
      return { pairs: [], error: 'Pick at least one page, or type a URL under “Other URLs”.' };
    }
    if (pairs.length > MAX_COMPARE_PAIRS) {
      return { pairs: [], error: `That’s ${pairs.length} pairs — keep it to ${MAX_COMPARE_PAIRS} or fewer.` };
    }
    return { pairs, error: null };
  }

  async function runCompare() {
    const { pairs, error: problem } = comparePairs();
    if (problem !== null) {
      setError(problem);
      return;
    }

    const allUrls = Array.from(
      new Set(pairs.flatMap((p) => [p.beforeUrl, p.afterUrl]).filter((u): u is string => !!u))
    );

    setBusy(true);
    setError(null);
    setResults(null);
    setDiffs(null);
    try {
      const byUrl = await scanInBatches(allUrls);
      setDiffs(
        pairs.map((p) =>
          diffPages(
            p.beforeUrl ?? '',
            p.afterUrl ?? '',
            p.beforeUrl ? byUrl.get(p.beforeUrl) ?? null : null,
            p.afterUrl ? byUrl.get(p.afterUrl) ?? null : null,
            // One profile for the whole run, so both sides carry it and the
            // card can say which device the figures describe.
            { before: viewport, after: viewport }
          )
        )
      );
    } catch (err) {
      setError(describeFetchError(err, serverUrl));
      if (!(err instanceof ScanRequestError)) setHealth('offline');
    } finally {
      setBusy(false);
      setProgress(null);
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
                placeholder={`${PLACEHOLDER_PROD}\n${PLACEHOLDER_STAGING}`}
                className="w-full resize-y rounded-card border border-rule bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <ComparePages
                targets={targets}
                site={site}
                onSiteChange={setSite}
                picked={picked}
                onPickedChange={setPicked}
                disabled={busy}
              />
              {/* Anything off the tracked list still has a home, one level
                  down: a preview build, a single page mid-fix. Empty, because
                  the pages above are the path this form is for. */}
              <details className="group">
                <summary className="inline-flex cursor-pointer list-none items-center text-xs text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                  <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
                  Other URLs — a preview build, or a page not on the list
                </summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="compare-before" className="mb-1 block text-xs text-muted">
                      <span className="font-medium text-ink">Before</span> · live production
                    </label>
                    <textarea id="compare-before" rows={3} value={beforeText} onChange={(e) => setBeforeText(e.target.value)} placeholder={PLACEHOLDER_PROD} className="w-full resize-y rounded-card border border-rule bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink" />
                  </div>
                  <div>
                    <label htmlFor="compare-after" className="mb-1 block text-xs text-muted">
                      <span className="font-medium text-ink">After</span> · staging or a preview build
                    </label>
                    <textarea id="compare-after" rows={3} value={afterText} onChange={(e) => setAfterText(e.target.value)} placeholder={PLACEHOLDER_STAGING} className="w-full resize-y rounded-card border border-rule bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink" />
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-faint">
                  Paired line by line, and added to the pages picked above — up to {MAX_COMPARE_PAIRS} pairs in one run.
                </p>
              </details>
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
                <ServerStatus
                  serverUrl={serverUrl}
                  token={token}
                  health={health}
                  onServerUrlChange={saveServerUrl}
                  onTokenChange={saveToken}
                  onRecheck={() => checkHealth(serverUrl, token)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3">
          {mode === 'scan' ? (
            <ExampleChips examples={SCAN_EXAMPLES} onPick={(url) => setUrlsText((t) => (t.trim() ? `${t.trim()}\n${url}` : url))} />
          ) : (
            <p className="max-w-lg text-xs text-faint">
              Only the pages picked above are scanned — each one twice, the same path on both
              origins, at the one device profile. Nothing is written to the run history.
            </p>
          )}
          <div className="flex items-center gap-3">
            {busy ? (
              <span className="text-xs text-muted tnum">
                {progress && progress.total > 0
                  ? progress.active > 0
                    ? `Loading URL${progress.active === 1 ? '' : 's'} ${progress.done + 1}${
                        progress.active > 1 ? `–${progress.done + progress.active}` : ''
                      } of ${progress.total} in a real browser…`
                    : `Scanned ${progress.done} of ${progress.total} URLs…`
                  : 'Loading each page in a real browser — usually under a minute.'}
              </span>
            ) : null}
            <button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-card bg-accent px-4 py-2 text-sm font-medium text-paper shadow-card hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55">
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
  token,
  health,
  onServerUrlChange,
  onTokenChange,
  onRecheck,
}: {
  serverUrl: string;
  token: string;
  health: Health;
  onServerUrlChange: (url: string) => void;
  onTokenChange: (token: string) => void;
  onRecheck: () => void;
}) {
  const dotClass =
    health === 'online'
      ? 'bg-good'
      : health === 'offline'
      ? 'bg-critical'
      : health === 'token'
      ? 'bg-serious'
      : 'bg-faint';
  const hosted = !serverUrl.trim();
  const labelText =
    health === 'online'
      ? hosted
        ? 'Scanner ready'
        : 'Your scanner ready'
      : health === 'offline'
      ? hosted
        ? 'Scanner unavailable'
        : 'Your scanner offline'
      : health === 'token'
      ? 'Scanner needs a token'
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
              ? 'Running on this site — nothing to install. Limited to our own public domains and a few URLs per scan.'
              : 'Running inside the network — on this machine, or on a colleague’s through a tunnel URL. This is how staging gets scanned. If it was started with a token, enter it below.'}
          </p>
        </div>

        <label className="block">
          <span className="text-eyebrow font-medium text-muted">
            Scanner address <span className="text-faint">· blank uses this site</span>
          </span>
          <input
            type="text"
            value={serverUrl}
            placeholder="http://localhost:4790 or a tunnel URL"
            onChange={(e) => onServerUrlChange(e.target.value)}
            className="mt-1 w-full rounded-card border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs transition-shadow"
          />
        </label>

        {!hosted ? (
          <label className="block">
            <span className="text-eyebrow font-medium text-muted">
              Token <span className="text-faint">· only if the scanner asks for one</span>
            </span>
            <input
              type="password"
              value={token}
              autoComplete="off"
              onChange={(e) => onTokenChange(e.target.value)}
              className="mt-1 w-full rounded-card border border-rule bg-paper px-2.5 py-1.5 font-mono text-xs transition-shadow"
            />
          </label>
        ) : null}

        <button
          type="button"
          onClick={onRecheck}
          className="text-sm font-medium text-accent hover:underline"
        >
          Check again
        </button>

        {health === 'token' ? (
          <p className="text-xs leading-relaxed text-muted">
            This scanner was started with a token. Paste the one whoever started it gave you, then check again.
          </p>
        ) : null}

        {health === 'offline' ? (
          <p className="text-xs leading-relaxed text-muted">
            {hosted ? (
              'This site’s scanner didn’t respond. Try again, or point this at a scanner inside your network:'
            ) : (
              <>Nothing is answering there. On the machine that should be running it:</>
            )}
            <code className="mt-1.5 block rounded-card border border-rule bg-paper px-2 py-1.5 font-mono text-[11px] text-ink">
              npm run scan-server
            </code>
            <span className="mt-1.5 block">To share it through a tunnel, see “Reach staging through a tunnel” in the README.</span>
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
