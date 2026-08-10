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
 * this server will open a real headless browser and navigate to *any* URL
 * it's handed in a POST body. That's exactly the point — it's how you point
 * it at a staging environment — but it also means anyone who can reach this
 * port can make your machine issue requests to wherever they choose,
 * including internal hosts you can reach but they can't. That's why it:
 *   - binds to 127.0.0.1 by default, not your network interface
 *   - only accepts http:// and https:// targets
 *   - caps requests to a handful of URLs and runs them one at a time
 * Don't put this behind a public port, a reverse proxy, or a tunnel without
 * adding real authentication in front of it first.
 *
 * Endpoints:
 *   GET  /health         -> { ok, busy, axeVersion }
 *   POST /scan           <- { urls: string[] }
 *                         -> { startedAt, finishedAt, results: PageResult[] }
 */
import http from 'node:http';

import { chromium } from 'playwright';

import { launchContext, launchOptions, scanPage } from './core.mjs';

const PORT = Number(process.env.PORT ?? 4790);
const HOST = process.env.HOST ?? '127.0.0.1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
const MAX_URLS_PER_REQUEST = 10;
const BODY_LIMIT_BYTES = 1_000_000;

// One scan at a time. Headless Chromium isn't free, and this is a local dev
// tool for one person at a time, not a service meant to take concurrent load.
let busy = false;
let lastAxeVersion = null;

function withCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

/** http(s) only, well-formed, deduplicated, capped. Throws a message-ready Error. */
function normaliseUrls(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('"urls" must be a non-empty array of strings');
  }
  if (input.length > MAX_URLS_PER_REQUEST) {
    throw new Error(`Provide at most ${MAX_URLS_PER_REQUEST} URLs per scan (got ${input.length})`);
  }

  const seen = new Set();
  for (const raw of input) {
    const s = String(raw ?? '').trim();
    let parsed;
    try {
      parsed = new URL(s);
    } catch {
      throw new Error(`Not a valid URL: "${s}"`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Only http:// and https:// URLs are supported: "${s}"`);
    }
    seen.add(parsed.toString());
  }
  return [...seen];
}

async function handleScan(req, res) {
  if (busy) {
    sendJson(res, 429, { error: 'A scan is already running on this server. Wait for it to finish.' });
    return;
  }

  let urls;
  try {
    const body = await readJsonBody(req);
    urls = normaliseUrls(body.urls);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
    return;
  }

  busy = true;
  const startedAt = new Date();
  let browser;
  try {
    browser = await chromium.launch(launchOptions());
    const context = await launchContext(browser);

    // Sequential, not Promise.all: one Chromium page at a time keeps this
    // predictable on an ordinary laptop and keeps timing comparable to the
    // scheduled scan, which does the same.
    const results = [];
    for (const url of urls) {
      const r = await scanPage(context, url);
      if (!r.error && r.axeVersion) lastAxeVersion = r.axeVersion;
      results.push(r);
    }

    await context.close();
    sendJson(res, 200, {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      results,
    });
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
    sendJson(res, 200, { ok: true, busy, axeVersion: lastAxeVersion });
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
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn(
      `\nWARNING: bound to ${HOST}, not localhost.`,
      'This server visits any URL it is given — do not expose it beyond machines you trust.'
    );
  }
});
