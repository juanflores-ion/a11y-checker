#!/usr/bin/env node
/**
 * Live scan server — the on-demand counterpart to scan.mjs.
 *
 *   cd scanner && npm install
 *   node server.mjs                       # http://127.0.0.1:4790
 *
 * This is what the dashboard's "Live Scan" tab talks to. The rest of the
 * viewer is a static export with no server of its own — this is the one part
 * of the project that has to be *running*, not just built, for that tab to
 * work. It calls the exact same `scanPage` as the scheduled scan (see
 * core.mjs), so a live scan of one of the ten tracked URLs should land on the
 * same numbers a scheduled run would have produced that day.
 *
 * SECURITY — read this before running it anywhere but your own machine:
 * this server will open a real headless browser and navigate to the URLs
 * it's handed in a POST body. That's exactly the point — it's how you point
 * it at a staging environment — but it also means anyone who can reach this
 * port can make your machine issue requests, including to internal hosts you
 * can reach but they can't. Two modes:
 *
 *   Local (default): no token, any http(s) URL. Binds to 127.0.0.1, so only
 *   this machine can reach it. Never tunnel or proxy it in this mode.
 *
 *   Shared (SCAN_TOKEN set): the mode for a tunnel. Every /scan needs
 *   `Authorization: Bearer <token>`, and only the tracked sites plus
 *   SCAN_ALLOWED_HOSTS are scanned — the same rule the hosted /api/scan
 *   route applies (see allowlist.mjs). SCAN_ALLOWED_HOSTS on its own also
 *   turns the allowlist on.
 *
 * In both modes it only accepts http:// and https:// targets, caps a request
 * to a handful of URLs and runs them one at a time.
 *
 * Endpoints:
 *   GET  /health         -> { ok, busy, axeVersion, authRequired, tokenAccepted }
 *   POST /scan           <- { urls: (string | {url, brand?, key?})[] }
 *                           (+ Authorization in shared mode)
 *                         -> { startedAt, finishedAt, results: PageResult[] }
 */
import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';

/**
 * `playwright-core`, not `playwright`: the browser is supplied, never
 * downloaded.
 *
 * The full package bundles its own Chromium download step, which this repo
 * has never installed — so `npm run scan-server` failed to start on a clean
 * checkout, which is how a scan server that could reach staging never got
 * run. Core drives whatever binary `PLAYWRIGHT_CHROMIUM_PATH` names (see
 * `launchOptions` in core.mjs) — Chrome or Edge on a Windows box on the VPN,
 * the pinned Chromium in CI. Whichever it is, `browserProvenance` records the
 * path and version on every run, so two scans taken with different browsers
 * can never be mistaken for each other.
 */
import { chromium } from 'playwright-core';

import { hostAllowed, parseAllowedHosts } from './allowlist.mjs';
import { identityFor } from './targets.mjs';
import { DEFAULT_PROFILE, PROFILES, PROFILE_NAMES, browserProvenance, launchContext, launchOptions, scanPage } from './core.mjs';

const PORT = Number(process.env.PORT ?? 4790);
const HOST = process.env.HOST ?? '127.0.0.1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
const MAX_URLS_PER_REQUEST = 10;
const BODY_LIMIT_BYTES = 1_000_000;

/** Shared mode. Empty or unset means local mode: no token, no allowlist. */
const TOKEN = (process.env.SCAN_TOKEN ?? '').trim() || null;
/**
 * Null means "any host" — local mode's whole point is a preview build on
 * localhost:8080 or a domain that isn't ours yet. Set the moment a token is
 * set (a tunnelled server must not be a proxy into the network the laptop is
 * on) or when SCAN_ALLOWED_HOSTS names hosts explicitly.
 */
const ALLOWED_HOSTS =
  TOKEN || (process.env.SCAN_ALLOWED_HOSTS ?? '').trim()
    ? parseAllowedHosts(process.env.SCAN_ALLOWED_HOSTS)
    : null;

// One scan at a time. Headless Chromium isn't free, and this is a local dev
// tool for one person at a time, not a service meant to take concurrent load.
let busy = false;
let lastAxeVersion = null;

function withCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin, Access-Control-Request-Private-Network');

  /**
   * Private Network Access.
   *
   * The dashboard can be hosted (Vercel, an internal box) while this server
   * stays on the QA engineer's own machine — which is the arrangement that
   * makes Measure and Compare useful to someone who hasn't cloned the repo.
   * But a fetch from an https:// page to 127.0.0.1 is a public-to-private
   * request, and Chrome preflights it separately: it asks with
   * `Access-Control-Request-Private-Network` and refuses unless the response
   * grants it explicitly. Without this header the deployed dashboard shows
   * "Scanner offline" with a perfectly healthy server running locally.
   *
   * This widens nothing on its own. Reaching this port at all still requires
   * being on this machine (it binds to 127.0.0.1), and the security note at
   * the top of this file still applies in full.
   */
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
}

/**
 * Constant-time compare against SCAN_TOKEN. Length leaks first, which is
 * fine — the token is random, not a password someone chose.
 */
function authorised(req) {
  if (!TOKEN) return true;
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

/**
 * http(s) only, well-formed, deduplicated, capped. Throws a message-ready Error.
 *
 * Two shapes, matching the hosted route: a bare string for any URL, or
 * `{ url, brand, key }` when the caller knows which tracked target it is. The
 * names let this server look up that target's identity reader — which of the
 * three Insureon homepages was served — exactly as the CLI does. Sending the
 * reader itself over the wire is not on offer: the caller names a target, the
 * server owns the code.
 *
 * The full run started sending the object form and this server answered 400,
 * which is how a staging baseline failed forty page loads before the first
 * one ran.
 */
function normaliseUrls(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('"urls" must be a non-empty array');
  }
  if (input.length > MAX_URLS_PER_REQUEST) {
    throw new Error(`Provide at most ${MAX_URLS_PER_REQUEST} URLs per scan (got ${input.length})`);
  }

  const seen = new Map();
  for (const item of input) {
    const isObject = item && typeof item === 'object';
    const s = String((isObject ? item.url : item) ?? '').trim();
    let parsed;
    try {
      parsed = new URL(s);
    } catch {
      throw new Error(`Not a valid URL: "${s}"`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Only http:// and https:// URLs are supported: "${s}"`);
    }
    if (ALLOWED_HOSTS && !hostAllowed(parsed.hostname, ALLOWED_HOSTS)) {
      throw new Error(
        `${parsed.hostname} isn't on this scanner's allowlist (${ALLOWED_HOSTS.join(', ')}). ` +
          'Whoever runs it can add a host with SCAN_ALLOWED_HOSTS.'
      );
    }
    const brand = isObject && typeof item.brand === 'string' ? item.brand : undefined;
    const key = isObject && typeof item.key === 'string' ? item.key : undefined;
    seen.set(parsed.toString(), { url: parsed.toString(), brand, key });
  }
  return [...seen.values()];
}

async function handleScan(req, res) {
  if (!authorised(req)) {
    sendJson(res, 401, { error: 'This scanner needs a token, and the one given was missing or wrong.' });
    return;
  }
  if (busy) {
    sendJson(res, 429, { error: 'A scan is already running on this server. Wait for it to finish.' });
    return;
  }

  let urls;
  let viewport;
  try {
    const body = await readJsonBody(req);
    urls = normaliseUrls(body.urls);
    viewport = body.viewport ?? DEFAULT_PROFILE;
    if (!PROFILES[viewport]) {
      throw new Error(`Unknown viewport "${viewport}". Known: ${PROFILE_NAMES.join(', ')}`);
    }
  } catch (err) {
    sendJson(res, 400, { error: err.message });
    return;
  }

  busy = true;
  const startedAt = new Date();
  let browser;
  const launchOpts = launchOptions();
  try {
    browser = await chromium.launch(launchOpts);
    const context = await launchContext(browser, viewport);

    // Sequential, not Promise.all: one Chromium page at a time keeps this
    // predictable on an ordinary laptop and keeps timing comparable to the
    // scheduled scan, which does the same.
    const results = [];
    for (const target of urls) {
      /**
       * Undefined for anything that isn't a declared target, which is most
       * URLs — `scanPage` then records no identity field at all, and a reader
       * that cannot tell records null. Three states, never collapsed.
       */
      const identity =
        target.brand && target.key ? identityFor(target.brand, target.key) : undefined;
      const r = await scanPage(context, target.url, { identity });
      if (!r.error && r.axeVersion) lastAxeVersion = r.axeVersion;
      results.push(r);
    }

    await context.close();
    /**
     * Which engine produced these numbers — asked while the browser is still
     * open, because a closed one cannot be asked its version. Without this the
     * hosted route stamped runs and this one did not, so a run recorded
     * through a tunnel could not say what measured it.
     */
    const provenance = browserProvenance(browser, launchOpts);
    const payload = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      results,
      provenance,
      scannedBy: 'scan-server',
      viewport,
      viewportSpec: {
        width: PROFILES[viewport].width,
        height: PROFILES[viewport].height,
        isMobile: PROFILES[viewport].isMobile,
      },
    };
    /**
     * Shut down and release the flag BEFORE answering.
     *
     * The other order looks harmless and is not: closing Chromium takes a
     * second or two, and a caller that sends its next batch the moment this
     * response lands arrives inside that window and gets 429 "a scan is
     * already running". A human clicking Run never noticed; the full run,
     * which fires batches back to back, stalled after the first one every
     * time.
     */
    if (browser) {
      await browser.close();
      browser = null;
    }
    busy = false;
    sendJson(res, 200, payload);
  } catch (err) {
    sendJson(res, 500, { error: String(err.message ?? err) });
  } finally {
    if (browser) await browser.close();
    busy = false;
  }
}

const server = http.createServer((req, res) => {
  withCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && pathname === '/health') {
    // `tokenAccepted` lets the dashboard's "Check again" validate a pasted
    // token before anyone scans. Same oracle /scan already offers, no wider.
    sendJson(res, 200, {
      ok: true,
      busy,
      axeVersion: lastAxeVersion,
      authRequired: Boolean(TOKEN),
      tokenAccepted: authorised(req),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/scan') {
    handleScan(req, res).catch((err) => {
      // Should be unreachable — handleScan catches internally — but a local
      // dev server should never take the process down over a bad request.
      sendJson(res, 500, { error: String(err.message ?? err) });
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found. Try GET /health or POST /scan.' });
});

server.listen(PORT, HOST, () => {
  console.log(`Live scan server on http://${HOST}:${PORT}`);
  console.log('POST { "urls": ["https://example.com"] } to /scan');
  if (TOKEN) {
    console.log(`Shared mode: /scan requires the token in SCAN_TOKEN.`);
    console.log(`Scans only: ${ALLOWED_HOSTS.join(', ')}  (extend with SCAN_ALLOWED_HOSTS)`);
  } else {
    console.log(
      ALLOWED_HOSTS
        ? `Local mode, allowlist on: ${ALLOWED_HOSTS.join(', ')}`
        : 'Local mode: no token, any URL. Set SCAN_TOKEN before tunnelling this.'
    );
  }
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn(
      `\nWARNING: bound to ${HOST}, not localhost.`,
      TOKEN
        ? 'Anyone with the token can scan the allowlisted hosts from this machine.'
        : 'This server visits any URL it is given — do not expose it beyond machines you trust.'
    );
  }
});
