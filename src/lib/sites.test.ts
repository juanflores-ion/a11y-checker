import assert from 'node:assert/strict';
import test from 'node:test';

import { SITES, stagingTwin } from './sites';

test('staging twin keeps the path and swaps the origin', () => {
  assert.equal(
    stagingTwin('insureon', 'https://www.insureon.com/small-business-insurance/general-liability'),
    'https://cd-preview.ion.staging.forsureon.com/small-business-insurance/general-liability'
  );
  assert.equal(
    stagingTwin('techinsurance', 'https://www.techinsurance.com/'),
    'https://cd-preview.tig.staging.forsureon.com/'
  );
});

test('staging twin keeps a query string', () => {
  assert.equal(
    stagingTwin('insureon', 'https://www.insureon.com/contact-us?x=1'),
    'https://cd-preview.ion.staging.forsureon.com/contact-us?x=1'
  );
});

test('staging twin is null when there is nothing to swap to', () => {
  const original = SITES.insureon.staging;
  SITES.insureon.staging = null;
  assert.equal(stagingTwin('insureon', 'https://www.insureon.com/'), null);
  SITES.insureon.staging = original;
  assert.equal(stagingTwin('insureon', 'not a url'), null);
});
