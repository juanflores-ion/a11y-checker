#!/usr/bin/env node
/**
 * Agent-accessibility scanner — the scheduled, fixed-target scan.
 *
 *   node scanner/scan.mjs --out data/runs --label "after phase 1"
 *
 * Standalone by design: this file never imports from the Next.js app, and the
 * app never imports from here. A full run takes 3–5 minutes, which is why it
 * can't live behind an HTTP request, and keeping them apart is what lets the
 * viewer stay a portable static export.
 *
 * Writes one JSON file per run into --out, named YYYY-MM-DD-HHmm.json.
 *
 * For scanning a URL that *isn't* one of the fixed 20 — a staging domain, a
 * one-off page — use `node scanner/server.mjs` and the dashboard's Live Scan
 * tab instead. Both this file and that one call the same `scanPage` in
 * core.mjs, so the numbers are directly comparable either way.
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

import { launchContext, launchOptions, scanPage } from './core.mjs';
import { targetList } from './targets.mjs';

/* ------------------------------------------------------------------ */
/* Args                                                                */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { out: 'data/runs', label: undefined, only: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = argv[++i];
    else if (arg === '--label') args.label = argv[++i];
    else if (arg === '--only') args.only = argv[++i]; // brand or brand:pageKey, for debugging
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

const USAGE = `
Agent-accessibility scanner

  node scanner/scan.mjs [--out DIR] [--label TEXT] [--only BRAND[:PAGE]]

  --out    Directory to write the run file into. Default: data/runs
  --label  Free text stored in meta.label and annotated on the trend chart,
           e.g. "baseline", "after phase 1".
  --only   Scan a subset. "techinsurance" or "techinsurance:home".
           Produces a partial run — fine for debugging, don't commit it,
           because missing pages make every total look better than it is.

For an arbitrary URL not in the fixed target list, use the live scan server
instead: node scanner/server.mjs
`;

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

function runFilename(date) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
    `-${p(date.getUTCHours())}${p(date.getUTCMinutes())}.json`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  let targets = targetList();
  if (args.only) {
    const [brand, key] = args.only.split(':');
    targets = targets.filter((t) => t.brand === brand && (!key || t.key === key));
    if (targets.length === 0) {
      console.error(`No targets match --only ${args.only}`);
      process.exitCode = 1;
      return;
    }
    console.error(`Partial run: ${targets.length} target(s). Do not treat totals as complete.\n`);
  }

  const startedAt = new Date();
  const browser = await chromium.launch(launchOptions());
  const context = await launchContext(browser);

  const result = { insureon: {}, techinsurance: {} };
  let axeVersion = null;
  let failures = 0;

  for (const [i, target] of targets.entries()) {
    const progress = `[${String(i + 1).padStart(2)}/${targets.length}]`;
    const r = await scanPage(context, target.url);

    if (r.error) {
      failures += 1;
      result[target.brand][target.key] = { url: r.url, error: r.error };
      console.error(`${progress} ${target.brand}/${target.key} — FAILED: ${r.error}`);
    } else {
      // axeVersion travels with every scanPage() result so a live scan can
      // report it too, but the run file keeps it once, at the meta level.
      const { axeVersion: v, ...page } = r;
      axeVersion ??= v;
      result[target.brand][target.key] = page;

      const nodes = page.violations.reduce((sum, viol) => sum + viol.n, 0);
      console.error(
        `${progress} ${target.brand}/${target.key} — ${page.violations.length} rules, ${nodes} nodes, ` +
          `phantom ${page.phantomMenu ? page.phantomMenu.focusable : 'n/a'}`
      );
    }
  }

  await context.close();
  await browser.close();

  const finishedAt = new Date();
  const run = {
    meta: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      axeVersion,
      viewport: { width: 390, height: 844, isMobile: true },
      ...(args.label ? { label: args.label } : {}),
    },
    ...result,
  };

  const outDir = path.resolve(process.cwd(), args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, runFilename(startedAt));
  fs.writeFileSync(outPath, `${JSON.stringify(run, null, 2)}\n`);

  const seconds = Math.round((finishedAt - startedAt) / 1000);
  console.error(
    `\nWrote ${path.relative(process.cwd(), outPath)} — ${targets.length} pages in ${seconds}s` +
      (failures ? `, ${failures} failed` : '')
  );
  console.error('Rebuild the viewer to pick it up: npm run build');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
