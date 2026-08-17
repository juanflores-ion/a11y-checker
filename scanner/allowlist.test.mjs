import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hostAllowed, parseAllowedHosts, trackedHosts } from './allowlist.mjs';

test('tracked hosts are the two brands, without www', () => {
  assert.deepEqual(trackedHosts().sort(), ['insureon.com', 'techinsurance.com']);
});

test('SCAN_ALLOWED_HOSTS adds hosts; origins and URLs are reduced to their host', () => {
  const allowed = parseAllowedHosts(
    ' staging.insureon.com, https://Preview.TechInsurance.com/some/path ,, insureon.com',
    ['insureon.com']
  );
  assert.deepEqual(allowed, ['insureon.com', 'staging.insureon.com', 'preview.techinsurance.com']);
});

test('unset or empty configuration leaves only the tracked hosts', () => {
  assert.deepEqual(parseAllowedHosts(undefined, ['a.test']), ['a.test']);
  assert.deepEqual(parseAllowedHosts('', ['a.test']), ['a.test']);
});

test('a host is allowed exactly or as a subdomain, never as a lookalike', () => {
  const allowed = ['insureon.com'];
  assert.equal(hostAllowed('insureon.com', allowed), true);
  assert.equal(hostAllowed('WWW.Insureon.com', allowed), true);
  assert.equal(hostAllowed('staging.insureon.com', allowed), true);
  assert.equal(hostAllowed('insureon.com.evil.test', allowed), false);
  assert.equal(hostAllowed('notinsureon.com', allowed), false);
  assert.equal(hostAllowed('169.254.169.254', allowed), false);
  assert.equal(hostAllowed('localhost', allowed), false);
});

test('an empty allowlist allows nothing', () => {
  assert.equal(hostAllowed('insureon.com', []), false);
});
