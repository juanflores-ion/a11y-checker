import assert from 'node:assert/strict';
import test from 'node:test';

import { cellTone, formatCount } from './format';

test('cellTone: not measured beats everything', () => {
  assert.equal(cellTone({ value: 0, target: 0, notMeasured: true }), 'na');
  assert.equal(cellTone({ value: 5, target: 0, notMeasured: true, misleadingZero: true }), 'na');
});

test('cellTone: a misleading zero is n/m, never ok', () => {
  assert.equal(cellTone({ value: 0, target: 0, misleadingZero: true }), 'nm');
});

test('cellTone: target met is ok, missed is bad', () => {
  assert.equal(cellTone({ value: 0, target: 0 }), 'ok');
  assert.equal(cellTone({ value: 3, target: 0 }), 'bad');
});

test('cellTone: higher-is-better ratios compare against the target', () => {
  assert.equal(cellTone({ value: 10, target: 10, higherIsBetter: true }), 'ok');
  assert.equal(cellTone({ value: 0, target: 10, higherIsBetter: true }), 'bad');
});

test('cellTone: no target is neutral whatever the value', () => {
  assert.equal(cellTone({ value: 0, target: null }), 'neutral');
  assert.equal(cellTone({ value: 285, target: null }), 'neutral');
});

test('formatCount: ratios only when higher is better and there is a target', () => {
  assert.equal(formatCount(7, 10, true), '7/10');
  assert.equal(formatCount(7, 0, false), '7');
  assert.equal(formatCount(1234, null), '1,234');
});
