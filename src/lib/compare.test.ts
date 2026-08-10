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
