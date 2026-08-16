import assert from 'node:assert/strict';
import test from 'node:test';

import type { ScannedPage } from './model';
import { matrixCell } from './pageMatrix';

const base: ScannedPage = {
  url: 'https://example.com/',
  violations: [],
  namelessButtons: [],
  namelessLinks: [],
  emptyHref: [],
  hasMain: true,
  phantomMenu: null,
};

test('matrixCell: absent page', () => {
  assert.deepEqual(matrixCell(undefined), { kind: 'absent' });
});

test('matrixCell: failed page carries its error', () => {
  assert.deepEqual(matrixCell({ url: 'https://example.com/x', error: 'HTTP 503' }), {
    kind: 'failed',
    error: 'HTTP 503',
  });
});

test('matrixCell: scanned page sums nodes, counts rules, takes the verdict', () => {
  const page: ScannedPage = {
    ...base,
    violations: [
      { id: 'label', impact: 'critical', n: 2 },
      { id: 'region', impact: 'moderate', n: 41 },
    ],
  };
  assert.deepEqual(matrixCell(page), { kind: 'scanned', nodes: 43, rules: 2, verdict: 'blocking' });
});

/**
 * `phantomMenu: null` is a measurement, not a gap: the page was looked at and
 * holds no off-screen panel, so `phantomPanelState` answers `'none'` and the
 * verdict turns on the violations alone. (A run that never recorded the field
 * at all is the unmeasured case, and `verdictForPage` refuses to certify it.)
 */
test('matrixCell: a serious violation and no phantom panel is needs-work', () => {
  const page: ScannedPage = {
    ...base,
    violations: [{ id: 'link-name', impact: 'serious', n: 3 }],
  };
  assert.deepEqual(matrixCell(page), {
    kind: 'scanned',
    nodes: 3,
    rules: 1,
    verdict: 'needs-work',
  });
});

test('matrixCell: no violations and no phantom panel is clear', () => {
  assert.deepEqual(matrixCell(base), { kind: 'scanned', nodes: 0, rules: 0, verdict: 'clear' });
});

/**
 * A page whose `violations` never made it into the file. Absent is not the
 * same as empty, but nothing here can tell them apart — what matters is that
 * it sums to zero rather than throwing.
 */
test('matrixCell: a page with no violations field counts nothing', () => {
  const page = { ...base, violations: undefined } as unknown as ScannedPage;
  assert.deepEqual(matrixCell(page), { kind: 'scanned', nodes: 0, rules: 0, verdict: 'clear' });
});
