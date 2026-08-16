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
