import assert from 'node:assert/strict';
import test from 'node:test';

import { environmentOfPages, environmentOfRun, environmentOfUrl } from './environment';
import type { PageResult } from './model';

const p = (url: string) => ({ url, violations: [] }) as unknown as PageResult;

test('production and staging hosts are told apart', () => {
  assert.equal(environmentOfUrl('https://www.insureon.com/contact-us'), 'production');
  assert.equal(environmentOfUrl('https://www.techinsurance.com/'), 'production');
  assert.equal(environmentOfUrl('https://cd-preview.ion.staging.forsureon.com/'), 'staging');
  assert.equal(environmentOfUrl('https://cd-preview.tig.staging.forsureon.com/about-us'), 'staging');
});

test('a host we do not track is unknown, never guessed', () => {
  assert.equal(environmentOfUrl('https://example.com/'), 'unknown');
  assert.equal(environmentOfUrl('not a url'), 'unknown');
});

test('a run that touched both deployments is mixed — never collapsed into one', () => {
  assert.equal(
    environmentOfPages([p('https://www.insureon.com/'), p('https://cd-preview.ion.staging.forsureon.com/')]),
    'mixed'
  );
});

test('unknown hosts do not drag a clean run into mixed', () => {
  assert.equal(environmentOfPages([p('https://www.insureon.com/'), p('https://example.com/')]), 'production');
  assert.equal(environmentOfPages([]), 'unknown');
});

test('a whole run is read across every brand and viewport it holds', () => {
  const run = {
    desktop: {
      insureon: { home: p('https://cd-preview.ion.staging.forsureon.com/') },
      techinsurance: { home: p('https://cd-preview.tig.staging.forsureon.com/') },
    },
    mobile: {
      insureon: { home: p('https://cd-preview.ion.staging.forsureon.com/') },
      techinsurance: {},
    },
  };
  assert.equal(environmentOfRun(run as never), 'staging');
});
