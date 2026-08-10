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
  let body: { urls?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const { urls, error } = parseUrls(body.urls);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const startedAt = new Date().toISOString();

  // Imported lazily so a failure to load the browser can be reported as a
  // clean error, and so the heavy modules stay out of any other route's trace.
  const [{ chromium }, chromiumPack, { launchContext, scanPage }] = await Promise.all([
    import('playwright-core'),
    import('@sparticuz/chromium').then((m) => m.default ?? m),
    import('../../../../scanner/core.mjs'),
  ]);

  let browser;
  try {
    browser = await chromium.launch({
      args: chromiumPack.args,
      executablePath: await chromiumPack.executablePath(),
      headless: true,
    });
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
    const context = await launchContext(browser);
    const results = [];
    // Sequential on purpose: concurrent Chromium pages in a function's memory
    // budget is how you turn a slow scan into a failed one.
    for (const url of urls) {
      results.push(await scanPage(context, url));
    }
    return NextResponse.json({
      startedAt,
      finishedAt: new Date().toISOString(),
      results,
      scannedBy: 'hosted',
    });
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 500 });
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Mirrors the standalone server's /health so the client can probe either. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    busy: false,
    hosted: true,
    maxUrls: MAX_URLS,
    allowedHosts: allowedHosts(),
  });
}
