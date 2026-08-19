import assert from 'node:assert/strict';
import test from 'node:test';

import { diffPages } from './compare';
import { findingsForDiff, findingsForPage } from './findings';
import type { PageResult, ScannedPage } from './model';

const sample = (selector: string, html: string) => ({ t: [selector], h: html });

const page = (violations: ScannedPage['violations']): ScannedPage =>
  ({
    url: 'https://www.insureon.com/',
    violations,
    namelessButtons: [],
    namelessLinks: [],
    emptyHref: [],
    hasMain: true,
    phantomMenu: null,
  }) as unknown as ScannedPage;

const HOME = page([
  { id: 'label', impact: 'critical', n: 2, sample: [sample('#a', '<input>'), sample('#b', '<input>')] },
  { id: 'region', impact: 'moderate', n: 41, sample: [sample('h1', '<h1>')] },
]);

test('a page with no rule failures has no findings', () => {
  assert.deepEqual(findingsForPage(page([])), []);
});

test('a finding carries the catalogue label, impact, count and its samples', () => {
  const [first] = findingsForPage(HOME);
  assert.equal(first.ruleId, 'label');
  assert.equal(first.label, 'Form fields with no label');
  assert.equal(first.impact, 'critical');
  assert.equal(first.sides.kind, 'single');
  assert.equal(first.sides.kind === 'single' && first.sides.only.count, 2);
  assert.deepEqual(first.sides.kind === 'single' && first.sides.only.samples, [
    { selector: '#a', html: '<input>' },
    { selector: '#b', html: '<input>' },
  ]);
});

test('a rule the catalogue has no copy for keeps its axe id and does not throw', () => {
  const [only] = findingsForPage(page([{ id: 'frame-title', impact: 'serious', n: 1 }]));
  assert.equal(only.label, 'frame-title');
  assert.equal(only.impact, 'moderate');
  assert.deepEqual(only.sides.kind === 'single' && only.sides.only.samples, []);
});

test('a sample with no selector records null rather than an invented one', () => {
  const [only] = findingsForPage(page([{ id: 'label', impact: 'critical', n: 1, sample: [{ t: [], h: '<i>' }] }]));
  assert.deepEqual(only.sides.kind === 'single' && only.sides.only.samples, [{ selector: null, html: '<i>' }]);
});

test('page findings are worst first: impact outranks count', () => {
  // region has 41 nodes to link-in-text-block's 1, but serious beats moderate.
  const mixed = page([
    { id: 'region', impact: 'moderate', n: 41 },
    { id: 'link-in-text-block', impact: 'serious', n: 1 },
    { id: 'label', impact: 'critical', n: 2 },
  ]);
  assert.deepEqual(
    findingsForPage(mixed).map((f) => f.ruleId),
    ['label', 'link-in-text-block', 'region']
  );
});

test('within one impact, the bigger count comes first', () => {
  const twoModerate = page([
    { id: 'landmark-one-main', impact: 'moderate', n: 1 },
    { id: 'region', impact: 'moderate', n: 41 },
  ]);
  assert.deepEqual(
    findingsForPage(twoModerate).map((f) => f.ruleId),
    ['region', 'landmark-one-main']
  );
});

/* ------------------------------ comparisons ------------------------------ */

const AFTER = page([{ id: 'region', impact: 'moderate', n: 41, sample: [sample('h1', '<h1>')] }]);

test('a comparison carries both sides, and a fixed rule reports a measured zero', () => {
  const diff = diffPages('https://a/', 'https://b/', HOME, AFTER, { before: 'desktop', after: 'desktop' });
  const fixed = findingsForDiff(diff).find((f) => f.ruleId === 'label');
  assert.ok(fixed);
  assert.equal(fixed.sides.kind, 'pair');
  if (fixed.sides.kind !== 'pair') return;
  assert.equal(fixed.sides.before?.count, 2);
  // Measured and clean is 0 with no samples — not an absent side.
  assert.deepEqual(fixed.sides.after, { count: 0, samples: [] });
});

test('a side that was never measured is null, never a zero', () => {
  const failed = { url: 'https://b/', error: 'net::ERR_FAILED' } as unknown as PageResult;
  const diff = diffPages('https://a/', 'https://b/', HOME, failed);
  for (const finding of findingsForDiff(diff)) {
    assert.equal(finding.sides.kind, 'pair');
    if (finding.sides.kind !== 'pair') continue;
    assert.equal(finding.sides.after, null, `${finding.ruleId} must report the after side as absent`);
    assert.ok(finding.sides.before, `${finding.ruleId} still has its measured before side`);
  }
});

test('an uncomparable pair still lists every rule either side found', () => {
  const failed = { url: 'https://b/', error: 'net::ERR_FAILED' } as unknown as PageResult;
  const diff = diffPages('https://a/', 'https://b/', HOME, failed);
  assert.deepEqual(findingsForDiff(diff).map((f) => f.ruleId).sort(), ['label', 'region']);
});

test('comparison findings follow the table order, so the panel steps in the order shown', () => {
  const diff = diffPages('https://a/', 'https://b/', HOME, AFTER, { before: 'desktop', after: 'desktop' });
  assert.deepEqual(findingsForDiff(diff).map((f) => f.ruleId), diff.rules.map((r) => r.id));
});
