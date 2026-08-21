'use client';

import { Fragment, useState } from 'react';

import { countedGhostControls } from '@/lib/aggregate';
import {
  DEFAULT_VIEWPORT,
  VERDICT_LABEL,
  VIEWPORT_LABEL,
  VIEWPORT_NAMES,
  isFailedPage,
  verdictForPage,
  type ViewportName,
} from '@/lib/model';
import { ServerStatus } from './scan/ServerStatus';
import { describeFetchError, endpoints, useScanner, type LiveScanResult } from './scan/useScanner';
import { SITES, productionUrls } from '@/lib/sites';
import { ScanResultCard } from './ScanResultCard';
import { SectionHead } from './ui/SectionHead';
import { StatusDot } from './ui/StatusDot';
import { NumCell, Table, TBody, Td, Th, THead, ToggleCell } from './ui/Table';

const SCAN_EXAMPLES = productionUrls();
/** Real addresses in the placeholders, so nobody has to guess the staging shape. */
const FIRST_SITE = Object.values(SITES)[0];
const PLACEHOLDER_PROD = FIRST_SITE.url;
const PLACEHOLDER_STAGING = Object.values(SITES).find((s) => s.staging)?.staging ?? 'https://staging.example.com/';

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

/**
 * Scan → Any URL: point a scanner at any address and read what it found.
 *
 * This used to carry a second mode, Before / after, which scanned production
 * and staging live and diffed them. That comparison is retired — the two
 * deployments serve different content, so its diff reported fixes nobody had
 * made. Two runs of the same deployment is the comparison that means
 * something, and that lives in `RecordedCompare`.
 *
 * The scanner an address points at: empty string means this site's own
 * `/api/scan`, the hosted scanner, which works for anyone who opens the
 * dashboard but can only reach the public internet. Setting an address
 * switches to a scanner someone is running inside the network — on this
 * machine (localhost) or on a colleague's, reached through a tunnel URL —
 * which is how a staging host gets scanned. A tunnelled scanner is started
 * with a token; the token travels with every request as a bearer header and
 * is kept next to the address.
 */
export function LiveScanClient() {
  const scanner = useScanner();
  const { serverUrl, token, health } = scanner;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [urlsText, setUrlsText] = useState('');
  const [results, setResults] = useState<LiveScanResult[] | null>(null);

  const [scannedAt, setScannedAt] = useState<string | null>(null);
  /**
   * One profile for the whole scan.
   *
   * These sites branch their markup on the device server-side — the desktop
   * nav alone accounts for ~56 links — so the profile decides which document
   * the figures describe, and the results have to say which one it was.
   */
  const [viewport, setViewport] = useState<ViewportName>(DEFAULT_VIEWPORT);
  /** The scanner someone else published, when this browser had none of its own. */
  const published = scanner.published;

  /**
   * One request to the scanner, whichever scanner the page is pointed at.
   * `scannedAt` comes off the response so the results can say when they were
   * taken rather than when they were rendered.
   */
  async function callScanServer(urls: unknown[]): Promise<LiveScanResult[]> {
    const body = await scanner.scan({ urls, viewport });
    setScannedAt((body.finishedAt as string) ?? new Date().toISOString());
    return body.results;
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
        `That’s ${urls.length} URLs. This scanner takes ${maxUrls} at a time` +
          (hosted ? '. A scanner inside your network takes ten.' : '.')
      );
      return;
    }

    setBusy(true);
    setError(null);
    setResults(null);
    try {
      setResults(await callScanServer(urls));
    } catch (err) {
      setError(describeFetchError(err, serverUrl));
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

  return (
    <div className="space-y-12">
      <section className="rounded-lg border border-rule bg-card shadow-card">
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_16rem]">
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
                    {v === 'desktop' ? ' (what agents get)' : ''}
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
                  published={published}
                  onServerUrlChange={scanner.setServerUrl}
                  onTokenChange={scanner.setToken}
                  onRecheck={scanner.recheck}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3">
          <ExampleChips examples={SCAN_EXAMPLES} onPick={(url) => setUrlsText((t) => (t.trim() ? `${t.trim()}\n${url}` : url))} />
          <div className="flex items-center gap-3">
            {busy ? (
              <span className="text-xs text-muted tnum">
                Loading each page in a real browser. Usually under a minute.
              </span>
            ) : null}
            <button type="button" onClick={runScan} disabled={busy} className="inline-flex items-center gap-2 rounded-card bg-accent px-4 py-2 text-sm font-medium text-paper shadow-card hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55">
              {busy ? (<><Spinner />Scanning…</>) : 'Run scan'}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="border-t border-critical/25 bg-critical/[0.04] px-4 py-2 text-sm text-critical">{error}</p>
        ) : null}
      </section>

      {results ? (
        results.length > 0 ? (
          <ScanResults
            results={results}
            onDownload={() => downloadJson({ scannedAt, results }, 'scan')}
          />
        ) : (
          <p className="text-sm text-muted">Nothing came back. The scanner returned no pages.</p>
        )
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


/* ------------------------------------------------------------------ */

function ScanResults({ results, onDownload }: { results: LiveScanResult[]; onDownload: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-labelledby="scan-results" aria-live="polite">
      <SectionHead
        chapter={false}
        id="scan-results"
        title="Results"
        note={`${results.length} page${results.length === 1 ? '' : 's'} · the same checks the scheduled runs use · expand a row for the sample markup.`}
        aside={
          <button type="button" onClick={onDownload} className="text-xs font-medium text-accent hover:underline">
            Download JSON
          </button>
        }
      />
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
                  <Td colSpan={8} className="text-critical">Couldn’t load: {r.error}</Td>
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
