#!/usr/bin/env node
/**
 * Run the scanner, tunnel it, and tell the dashboard where it is.
 *
 *   npm run scan-server:share
 *
 * One command for the person hosting the scanner; nothing at all for everyone
 * else. Before this, a before/after against staging cost a hand-off every
 * time: quick tunnels take a new random hostname on every start, so whoever
 * hosted had to message QA a fresh URL and token, and QA had to paste both
 * into the Scan page. Now the tunnel URL and the token are published to the
 * dashboard as soon as they exist, and the Scan page fills them in for anyone
 * who hasn't set their own.
 *
 * What it does, in order:
 *   1. mints a fresh token — a new one per run, so an old one stops working
 *      the moment the scanner restarts, and nobody has to manage rotation
 *   2. starts `scanner/server.mjs` in shared mode with that token
 *   3. starts `cloudflared tunnel --url`, waits for the hostname
 *   4. POSTs { address, token } to <dashboard>/api/scanner
 *   5. keeps running; Ctrl-C stops the scanner, the tunnel, and clears the
 *      published value so the Scan page stops advertising a dead address
 *
 * Configuration, all optional except the secret:
 *   SCAN_PUBLISH_URL     dashboard base URL      (default http://localhost:3000)
 *   SCAN_PUBLISH_SECRET  must match the deployment's own value  (required)
 *   SCAN_ALLOWED_HOSTS   extra hosts the scanner may visit
 *   CLOUDFLARED          path to the binary      (default `cloudflared`)
 *   SCAN_PUBLISH_NOTE    free text, e.g. "Juan's laptop"
 *   PLAYWRIGHT_CHROMIUM_PATH  browser for the scanner to drive
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const DASHBOARD = (process.env.SCAN_PUBLISH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const SECRET = process.env.SCAN_PUBLISH_SECRET ?? '';
const CLOUDFLARED = process.env.CLOUDFLARED ?? 'cloudflared';
const NOTE = process.env.SCAN_PUBLISH_NOTE ?? '';
const PORT = process.env.SCAN_PORT ?? '4790';

if (!SECRET) {
  console.error(
    'SCAN_PUBLISH_SECRET is not set — that is the value the dashboard checks before\n' +
      'accepting a published address. Set the same value here and on the deployment.'
  );
  process.exit(1);
}

/**
 * A new token every run, deliberately.
 *
 * The token is published to anyone who can open the dashboard, so its job is
 * not secrecy against them — it is making sure a scanner that stopped running
 * cannot be reached with a value someone saved a week ago.
 */
const TOKEN = randomBytes(18).toString('base64url');

const children = [];
function start(command, args, opts = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  children.push(child);
  return child;
}

/* 1 — the scanner ---------------------------------------------------- */
const server = start(process.execPath, [path.join(here, 'server.mjs')], {
  env: { ...process.env, SCAN_TOKEN: TOKEN, PORT },
});
server.stdout.on('data', (b) => process.stdout.write(`[scanner] ${b}`));
server.stderr.on('data', (b) => process.stderr.write(`[scanner] ${b}`));
server.on('exit', (code) => {
  console.error(`[scanner] exited (${code}) — stopping.`);
  shutdown(1);
});

/* 2 — the tunnel ------------------------------------------------------ */
const tunnel = start(CLOUDFLARED, ['tunnel', '--url', `http://127.0.0.1:${PORT}`]);
let address = null;

async function publish(value) {
  const res = await fetch(`${DASHBOARD}/api/scanner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-scan-publish-secret': SECRET },
    body: JSON.stringify(value),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `${res.status}`);
  return body;
}

function onTunnelOutput(buffer) {
  const text = String(buffer);
  process.stderr.write(`[tunnel] ${text}`);
  if (address) return;
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match) return;
  address = match[0];
  publish({ address, token: TOKEN, ...(NOTE ? { note: NOTE } : {}) })
    .then((body) => {
      if (body?.warning) console.warn(`\n  ! ${body.warning}`);
      console.log(`\n  Published to ${DASHBOARD}`);
      console.log(`  Scanner  ${address}`);
      console.log(`  Token    ${TOKEN}`);
      console.log('\n  Anyone opening the Scan page now gets these filled in.');
      console.log('  Ctrl-C to stop and un-publish.\n');
    })
    .catch((err) => {
      console.error(`\n  Could not publish: ${err.message}`);
      console.error(`  The scanner still works — hand these over by other means:`);
      console.error(`  ${address}  token ${TOKEN}\n`);
    });
}
tunnel.stdout.on('data', onTunnelOutput);
tunnel.stderr.on('data', onTunnelOutput);
tunnel.on('error', (err) => {
  console.error(
    `Could not start "${CLOUDFLARED}": ${err.message}\n` +
      'Set CLOUDFLARED to the binary path if it is not on PATH.'
  );
  shutdown(1);
});

/* 3 — leave nothing advertising a dead address ------------------------ */
let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (address) {
    try {
      /**
       * Published with an empty address? No — the route rejects that, and it
       * should: "no scanner" is the absence of a value, not a malformed one.
       * Loopback is the honest thing to leave behind, because it is what a
       * reader with no scanner of their own should try next.
       */
      await publish({ address: `http://localhost:${PORT}`, token: '', note: 'nobody is hosting one' });
      console.log('Un-published.');
    } catch {
      console.error('Could not un-publish — the Scan page may advertise a dead address.');
    }
  }
  for (const child of children) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
