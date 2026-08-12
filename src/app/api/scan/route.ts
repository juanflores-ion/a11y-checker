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
 * back the result. The standalone dev server manages that risk by binding to
 * 127.0.0.1 — it is only reachable from the machine running it. A public
 * function has no such protection, so it only scans hosts we have named.
 *
 * Add staging hosts with SCAN_ALLOWED_HOSTS (comma-separated). Suffix matching
 * is deliberate: "insureon.com" also allows "staging.insureon.com", but never
 * "insureon.com.evil.test", which is why the check is on dot-boundaries and
 * not `includes()`.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { SITES } from '@/lib/sites';

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
  const configured = (process.env.SCAN_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const tracked = Object.values(SITES).map((s) => s.host.replace(/^www\./, '').toLowerCase());
  return [...new Set([...tracked, ...configured])];
}

function hostAllowed(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase();
  // Exact match, or a subdomain of an allowed host. Dot-boundary only, so a
  // lookalike domain that merely *contains* an allowed name can't slip past.
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}

function parseUrls(input: unknown): { urls: string[]; error?: string } {
  if (!Array.isArray(input)) return { urls: [], error: 'Body must be { urls: string[] }.' };
  if (input.length === 0) return { urls: [], error: 'No URLs given.' };
  if (input.length > MAX_URLS) {
    return { urls: [], error: `Too many URLs — this endpoint scans ${MAX_URLS} at a time.` };
  }

  const allowed = allowedHosts();
  const urls: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') return { urls: [], error: 'Every URL must be a string.' };
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { urls: [], error: `Not a valid URL: “${raw}”` };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { urls: [], error: `Only http and https are scannable: “${raw}”` };
    }
    if (!hostAllowed(parsed.hostname, allowed)) {
      return {
        urls: [],
        error:
          `${parsed.hostname} isn't on the allowlist. This endpoint only scans our own sites ` +
          `(${allowed.join(', ')}). Add a staging host with SCAN_ALLOWED_HOSTS, or run the ` +
          `scanner locally to scan anything.`,
      };
    }
    urls.push(parsed.toString());
  }
  return { urls };
}

export async function POST(request: Request) {
  let body: { urls?: unknown; viewport?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const { urls, error } = parseUrls(body.urls);
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
  ] = await Promise.all([
    import('playwright-core'),
    import('@sparticuz/chromium').then((m) => m.default ?? m),
    import('../../../../scanner/core.mjs'),
    import('axe-core'),
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
          `Run the scanner locally as a fallback. (${(err as Error).message})`,
      },
      { status: 503 }
    );
  }

  try {
    const context = await launchContext(browser, viewport);
    const results = [];
    // Sequential on purpose: concurrent Chromium pages in a function's memory
    // budget is how you turn a slow scan into a failed one.
    for (const url of urls) {
      results.push(await scanPage(context, url, { axeSource }));
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
