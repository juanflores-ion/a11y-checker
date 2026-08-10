/**
 * Definition-of-done tests. Every number here comes straight from §3/§4 of the
 * build spec. Run with `npm test`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { latestRun, loadRuns, Run } from './loadRuns';
import {
  clickableNoRoleCount,
  ghostControlCount,
  hiddenPanelStats,
  mainCoverage,
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
  return {
    id: 'synthetic',
    meta: { startedAt: '2026-08-08T10:30:00.000Z' },
    insureon: { home: page('https://www.insureon.com/') },
    techinsurance: { home: page('https://www.techinsurance.com/') },
  };
}

/** Same shape as the baseline for TechInsurance, with the fixed rules cleared. */
const after = withRules({ region: 324, 'link-in-text-block': 179, 'color-contrast': 34 });

const extended = latestRun(runs) as Run;

test('the extended probes measure what axe structurally cannot', () => {
  // The whole point of the probe rewrite. Insureon's back control is a <div>,
  // so axe's button-name rule reads 0 on a site that has fifty of them. If
  // this ever goes back to zero, the probe has regressed — check that before
  // believing the sites were fixed.
  assert.ok(extended, 'no run on file');
  assert.equal(ruleTotals(extended, 'insureon')['button-name'] ?? 0, 0, 'axe still cannot see them');
  assert.equal(ghostControlCount(extended, 'insureon', 'backButton'), 50);

  // The hamburger: one per page, both brands, invisible to every audit.
  assert.equal(ghostControlCount(extended, 'insureon', 'menu'), 10);
  assert.equal(ghostControlCount(extended, 'techinsurance', 'menu'), 10);

  // Generalised panel probe reproduces the hardcoded mega-menu reading.
  assert.equal(phantomFocusable(extended, 'insureon'), 68);
  assert.equal(phantomFocusable(extended, 'techinsurance'), 69);

  // And finds more than the mega-menu, which the old selector never could.
  assert.ok(hiddenPanelStats(extended, 'insureon').panels > 10);
  assert.ok(clickableNoRoleCount(extended, 'insureon') > 100);
});

test('no page in any run was measured from an error page', () => {
  // Ten stale target URLs once 404'd and were measured as real pages, which
  // read as a 47% improvement. scanPage now rejects non-OK responses, so a
  // moved URL surfaces as a failed page instead of a fake win.
  for (const run of runs) {
    for (const brand of ['insureon', 'techinsurance'] as const) {
      for (const [key, page] of Object.entries(run[brand])) {
        const status = (page as { httpStatus?: number }).httpStatus;
        if (status !== undefined) {
          assert.ok(status < 400, `${run.id} ${brand}/${key} was measured on HTTP ${status}`);
        }
      }
    }
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
    const fingerprint = JSON.stringify([run.insureon, run.techinsurance]);
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
