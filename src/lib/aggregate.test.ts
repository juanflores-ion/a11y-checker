/**
 * Definition-of-done tests. Every number here comes straight from §3/§4 of the
 * build spec. Run with `npm test`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { latestRun, loadRuns, runAtViewport, Run, VIEWPORT_NAMES } from './loadRuns';
import {
  clickableNoRoleCount,
  ghostControlCount,
  hiddenPanelStats,
  mainCoverage,
  navReach,
  unreachableStats,
  namelessCounts,
  passRatio,
  perPageRuleTotals,
  phantomFocusable,
  ruleDeltas,
  ruleTotals,
  scorecard,
  totalNodes,
  worstPhantom,
} from './aggregate';

/** The runs the app actually renders. */
const runs = loadRuns();

/**
 * The 7 Aug 2026 production baseline, kept as a test fixture rather than in
 * `data/runs/`. It predates the probe rewrite, and four of its ten page keys
 * pointed at URLs the sites have since retired — so it is not comparable to a
 * current run and has no business being rendered. Its figures are still the
 * canonical ones from the investigation, so the maths below keeps asserting
 * against them here, where nothing displays them.
 */
const baseline = loadRuns('src/lib/fixtures').find(
  (r) => r.id === '2026-08-07-0914'
) as Run;

/**
 * A synthetic "after" run, built here rather than shipped in `data/runs/`.
 *
 * The delta maths needs two runs to test against, but the only real scan on
 * file is the baseline. A hand-made second run once lived in `data/runs/` to
 * fill that gap and it leaked into the UI as a real measurement. Fixtures for
 * testing belong in the test; `data/runs/` holds measurements only.
 */
function withRules(counts: Record<string, number>): Run {
  const page = (url: string) => ({
    url,
    violations: Object.entries(counts).map(([id, n]) => ({ id, impact: 'serious', n })),
    namelessButtons: [],
    namelessLinks: [],
    emptyHref: [],
    hasMain: true,
    phantomMenu: null,
  });
  const brands = {
    insureon: { home: page('https://www.insureon.com/') },
    techinsurance: { home: page('https://www.techinsurance.com/') },
  };
  return {
    id: 'synthetic',
    meta: { startedAt: '2026-08-08T10:30:00.000Z', primaryViewport: 'desktop' },
    ...brands,
    byViewport: { desktop: brands },
    viewports: ['desktop'],
    primaryViewport: 'desktop',
  };
}

/** Same shape as the baseline for TechInsurance, with the fixed rules cleared. */
const after = withRules({ region: 324, 'link-in-text-block': 179, 'color-contrast': 34 });

const extended = latestRun(runs) as Run;

/**
 * The latest run projected to each profile. Every probe assertion below names
 * the profile it is about, because the two are different pages: these sites
 * pick their markup from the user-agent on the server, so the mobile back
 * controls simply do not exist in the desktop document and vice versa.
 */
const onMobile = extended ? runAtViewport(extended, 'mobile') : null;
const onDesktop = extended ? runAtViewport(extended, 'desktop') : null;

test('the extended probes measure what axe structurally cannot — mobile', () => {
  // The whole point of the probe rewrite. Insureon's back control is a <div>,
  // so axe's button-name rule reads 0 on a site that has fifty of them. If
  // this ever goes back to zero, the probe has regressed — check that before
  // believing the sites were fixed.
  assert.ok(onMobile, 'the latest run did not measure the mobile profile');
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

test('the desktop profile is measured, and it is the one agents are served', () => {
  // Desktop went unmeasured until 11 Aug 2026, so every figure the dashboard
  // showed described the mobile layout — the one variant no agent receives.
  // A desktop UA, an unrecognised UA and no UA at all are all served desktop.
  assert.ok(onDesktop, 'the latest run did not measure the desktop profile');
  assert.equal(extended.primaryViewport, 'desktop', 'desktop should lead — agents get it');

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

test('no page in any run was measured from an error page', () => {
  // Ten stale target URLs once 404'd and were measured as real pages, which
  // read as a 47% improvement. scanPage now rejects non-OK responses, so a
  // moved URL surfaces as a failed page instead of a fake win.
  //
  // Every viewport, not just the primary: a URL that 404s only under one
  // profile would otherwise sail through, and half a run measured on error
  // pages is exactly as misleading as a whole one.
  for (const run of runs) {
    for (const viewport of run.viewports) {
      for (const brand of ['insureon', 'techinsurance'] as const) {
        for (const [key, page] of Object.entries(run.byViewport[viewport]![brand])) {
          const status = (page as { httpStatus?: number }).httpStatus;
          if (status !== undefined) {
            assert.ok(
              status < 400,
              `${run.id} ${viewport} ${brand}/${key} was measured on HTTP ${status}`
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

test('the baseline fixture is present', () => {
  // Without this, a missing or renamed fixture makes every downstream test
  // throw on `undefined` instead of saying which one went missing.
  assert.ok(baseline, '2026-08-07-0914 is missing from src/lib/fixtures');
});

test('fixtures never leak into the runs the app renders', () => {
  // The viewer reads data/runs and nothing else. A fixture that finds its way
  // in there gets rendered as a real measurement — which has happened once.
  assert.ok(runs.length >= 1, 'no runs on file');
  assert.ok(
    !runs.some((r) => r.id === '2026-08-07-0914'),
    'the retired baseline is back in data/runs'
  );
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

test('a check that never ran is not a pass', () => {
  // The scorecard once counted "this probe did not exist yet" as met. Absence
  // has to read as absence: met === null and notMeasured set, so the pass ratio
  // excludes it instead of banking it.
  for (const run of runs) {
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

test('runs load and sort oldest first', () => {
  assert.ok(runs.length >= 1);
  const sorted = [...runs].sort(
    (a, b) => Date.parse(a.meta.startedAt) - Date.parse(b.meta.startedAt)
  );
  assert.deepEqual(runs.map((r) => r.id), sorted.map((r) => r.id));
  assert.equal(latestRun(runs)?.id, runs[runs.length - 1].id);
});

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
