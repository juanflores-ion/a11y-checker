import assert from 'node:assert/strict';
import test from 'node:test';

import { diffPages, pairUrls } from './compare';
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

test('a failed scan on either side degrades gracefully instead of throwing', () => {
  const failed = { url: 'https://example.com/', error: 'timed out' };
  const diff = diffPages('a', 'b', failed, page({ violations: [{ id: 'label', impact: 'critical', n: 3 }] }));

  // The failed side contributes zero, not a crash and not a false "resolved".
  assert.equal(diff.totalBefore, 0);
  assert.equal(diff.totalAfter, 3);
  assert.equal(diff.rules[0].status, 'new');
});

test('missing entirely (null) is treated the same as a failed scan', () => {
  const diff = diffPages('a', 'b', null, null);
  assert.equal(diff.totalBefore, 0);
  assert.equal(diff.totalAfter, 0);
  assert.deepEqual(diff.rules, []);
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

  const matched = diffPages('prod', 'staging', before, after, {
    before: 'desktop',
    after: 'desktop',
  });
  assert.equal(matched.viewportMismatch, undefined);

  // Unstated viewports stay unflagged — the older callers pass neither.
  assert.equal(diffPages('prod', 'staging', before, after).viewportMismatch, undefined);
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
