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
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const SCANNER_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Which probe code produced these numbers.
 *
 * The short SHA of the last commit that touched `scanner/` — literally what
 * `git log -1 --format=%h -- scanner/` prints. Two runs carrying the same value
 * were measured by the same engine; two runs carrying different values were
 * not, and a line drawn between them joins measurements taken with different
 * instruments.
 *
 * It exists because both published runs were produced by probe code that no
 * longer exists — `a2cd211` rewrote five hand-written predicates underneath
 * them — and nothing in either file says so. Recording this does not repair
 * those runs. It makes the discontinuity visible, so the first run that carries
 * a probeVersion can be marked as a new baseline instead of read as a
 * regression.
 *
 * Three ways it can fail, and what each writes:
 *
 * - **No git, or not a checkout** (a container, an unpacked tarball): `null`.
 *   Never omitted. An *absent* field means the run predates provenance
 *   entirely, which is true of the three files already in `data/runs`; `null`
 *   means this run asked and could not answer. Those are different facts and
 *   whatever marks the discontinuity has to be able to tell them apart.
 * - **The working tree differs from that commit**: the SHA is suffixed
 *   `+dirty`. A bare SHA there would name code that is not the code that ran,
 *   and a confident wrong answer is worse than no answer — it is the same
 *   failure as a scan that did not happen rendering as a good result.
 * - **SCANNER_PROBE_VERSION** overrides both, for a deployment that has no
 *   `.git` but can compute the value at build time from the same command.
 *
 * The git calls are scoped with `-C` to this file's own directory rather than
 * to `process.cwd()`, so the answer does not change with where a caller was
 * invoked from.
 *
 * It lives here, next to `browserProvenance`, because both ways of taking a run
 * outside the hosted route need it and only one of them used to have it: the
 * CLI stamped its runs and the scan server did not, so every run taken through
 * a tunnel — which is every run on file — reads "scanner not recorded". The
 * hosted route in `src/app/api/scan/route.ts` deliberately keeps its own copy;
 * it cannot locate `scanner/` this way, and the reasoning is written there.
 */
export function probeVersion() {
  const pinned = process.env.SCANNER_PROBE_VERSION?.trim();
  if (pinned) return pinned;
  try {
    const git = (args) =>
      execFileSync('git', ['-C', SCANNER_DIR, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    const sha = git(['log', '-1', '--format=%h', '--', '.']);
    if (!sha) return null;
    // Untracked files count: a probe added but not committed is still code
    // that ran and is not in the commit this claims to be.
    const dirty = git(['status', '--porcelain', '--', '.']);
    return dirty ? `${sha}+dirty` : sha;
  } catch {
    return null;
  }
}

/**
 * Which browser actually produced this run.
 *
 * Three different Chromium majors — 148, 149 and 151 — were used against these
 * sites inside a single working session, and not one run file on disk names the
 * engine that measured it. Both published runs were produced by probe code that
 * no longer exists and by an unrecorded browser, and nothing anywhere says so.
 * Every number this tool publishes is a comparison between two runs, and that
 * comparison is only honest if you can see when the thing doing the measuring
 * changed — the same argument that pins `axe-core` to an exact version and
 * records `meta.axeVersion` on every run.
 *
 * Pass the options you actually launched with. `browserType.executablePath()`
 * cannot stand in for them: it reports the build Playwright would have chosen,
 * not the one it was pointed at. Measured — launched from `chromium-1228` via
 * `PLAYWRIGHT_CHROMIUM_PATH`, it still answered `chromium-1234`. A provenance
 * field that quietly names the wrong binary is worse than an absent one.
 *
 * Returns only the keys it could establish, so a caller can spread it into
 * `meta` and have "not recorded" stay absent rather than become a value. Call
 * it while the browser is still open.
 */
export function browserProvenance(browser, launchOpts = {}) {
  const provenance = {};
  try {
    const name = browser?.browserType?.()?.name?.();
    const version = browser?.version?.();
    if (version) {
      const label = name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : 'Browser';
      provenance.browserVersion = `${label} ${version}`;
    }
  } catch {
    // An engine we could not ask is recorded as absent, never as a guess.
  }
  // With no override in play, Playwright launched its own build and
  // `executablePath()` is the honest answer; with one, it is not.
  let executablePath = launchOpts?.executablePath ?? process.env.PLAYWRIGHT_CHROMIUM_PATH ?? null;
  if (!executablePath) {
    try {
      executablePath = browser?.browserType?.()?.executablePath?.() ?? null;
    } catch {
      executablePath = null;
    }
  }
  if (executablePath) provenance.browserPath = executablePath;
  return provenance;
}

/**
 * The device profiles a scan can run at, exported so a caller assembling a run
 * file records what was actually measured rather than repeating the numbers and
 * hoping they stay in step.
 *
 * ── Why there are two, and why desktop is first ──────────────────────────
 * These sites resolve their layout on the server from the user-agent — Sitecore
 * puts the result in `deviceLayout`, and the React tree branches on it — and
 * then re-resolve it in the browser from `matchMedia`. So the profile isn't a
 * detail of how we look at the page; it decides which page we are looking at.
 *
 * Measured against production: a desktop UA, an unrecognised UA, and no UA at
 * all all resolve to `deviceLayout: desktop`. Only a recognised mobile UA gets
 * the mobile layout. Agents therefore receive the *desktop* markup, which is
 * why it leads here — a scan that only ran the mobile profile was describing
 * the one variant no agent ever sees.
 *
 * They fail in opposite ways, so neither substitutes for the other. On mobile
 * the nav links are all in the accessibility tree but trapped in an off-screen
 * drawer; on desktop they are `display: none` until hover, so Insureon exposes
 * 7 of its 63 nav destinations. Both are real, and one number cannot say both.
 *
 * The user-agent and the viewport must always agree. Ship a desktop viewport
 * with a mobile UA and the server renders mobile, the client then swaps to
 * desktop on hydration, and the scan measures a state no visitor is ever in.
 */
export const PROFILES = {
  desktop: {
    name: 'desktop',
    label: 'Desktop',
    width: 1440,
    height: 900,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
  /** Mirrors the Lighthouse mobile profile the PageSpeed score is computed on. */
  mobile: {
    name: 'mobile',
    label: 'Mobile',
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
};

/** Desktop leads because it is what agents are served. */
export const PROFILE_NAMES = ['desktop', 'mobile'];
export const DEFAULT_PROFILE = 'desktop';

export function resolveProfile(name = DEFAULT_PROFILE) {
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(
      `Unknown device profile “${name}”. Known profiles: ${PROFILE_NAMES.join(', ')}.`
    );
  }
  return profile;
}

/**
 * Retained so a run file recorded before profiles existed still describes
 * itself correctly: those runs were all mobile.
 */
export const VIEWPORT = {
  width: PROFILES.mobile.width,
  height: PROFILES.mobile.height,
  isMobile: true,
};

export async function launchContext(browser, profileName = DEFAULT_PROFILE) {
  const p = resolveProfile(profileName);
  return browser.newContext({
    viewport: { width: p.width, height: p.height },
    isMobile: p.isMobile,
    hasTouch: p.hasTouch,
    deviceScaleFactor: p.deviceScaleFactor,
    userAgent: p.userAgent,
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

/**
 * A handler attached to nearly every candidate on the page is telemetry, not
 * behaviour.
 *
 * Analytics scripts bind click listeners indiscriminately. On Insureon every
 * single confirmed listener — all 37 — resolved to one line of `sgtracker.js`,
 * and the probe read each of them as proof that a decorative icon was secretly
 * a control. It reported fourteen defects that did not exist, against source
 * files containing no handler at all.
 *
 * A real control's handler is attached for that control. So a handler location
 * shared across most of the page's candidates is disqualified as evidence: it
 * says something about the tracker, not about the element.
 */
const SHARED_HANDLER_SHARE = 0.5;

async function confirmClickListeners(page, controls) {
  if (controls.length === 0) return controls;
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);

    /**
     * Map scriptId -> url so a finding can name what attached its listener.
     *
     * Subscribe BEFORE enabling, and not the other way round. `Debugger.enable`
     * replays a `scriptParsed` for every script the page has already parsed, and
     * it replays them against the session as the command resolves — so a handler
     * attached after the `await` gets none of them. Every script on a loaded page
     * has already parsed by the time this runs, which is the whole set.
     *
     * Measured on the metamorphic tracker fixture, Chromium 149.0.7827.55, the
     * two orders on the same page: subscribe-after collected 0 script urls and
     * every published control came back `listenerScript: null`; subscribe-first
     * collected the urls and named `sgtracker.js`. Through the real `scanPage`,
     * both the own-handler and the own-handler-plus-tracker page published six
     * controls with `listenerScript` null on all six.
     *
     * That field is not decoration. The Insureon incident was diagnosed by it —
     * all thirty-seven confirmed listeners resolving to one line of one analytics
     * file is what identified fourteen reported defects as telemetry, and it is
     * what `SHARED_HANDLER_SHARE` below was written from. A run that confirms a
     * listener and cannot say what attached it cannot repeat that diagnosis.
     *
     * The guard itself is unaffected either way: it keys on
     * `scriptId:lineNumber:columnNumber`, which comes from the listener, not from
     * this map. Only the attribution was lost.
     */
    const scripts = new Map();
    cdp.on('Debugger.scriptParsed', (e) => scripts.set(e.scriptId, e.url));
    await cdp.send('Debugger.enable').catch(() => {});

    const { result } = await cdp.send('Runtime.evaluate', {
      expression: 'window.__ghostCandidateEls',
      returnByValue: false,
    });
    if (!result?.objectId) return controls;

    const props = await cdp.send('Runtime.getProperties', {
      objectId: result.objectId,
      ownProperties: true,
    });

    // Pass one: collect, without judging.
    const found = new Map(); // index -> [{ key, script }]
    const frequency = new Map(); // handler location -> how many candidates
    for (const prop of props.result) {
      if (!/^\d+$/.test(prop.name) || !prop.value?.objectId) continue;
      const index = Number(prop.name);
      if (!controls[index]) continue;
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
        objectId: prop.value.objectId,
        depth: 0,
      });
      const activation = (listeners ?? []).filter((l) => ACTIVATION_EVENTS.has(l.type));
      const entries = activation.map((l) => ({
        key: `${l.scriptId}:${l.lineNumber}:${l.columnNumber}`,
        script: scripts.get(l.scriptId) ?? null,
      }));
      found.set(index, entries);
      for (const key of new Set(entries.map((e) => e.key))) {
        frequency.set(key, (frequency.get(key) ?? 0) + 1);
      }
    }

    /**
     * Pass two: a handler bound to most candidates is not what makes any one
     * of them a control.
     *
     * The denominator is the candidates that carry *some* activation listener,
     * not every candidate examined. Counting all of them silently weakens the
     * guard as the tracker's share falls: measured, a tracker bound to 3 of 8
     * examined candidates scores 0.375, slips under the 0.5 threshold, and
     * three phantom controls come back — the same fourteen-false-positive
     * failure this guard was added to stop, just at a lower listener density.
     * Elements with no listener at all say nothing about whether a handler is
     * page-wide telemetry, so they are not evidence either way.
     */
    const total = [...found.values()].filter((entries) => entries.length > 0).length;
    const shared = new Set(
      [...frequency.entries()]
        .filter(([, n]) => total >= 4 && n / total >= SHARED_HANDLER_SHARE)
        .map(([key]) => key)
    );

    for (const [index, entries] of found) {
      const own = entries.filter((e) => !shared.has(e.key));
      controls[index].confirmedListener = own.length > 0;
      controls[index].listenerScript = (own[0] ?? entries[0])?.script ?? null;
      /** True when the only listeners here are page-wide analytics handlers. */
      controls[index].listenerIsShared = own.length === 0 && entries.length > 0;
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
/**
 * Ask the page which variant of itself it is, if the caller declared how.
 *
 * The contract is in `targets.mjs`, and so is every fact about any site. This
 * function knows only that it was handed a question and a way to ask it. It
 * records the answer verbatim and never interprets it — the moment this file
 * learns what a `Homepage-Hero-V3` is, the engine is coupled to one CMS.
 *
 * Three outcomes stay distinguishable, because they are three different facts:
 *
 *   undefined            no identity was declared for this target
 *   { value: null }      asked, and the page could not answer
 *   { value: "…" }       asked and answered
 *   { value: null, error } the reader threw, and the run says so
 *
 * A reader that throws must never take the scan down with it: identity is
 * provenance, not measurement, and a page whose variant is unknown is still a
 * page worth measuring. Nothing in the defect set reads this field.
 */
async function readIdentity(page, identity) {
  if (!identity || typeof identity.read !== 'function') return undefined;
  try {
    const value = await page.evaluate(identity.read);
    return {
      key: identity.key,
      value: typeof value === 'string' && value.length > 0 ? value.slice(0, 120) : null,
    };
  } catch (err) {
    return { key: identity.key, value: null, error: String(err?.message ?? err).slice(0, 200) };
  }
}

export async function scanPage(context, url, { axeSource: providedAxeSource, identity } = {}) {
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

    /**
     * The same proof, for the other half of what axe is used for.
     *
     * `probes.mjs` no longer computes tree membership, accessible names,
     * focusability, IDREF resolution or on-screen visibility itself — it asks
     * `axe.commons`, which is a published-but-undocumented internal rather than
     * part of axe's API. A version bump that kept `axe.run` and moved
     * `axe.commons` would not break the scan; it would make every probe in that
     * file measure nothing and report a spotless page. That is the exact shape
     * of the two false-clean incidents this scanner has already shipped, so it
     * gets the same treatment the CSP failure got: an explicit error, and a
     * page that contributes zero.
     */
    const commonsReady = await page.evaluate(() => {
      const c = window.axe?.commons;
      return (
        typeof c?.dom?.isVisibleToScreenReaders === 'function' &&
        typeof c?.dom?.isVisibleOnScreen === 'function' &&
        typeof c?.dom?.isInTabOrder === 'function' &&
        typeof c?.dom?.getTabbableElements === 'function' &&
        typeof c?.text?.accessibleText === 'function' &&
        typeof c?.aria?.getAccessibleRefs === 'function' &&
        typeof c?.aria?.getRolesByType === 'function' &&
        typeof c?.aria?.getRole === 'function' &&
        typeof window.axe?.utils?.parseTabindex === 'function' &&
        typeof window.axe?.utils?.getNodeFromTree === 'function' &&
        typeof window.axe?.setup === 'function' &&
        typeof window.axe?.teardown === 'function'
      );
    });
    if (!commonsReady) {
      return {
        url,
        error:
          'axe.commons is missing or has changed shape in this axe-core build, so the ' +
          'probes could not measure tree membership, names, focusability or visibility. ' +
          'Nothing was measured — this is a packaging fault, not a fault on the page.',
      };
    }

    const axeResults = await page.evaluate(async () => window.axe.run(document));
    const extras = await page.evaluate(collectMeasurements);
    await confirmClickListeners(page, extras.ghostControls);
    const violations = shapeViolations(axeResults);
    // Read last, and against the same settled page every probe just measured,
    // so the recorded identity names the document those numbers came from.
    const pageIdentity = await readIdentity(page, identity);

    return {
      url,
      violations,
      ...extras,
      httpStatus: status,
      axeVersion: axeResults.testEngine?.version ?? null,
      ...(pageIdentity ? { identity: pageIdentity } : {}),
    };
  } catch (err) {
    // Recorded as an explicit error, never as a clean page. The viewer
    // renders this as a distinct failed state so it can't be read as a pass.
    return { url, error: String(err.message ?? err) };
  } finally {
    await page.close();
  }
}
