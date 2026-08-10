/**
 * The scan engine. One `scanPage` function, two callers:
 *
 *   scan.mjs    loops over the fixed 20-URL target list, on a schedule,
 *               writes a dated file into data/runs/.
 *   server.mjs  runs the same function on demand, against whatever URL
 *               a person hands it from the dashboard's Live Scan tab.
 *
 * This file is what makes "static scan" and "live scan" the same
 * measurement rather than two implementations that quietly drift apart.
 * If you need to change what gets measured, change it here — once — and
 * both callers pick it up.
 */
/**
 * axe-core is pinned to an exact version, not a caret range, and that is
 * load-bearing rather than fussy.
 *
 * A `^4.10.2` range once let a fresh install pull 4.13.0, and the next run
 * reported four rules the previous one had never heard of. Nothing about
 * either site had changed — the rule engine had. Every "improvement" or
 * regression this tool reports is a comparison between two runs, and that
 * comparison is only honest if both were measured by the same engine. Change
 * this version deliberately, and expect a step change in the numbers when you
 * do; `meta.axeVersion` records it on every run so the discontinuity is at
 * least visible.
 */
import { createRequire } from 'node:module';

import { collectMeasurements } from './probes.mjs';

/**
 * axe's engine, as a source string.
 *
 * axe-core is CommonJS and exposes its whole engine on `.source`. Which shape
 * that arrives in depends on who loaded the file — plain Node ESM for the CLI,
 * a bundler for the API route — and where `node_modules` sits relative to this
 * file, which differs again inside a serverless bundle.
 *
 * So this resolves lazily and never throws at import time. An earlier version
 * threw from module scope, which turned a recoverable "couldn't find axe" into
 * an unhandled 500 before the route's own error handling could run. Callers
 * that can resolve axe themselves (the API route can, through the bundler)
 * pass it to `scanPage` instead and skip this entirely.
 */
let cachedAxeSource = null;

export function resolveAxeSource() {
  if (cachedAxeSource) return cachedAxeSource;
  const require = createRequire(import.meta.url);
  for (const specifier of ['axe-core', 'axe-core/axe.js']) {
    try {
      const source = require(specifier)?.source;
      if (typeof source === 'string' && source.length > 0) {
        cachedAxeSource = source;
        return cachedAxeSource;
      }
    } catch {
      // Try the next specifier before giving up.
    }
  }
  return null;
}

/**
 * Launch options for the scan browser.
 *
 * Playwright's bundled headless shell is missing shared libraries on some
 * Linux and WSL setups (`libnspr4.so`), where the full Chromium build in the
 * same cache works fine. Rather than hardcode a path, honour an override so
 * one environment's quirk doesn't get baked into the tool:
 *
 *   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome node scanner/scan.mjs
 */
export function launchOptions() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return executablePath ? { headless: true, executablePath } : { headless: true };
}

/**
 * Mirrors the Lighthouse mobile profile the PageSpeed score is computed on.
 * Live scans use the identical device profile as the scheduled scan, on
 * purpose: point this at one of the ten tracked URLs and the numbers should
 * land in the same place the next scheduled run would put them.
 */
export async function launchContext(browser) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    bypassCSP: true,
  });
}

/** Shape axe's output down to the data contract: id, impact, n, up to 2 samples. */
function shapeViolations(axeResults) {
  return (axeResults?.violations ?? []).map((v) => ({
    id: v.id,
    impact: v.impact,
    n: v.nodes.length,
    sample: v.nodes.slice(0, 2).map((node) => ({
      t: node.target.map(String),
      h: node.html.length > 240 ? `${node.html.slice(0, 240)}…` : node.html,
    })),
  }));
}

/**
 * Ask the browser which of the candidate elements really carry an activation
 * listener.
 *
 * `cursor: pointer` is a strong hint but only a hint — it's a style, and a
 * style can be wrong in either direction. The browser's own listener registry
 * is the authority, and it's only reachable over CDP; page script can't read
 * listeners it didn't attach. Run against the handful of candidates that would
 * actually be reported, not all of them, so this stays cheap.
 *
 * Degrades to `null` (meaning "unconfirmed", not "no listener") if CDP is
 * unavailable — a Firefox run, say. Never silently drops a finding.
 */
const ACTIVATION_EVENTS = new Set([
  'click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown',
]);

async function confirmClickListeners(page, controls) {
  if (controls.length === 0) return controls;
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: 'window.__ghostCandidateEls',
      returnByValue: false,
    });
    if (!result?.objectId) return controls;

    const props = await cdp.send('Runtime.getProperties', {
      objectId: result.objectId,
      ownProperties: true,
    });

    for (const prop of props.result) {
      if (!/^\d+$/.test(prop.name) || !prop.value?.objectId) continue;
      const index = Number(prop.name);
      if (!controls[index]) continue;
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
        objectId: prop.value.objectId,
        depth: 0,
      });
      controls[index].confirmedListener = (listeners ?? []).some((l) =>
        ACTIVATION_EVENTS.has(l.type)
      );
    }
  } catch {
    // Leave confirmedListener as null. An unconfirmed finding still reports.
  } finally {
    await cdp?.detach().catch(() => {});
  }
  return controls;
}

/**
 * Scan one URL in an existing browser context. Opens its own page and closes
 * it when done, so callers can loop this over many URLs in one context.
 *
 * Returns `{ url, violations, namelessButtons, namelessLinks, emptyHref,
 * hasMain, ghostControls, clickableNoRole, hiddenPanels, phantomMenu,
 * httpStatus, axeVersion }` on success, or `{ url, error }` on failure — the shape a scanned run file expects, plus `axeVersion`, which
 * per-page callers are free to drop (the CLI keeps it once, in `meta`).
 */
export async function scanPage(context, url, { axeSource: providedAxeSource } = {}) {
  const axeSource = providedAxeSource ?? resolveAxeSource();
  if (!axeSource) {
    return {
      url,
      error:
        'axe-core could not be loaded, so nothing was measured. This is a packaging fault, ' +
        'not a fault on the page.',
    };
  }

  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    /**
     * A page the server refused is not a page with no problems.
     *
     * Playwright resolves `goto` on a 404 exactly as it does on a 200, so
     * without this the scanner cheerfully measures the error page: a thin
     * shell of nav and footer that trips almost no rules. Ten stale target
     * URLs once turned that into a 47% "improvement" across a run. Anything
     * the server didn't serve is an explicit failure, and contributes zero.
     */
    const status = response?.status() ?? 0;
    if (status >= 400) {
      return { url, error: `HTTP ${status} — the server did not serve this page` };
    }

    await page.waitForTimeout(2200);

    // Soft 404s answer 200 and render an error page. Titles are the reliable
    // tell; every CMS puts the status in them.
    const title = await page.title();
    if (/\b404\b|page not found/i.test(title)) {
      return { url, error: `Soft 404 — served HTTP ${status} but the page is an error page (“${title}”)` };
    }

    await page.addScriptTag({ content: axeSource });

    // Prove the injection worked before trusting anything that follows. A
    // Content-Security-Policy can drop the script silently, and the result
    // would be a clean report from a scanner that never ran.
    const axeReady = await page.evaluate(() => typeof window.axe?.run === 'function');
    if (!axeReady) {
      return { url, error: 'axe-core did not load in the page — nothing was measured.' };
    }

    const axeResults = await page.evaluate(async () => window.axe.run(document));
    const extras = await page.evaluate(collectMeasurements);
    await confirmClickListeners(page, extras.ghostControls);
    const violations = shapeViolations(axeResults);

    return {
      url,
      violations,
      ...extras,
      httpStatus: status,
      axeVersion: axeResults.testEngine?.version ?? null,
    };
  } catch (err) {
    // Recorded as an explicit error, never as a clean page. The viewer
    // renders this as a distinct failed state so it can't be read as a pass.
    return { url, error: String(err.message ?? err) };
  } finally {
    await page.close();
  }
}
