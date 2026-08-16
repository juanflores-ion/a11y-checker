/**
 * Tests for the aggregation layer: `aggregate.ts`, and the defect definitions
 * in `model.ts` that it now shares rather than restates. Run with `npm test`.
 *
 * WHAT THESE CAN AND CANNOT CATCH — worth reading before adding one.
 *
 * They test arithmetic over frozen input. **They cannot fail because a probe
 * regressed.** A run file is frozen JSON; editing `scanner/probes.mjs` does not
 * retroactively change one, so no assertion here has any purchase on whether
 * the scanner measures the right thing. Probe correctness needs the metamorphic
 * suite — build the same component five ways and assert the five answers agree —
 * which is a different piece of work in a different directory.
 *
 * This file used to blur that line, and the blur was load-bearing. The probe
 * assertions read `latestRun(loadRuns())`, taking their expected values from
 * whatever the scanner last produced and asserting them back. That is inverted
 * twice over: it could not fail for a probe bug, and it *would* fail the day
 * ION's fix lands and a better run becomes the latest — the tool's entire
 * purpose showing up as a red build. Those assertions now read a frozen copy in
 * `src/lib/fixtures/`, which is the pattern this repo already established for
 * the 7 Aug baseline, and they are labelled for what they are: regression tests
 * over `aggregate.ts`.
 *
 * Three corpora, and the difference between them matters:
 *
 * - `baseline` — the 7 Aug 2026 fixture. Canonical §3/§4 figures, and the only
 *   run anywhere that carries *no* probe fields, which makes it the corpus for
 *   what the aggregator does with a check that did not exist yet.
 * - `frozen` — a byte-for-byte copy of the 11 Aug 14:12 run. The probe-era
 *   figures, pinned so they stop moving under the tests.
 * - `runs` — the real scans in `data/runs/`, the ones the app renders. Used
 *   only for structural and contract assertions, never for a magnitude: a
 *   magnitude asserted against live data is a test that fails when the sites
 *   get better.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { latestRun, loadRuns, runAtViewport, Run, VIEWPORT_NAMES } from './loadRuns';
import {
  PAGE_DEFECTS,
  PAGE_KEYS,
  NON_DEFECT_METRICS,
  countsAsGhostControl,
  hiddenPanelAnnounced,
  isFailedPage,
  isScannedPage,
  pageDefectSummary,
  pageVerdict,
  phantomBlocking,
  phantomPanelState,
  verdictForPage,
  type GhostControl,
  type HiddenPanel,
  type PageResult,
  type PhantomMenu,
  type ScannedPage,
} from './model';
import {
  PROBE_CHECKS,
  clickableNoRoleCount,
  countedGhostControls,
  ghostControlCount,
  hasReachData,
  hiddenPanelStats,
  mainCoverage,
  makeDelta,
  metricStability,
  metricValue,
  namelessCounts,
  navReach,
  passRatio,
  perPageProbeTotals,
  perPageRuleTotals,
  phantomFocusable,
  probeMeasured,
  probeTotals,
  resolveMetric,
  ruleDeltas,
  ruleTotals,
  scorecard,
  sparklineSeries,
  totalNodes,
  unreachableStats,
  worstPhantom,
} from './aggregate';

/** The runs the app actually renders. */
const runs = loadRuns();

/** The frozen copies the maths asserts against. Never rendered. */
const fixtures = loadRuns('src/lib/fixtures');

/**
 * The 7 Aug 2026 production baseline, kept as a test fixture rather than in
 * `data/runs/`. It predates the probe rewrite, and four of its ten page keys
 * pointed at URLs the sites have since retired — so it is not comparable to a
 * current run and has no business being rendered. Its figures are still the
 * canonical ones from the investigation, so the maths below keeps asserting
 * against them here, where nothing displays them.
 */
const BASELINE_ID = '2026-08-07-0914';

/**
 * The 11 Aug 2026 14:12 run, frozen. This is the first run that measured both
 * device profiles and carried every probe, so it is what the probe-era
 * assertions are pinned to. A copy, not a move: the original is still in
 * `data/runs/` and still rendered, and a test below checks the two have not
 * drifted apart.
 */
const FROZEN_ID = '2026-08-11-1412';

/**
 * The 10 Aug 2026 run, still in `data/runs/` and still rendered. It carries
 * `ghostControls` but no reachability fields at all, which makes it the live
 * example of a check reading zero because nothing looked.
 */
const PRE_REACH_RUN_ID = '2026-08-10-1450';

const baseline = fixtures.find((r) => r.id === BASELINE_ID) as Run;
const frozen = fixtures.find((r) => r.id === FROZEN_ID) as Run;

/**
 * A synthetic "after" run, built here rather than shipped in `data/runs/`.
 *
 * The delta maths needs two runs to test against, but the only real scan on
 * file is the baseline. A hand-made second run once lived in `data/runs/` to
 * fill that gap and it leaked into the UI as a real measurement. Fixtures for
 * testing belong in the test; `data/runs/` holds measurements only.
 */
function withRules(counts: Record<string, number>): Run {
  const page = (url: string) =>
    scannedPage({
      url,
      violations: Object.entries(counts).map(([id, n]) => ({ id, impact: 'serious', n })),
    });
  return runOf(
    { home: page('https://www.insureon.com/') },
    { home: page('https://www.techinsurance.com/') }
  );
}

/** Same shape as the baseline for TechInsurance, with the fixed rules cleared. */
const after = withRules({ region: 324, 'link-in-text-block': 179, 'color-contrast': 34 });

/**
 * The frozen run projected to each profile. Every probe assertion below names
 * the profile it is about, because the two are different pages: these sites
 * pick their markup from the user-agent on the server, so the mobile back
 * controls simply do not exist in the desktop document and vice versa.
 */
const onMobile = frozen ? runAtViewport(frozen, 'mobile') : null;
const onDesktop = frozen ? runAtViewport(frozen, 'desktop') : null;

/* ------------------------------------------------------------------ */
/* Synthetic shapes                                                    */
/*                                                                     */
/* Built inline, where they are visibly synthetic. Anything that has to */
/* look like a measurement lives in `fixtures/` as a real scan instead. */
/* ------------------------------------------------------------------ */

function scannedPage(overrides: Partial<ScannedPage> = {}): ScannedPage {
  return {
    url: 'https://example.com/',
    violations: [],
    namelessButtons: [],
    namelessLinks: [],
    emptyHref: [],
    hasMain: true,
    phantomMenu: null,
    ...overrides,
  };
}

/**
 * A page as an *older* scanner wrote it: the named fields are absent from the
 * JSON entirely, rather than present and zero.
 *
 * That distinction is the whole of C2 and the thing two false-clean incidents
 * turned on, and it cannot be expressed by setting a field to 0 or null —
 * `phantomMenu: null` is a real reading ("looked, no menu here"), while a
 * missing `phantomMenu` key means nobody looked. Only deleting the key
 * reproduces the second.
 */
function pageMissing(
  fields: Array<keyof ScannedPage>,
  overrides: Partial<ScannedPage> = {}
): ScannedPage {
  const page: Record<string, unknown> = { ...scannedPage(overrides) };
  for (const field of fields) delete page[field];
  // Through `unknown` deliberately: the cast is the point. `ScannedPage`
  // describes today's scanner, and the whole subject of these tests is a run
  // file that does not satisfy it because it was written before the field
  // existed. The type cannot express that and should not be widened to.
  return page as unknown as ScannedPage;
}

function runOf(
  insureon: Record<string, PageResult>,
  techinsurance: Record<string, PageResult> = {}
): Run {
  const brands = { insureon, techinsurance };
  return {
    id: 'synthetic',
    meta: { startedAt: '2026-08-08T10:30:00.000Z', primaryViewport: 'desktop' },
    ...brands,
    byViewport: { desktop: brands },
    viewports: ['desktop'],
    primaryViewport: 'desktop',
  };
}

function ghost(selector: string, confirmedListener: boolean | null): GhostControl {
  return {
    selector,
    html: `<div class="${selector}"></div>`,
    tag: 'div',
    testId: null,
    hasOnClickAttr: false,
    cursorPointer: true,
    keyboardReachable: false,
    confirmedListener,
  };
}

function hiddenPanel(overrides: Partial<HiddenPanel> = {}): HiddenPanel {
  return {
    selector: 'div.panel',
    why: ['off screen'],
    transform: null,
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    maxHeight: null,
    ariaHidden: null,
    inert: false,
    pointerEvents: 'auto',
    exposedInTree: true,
    links: 6,
    buttons: 0,
    focusable: 6,
    tabbable: 6,
    hasKeyboardTrigger: true,
    triggerHasAriaExpanded: true,
    sample: '<a href="/a">A</a>',
    ...overrides,
  };
}

/** The projection `probes.mjs` makes from the largest hidden panel. */
function phantomOf(panel: HiddenPanel): PhantomMenu {
  return {
    transform: panel.transform,
    display: panel.display,
    visibility: panel.visibility,
    ariaHidden: panel.ariaHidden,
    inert: panel.inert,
    pointerEvents: panel.pointerEvents,
    exposedInTree: panel.exposedInTree,
    links: panel.links,
    buttons: panel.buttons,
    focusable: panel.focusable,
    tabbable: panel.tabbable,
  };
}

/* ------------------------------------------------------------------ */
/* The fixtures themselves                                             */
/* ------------------------------------------------------------------ */

test('the fixtures the rest of this file depends on are present', () => {
  // Without this, a missing or renamed fixture makes every downstream test
  // throw on `undefined` instead of saying which one went missing.
  assert.ok(baseline, `${BASELINE_ID} is missing from src/lib/fixtures`);
  assert.ok(frozen, `${FROZEN_ID} is missing from src/lib/fixtures`);
  assert.ok(onMobile, `${FROZEN_ID} carries no mobile profile`);
  assert.ok(onDesktop, `${FROZEN_ID} carries no desktop profile`);
});

test('the frozen fixture is a real scan, not a hand-built one', (t) => {
  /**
   * The fixture is a copy of a run that is still in `data/runs/`, so for as
   * long as both exist the copy can be checked against its source. That check
   * is the difference between "the tests assert against a measurement" and
   * "the tests assert against a file somebody edited until they passed" — and
   * this project has already shipped a hand-built run file that reached the
   * screen captioned "Measured on production".
   *
   * When the 11 Aug run is eventually retired from `data/runs/` the way the
   * 7 Aug one was, there is nothing left to compare against and this skips.
   * It does not start passing vacuously.
   */
  const source = runs.find((r) => r.id === FROZEN_ID);
  if (!source) {
    t.skip(`${FROZEN_ID} has been retired from data/runs; the fixture is now the only copy`);
    return;
  }
  assert.deepEqual(frozen.meta, source.meta, `${FROZEN_ID}: the fixture's meta has been edited`);
  assert.deepEqual(
    frozen.byViewport,
    source.byViewport,
    `${FROZEN_ID}: the fixture no longer matches the run in data/runs — one of the two was edited`
  );
});

test('fixtures never leak into the runs the app renders', () => {
  // The viewer reads data/runs and nothing else. A fixture that finds its way
  // in there gets rendered as a real measurement — which has happened once.
  //
  // The 11 Aug fixture is the deliberate exception and is checked above
  // instead: it is a copy of a run that legitimately renders, not a fixture
  // that escaped into the render path.
  assert.ok(runs.length >= 1, 'no runs on file');
  assert.ok(
    !runs.some((r) => r.id === BASELINE_ID),
    'the retired baseline is back in data/runs'
  );
});

/* ------------------------------------------------------------------ */
/* The run-file contract, over the real scans                          */
/* ------------------------------------------------------------------ */

test('every run file in data/runs satisfies the run-file contract', () => {
  /**
   * The coverage that must survive the probe assertions moving to a fixture.
   *
   * Those assertions were the only thing reading `data/runs/` for anything but
   * structure, so freezing them without this would mean a malformed real run —
   * a truncated write, a hand-edit, a scanner that started emitting a string
   * where a count belongs — reaching the dashboard with nothing to stop it.
   *
   * Every assertion here is an *invariant of the shape*, never a magnitude.
   * That is the design rule for this test and the reason the old one had to
   * go: it must pass unchanged on a run of a completely fixed site, where
   * every defect count is zero. If something in here can fail because the
   * sites got better, it is in the wrong test.
   */
  assert.ok(runs.length >= 1, 'no runs on file');

  const canonicalKeys = new Set<string>(PAGE_KEYS);

  for (const run of runs) {
    assert.ok(
      Number.isFinite(Date.parse(run.meta.startedAt)),
      `${run.id}: meta.startedAt is not a date`
    );

    for (const viewport of run.viewports) {
      for (const brand of ['insureon', 'techinsurance'] as const) {
        const pages = Object.entries(run.byViewport[viewport]![brand]);
        const where = `${run.id} ${viewport} ${brand}`;

        /**
         * A brand with no pages at all reads as every target met — that is the
         * false clean `scorecard()` now guards, and a run file in this shape
         * should never have been committed in the first place. `--only` runs
         * are for debugging; the README says not to commit one.
         */
        assert.ok(pages.length > 0, `${where}: no pages measured at all`);

        for (const [key, page] of pages) {
          const at = `${where}/${key}`;
          assert.ok(canonicalKeys.has(key), `${at}: not one of the canonical page keys`);

          if (isFailedPage(page)) {
            // A failed page is `{ url, error }` and nothing else. It renders as
            // an explicit error state and contributes zero to every total, so
            // the one thing it must not be is silently shapeless.
            assert.equal(typeof page.url, 'string', `${at}: failed page with no url`);
            assert.ok(page.error.length > 0, `${at}: failed page with an empty reason`);
            continue;
          }

          assert.equal(typeof page.url, 'string', `${at}: no url`);
          assert.ok(Array.isArray(page.violations), `${at}: violations is not a list`);
          for (const v of page.violations) {
            assert.equal(typeof v.id, 'string', `${at}: violation with no rule id`);
            assert.equal(typeof v.impact, 'string', `${at}: ${v.id} has no impact`);
            assert.ok(
              Number.isInteger(v.n) && v.n >= 0,
              `${at}: ${v.id} failing-node count is ${v.n}`
            );
          }

          assert.equal(typeof page.hasMain, 'boolean', `${at}: hasMain is not a boolean`);
          for (const field of ['namelessButtons', 'namelessLinks', 'emptyHref'] as const) {
            assert.ok(Array.isArray(page[field]), `${at}: ${field} is not a list`);
          }

          // Every page was measured on a real response. Ten stale target URLs
          // once 404'd and were measured as real pages, which read as a 47%
          // improvement; `scanPage` now rejects non-OK responses, and a run
          // file carrying one is a run file that predates that fix.
          if (page.httpStatus !== undefined) {
            assert.ok(page.httpStatus < 400, `${at}: measured on HTTP ${page.httpStatus}`);
          }

          /**
           * The probe fields are optional — older runs predate them — but a
           * field that is present has to be internally consistent. Each of
           * these is a definition holding, not a defect being absent, so all
           * of them survive a site with nothing wrong with it.
           */
          if (page.navLinks) {
            assert.ok(
              page.navLinks.inTree <= page.navLinks.total,
              `${at}: more nav links in the tree (${page.navLinks.inTree}) than in the page (${page.navLinks.total})`
            );
          }
          if (page.unreachableTotals) {
            const t = page.unreachableTotals;
            for (const [field, n] of Object.entries(t)) {
              assert.ok(Number.isInteger(n) && n >= 0, `${at}: unreachableTotals.${field} is ${n}`);
            }
            assert.ok(
              t.unannouncedPanels <= t.panels,
              `${at}: ${t.unannouncedPanels} unannounced panels out of ${t.panels}`
            );
            /**
             * NOT asserted here, deliberately: `unannouncedLinks <=
             * unannouncedFocusable`. It holds on every run currently on disk
             * (checked), and `model.ts` calls links "a subset of focusable"
             * when explaining why the defect counts must never be summed — but
             * the probe does not guarantee it. `links` counts every `a[href]`
             * in the region; `focusable` counts elements that pass `isControl`,
             * which rejects `tabindex="-1"` and `role="presentation"`. One link
             * written that way makes links exceed controls without anything
             * being wrong, and a contract test that fires on correct markup is
             * the false alarm this whole exercise is about removing.
             */
          }
          for (const g of page.ghostControls ?? []) {
            assert.equal(typeof g.selector, 'string', `${at}: ghost control with no selector`);
            assert.ok(
              g.confirmedListener === true ||
                g.confirmedListener === false ||
                g.confirmedListener === null,
              `${at}: confirmedListener is ${g.confirmedListener} — it has three states and this is not one`
            );
          }
          for (const p of page.hiddenPanels ?? []) {
            assert.ok(Number.isInteger(p.focusable), `${at}: panel focusable is ${p.focusable}`);
            assert.ok(
              p.tabbable <= p.focusable,
              `${at}: ${p.tabbable} tabbable of ${p.focusable} focusable`
            );
            /**
             * Both halves of "announced" have to be recorded. A panel missing
             * them is not a mouse-only panel, it is an unmeasured one — and
             * `hiddenPanelAnnounced` returns null rather than manufacturing a
             * defect out of the gap. Assert they are here so that null stays a
             * theoretical branch rather than something the dashboard is
             * quietly full of.
             */
            assert.equal(
              typeof p.hasKeyboardTrigger,
              'boolean',
              `${at}: panel records no hasKeyboardTrigger`
            );
            assert.equal(
              typeof p.triggerHasAriaExpanded,
              'boolean',
              `${at}: panel records no triggerHasAriaExpanded`
            );
          }
          for (const u of page.unreachablePanels ?? []) {
            assert.equal(typeof u.announced, 'boolean', `${at}: unreachable panel with no verdict`);
            // "Announced" means something *in the tree* says the region
            // exists. A trigger outside the tree announces it to nobody.
            if (u.announced) {
              assert.ok(u.triggerInTree, `${at}: ${u.selector} announced by a trigger out of the tree`);
            }
          }
          if (page.phantomMenu) {
            assert.ok(
              page.phantomMenu.tabbable <= page.phantomMenu.focusable,
              `${at}: phantom menu has more tabbable than focusable controls`
            );
          }
        }
      }
    }
  }
});

test('the two profiles in a run are genuinely different measurements', () => {
  // If desktop and mobile ever come back identical, the profile plumbing has
  // broken — most likely a user-agent that no longer matches its viewport, so
  // the server hands back the same layout twice. The dashboard would then show
  // two headings over one set of numbers, which is worse than showing one.
  for (const run of runs) {
    if (run.viewports.length < 2) continue;
    const [a, b] = run.viewports;
    assert.notDeepEqual(
      run.byViewport[a],
      run.byViewport[b],
      `${run.id}: ${a} and ${b} measured identically — check the profile user-agents`
    );
  }
});

test('every run is a distinct measurement', () => {
  // Two identical run files make the default "latest vs previous" comparison
  // read "no change" on every metric, which is indistinguishable from a
  // genuine flat result. This caught a duplicated fixture once already.
  const seen = new Map<string, string>();
  for (const run of runs) {
    // Fingerprint every viewport, not the primary projection alone — two runs
    // could differ only in the profile they lead with and still be the same
    // measurement twice over.
    const fingerprint = JSON.stringify(run.byViewport);
    const twin = seen.get(fingerprint);
    assert.equal(twin, undefined, `${run.id} has identical measurements to ${twin}`);
    seen.set(fingerprint, run.id);
  }
});

test('every run on file is a real measurement', () => {
  // A future-dated run means invented figures, and invented figures rendered
  // as measurement is the most damaging thing this tool could do — it goes to
  // Product and SEO, who quote it. This has happened once already: a
  // hand-built "projected" run shipped in data/runs and showed up on screen
  // captioned "Measured on production".
  const now = Date.now();
  for (const run of runs) {
    assert.ok(
      Date.parse(run.meta.startedAt) <= now,
      `${run.id} is dated in the future — data/runs holds real scans only, ` +
        'never hand-built or projected ones'
    );
  }
});

test('every run declares the viewports it actually measured', () => {
  // A run's numbers mean nothing without knowing which device profile produced
  // them: these sites serve different markup per device, so desktop and mobile
  // are different pages rather than different framings of one. Runs recorded
  // before profiles existed were all mobile, and the loader has to say so
  // rather than leave it implied.
  for (const run of runs) {
    assert.ok(run.viewports.length > 0, `${run.id} declares no viewport`);
    for (const v of run.viewports) {
      assert.ok(run.byViewport[v], `${run.id} lists ${v} but carries no ${v} results`);
    }
    assert.ok(
      run.viewports.includes(run.primaryViewport),
      `${run.id} is primarily ${run.primaryViewport}, which it never measured`
    );
  }
});

test('the primary projection is the primary viewport, not whatever was first', () => {
  // run.insureon is what every aggregate helper reads. If it ever drifts from
  // byViewport[primaryViewport], the whole dashboard silently reports one
  // profile under another profile's heading.
  for (const run of runs) {
    assert.deepEqual(run.insureon, run.byViewport[run.primaryViewport]?.insureon);
    assert.deepEqual(run.techinsurance, run.byViewport[run.primaryViewport]?.techinsurance);
  }
});

test('runAtViewport refuses to substitute a profile that was not measured', () => {
  // The whole guard. Returning the other viewport's numbers here would be the
  // same class of bug as charting a mobile run next to a desktop one — a
  // confident figure describing a page nobody looked at.
  for (const run of runs) {
    for (const v of VIEWPORT_NAMES) {
      const view = runAtViewport(run, v);
      if (run.viewports.includes(v)) {
        assert.ok(view, `${run.id} measured ${v} but would not project to it`);
        assert.equal(view.primaryViewport, v);
        assert.deepEqual(view.insureon, run.byViewport[v]?.insureon);
      } else {
        assert.equal(view, null, `${run.id} never measured ${v} but projected to it anyway`);
      }
    }
  }
});

test('runs load and sort oldest first', () => {
  assert.ok(runs.length >= 1);
  const sorted = [...runs].sort(
    (a, b) => Date.parse(a.meta.startedAt) - Date.parse(b.meta.startedAt)
  );
  assert.deepEqual(runs.map((r) => r.id), sorted.map((r) => r.id));
  assert.equal(latestRun(runs)?.id, runs[runs.length - 1].id);
});

/* ------------------------------------------------------------------ */
/* Probe rollups, over the frozen run                                  */
/* ------------------------------------------------------------------ */

test('mobile probe rollups — aggregate.ts over the frozen 11 Aug run', () => {
  /**
   * These are the figures the investigation published, and this asserts that
   * `aggregate.ts` still adds them up the same way. It says nothing about
   * whether the probes measure the right thing: the input is frozen JSON.
   *
   * The comment that used to sit here — "if this ever goes back to zero, the
   * probe has regressed" — was simply false, and it mattered, because it is
   * the sentence that made everyone believe there was a safety net under the
   * scanner. There is not. There is one under the arithmetic.
   */
  assert.ok(onMobile, 'the frozen run did not measure the mobile profile');

  // Insureon's back control is a <div>, so axe's button-name rule reads 0 on a
  // site that has fifty of them. Both halves of that sentence, asserted
  // together — a misleading zero is only misleading next to the real count.
  assert.equal(ruleTotals(onMobile, 'insureon')['button-name'] ?? 0, 0, 'axe still cannot see them');
  assert.equal(ghostControlCount(onMobile, 'insureon', 'backButton'), 50);

  // The hamburger: one per page, both brands, invisible to every audit.
  assert.equal(ghostControlCount(onMobile, 'insureon', 'menu'), 10);
  assert.equal(ghostControlCount(onMobile, 'techinsurance', 'menu'), 10);

  // Generalised panel probe reproduces the hardcoded mega-menu reading.
  assert.equal(phantomFocusable(onMobile, 'insureon'), 68);
  assert.equal(phantomFocusable(onMobile, 'techinsurance'), 69);

  // And finds more than the mega-menu, which the old selector never could.
  assert.ok(hiddenPanelStats(onMobile, 'insureon').panels > 10);
  assert.ok(clickableNoRoleCount(onMobile, 'insureon') > 100);

  // On mobile the nav is entirely in the tree — trapped off-screen, but
  // present. That is what makes the desktop reading below a separate defect
  // rather than the same one counted twice.
  assert.equal(navReach(onMobile, 'insureon').hidden, 0);
  assert.equal(navReach(onMobile, 'techinsurance').hidden, 0);
});

test('desktop probe rollups — the profile agents are actually served', () => {
  // Desktop went unmeasured until 11 Aug 2026, so every figure the dashboard
  // showed described the mobile layout — the one variant no agent receives.
  // A desktop UA, an unrecognised UA and no UA at all are all served desktop.
  assert.ok(onDesktop, 'the frozen run did not measure the desktop profile');
  assert.equal(frozen.primaryViewport, 'desktop', 'desktop should lead — agents get it');

  // The hover-only mega-menu: in the page, out of the accessibility tree, and
  // nothing in the tree announces it. Both brands, every page.
  for (const brand of ['insureon', 'techinsurance'] as const) {
    const nav = navReach(onDesktop, brand);
    assert.ok(nav.total > 0, `${brand}: no navigation links measured at all`);
    assert.ok(
      nav.hidden > nav.inTree * 3,
      `${brand}: expected most of the nav to be unreachable on desktop, ` +
        `got ${nav.hidden} hidden vs ${nav.inTree} reachable`
    );
    // Cross-check: the panel probe and the nav probe are computed
    // independently, so agreement between them is evidence, not tautology.
    assert.ok(unreachableStats(onDesktop, brand).unannouncedPanels > 0);
  }

  // The mobile-only components are absent here, which is the point: these are
  // two different documents, not one document at two widths.
  assert.equal(ghostControlCount(onDesktop, 'insureon', 'backButton'), 0);
});

test('the unfindable count is unannounced content, not merely hidden content', () => {
  /**
   * The distinction this whole check turns on.
   *
   * On mobile, production's closed drawer keeps its links *in* the tree, so
   * nothing is out of the tree and nothing is unfindable. A build that hides
   * the drawer properly behind a disclosure button moves those links out of the
   * tree — and must still report zero unfindable, because a button announces
   * them.
   *
   * This row first shipped counting every out-of-tree link. Measured against a
   * fixed build of Insureon it read 680 where the truth was 51, turning a
   * completed fix into a catastrophic-looking regression.
   */
  assert.ok(onMobile && onDesktop, 'need both profiles');

  for (const brand of ['insureon', 'techinsurance'] as const) {
    // Mobile is the case that proves the two are independent measurements.
    // Every nav link is in the tree (nothing hidden), yet there are still
    // unfindable links — they come from an unannounced panel that isn't in the
    // nav at all. One number cannot be derived from the other.
    const nav = navReach(onMobile, brand);
    const stats = unreachableStats(onMobile, brand);
    assert.equal(nav.hidden, 0, `${brand}: mobile keeps its nav links in the tree`);
    if (stats.links > 0) {
      assert.ok(
        stats.unannouncedPanels > 0,
        `${brand}: unfindable links must come from unannounced panels`
      );
    }

    // Desktop: out of the tree *and* unannounced.
    const d = unreachableStats(onDesktop, brand);
    assert.ok(d.links > 0, `${brand}: desktop should report unfindable links`);
    assert.ok(
      d.unannouncedPanels > 0,
      `${brand}: unfindable links must come from unannounced panels`
    );
  }

  // The scorecard row reads the same number, not the broader hidden count.
  const row = scorecard(onDesktop, 'insureon').find((r) => r.key === 'unfindable-links');
  assert.ok(row, 'the unfindable-links row is missing');
  assert.equal(row.value, unreachableStats(onDesktop, 'insureon').links);
  assert.notEqual(
    row.value,
    navReach(onDesktop, 'insureon').hidden,
    'the row is reading the old hidden-links formula again'
  );
});

/* ------------------------------------------------------------------ */
/* C2 — a measurement that did not happen is null, never zero          */
/* ------------------------------------------------------------------ */

test('a check that never ran is not a pass', () => {
  // The scorecard once counted "this probe did not exist yet" as met. Absence
  // has to read as absence: met === null and notMeasured set, so the pass ratio
  // excludes it instead of banking it.
  //
  // Over the fixtures as well as the live runs — the 7 Aug baseline is the
  // only corpus that carries no probe fields at all, so it is the one that
  // keeps this from going vacuous once every run on disk has every check.
  for (const run of [...runs, ...fixtures]) {
    for (const brand of ['insureon', 'techinsurance'] as const) {
      for (const row of scorecard(run, brand)) {
        if (row.notMeasured) {
          assert.equal(
            row.met,
            null,
            `${run.id} ${brand}: "${row.label}" was never measured but scored ${row.met}`
          );
        }
      }
    }
  }
});

test('a probe that never ran reads as not measured, not as zero', () => {
  /**
   * The 10 Aug 2026 run is the live example, and it is still in `data/runs/`:
   * it carries `ghostControls` but no reachability fields at all, so "links an
   * agent cannot find" sums to 0 for the sole reason that nothing looked —
   * while the next run, at the same mobile profile and on the same brand,
   * measured 51. A dashboard printing that 0 says the site is clean on its
   * headline check.
   *
   * A single `hasProbeData` boolean cannot catch this, because that run does
   * have probe data; just not this probe's. Hence per-check `probeMeasured`.
   */
  for (const run of [...runs, ...fixtures]) {
    for (const brand of ['insureon', 'techinsurance'] as const) {
      const measured = probeMeasured(run, brand);
      const totals = probeTotals(run, brand);
      for (const check of PROBE_CHECKS) {
        if (measured[check.id]) continue;
        assert.equal(
          totals[check.id],
          0,
          `${run.id} ${brand}: ${check.id} was never measured yet totals to ${totals[check.id]}`
        );
        const row = scorecard(run, brand).find((r) => r.key === check.id);
        if (row) {
          assert.equal(row.met, null, `${run.id} ${brand}: unmeasured ${check.id} scored ${row.met}`);
          assert.equal(row.notMeasured, true, `${run.id} ${brand}: ${check.id} is not flagged`);
        }
      }
    }
  }

  // And the concrete case, named, for as long as that run is on disk.
  const aug10 = runs.find((r) => r.id === PRE_REACH_RUN_ID);
  if (aug10) {
    assert.equal(probeMeasured(aug10, 'insureon')['unfindable-links'], false);
    assert.equal(probeTotals(aug10, 'insureon')['unfindable-links'], 0, 'the zero that is not a zero');
    assert.equal(metricValue(aug10, 'insureon', 'unfindable-links'), null, 'the trend must not plot it');
    assert.equal(
      resolveMetric(aug10, 'insureon', { kind: 'unfindable-links', label: 'Links an agent cannot find' })
        .notMeasured,
      true,
      'the issue catalogue is the layer Product and SEO read; it must not quote this 0'
    );
  }
});

test('a catalogue metric carries the target it is scored against, not just a number', () => {
  /**
   * Colour on the Overview issues table comes from `cellTone`, and `cellTone`
   * asks for a target. Without one every non-zero figure reads red, which is
   * how `nav-links-in-tree` — links an agent *can* reach, and a number a
   * correct site wants high — ended up printed as a defect.
   */
  const run = runOf({ home: scannedPage() }, { home: scannedPage() });

  const defect = resolveMetric(run, 'insureon', {
    kind: 'unfindable-links',
    label: 'Links an agent cannot find',
  });
  assert.equal(defect.target, 0, 'a defect is scored against zero');
  assert.equal(defect.higherIsBetter, false);

  const descriptive = resolveMetric(run, 'insureon', {
    kind: 'clickable-no-role',
    label: 'Clickable elements with no role',
  });
  assert.equal(descriptive.target, null, 'a magnitude has no target and must not colour red');

  const reachable = resolveMetric(run, 'insureon', {
    kind: 'nav-links-in-tree',
    label: 'Navigation links it can find',
  });
  assert.equal(reachable.higherIsBetter, true, 'more of the nav in the tree is better');

  // Rules split on `exact`: a discrete defect scores against zero, a drifting
  // one has no target that survives content churn.
  assert.equal(
    resolveMetric(run, 'insureon', { kind: 'rule', ruleId: 'button-name', label: 'Buttons with no name' }).target,
    0
  );
  assert.equal(
    resolveMetric(run, 'insureon', { kind: 'rule', ruleId: 'region', label: 'Nodes outside a landmark' }).target,
    null
  );
});

test('a brand where nothing scanned is absence, not a clean sweep', () => {
  /**
   * Failed pages are excluded from every calculation, so a brand where every
   * page failed to load leaves every total at zero, every target met, and a
   * scorecard reading "all targets met" for a run in which nothing was
   * measured at all. Same shape as both false-clean incidents already shipped
   * here.
   */
  const empty = runOf({});

  for (const row of scorecard(empty, 'insureon')) {
    assert.equal(row.met, null, `"${row.label}" scored ${row.met} on a brand with no pages`);
    assert.equal(row.notMeasured, true, `"${row.label}" is not flagged as unmeasured`);
  }
  assert.deepEqual(passRatio(empty, 'insureon'), { passed: 0, total: 0 }, 'nothing measured, nothing passed');

  for (const metric of ['total', 'in-scope', 'phantom', 'unfindable-links', 'rule:region'] as const) {
    assert.equal(metricValue(empty, 'insureon', metric), null, `${metric} plotted a value`);
  }
  assert.equal(
    resolveMetric(empty, 'insureon', { kind: 'rule', ruleId: 'region', label: 'Region' }).notMeasured,
    true
  );
});

test('a run that predates a check leaves a gap in the series, not a zero', () => {
  /**
   * A run recorded before a check existed, plotted as zero, draws a line
   * falling to the floor and climbing back — a fix that landed and then
   * regressed, invented entirely out of when the scanner learned to look.
   *
   * The 7 Aug baseline carries no reachability probe and the frozen 11 Aug run
   * carries it in full, so the pair is exactly that shape.
   */
  assert.ok(onMobile, 'need the frozen mobile profile');
  assert.equal(hasReachData(baseline, 'insureon'), false, 'the baseline predates the reach probe');
  assert.deepEqual(sparklineSeries([baseline, onMobile], 'insureon', 'unfindable-links'), [null, 51]);
});

/* ------------------------------------------------------------------ */
/* One definition of a ghost control                                   */
/* ------------------------------------------------------------------ */

test('one definition of a ghost control, shared by the header and the table', () => {
  /**
   * `ghostControlCount` dropped the candidates the browser's listener registry
   * disproved and `perPageProbeTotals` did not, so the Runs → By check row and
   * the per-page table that expands underneath it computed different things
   * for the same figure. Both now go through `countsAsGhostControl` in
   * `model.ts`.
   *
   * `confirmedListener: null` still counts. That value means CDP could not
   * answer — uncertainty, not absence — and uncertainty is not allowed to
   * shrink a defect count.
   */
  assert.equal(countsAsGhostControl(ghost('div.a', true)), true);
  assert.equal(countsAsGhostControl(ghost('div.b', null)), true, 'unconfirmed is not disproved');
  assert.equal(countsAsGhostControl(ghost('div.c', false)), false, 'the registry says it has no handler');

  const page = scannedPage({
    ghostControls: [ghost('div.confirmed', true), ghost('div.disproved', false), ghost('div.unknown', null)],
  });
  assert.equal(countedGhostControls(page).length, 2);

  const run = runOf({ home: page });
  assert.equal(ghostControlCount(run, 'insureon'), 2, 'the header dropped the wrong ones');
  assert.equal(
    perPageProbeTotals(run, 'insureon')['ghost-controls']['home'],
    2,
    'the per-page table disagrees with the header again'
  );
});

test('the ghost header equals the sum of its per-page table, on every run on file', () => {
  /**
   * A reader who adds up the table and gets a different answer from the header
   * stops trusting every other figure on the page, which is a far larger loss
   * than the row itself.
   *
   * This passes today for a reason that is a property of the data rather than
   * of the code: every ghost control in every run on disk carries
   * `confirmedListener: true`, so the filter drops nothing. `core.mjs` sets
   * that flag from the browser's own registry, so the first candidate it
   * disproves is what would have split the two numbers.
   */
  for (const run of [...runs, ...fixtures]) {
    for (const viewport of run.viewports) {
      const view = runAtViewport(run, viewport)!;
      for (const brand of ['insureon', 'techinsurance'] as const) {
        const table = Object.values(perPageProbeTotals(view, brand)['ghost-controls']).reduce(
          (a, b) => a + b,
          0
        );
        assert.equal(
          ghostControlCount(view, brand),
          table,
          `${run.id} ${viewport} ${brand}: header and per-page table disagree`
        );
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* Hidden is not unfindable — the verdict layer                        */
/* ------------------------------------------------------------------ */

test('an off-screen panel a keyboard trigger announces is not a dead end', () => {
  /**
   * False-positive class 1, at the verdict layer, on real data.
   *
   * Insureon's desktop home page carries a four-control accordion whose
   * trigger is keyboard-reachable and carries `aria-expanded`. That is a
   * *correct* disclosure — the shape the README says is fine — and the old
   * formula called the page blocking for having it.
   */
  assert.ok(onDesktop, 'need the frozen desktop profile');
  const page = onDesktop.insureon['home'];
  assert.ok(isScannedPage(page), 'the frozen desktop home page did not scan');

  const oldFormula = (page.phantomMenu?.focusable ?? 0) > 0;
  assert.equal(oldFormula, true, 'the page still has the closed panel the old formula flagged');
  assert.equal(phantomPanelState(page), 'announced');
  assert.equal(phantomBlocking(page), false, 'a correct disclosure is not an agent dead end');
  assert.notEqual(pageVerdict(page).verdict, 'blocking');
  assert.equal(pageVerdict(page).notMeasured, false);
});

test('an off-screen panel nothing announces still blocks', () => {
  // The overcorrection guard. Insureon's mobile drawer has a keyboard-reachable
  // trigger that says nothing about state, so an agent has no way to know there
  // is anything behind it — 68 controls' worth. It stays reported.
  assert.ok(onMobile, 'need the frozen mobile profile');
  const page = onMobile.insureon['home'];
  assert.ok(isScannedPage(page), 'the frozen mobile home page did not scan');

  assert.equal(phantomPanelState(page), 'unannounced');
  assert.equal(phantomBlocking(page), true);
  assert.equal(pageVerdict(page).verdict, 'blocking');
});

test('announcement needs a keyboard trigger *and* a declared state', () => {
  // "A closed dialog with an aria-expanded trigger is fine; a :hover mega-menu
  // is not" — and so is a trigger you can reach but that never says what it
  // does. Both halves, or it is not announced.
  assert.equal(hiddenPanelAnnounced(hiddenPanel()), true);
  assert.equal(
    hiddenPanelAnnounced(hiddenPanel({ triggerHasAriaExpanded: false })),
    false,
    'reachable but silent about state'
  );
  assert.equal(hiddenPanelAnnounced(hiddenPanel({ hasKeyboardTrigger: false })), false);

  // A panel that recorded no trigger measured the panel, not the trigger.
  // Answering "no trigger" there manufactures a defect out of a missing field.
  const noRecord = { ...hiddenPanel() } as Partial<HiddenPanel>;
  delete noRecord.hasKeyboardTrigger;
  assert.equal(hiddenPanelAnnounced(noRecord as HiddenPanel), null, 'unknown, not "mouse-only"');
});

test('a panel with nothing recorded about its trigger is unknown, never fine', () => {
  /**
   * The other direction of the same rule. A run that recorded trapped controls
   * but nothing about what opens them cannot be graded, and the honest answer
   * is null — which `pageVerdict` reports and `verdictForPage` resolves to
   * `blocking`, a refusal to certify rather than a claim.
   */
  const panel = hiddenPanel({ focusable: 6, links: 6 });
  const page = pageMissing(['hiddenPanels'], { phantomMenu: phantomOf(panel) });

  assert.equal(phantomPanelState(page), null);
  assert.equal(phantomBlocking(page), null, 'null, not false — a check that did not run is not a pass');
  const verdict = pageVerdict(page);
  assert.equal(verdict.verdict, null);
  assert.equal(verdict.notMeasured, true);
  assert.equal(verdictForPage(page), 'blocking', 'the renderable form refuses to certify');

  // And with the panel present, the same phantom projection resolves.
  const measured = scannedPage({ hiddenPanels: [panel], phantomMenu: phantomOf(panel) });
  assert.equal(phantomPanelState(measured), 'announced');
  assert.equal(phantomBlocking(measured), false);
});

test('no closed panel at all is a measurement, and it is clean', () => {
  // `phantomMenu: null` means the page was looked at and has no such region.
  // That is the one case where zero really is zero.
  const page = scannedPage({ phantomMenu: null });
  assert.equal(phantomPanelState(page), 'none');
  assert.equal(phantomBlocking(page), false);
  assert.equal(pageVerdict(page).verdict, 'clear');
  assert.equal(pageVerdict(page).notMeasured, false);
});

/* ------------------------------------------------------------------ */
/* C3 — the defect set                                                 */
/* ------------------------------------------------------------------ */

test('the defect set is the list a correct page has at zero', () => {
  /**
   * "What counts as a defect" had been restated in nine separate comment
   * blocks across `aggregate.ts`, `compare.ts` and `issues.ts`, and
   * restatements drift: two of the five false-positive classes were a metric
   * counting *hidden* where the defect is *unannounced*, each found and fixed
   * separately because no two call sites shared a definition.
   */
  assert.deepEqual(
    PAGE_DEFECTS.map((d) => d.key),
    [
      'namelessButtons',
      'namelessLinks',
      'emptyHref',
      'noMain',
      'ghostControls',
      'hiddenPanels',
      'unannouncedPanels',
      'unannouncedFocusable',
      'unannouncedLinks',
    ]
  );

  // The other half of the definition, and the half that keeps getting lost:
  // these are expected to be non-zero on a page with nothing wrong with it.
  // Every one of them has been reported as a defect at some point.
  const defects = new Set<string>(PAGE_DEFECTS.map((d) => d.key));
  const expectedNonZero = [
    'clickableNoRole',
    'unreachableTotals.panels',
    'unreachablePanels',
    'navLinks.inTree < navLinks.total',
  ];
  for (const metric of expectedNonZero) {
    assert.ok(
      NON_DEFECT_METRICS.some((m) => m.key === metric),
      `${metric} is missing from NON_DEFECT_METRICS`
    );
    assert.ok(!defects.has(metric), `${metric} has been promoted back into the defect set`);
  }
});

test('a page missing a check is not clean, however clean the rest of it looks', () => {
  /**
   * `clean` mirrors `ScorecardRow.met`: true only when everything was measured
   * and everything was zero, null — never true, never false — when something
   * was not measured at all. A page with every visible count at zero and five
   * checks that never ran is the exact shape of a false clean.
   */
  const unmeasured = pageMissing(['ghostControls', 'hiddenPanels', 'unreachableTotals']);
  const summary = pageDefectSummary(unmeasured);
  assert.deepEqual(summary.present, [], 'nothing measured came back non-zero');
  assert.equal(summary.clean, null, 'a partly measured page is not a clean one');
  assert.deepEqual(summary.notMeasured, [
    'ghostControls',
    'hiddenPanels',
    'unannouncedPanels',
    'unannouncedFocusable',
    'unannouncedLinks',
  ]);

  // Fully measured and all zero is the only thing that earns `true`.
  const clean = scannedPage({
    ghostControls: [],
    hiddenPanels: [],
    unreachableTotals: { panels: 0, unannouncedPanels: 0, unannouncedFocusable: 0, unannouncedLinks: 0 },
  });
  assert.equal(pageDefectSummary(clean).clean, true);

  // And a run that predates the probes reports each of them as unmeasured
  // rather than as zero, on real data.
  const home = baseline.insureon['home'];
  assert.ok(isScannedPage(home));
  assert.deepEqual(pageDefectSummary(home).notMeasured, [
    'ghostControls',
    'hiddenPanels',
    'unannouncedPanels',
    'unannouncedFocusable',
    'unannouncedLinks',
  ]);
});

test('an absent hasMain is unknown; only an explicit false is the defect', () => {
  // The failure mode of getting this wrong is a run whose scanner never
  // recorded the field reporting ten missing landmarks it never looked for.
  const counts = (p: ScannedPage) => pageDefectSummary(p).counts.noMain;
  assert.equal(counts(scannedPage({ hasMain: true })), 0);
  assert.equal(counts(scannedPage({ hasMain: false })), 1);
  assert.equal(counts(pageMissing(['hasMain'])), null);
});

/* ------------------------------------------------------------------ */
/* Repeatability                                                       */
/* ------------------------------------------------------------------ */

test('a metric measured to swing by 86 is not judged against a threshold of 2', () => {
  /**
   * Sixteen consecutive scans of an unchanged insureon.com home page returned
   * `clickableNoRole` of 1 (x5), 36 (x6) and 87 (x5) — the site serves three
   * different documents to identical requests. Every trend line on this metric
   * was being drawn against a global tolerance of 2, so the dashboard called
   * pure site variance a change, every time.
   */
  const stability = metricStability('clickable-no-role');
  assert.equal(stability.repeatability, 'volatile');
  assert.equal(stability.tolerance, 86, 'the measured spread, not a chosen number');
  assert.ok(stability.evidence, 'a tolerance with no evidence behind it is a guess');
  assert.equal(stability.evidence.scans, 16);
  assert.ok(stability.evidence.floor, 'one page standing in for a ten-page sum is a floor');

  // Exactly the measured swing is not news; one more than it is.
  assert.equal(makeDelta(1, 87, true, 'clickable-no-role').notable, false);
  assert.equal(makeDelta(1, 88, true, 'clickable-no-role').notable, true);

  /**
   * And the reason `exact` cannot be trusted alone: this metric counts
   * discrete things and is exact by that definition, while being useless by
   * the other. The measurement wins over the flag.
   */
  assert.equal(makeDelta(1, 87, true, 'clickable-no-role').exact, true);
});

test('a metric identical on sixteen scans alarms on a move of one', () => {
  // The other half of the same finding, and the reason it is not simply "widen
  // everything": `unfindableLinks` read 56 on every one of those sixteen scans
  // while the metric beside it swung by 86. It is the headline figure, and any
  // movement in it is real.
  const stability = metricStability('unfindable-links');
  assert.equal(stability.repeatability, 'stable');
  assert.equal(stability.tolerance, 0);
  assert.equal(makeDelta(57, 56, true, 'unfindable-links').notable, true);
  assert.equal(makeDelta(56, 56, true, 'unfindable-links').notable, false);
});

test('a metric nobody has scanned twice says so, rather than implying a finding', () => {
  // The placeholder tolerance of 2 survives for these so that nothing changes
  // behaviour on the strength of no measurement — but `unknown` is what tells
  // a reader the threshold is inherited rather than derived.
  for (const metric of ['ghost-controls', 'hidden-panel-controls', 'phantom', 'rule:region']) {
    const stability = metricStability(metric);
    assert.equal(stability.repeatability, 'unknown', `${metric} claims evidence it does not have`);
    assert.equal(stability.evidence, null);
    assert.equal(stability.tolerance, 2);
  }
  // A caller that names no metric at all still gets told the threshold is a
  // placeholder, rather than being left to assume otherwise.
  assert.equal(makeDelta(10, 8, false).stability.repeatability, 'unknown');
});

test('a rule id and its trend key resolve to the same evidence', () => {
  // One table serves every screen. Two spellings of the same metric with two
  // different tolerances is how a figure ends up notable on one page and not
  // on another.
  assert.deepEqual(metricStability('rule:clickable-no-role'), metricStability('clickable-no-role'));
});

test('every probe check carries its repeatability to the UI', () => {
  // The table renders deltas on these rows. Carrying stability on the data
  // rather than leaving each component to look it up is what stops one screen
  // badging a volatile figure and the next one not.
  for (const check of PROBE_CHECKS) {
    assert.ok(check.stability, `${check.id} has no stability`);
    assert.equal(check.stability.metric, check.id);
  }
  assert.equal(
    PROBE_CHECKS.find((c) => c.id === 'clickable-no-role')!.stability.repeatability,
    'volatile'
  );
});

test('every scorecard row and every delta carries its stability', () => {
  assert.ok(onDesktop, 'need the frozen desktop profile');
  for (const row of scorecard(onDesktop, 'insureon')) {
    assert.ok(row.stability, `"${row.label}" has no stability`);
    assert.equal(row.stability.metric, row.key);
  }
  for (const delta of Object.values(ruleDeltas(after, baseline, 'techinsurance'))) {
    assert.ok(delta.stability, 'a delta with no stability behind its "notable"');
  }
});

/* ------------------------------------------------------------------ */
/* §3/§4 of the build spec, over the 7 Aug baseline                    */
/* ------------------------------------------------------------------ */

test('§3 rule totals — Insureon', () => {
  assert.deepEqual(ruleTotals(baseline, 'insureon'), {
    region: 263,
    'link-in-text-block': 228,
    'color-contrast': 13,
    label: 11,
    'landmark-one-main': 10,
    'heading-order': 4,
    'aria-hidden-focus': 4,
  });
});

test('§3 rule totals — TechInsurance', () => {
  assert.deepEqual(ruleTotals(baseline, 'techinsurance'), {
    region: 324,
    'link-in-text-block': 179,
    'button-name': 50,
    'color-contrast': 34,
    'landmark-one-main': 10,
    'link-name': 7,
    label: 5,
    'heading-order': 4,
  });
});

test('absent rule reads as zero, not missing', () => {
  const t = ruleTotals(baseline, 'insureon');
  assert.equal(t['button-name'], undefined);
  assert.equal(scorecard(baseline, 'insureon').find((r) => r.key === 'button-name')!.value, 0);
});

test('§3 per-page breakdown — TechInsurance', () => {
  const perPage = perPageRuleTotals(baseline, 'techinsurance');
  assert.deepEqual(perPage['region'], {
    home: 52,
    policy: 65,
    major: 78,
    minor: 38,
    article: 30,
    resources: 18,
    about: 19,
    contact: 22,
    legal: 1,
    'a11y-stmt': 1,
  });
  // NOTE: §3's per-page table lists policy as 65 for this rule, which makes the
  // row sum to 178 while §3's own brand total says 179. The run file has 66,
  // and 66 is what reconciles the two tables. Treating the totals table as
  // authoritative and the per-page cell as a transcription slip.
  assert.deepEqual(perPage['link-in-text-block'], {
    home: 1,
    policy: 66,
    major: 67,
    minor: 21,
    article: 9,
    resources: 1,
    about: 2,
    contact: 7,
    legal: 3,
    'a11y-stmt': 2,
  });
  // button-name is 5 on every one of the ten pages.
  assert.equal(Object.keys(perPage['button-name']).length, 10);
  assert.ok(Object.values(perPage['button-name']).every((n) => n === 5));
  // link-name fires on seven pages only; the last three are genuinely clean.
  assert.deepEqual(Object.keys(perPage['link-name']).sort(), [
    'about',
    'article',
    'home',
    'major',
    'minor',
    'policy',
    'resources',
  ]);
  assert.deepEqual(Object.keys(perPage['heading-order']).sort(), [
    'about',
    'contact',
    'major',
    'policy',
  ]);
});

test('§3 phantom menu figures', () => {
  const ion = worstPhantom(baseline, 'insureon');
  assert.equal(ion.phantom!.links, 68);
  assert.equal(ion.phantom!.buttons, 0);
  assert.equal(ion.phantom!.focusable, 68);
  assert.equal(ion.phantom!.tabbable, 68);
  assert.equal(ion.phantom!.exposedInTree, true);
  assert.equal(ion.phantom!.pointerEvents, 'none');
  assert.equal(ion.pagesWithMenu, 10);

  const tig = worstPhantom(baseline, 'techinsurance');
  assert.equal(tig.phantom!.links, 64);
  assert.equal(tig.phantom!.buttons, 5);
  assert.equal(tig.phantom!.focusable, 69);
  assert.equal(tig.phantom!.tabbable, 69);
  assert.equal(phantomFocusable(baseline, 'techinsurance'), 69);
});

test('hasMain is false on all twenty baseline pages', () => {
  assert.deepEqual(mainCoverage(baseline, 'insureon'), { withMain: 0, scanned: 10 });
  assert.deepEqual(mainCoverage(baseline, 'techinsurance'), { withMain: 0, scanned: 10 });
});

test('§4 scorecard baseline values', () => {
  const ion = Object.fromEntries(scorecard(baseline, 'insureon').map((r) => [r.key, r.value]));
  const tig = Object.fromEntries(scorecard(baseline, 'techinsurance').map((r) => [r.key, r.value]));

  assert.equal(ion['button-name'], 0);
  assert.equal(tig['button-name'], 50);
  assert.equal(ion['link-name'], 0);
  assert.equal(tig['link-name'], 7);
  assert.equal(ion['label'], 11);
  assert.equal(tig['label'], 5);
  assert.equal(ion['phantom'], 68);
  assert.equal(tig['phantom'], 69);
  assert.equal(ion['region'], 263);
  assert.equal(tig['region'], 324);
});

test("Insureon's zeros are flagged as misleading; TechInsurance's non-zeros are not", () => {
  const ion = scorecard(baseline, 'insureon');
  assert.equal(ion.find((r) => r.key === 'button-name')!.misleadingZero, true);
  assert.equal(ion.find((r) => r.key === 'link-name')!.misleadingZero, true);
  const tig = scorecard(baseline, 'techinsurance');
  assert.equal(tig.find((r) => r.key === 'button-name')!.misleadingZero, false);
});

test('contrast and colour-only links are marked out of scope', () => {
  const rows = scorecard(baseline, 'insureon');
  assert.equal(rows.find((r) => r.key === 'color-contrast')!.inScope, false);
  assert.equal(rows.find((r) => r.key === 'link-in-text-block')!.inScope, false);
  assert.equal(rows.find((r) => r.key === 'region')!.inScope, true);
});

test('pass ratio counts only rows with a hard target', () => {
  assert.deepEqual(passRatio(baseline, 'insureon'), { passed: 3, total: 6 });
  assert.deepEqual(passRatio(baseline, 'techinsurance'), { passed: 0, total: 6 });
});

test('a rule that stops firing reads as a drop to zero, not a vanished row', () => {
  const d = ruleDeltas(after, baseline, 'techinsurance');
  assert.ok('button-name' in d, 'button-name must still appear after it stops firing');
  assert.equal(d['button-name'].current, 0);
  assert.equal(d['button-name'].previous, 50);
  assert.equal(d['button-name'].change, -50);
  assert.equal(d['button-name'].direction, 'down');
  assert.equal(d['label'].current, 0);
  assert.equal(d['label'].previous, 5);
});

test('exact rules alarm on any movement; noisy rules tolerate small drift', () => {
  const d = ruleDeltas(after, baseline, 'techinsurance');
  assert.equal(d['region'].change, 0);
  assert.equal(d['region'].exact, false);
  assert.equal(d['region'].notable, false);
  assert.equal(d['button-name'].exact, true);
  assert.equal(d['button-name'].notable, true);
});

test('no previous run means no delta, not a delta of zero', () => {
  const d = ruleDeltas(baseline, null, 'insureon');
  assert.equal(d['region'].previous, null);
  assert.equal(d['region'].change, null);
  assert.equal(d['region'].direction, 'unknown');
});

test('totals are the sum of every rule', () => {
  assert.equal(totalNodes(baseline, 'insureon'), 263 + 228 + 13 + 11 + 10 + 4 + 4);
  assert.equal(totalNodes(baseline, 'techinsurance'), 324 + 179 + 50 + 34 + 10 + 7 + 5 + 4);
});

test('nameless control lists are counted', () => {
  const tig = namelessCounts(baseline, 'techinsurance');
  assert.ok(tig.buttons > 0);
  assert.equal(tig.emptyHref, 7);
});
