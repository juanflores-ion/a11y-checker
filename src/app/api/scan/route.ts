/**
 * On-demand scan, running on the host rather than on someone's laptop.
 *
 * Measure and Compare used to require every visitor to clone the repo and
 * leave a local server running. That made them features for exactly one
 * person. This route runs the same scan inside a serverless function, so the
 * deployed dashboard works for whoever opens it.
 *
 * It calls the identical `scanPage` the scheduled CLI run calls (scanner/
 * core.mjs) with the identical device profile, so a scan taken here lands on
 * the same numbers a scheduled run would have produced. The only difference is
 * which Chromium gets launched: the CLI uses the full Playwright download,
 * this uses @sparticuz/chromium, a build small enough to fit in a function.
 *
 * ── Why there is an allowlist ────────────────────────────────────────────
 * This endpoint fetches a URL it is handed and reports what it found. Left
 * open, that is a server-side request forgery hole with a UI on top: anyone
 * could point it at a cloud metadata endpoint or an internal host and read
 * back the result. A public function has no network boundary to hide behind,
 * so it only scans hosts we have named: the tracked sites, their staging
 * origins from `SITES`, and SCAN_ALLOWED_HOSTS (comma-separated). The rule
 * itself lives in scanner/allowlist.mjs, shared with the standalone server so
 * the two cannot drift.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { SITES } from '@/lib/sites';
import { hostAllowed, parseAllowedHosts } from '../../../../scanner/allowlist.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** A cold start plus one page is comfortably inside this; see MAX_URLS. */
export const maxDuration = 60;

/**
 * Far lower than the standalone server's ten. That one has no execution
 * ceiling; this one does, and a request that dies at the limit returns
 * nothing at all rather than partial results. Better to cap it honestly and
 * let the client send several requests.
 */
const MAX_URLS = 3;

/**
 * Which probe code this deployment is running.
 *
 * Same definition as `probeVersion()` in scanner/scan.mjs, which owns it: the
 * short SHA of the last commit that touched `scanner/`, suffixed `+dirty` when
 * the working tree has moved on. Deliberately re-derived here rather than
 * shared, because the two callers cannot locate `scanner/` the same way. The
 * CLI is always running out of a checkout and finds the directory from its own
 * module URL. This route is usually running out of a bundle where the source
 * layout no longer exists and there is no `.git` at all, so it resolves from
 * `process.cwd()` and is *expected* to answer null in production.
 *
 * That null is the honest answer, not a stopgap, and it is why the answer is
 * null rather than `VERCEL_GIT_COMMIT_SHA`: the deploy SHA moves on every
 * commit to the repository, including the ones that change nothing under
 * `scanner/`. Recording it would draw a probe-version discontinuity — the exact
 * signal this field exists to raise — on runs measured by identical code.
 *
 * To record it properly from a deployment, compute it at build time with the
 * same command and set SCANNER_PROBE_VERSION:
 *
 *   SCANNER_PROBE_VERSION=$(git log -1 --format=%h -- scanner/)
 *
 * Memoised because it shells out and the answer cannot change while the
 * process lives.
 */
let probeVersionCache: string | null | undefined;

function probeVersion(): string | null {
  if (probeVersionCache !== undefined) return probeVersionCache;

  const pinned = process.env.SCANNER_PROBE_VERSION?.trim();
  if (pinned) {
    probeVersionCache = pinned;
    return probeVersionCache;
  }

  const scannerDir = path.join(process.cwd(), 'scanner');
  try {
    const git = (args: string[]) =>
      execFileSync('git', ['-C', scannerDir, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    const sha = git(['log', '-1', '--format=%h', '--', '.']);
    // Untracked files count: a probe added but not committed is still code
    // that ran and is not in the commit this claims to be.
    const dirty = sha ? git(['status', '--porcelain', '--', '.']) : '';
    probeVersionCache = sha ? (dirty ? `${sha}+dirty` : sha) : null;
  } catch {
    probeVersionCache = null;
  }
  return probeVersionCache;
}

function allowedHosts(): string[] {
  const tracked = Object.values(SITES).flatMap((s) => {
    const hosts = [s.host.replace(/^www\./, '')];
    if (s.staging) hosts.push(new URL(s.staging).hostname);
    return hosts;
  });
  return parseAllowedHosts(process.env.SCAN_ALLOWED_HOSTS, tracked);
}

/**
 * One URL to scan, and — when the caller knows it — which tracked target it
 * is.
 *
 * The caller sends *names*, never code: the server looks the identity reader
 * up in `targets.mjs` by brand and page key. A name nobody declared resolves
 * to `undefined`, which is the honest "no identity declared" state rather
 * than an error. That split is the whole security story here — the browser
 * cannot hand this endpoint a function to run in the page.
 */
interface ScanEntry {
  url: string;
  brand?: string;
  key?: string;
}

const BODY_SHAPE =
  'Body must be { urls: (string | { url, brand?, key? })[] }.';

function parseEntries(input: unknown): { entries: ScanEntry[]; error?: string } {
  if (!Array.isArray(input)) return { entries: [], error: BODY_SHAPE };
  if (input.length === 0) return { entries: [], error: 'No URLs given.' };
  if (input.length > MAX_URLS) {
    return { entries: [], error: `Too many URLs. This endpoint scans ${MAX_URLS} at a time.` };
  }

  const allowed = allowedHosts();
  const entries: ScanEntry[] = [];
  for (const item of input) {
    /**
     * Two shapes, because Scan → Single URL sends bare strings for pages
     * that are nobody's tracked target, and the full run sends the target
     * it is scanning. Neither caller should have to care about the other's
     * needs.
     */
    const raw = typeof item === 'string' ? item : (item as { url?: unknown })?.url;
    if (typeof raw !== 'string') return { entries: [], error: BODY_SHAPE };

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { entries: [], error: `Not a valid URL: “${raw}”` };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { entries: [], error: `Only http and https are scannable: “${raw}”` };
    }
    if (!hostAllowed(parsed.hostname, allowed)) {
      return {
        entries: [],
        error:
          `${parsed.hostname} isn't on the allowlist. This endpoint only scans our own sites ` +
          `(${allowed.join(', ')}). Add a staging host with SCAN_ALLOWED_HOSTS, or point ` +
          `Scanner at one running inside your network.`,
      };
    }

    const brand = typeof item === 'string' ? undefined : (item as { brand?: unknown }).brand;
    const key = typeof item === 'string' ? undefined : (item as { key?: unknown }).key;
    entries.push({
      url: parsed.toString(),
      ...(typeof brand === 'string' ? { brand } : {}),
      ...(typeof key === 'string' ? { key } : {}),
    });
  }
  return { entries };
}

export async function POST(request: Request) {
  let body: { urls?: unknown; viewport?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const { entries, error } = parseEntries(body.urls);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const requestedViewport = body.viewport === undefined ? undefined : String(body.viewport);

  const startedAt = new Date().toISOString();

  // Imported lazily so a failure to load the browser can be reported as a
  // clean error, and so the heavy modules stay out of any other route's trace.
  /**
   * axe is resolved here, not inside core.mjs, and passed down.
   *
   * core.mjs can find it perfectly well from the CLI. Inside a serverless
   * bundle it cannot: `createRequire` there resolves from
   * /vercel/path0/scanner/, which has no node_modules, and the first deploy
   * failed with exactly that — `Cannot find module 'axe-core'`, requireStack
   * /vercel/path0/scanner/core.mjs. This module is bundler-external, so the
   * import right here resolves from the function's own tree, which does have
   * it. One engine, two ways of reaching it, same measurement either way.
   */
  const [
    { chromium },
    chromiumPack,
    { browserProvenance, launchContext, scanPage, PROFILES, PROFILE_NAMES, DEFAULT_PROFILE },
    axe,
    { identityFor },
  ] = await Promise.all([
    import('playwright-core'),
    import('@sparticuz/chromium').then((m) => m.default ?? m),
    import('../../../../scanner/core.mjs'),
    import('axe-core'),
    /**
     * The identity readers. Kept out of `core.mjs` on purpose — the engine
     * measures agent readiness and must not learn what Sitecore is — so the
     * route does the lookup and hands the reader down, exactly as the CLI
     * does.
     */
    import('../../../../scanner/targets.mjs'),
  ]);

  /**
   * The profile isn't cosmetic here: these sites resolve their layout from the
   * user-agent on the server, so scanning at the wrong one measures a different
   * page. An unknown name is rejected rather than defaulted, because silently
   * measuring something other than what was asked for is how a scan comes back
   * clean about a page nobody looked at.
   */
  const viewport = requestedViewport ?? DEFAULT_PROFILE;
  if (!PROFILES[viewport]) {
    return NextResponse.json(
      { error: `Unknown viewport “${viewport}”. Known viewports: ${PROFILE_NAMES.join(', ')}.` },
      { status: 400 }
    );
  }

  const axeModule = axe as unknown as { source?: string; default?: { source?: string } };
  const axeSource = axeModule.source ?? axeModule.default?.source;
  if (typeof axeSource !== 'string' || axeSource.length === 0) {
    return NextResponse.json(
      {
        error:
          'The scan engine could not be loaded on the server, so nothing was measured. ' +
          'This is a packaging fault rather than a problem with the page. Run the scanner ' +
          'locally as a fallback.',
      },
      { status: 503 }
    );
  }

  let browser;
  /**
   * Kept as a variable, and resolved inside the try so a packaging failure
   * still returns the friendly 503 rather than a stack trace.
   *
   * `browserProvenance` needs the options we actually launched with, because
   * `browserType.executablePath()` reports the build Playwright *would* have
   * chosen rather than the one it was pointed at — measured last session as
   * chromium-1234 while chromium-1228 was the process running. Here the
   * difference is the whole point: this route runs @sparticuz's Chromium and
   * the CLI runs the full Playwright download, so a run file that does not
   * name its executable cannot say which of the two measured it.
   */
  let launchOpts: { args?: string[]; executablePath?: string; headless?: boolean } = {};
  try {
    launchOpts = {
      args: chromiumPack.args,
      executablePath: await chromiumPack.executablePath(),
      headless: true,
    };
    browser = await chromium.launch(launchOpts);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          'Could not start a browser on the server. ' +
          `Point Scanner at one running on your machine as a fallback. (${(err as Error).message})`,
      },
      { status: 503 }
    );
  }

  try {
    const context = await launchContext(browser, viewport);
    const results = [];
    // Sequential on purpose: concurrent Chromium pages in a function's memory
    // budget is how you turn a slow scan into a failed one.
    for (const entry of entries) {
      /**
       * Undefined for anything that isn't a declared target, which is most
       * URLs — `scanPage` then records no identity field at all, and a reader
       * that cannot tell records `null`. Three states, never collapsed.
       */
      const identity =
        entry.brand && entry.key ? identityFor(entry.brand, entry.key) : undefined;
      results.push(await scanPage(context, entry.url, { axeSource, identity }));
    }
    const profile = PROFILES[viewport];
    // Asked while the browser is still open — the `finally` below closes it,
    // and a closed browser cannot be asked its version.
    const engine = browserProvenance(browser, launchOpts);
    return NextResponse.json({
      startedAt,
      finishedAt: new Date().toISOString(),
      results,
      viewport,
      viewportSpec: {
        width: profile.width,
        height: profile.height,
        isMobile: profile.isMobile,
      },
      scannedBy: 'hosted',
      /**
       * Which engine measured this, for whoever assembles a run file out of
       * these responses — FullScanRunner does exactly that, and until now it
       * dropped `scannedBy` on the floor and recorded nothing about the
       * browser at all, so a run taken through the dashboard was
       * indistinguishable from a run taken on someone's laptop.
       *
       * Every key is present on every response, `null` where it could not be
       * established. Absent is reserved for the other meaning: a response from
       * a deployment that predates this block. The client has to be able to
       * tell "the server could not identify its browser" from "the server was
       * never asked", because only one of those is worth chasing.
       */
      provenance: {
        probeVersion: probeVersion(),
        browserVersion: engine.browserVersion ?? null,
        browserPath: engine.browserPath ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 500 });
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Mirrors the standalone server's /health so the client can probe either. */
export async function GET() {
  const { PROFILE_NAMES, DEFAULT_PROFILE } = await import('../../../../scanner/core.mjs');
  return NextResponse.json({
    ok: true,
    busy: false,
    hosted: true,
    maxUrls: MAX_URLS,
    allowedHosts: allowedHosts(),
    viewports: PROFILE_NAMES,
    defaultViewport: DEFAULT_PROFILE,
  });
}
