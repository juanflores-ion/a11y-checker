import assert from 'node:assert/strict';
import test from 'node:test';

import { environmentPair, variantFigures } from './howItWorks';
import type { Run, ScannedPage } from './model';

const v = (id: string, n: number) => ({ id, impact: 'moderate', n });

const page = (url: string, violations: Array<{ id: string; impact: string; n: number }>, extra: object = {}) =>
  ({ url, violations, namelessButtons: [], namelessLinks: [], emptyHref: [], hasMain: true, phantomMenu: null, ...extra }) as unknown as ScannedPage;

/** The real shape of the 19 Aug production homepage: A of record, B and C beside it. */
const HOME = page('https://www.insureon.com/', [v('label', 2), v('region', 41), v('link-in-text-block', 4)], {
  identity: { key: 'homepage-variant', value: 'Variant A' },
  identityAttempts: 3,
  variants: {
    'Variant B': page('https://www.insureon.com/', [v('region', 26), v('landmark-one-main', 2)]),
    'Variant C': page('https://www.insureon.com/', [v('region', 60), v('label', 8)]),
  },
});

test('a page with no identity has no variant figure to show', () => {
  assert.equal(variantFigures(page('https://x/', [v('region', 3)])), null);
});

test('the page of record comes first, is marked, and carries its own totals', () => {
  const figures = variantFigures(HOME);
  assert.ok(figures);
  assert.equal(figures[0].name, 'Variant A');
  assert.equal(figures[0].ofRecord, true);
  assert.equal(figures[0].failing, 47);
  assert.equal(figures[0].rules, 3);
});

test('each variant is totalled from its own violations, never from the record', () => {
  const figures = variantFigures(HOME)!;
  assert.deepEqual(
    figures.map((f) => [f.name, f.failing]),
    [
      ['Variant A', 47],
      ['Variant B', 28],
      ['Variant C', 68],
    ]
  );
  assert.deepEqual(figures.map((f) => f.ofRecord), [true, false, false]);
});

test('an identified page that served only itself still reports the one variant', () => {
  const only = page('https://x/', [v('region', 5)], { identity: { key: 'k', value: 'Variant A' } });
  assert.deepEqual(variantFigures(only), [{ name: 'Variant A', failing: 5, rules: 1, ofRecord: true }]);
});

test('a page asked and unable to tell reports no variants rather than guessing a name', () => {
  const unknown = page('https://x/', [v('region', 5)], { identity: { key: 'k', value: null } });
  assert.equal(variantFigures(unknown), null);
});

/* ------------------------------ environments ------------------------------ */

const run = (id: string, environment: string, home: ScannedPage | null): Run =>
  ({
    id,
    environment,
    meta: { startedAt: `2026-08-19T10:00:00.000Z` },
    insureon: home ? { home } : {},
    techinsurance: {},
    byViewport: { desktop: { insureon: home ? { home } : {}, techinsurance: {} } },
    viewports: ['desktop'],
    primaryViewport: 'desktop',
  }) as unknown as Run;

test('the pair is the latest production run against the latest staging one', () => {
  const pair = environmentPair([
    run('old-prod', 'production', page('https://www.insureon.com/', [v('region', 90)])),
    run('prod', 'production', HOME),
    run('staging', 'staging', page('https://cd-preview.ion.staging.forsureon.com/', [v('region', 26), v('landmark-one-main', 2)], {
      identity: { key: 'homepage-variant', value: 'Variant B' },
    })),
  ]);
  assert.ok(pair);
  assert.deepEqual(pair.production, { runId: 'prod', variant: 'Variant A', failing: 47 });
  assert.deepEqual(pair.staging, { runId: 'staging', variant: 'Variant B', failing: 28 });
});

test('a missing side is null — the picture says so rather than inventing one', () => {
  const pair = environmentPair([run('prod', 'production', HOME)]);
  assert.ok(pair);
  assert.equal(pair.staging, null);
  assert.ok(pair.production);
});

test('no runs at all means no pair', () => {
  assert.equal(environmentPair([]), null);
});

test('a run whose homepage failed to scan contributes nothing, never a zero', () => {
  const failed = { url: 'https://x/', error: 'net::ERR_FAILED' } as unknown as ScannedPage;
  const pair = environmentPair([run('prod', 'production', failed)]);
  assert.equal(pair, null);
});
