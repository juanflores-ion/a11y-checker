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

import {
  DEFAULT_PROFILE,
  PROFILES,
  PROFILE_NAMES,
  browserProvenance,
  launchContext,
  launchOptions,
  scanPage,
} from './core.mjs';
import { identityFor, targetList } from './targets.mjs';

/* ------------------------------------------------------------------ */
/* Args                                                                */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { out: 'data/runs', label: undefined, only: undefined, viewports: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = argv[++i];
    else if (arg === '--label') args.label = argv[++i];
    else if (arg === '--only') args.only = argv[++i]; // brand or brand:pageKey, for debugging
    else if (arg === '--viewport') args.viewports = argv[++i].split(',').map((s) => s.trim());
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

const USAGE = `
Agent-accessibility scanner

  node scanner/scan.mjs [--out DIR] [--label TEXT] [--only BRAND[:PAGE]]
                        [--viewport desktop,mobile]

  --out       Directory to write the run file into. Default: data/runs
  --label     Free text stored in meta.label and annotated on the trend chart,
              e.g. "baseline", "after phase 1".
  --only      Scan a subset. "techinsurance" or "techinsurance:home".
              Produces a partial run — fine for debugging, don't commit it,
              because missing pages make every total look better than it is.
  --viewport  Which device profiles to measure. Default: ${PROFILE_NAMES.join(',')}.
              These sites serve different markup per device, so each profile is
              a different page, not a different framing of one. Desktop is what
              agents are served and is the primary.

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

  const viewports = args.viewports ?? PROFILE_NAMES;
  for (const name of viewports) {
    if (!PROFILES[name]) {
      console.error(`Unknown viewport “${name}”. Known: ${PROFILE_NAMES.join(', ')}`);
      process.exitCode = 1;
      return;
    }
  }

  const startedAt = new Date();
  // Held in a variable rather than passed inline because `browserProvenance`
  // needs the options we actually launched with: `browserType.executablePath()`
  // reports the build Playwright *would* have chosen, which is not the same
  // thing whenever PLAYWRIGHT_CHROMIUM_PATH is in play — and it was, for every
  // browser that could be made to run on the machine this was written on.
  const launchOpts = launchOptions();
  const browser = await chromium.launch(launchOpts);

  const byViewport = {};
  let axeVersion = null;
  let failures = 0;

  /**
   * One context per profile, and every page measured in both before the file
   * is written. Profile is the outer loop because a context carries the
   * user-agent: it has to match its viewport, or the server renders one layout
   * and the client hydrates into the other.
   */
  for (const viewport of viewports) {
    const context = await launchContext(browser, viewport);
    const result = { insureon: {}, techinsurance: {} };

    for (const [i, target] of targets.entries()) {
      const progress = `${viewport.padEnd(7)} [${String(i + 1).padStart(2)}/${targets.length}]`;
      const r = await scanPage(context, target.url, {
        identity: identityFor(target.brand, target.key),
      });

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
        const nav = page.navLinks ? `nav ${page.navLinks.inTree}/${page.navLinks.total}` : 'nav n/a';
        console.error(
          `${progress} ${target.brand}/${target.key} — ${page.violations.length} rules, ${nodes} nodes, ` +
            `phantom ${page.phantomMenu ? page.phantomMenu.focusable : 'n/a'}, ${nav}`
        );
      }
    }

    byViewport[viewport] = result;
    await context.close();
  }

  // Asked while the browser is still open — a closed one cannot be asked its
  // version, and a version we could not read is recorded as null, never guessed.
  const provenance = browserProvenance(browser, launchOpts);

  await browser.close();

  const primaryViewport = viewports.includes(DEFAULT_PROFILE) ? DEFAULT_PROFILE : viewports[0];
  const finishedAt = new Date();
  const run = {
    meta: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      axeVersion,
      primaryViewport,
      viewports: Object.fromEntries(
        viewports.map((v) => [
          v,
          { width: PROFILES[v].width, height: PROFILES[v].height, isMobile: PROFILES[v].isMobile },
        ])
      ),
      /* ----------------------------------------------------------------
       * Which engine produced these numbers.
       *
       * `axeVersion` above has always recorded the rule engine. These record
       * the browser and the probes, which is where the rest of the movement
       * comes from: three Chromium majors (148, 149, 151) were driven against
       * these sites inside a single session and not one run file says which
       * one wrote it.
       *
       * All four keys are written every time, `null` when they could not be
       * established. `browserProvenance` returns only what it could prove, and
       * the `?? null` here is where "could not prove it" becomes an explicit
       * *not recorded* rather than a missing key — because a missing key
       * already means something else on this contract: that the run predates
       * provenance altogether, as the three files in `data/runs` do.
       * ---------------------------------------------------------------- */
      probeVersion: probeVersion(),
      browserVersion: provenance.browserVersion ?? null,
      browserPath: provenance.browserPath ?? null,
      // Which of the two ways of taking a run this was. They launch different
      // Chromium builds — the full Playwright download here, @sparticuz inside
      // the hosted function — so it is a property of the instrument, not a
      // note about who pressed the button.
      scannedBy: 'cli',
      ...(args.label ? { label: args.label } : {}),
    },
    byViewport,
  };

  const outDir = path.resolve(process.cwd(), args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, runFilename(startedAt));
  fs.writeFileSync(outPath, `${JSON.stringify(run, null, 2)}\n`);

  const seconds = Math.round((finishedAt - startedAt) / 1000);
  console.error(
    `\nWrote ${path.relative(process.cwd(), outPath)} — ${targets.length} pages ` +
      `× ${viewports.join(', ')} in ${seconds}s` +
      (failures ? `, ${failures} failed` : '')
  );
  // Printed as well as written, because the fastest way to notice you scanned
  // with the wrong browser is to be told which one you just used.
  const notRecorded = (v) => v ?? 'not recorded';
  console.error(
    `Engine: probes ${notRecorded(run.meta.probeVersion)} · ` +
      `${notRecorded(run.meta.browserVersion)} · axe ${notRecorded(axeVersion)}`
  );
  console.error('Rebuild the viewer to pick it up: npm run build');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
