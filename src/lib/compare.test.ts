/**
 * Tests for `compare.ts` — the before/after diffing behind the Compare page.
 *
 * Every input here is constructed inline. Nothing reads a run file, so no
 * assertion in this file can move because a site changed or a probe was
 * rewritten, and none of them needs to be re-pinned when ION's fix lands.
 *
 * Most of what is tested is one rule: **a figure that was never measured is
 * `null`, never 0.** Compare is where that fails most expensively, because the
 * whole screen is subtraction — an absent side scored as zero turns a scan that
 * did not happen into a column of resolved rules or a hundred new violations.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { diffPages, pairUrls, summariseDiff } from './compare';
import type { ScannedPage } from './model';

function page(overrides: Partial<ScannedPage> = {}): ScannedPage {
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

test('a rule that disappears between before and after is "resolved"', () => {
  const before = page({ violations: [{ id: 'button-name', impact: 'critical', n: 5 }] });
  const after = page({ violations: [] });
  const diff = diffPages('prod', 'staging', before, after);

  assert.equal(diff.resolvedCount, 1);
  assert.equal(diff.newCount, 0);
  assert.equal(diff.rules[0].status, 'resolved');
  assert.equal(diff.rules[0].before, 5);
  assert.equal(diff.rules[0].after, 0);
  assert.equal(diff.totalChange, -5);
});

test('a rule that appears for the first time is "new", not "worsened"', () => {
  const before = page({ violations: [] });
  const after = page({ violations: [{ id: 'label', impact: 'critical', n: 2 }] });
  const diff = diffPages('prod', 'staging', before, after);

  assert.equal(diff.rules[0].status, 'new');
  assert.equal(diff.newCount, 1);
  assert.equal(diff.totalChange, 2);
});

test('a rule present on both sides is improved, worsened, or unchanged — never resolved/new', () => {
  const shrinking = diffPages(
    'a',
    'b',
    page({ violations: [{ id: 'region', impact: 'moderate', n: 10 }] }),
    page({ violations: [{ id: 'region', impact: 'moderate', n: 4 }] })
  );
  assert.equal(shrinking.rules[0].status, 'improved');

  const growing = diffPages(
    'a',
    'b',
    page({ violations: [{ id: 'region', impact: 'moderate', n: 4 }] }),
    page({ violations: [{ id: 'region', impact: 'moderate', n: 10 }] })
  );
  assert.equal(growing.rules[0].status, 'worsened');

  const flat = diffPages(
    'a',
    'b',
    page({ violations: [{ id: 'region', impact: 'moderate', n: 4 }] }),
    page({ violations: [{ id: 'region', impact: 'moderate', n: 4 }] })
  );
  assert.equal(flat.rules[0].status, 'unchanged');
  assert.equal(flat.totalChange, 0);
});

test('resolved and new rules sort ahead of improved/worsened/unchanged', () => {
  const diff = diffPages(
    'a',
    'b',
    page({
      violations: [
        { id: 'unchanged-rule', impact: 'minor', n: 1 },
        { id: 'resolved-rule', impact: 'critical', n: 9 },
        { id: 'worsened-rule', impact: 'serious', n: 2 },
      ],
    }),
    page({
      violations: [
        { id: 'unchanged-rule', impact: 'minor', n: 1 },
        { id: 'worsened-rule', impact: 'serious', n: 6 },
        { id: 'new-rule', impact: 'critical', n: 3 },
      ],
    })
  );

  assert.deepEqual(
    diff.rules.map((r) => r.status),
    ['resolved', 'new', 'worsened', 'unchanged']
  );
});

test('a failed scan on either side reports the absence rather than a zero', () => {
  /**
   * This test used to assert `totalBefore === 0`, and that assertion was the
   * 10 Aug false-clean written down as a requirement.
   *
   * A scan that failed measured nothing. Scoring it zero produces "0 → 120",
   * which reads as 120 new violations rather than as a measurement that never
   * happened — and it renders directly underneath the notice saying the scan
   * failed. Worse in the other direction: with the *after* side failed, every
   * rule the before side found came back "Resolved", a screen full of green
   * produced by a scan that never ran.
   *
   * "Degrades gracefully" means it reports the absence. It does not mean it
   * substitutes a zero and carries on.
   */
  const failed = { url: 'https://example.com/', error: 'timed out' };
  const diff = diffPages('a', 'b', failed, page({ violations: [{ id: 'label', impact: 'critical', n: 3 }] }));

  assert.equal(diff.totalBefore, null, 'a failed scan is not a clean page');
  assert.equal(diff.totalAfter, 3, 'the side that did scan still reports its number');
  assert.equal(diff.totalChange, null, 'there is nothing to subtract from what');
  assert.equal(diff.notComparable, 'not-measured');

  // Every cross-side figure is withheld, not computed against the gap.
  assert.deepEqual(diff.rules, [], 'no rule may be called new or resolved against a scan that failed');
  assert.equal(diff.resolvedCount, null, '"0 resolved" would read as news');
  assert.equal(diff.newCount, null);
});

test('missing entirely (null) is treated the same as a failed scan', () => {
  // Compare hits this mid-deploy, when one side is still queued or the request
  // cap was reached. Not-yet-measured and failed-to-measure are the same
  // answer: nobody looked.
  const diff = diffPages('a', 'b', null, null);
  assert.equal(diff.totalBefore, null);
  assert.equal(diff.totalAfter, null);
  assert.equal(diff.totalChange, null);
  assert.deepEqual(diff.rules, []);
  assert.equal(diff.notComparable, 'not-measured');
});

test('a scanner that predates a check reports nothing, not zero', () => {
  /**
   * §8 bug 8, and the one that had shipped: `unannouncedLinks ?? 0` treated
   * "this check did not exist" as "this check found none".
   *
   * It is reachable from the UI, not only from history — the Scanner control
   * on Compare accepts any address, so a local server running older probe code
   * returns a page with no `unreachableTotals` at all. Both sides scanned
   * cleanly, both sides report zero unfindable links, and the headline figure
   * of the whole tool reads clean because nothing looked.
   */
  const diff = diffPages('prod', 'staging', page(), page());

  assert.equal(diff.unfindableBefore, null, 'nothing counted unfindable links here');
  assert.equal(diff.unfindableAfter, null);

  // The contrast: a page that *was* measured and found none reports the zero,
  // because that is a measurement.
  const measured = page({
    unreachableTotals: { panels: 0, unannouncedPanels: 0, unannouncedFocusable: 0, unannouncedLinks: 0 },
  });
  const real = diffPages('prod', 'staging', measured, measured);
  assert.equal(real.unfindableBefore, 0);
  assert.equal(real.unfindableAfter, 0);
});

test('a scanned page with no closed menu reports zero phantom controls, not null', () => {
  // The other half of the same rule, and the reason `phantom` and `unfindable`
  // read their absences differently. `phantomMenu: null` on a scanned page is
  // a real reading — the scanner looked and there is no such region — so zero
  // is the honest answer. Only an unmeasured side is null.
  const diff = diffPages('prod', 'staging', page({ phantomMenu: null }), null);
  assert.equal(diff.phantomBefore, 0, 'looked, and there is no closed menu');
  assert.equal(diff.phantomAfter, null, 'nobody looked');
});

test('phantom-menu focusable count is compared independently of axe violations', () => {
  const diff = diffPages(
    'a',
    'b',
    page({ phantomMenu: { transform: null, display: 'block', visibility: 'visible', ariaHidden: null, inert: false, pointerEvents: 'none', exposedInTree: true, links: 10, buttons: 0, focusable: 10, tabbable: 10 } }),
    page({ phantomMenu: null })
  );
  assert.equal(diff.phantomBefore, 10);
  assert.equal(diff.phantomAfter, 0);
});

test('pairUrls pairs by line position and tolerates uneven lists', () => {
  assert.deepEqual(pairUrls(['a', 'b'], ['x', 'y']), [
    { beforeUrl: 'a', afterUrl: 'x' },
    { beforeUrl: 'b', afterUrl: 'y' },
  ]);
  assert.deepEqual(pairUrls(['a', 'b', 'c'], ['x']), [
    { beforeUrl: 'a', afterUrl: 'x' },
    { beforeUrl: 'b', afterUrl: null },
    { beforeUrl: 'c', afterUrl: null },
  ]);
  assert.deepEqual(pairUrls([], []), []);
});

test('a diff taken across two device profiles is flagged, not quietly reported', () => {
  // These sites serve different markup per device, so a before/after taken at
  // two profiles compares two different pages — the desktop nav alone accounts
  // for roughly 56 links. The UI applies one profile to both sides, so this
  // should never fire in practice; it exists because "compared the wrong two
  // things and reported a confident number" is the failure this tool keeps
  // having to design out.
  const before = page({ navLinks: { total: 70, inTree: 70 } });
  const after = page({ navLinks: { total: 63, inTree: 7 } });

  const mismatched = diffPages('prod', 'staging', before, after, {
    before: 'mobile',
    after: 'desktop',
  });
  assert.deepEqual(mismatched.viewportMismatch, { before: 'mobile', after: 'desktop' });

  // And it is not merely flagged: every cross-side figure is withheld. A
  // mismatched diff has a row for each rule and every one of them is noise.
  assert.equal(mismatched.notComparable, 'viewport-mismatch');
  assert.deepEqual(mismatched.rules, []);
  assert.equal(mismatched.totalChange, null);
  assert.equal(mismatched.resolvedCount, null);
  // The per-side figures survive, because each was measured — it is the
  // subtraction between them that means nothing.
  assert.equal(mismatched.unfindableBefore, null);
  assert.equal(mismatched.viewports.before, 'mobile');

  const matched = diffPages('prod', 'staging', before, after, {
    before: 'desktop',
    after: 'desktop',
  });
  assert.equal(matched.viewportMismatch, undefined);
  assert.equal(matched.notComparable, undefined);

  // Unstated viewports stay unflagged — the older callers pass neither. That
  // is why `viewports` is on the diff: the screen says whether the guard was
  // armed, rather than leaving it to a code reading.
  const unstated = diffPages('prod', 'staging', before, after);
  assert.equal(unstated.viewportMismatch, undefined);
  assert.deepEqual(unstated.viewports, { before: null, after: null });
});

test('links an agent cannot find are diffed alongside the rule counts', () => {
  // The desktop failure mode is invisible to axe: the links are in the DOM and
  // out of the accessibility tree, so no rule fires on them. Without this the
  // fix that matters most would show up as "no change".
  const before = page({
    navLinks: { total: 63, inTree: 7 },
    unreachableTotals: {
      panels: 5,
      unannouncedPanels: 5,
      unannouncedFocusable: 56,
      unannouncedLinks: 56,
    },
  });
  const after = page({
    navLinks: { total: 63, inTree: 63 },
    unreachableTotals: {
      panels: 0,
      unannouncedPanels: 0,
      unannouncedFocusable: 0,
      unannouncedLinks: 0,
    },
  });
  const diff = diffPages('prod', 'staging', before, after);

  assert.equal(diff.unfindableBefore, 56);
  assert.equal(diff.unfindableAfter, 0);
});

test('a menu hidden behind a real disclosure button is not a regression', () => {
  /**
   * The exact shape of Insureon's fixed mobile build, measured 11 Aug 2026.
   *
   * Before: the closed drawer's 68 links sat *in* the accessibility tree,
   * off-screen and tabbable — 68 dead controls. After: the drawer is properly
   * hidden, so those links leave the tree, and a real <button> announces it.
   * That is the fix working exactly as intended.
   *
   * Counting "links out of the tree" would score that as 0 -> 68 and report a
   * completed fix as a catastrophic regression. It genuinely did, which is why
   * this test exists. Only unannounced content counts.
   */
  const before = page({
    navLinks: { total: 70, inTree: 70 },
    phantomMenu: {
      transform: null, display: 'block', visibility: 'visible', ariaHidden: null,
      inert: false, pointerEvents: 'none', exposedInTree: true,
      links: 68, buttons: 0, focusable: 68, tabbable: 68,
    },
    unreachableTotals: {
      panels: 0, unannouncedPanels: 0, unannouncedFocusable: 0, unannouncedLinks: 0,
    },
  });
  const after = page({
    navLinks: { total: 70, inTree: 2 },
    phantomMenu: null,
    unreachableTotals: {
      // One panel, out of the tree — but announced, so nothing is unfindable.
      panels: 1, unannouncedPanels: 0, unannouncedFocusable: 0, unannouncedLinks: 0,
    },
  });
  const diff = diffPages('prod', 'staging', before, after);

  assert.equal(diff.unfindableBefore, 0);
  assert.equal(diff.unfindableAfter, 0, 'an announced panel must never count as unfindable');
  // And the defect that actually got fixed shows up as fixed.
  assert.equal(diff.phantomBefore, 68);
  assert.equal(diff.phantomAfter, 0);
});

/**
 * ── Page identity ────────────────────────────────────────────────────────
 *
 * A URL is assumed to name a page. Insureon's homepage is one Sitecore item
 * under a content test and returns one of three materially different documents
 * from the same URL — measured 13 Aug 2026 at 971, 893 and 1191 DOM nodes,
 * each internally byte-stable. Diffing two of them reports every difference
 * between two designs as a change somebody made.
 *
 * This is `viewportMismatch`'s twin, and the tests below are the same shape,
 * because the failure is the same one: comparing the wrong two things and
 * printing a confident number.
 */
const ident = (value: string | null) => ({ key: 'homepage-variant', value });

test('two sides that served different documents are not comparable', () => {
  const before = page({
    identity: ident('Homepage-Hero-V2'),
    violations: [{ id: 'link-name', impact: 'serious', n: 4 }],
  });
  const after = page({
    identity: ident('Homepage-Hero-V3'),
    violations: [{ id: 'link-name', impact: 'serious', n: 9 }],
  });
  const diff = diffPages('a', 'b', before, after);

  assert.equal(diff.notComparable, 'identity-mismatch');
  assert.equal(diff.identityMismatch?.before?.value, 'Homepage-Hero-V2');
  assert.equal(diff.identityMismatch?.after?.value, 'Homepage-Hero-V3');
  // And no figure survives, exactly as with a cross-viewport pair. "+5 link-name"
  // here would be a property of the two designs, not of anything anyone did.
  assert.deepEqual(diff.rules, []);
  assert.equal(diff.totalChange, null);
  assert.equal(diff.resolvedCount, null);
  assert.equal(diff.newCount, null);
});

test('two sides that served the same document compare normally', () => {
  const before = page({
    identity: ident('Homepage-Hero-V3'),
    violations: [{ id: 'link-name', impact: 'serious', n: 4 }],
  });
  const after = page({ identity: ident('Homepage-Hero-V3'), violations: [] });
  const diff = diffPages('a', 'b', before, after);

  assert.equal(diff.notComparable, undefined);
  assert.equal(diff.identityMismatch, undefined);
  assert.equal(diff.rules[0].status, 'resolved');
});

test('pages that declare no identity are unaffected', () => {
  // Nineteen of the twenty targets are in this case, so the guard has to cost
  // nothing where it buys nothing.
  const diff = diffPages('a', 'b', page({}), page({}));
  assert.equal(diff.notComparable, undefined);
  assert.equal(diff.identityMismatch, undefined);
});

test('an unidentifiable page never matches another unidentifiable page', () => {
  /**
   * The whole point. Two pages that were both asked and could not answer are
   * two unknowns, not a match — treating them as equal is how a diff of
   * variant A against variant C would render as a confident delta. Absence of
   * a measurement is not a value, here as everywhere else in this codebase.
   */
  const diff = diffPages('a', 'b', page({ identity: ident(null) }), page({ identity: ident(null) }));
  assert.equal(diff.notComparable, 'identity-mismatch');
});

test('one side identified and the other not is not comparable', () => {
  const diff = diffPages('a', 'b', page({ identity: ident('Homepage-Hero-V2') }), page({}));
  assert.equal(diff.notComparable, 'identity-mismatch');
});

test('an unmeasured side reports not-measured, not identity-mismatch', () => {
  // A failed scan has no identity to disagree about, and "a side was never
  // measured" is the truer reason to show a reader.
  const diff = diffPages('a', 'b', page({ identity: ident('Homepage-Hero-V2') }), {
    url: 'b',
    error: 'HTTP 503',
  });
  assert.equal(diff.notComparable, 'not-measured');
});

/* ------------------------------------------------------------------ */
/* The verdict a reader sees at the top of the card                    */
/* ------------------------------------------------------------------ */

test('fewer failing elements reads as better, and says by how many', () => {
  const before = page({ violations: [{ id: 'region', impact: 'moderate', n: 66 }] });
  const after = page({ violations: [{ id: 'region', impact: 'moderate', n: 26 }] });
  const s = summariseDiff(diffPages('prod', 'staging', before, after));

  assert.equal(s.verdict, 'better');
  assert.equal(s.headline, '40 fewer failing elements after the fix');
  assert.match(s.detail, /1 check improved/);
  assert.equal(s.moved.length, 1);
  assert.equal(s.moved[0].change, -40);
  assert.equal(s.stillThere.length, 0);
});

test('one more failing element is singular, and reads as worse', () => {
  const before = page({ violations: [{ id: 'region', impact: 'moderate', n: 1 }] });
  const after = page({ violations: [{ id: 'region', impact: 'moderate', n: 2 }] });
  const s = summariseDiff(diffPages('prod', 'staging', before, after));

  assert.equal(s.verdict, 'worse');
  assert.equal(s.headline, '1 more failing element after the fix');
});

test('a check that did not move is "still there", not "moved"', () => {
  const v = [{ id: 'region', impact: 'moderate' as const, n: 4 }];
  const s = summariseDiff(diffPages('prod', 'staging', page({ violations: v }), page({ violations: v })));

  assert.equal(s.verdict, 'same');
  assert.equal(s.headline, 'No change in failing elements');
  assert.equal(s.moved.length, 0);
  assert.deepEqual(s.stillThere.map((l) => [l.key, l.after]), [['region', 4]]);
});

test('the empty case is stated, never left to be inferred', () => {
  const before = page({ violations: [{ id: 'region', impact: 'moderate', n: 3 }] });
  const after = page({ violations: [{ id: 'region', impact: 'moderate', n: 1 }] });
  assert.match(summariseDiff(diffPages('p', 's', before, after)).detail, /nothing new appeared/);

  const withNew = page({ violations: [{ id: 'region', impact: 'moderate', n: 1 }, { id: 'label', impact: 'critical', n: 2 }] });
  assert.match(summariseDiff(diffPages('p', 's', before, withNew)).detail, /1 new check failing/);
});

test('a pair that cannot be compared gets no verdict at all', () => {
  const failed = page({ url: 'https://s/', error: 'timeout' } as never);
  const s = summariseDiff(diffPages('prod', 'staging', page(), failed));

  assert.equal(s.verdict, 'unknown');
  assert.equal(s.headline, '');
  assert.deepEqual([s.moved, s.stillThere], [[], []]);
});

test('the headline metric rides with the rules, on whichever list fits', () => {
  const before = page({ unreachableTotals: { unannouncedLinks: 9 } } as never);
  const after = page({ unreachableTotals: { unannouncedLinks: 2 } } as never);
  const moved = summariseDiff(diffPages('p', 's', before, after)).moved;
  assert.ok(moved.some((l) => l.key === 'unfindable-links' && l.change === -7), JSON.stringify(moved));
});
