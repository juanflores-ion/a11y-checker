import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetMemory,
  readPublished,
  validateAddress,
  validatePublish,
  writePublished,
} from './scannerEndpoint';

test('a tunnel or one of our own hosts may be published', () => {
  assert.deepEqual(validateAddress('https://x-y-z.trycloudflare.com'), {
    address: 'https://x-y-z.trycloudflare.com',
  });
  assert.deepEqual(validateAddress('https://scanner.forsureon.com/'), {
    address: 'https://scanner.forsureon.com',
  });
  assert.deepEqual(validateAddress('http://localhost:4790'), { address: 'http://localhost:4790' });
});

test('a published address is an origin, never a path', () => {
  assert.deepEqual(validateAddress('https://a.trycloudflare.com/scan?x=1'), {
    address: 'https://a.trycloudflare.com',
  });
});

test('anything else is refused — a published address steers other people’s browsers', () => {
  for (const bad of [
    'https://evil.test',
    'http://x-y-z.trycloudflare.com', // http, and not loopback
    'https://trycloudflare.com.evil.test',
    'not a url',
    '',
    undefined,
  ]) {
    assert.ok('error' in validateAddress(bad), `should refuse ${String(bad)}`);
  }
});

test('publish carries the token and stamps the time', () => {
  const parsed = validatePublish({ address: 'https://a.trycloudflare.com', token: 'abc', note: 'laptop' });
  assert.ok(!('error' in parsed));
  if ('error' in parsed) return;
  assert.equal(parsed.token, 'abc');
  assert.equal(parsed.note, 'laptop');
  assert.ok(Date.parse(parsed.publishedAt) > 0);
});

test('a missing token publishes as empty, not undefined — local mode has none', () => {
  const parsed = validatePublish({ address: 'https://a.trycloudflare.com' });
  assert.ok(!('error' in parsed));
  if ('error' in parsed) return;
  assert.equal(parsed.token, '');
});

test('non-string token or note is refused rather than coerced', () => {
  assert.ok('error' in validatePublish({ address: 'https://a.trycloudflare.com', token: 42 }));
  assert.ok('error' in validatePublish({ address: 'https://a.trycloudflare.com', note: {} }));
});

test('the memory store round-trips, and starts empty', async () => {
  __resetMemory();
  assert.equal(await readPublished(), null);
  const value = {
    address: 'https://a.trycloudflare.com',
    token: 't',
    publishedAt: new Date().toISOString(),
  };
  assert.equal(await writePublished(value), true);
  assert.deepEqual(await readPublished(), value);
  __resetMemory();
});
