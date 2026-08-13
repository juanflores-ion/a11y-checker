#!/usr/bin/env node
/**
 * The metamorphic suite.
 *
 *   npm run metamorphic
 *   node scanner/metamorphic/run.mjs --family icon-technique --verbose
 *
 * ── What this replaces, and why ──────────────────────────────────────────
 *
 * A hand-written fixture benchmark, which was the plan until somebody ran the
 * counterfactual: the fixtures a competent engineer would plausibly have written
 * *before* each fault was known, scored against the real pre-fix probe code. The
 * textbook-correct accordion and the textbook-correct mega-menu both came back
 * silent. Best case, one of five faults caught, and the reason is structural
 * rather than a matter of writing better fixtures — the fixture's label and the
 * probe's rule come from the same head, and every one of those faults *was* a
 * gap in that head.
 *
 * So this suite states no expected values. It builds the same component several
 * ways, behaviourally identical and structurally different, and requires the
 * scanner to return the same numbers. Nobody has to know the right answer. The
 * disagreement is the bug — which is not a slogan: it is the only technique in
 * the whole investigation that found an unknown fault with no human label, when
 * five hamburgers differing only in icon technique scored 0, 0, 1, 1, 1.
 *
 * ── How it runs ──────────────────────────────────────────────────────────
 *
 * Generated fixtures, served over a throwaway HTTP server on an ephemeral port,
 * measured through the real `scanPage()` from core.mjs. Not through
 * `collectMeasurements` directly: half of what the analytics families test lives
 * in `confirmClickListeners` in core.mjs, over CDP, outside the probes entirely.
 * A suite that skipped it would be green about code it never ran.
 *
 * ── Known limitations ────────────────────────────────────────────────────
 *
 * A handful of disagreements are real, understood, and not fixable in the file
 * that produces them — `handler-identity` is the standing one. They are listed
 * in `known-limitations.mjs` with their measured values, and this runner treats
 * them as: print, marked, do not fail. Everything else fails as before, and an
 * accepted entry that STOPS reproducing fails too. The reasoning for all of
 * that is in that file's preamble; what matters here is that the acceptance is
 * a data file this code reads, never a flag a family can set on itself.
 *
 * Exit codes: 0 every family agreed, or disagreed only in ways the baseline
 * accepts. 1 a family disagreed, a page went unmeasured, or an accepted
 * limitation went stale. 2 the suite is misconfigured — a family that does not
 * classify every metric, a baseline entry that does not describe a real
 * assertion, or a browser that would not launch. Two and one are separate
 * because they need different responses, and because "the suite could not run"
 * must never be reachable from the same code path as "the suite passed".
 */

import { chromium } from 'playwright';

import { browserProvenance, launchContext, launchOptions, scanPage } from '../core.mjs';
import { FAMILIES, declarationProblems, familyById } from './families.mjs';
import { buildVariant } from './fixtures.mjs';
import {
  NOT_ASSERTED,
  acceptancesFor,
  acceptedDisagreement,
  acceptedPinnedMiss,
  baselineProblems,
  disagreementMatches,
} from './known-limitations.mjs';
import { METRIC_KEYS, compareMetric, measure, metricLabel } from './metrics.mjs';
import { serveFixtures } from './serve.mjs';

/* ------------------------------------------------------------------ */
/* Args                                                                */
/* ------------------------------------------------------------------ */

const USAGE = `
Metamorphic suite — the assertion is agreement, not a value.

  node scanner/metamorphic/run.mjs [--family ID]... [--profile NAME]
                                   [--verbose] [--serve] [--list] [--check]

  --family   Run one family. Repeatable. Default: all of them.
  --profile  Device profile to measure at. Default: desktop, which is what
             agents are served.
  --verbose  Print every metric for every variant, not just the disagreements.
  --serve    Build and serve the fixtures, print their URLs, and stay up so you
             can open one in a browser. Measures nothing.
  --list     List the families and exit.
  --check    Validate the families and the baseline and exit, without a browser
             and without measuring anything. Exit 2 if the suite is
             misconfigured, 0 if it is sound. Seconds, not minutes: this is the
             half that catches an exemption nothing pins or an acceptance with
             no evidence in it, and it is worth running on every push even where
             a browser is not worth installing.

If Chromium will not launch (WSL and some Linux setups are missing libnspr4 and
friends), point it at one that works rather than patching anything:

  PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run metamorphic
`;

function parseArgs(argv) {
  const args = {
    families: [],
    profile: 'desktop',
    verbose: false,
    serve: false,
    list: false,
    check: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--family') args.families.push(argv[++i]);
    else if (arg === '--profile') args.profile = argv[++i];
    else if (arg === '--verbose' || arg === '-v') args.verbose = true;
    else if (arg === '--serve') args.serve = true;
    else if (arg === '--list') args.list = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else return { error: `Unknown argument “${arg}”` };
  }
  return args;
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

const out = (line = '') => process.stdout.write(`${line}\n`);
const progress = (line) => process.stderr.write(`${line}\n`);

/** `null` prints as words, never as a number. It is not a number. */
const show = (value) => {
  if (value === null || value === undefined) return 'not measured';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

const pad = (s, n) => `${s}${' '.repeat(Math.max(0, n - s.length))}`;

/**
 * Wrap prose to the report's width. The reasons in known-limitations.mjs are
 * paragraphs, not labels, and a reason that runs off the side of a terminal is
 * a reason nobody reads — which defeats the entire point of printing it.
 */
function wrap(textBlock, indent, width = 78) {
  const lines = [];
  for (const paragraph of String(textBlock).split('\n\n')) {
    let line = indent;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line.length > indent.length && line.length + 1 + word.length > width) {
        lines.push(line);
        line = indent;
      }
      line += line.length > indent.length ? ` ${word}` : word;
    }
    if (line.trim()) lines.push(line);
  }
  return lines;
}

/** The first paragraph of a reason. The rest is one file away and stays there. */
const firstParagraph = (s) => String(s).split('\n\n')[0];

function reportMetric(key, comparison, indent = '    ') {
  const width = Math.max(...comparison.values.map((v) => v.variant.length));
  const spread =
    comparison.spread === null || comparison.spread === 0 ? '' : `  (spread ${comparison.spread})`;
  out(`${indent}${metricLabel(key)} — ${key}${spread}`);
  const first = comparison.values[0]?.value;
  for (const { variant, value } of comparison.values) {
    const differs = JSON.stringify(value) !== JSON.stringify(first);
    const row = `${indent}  ${pad(variant, width)}  ${pad(show(value), 14)}${differs ? '  <- differs' : ''}`;
    out(row.trimEnd());
  }
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/**
 * Turn the selected families into routes and a flat list of pages to measure.
 * Every variant is built here, before a browser exists, so a generator fault
 * fails fast and costs nothing.
 */
function buildRoutes(families) {
  const routes = new Map();
  const pages = [];
  for (const family of families) {
    for (const variant of family.variants) {
      const dir = `/f/${family.id}/${variant.id}/`;
      const { html, assets } = buildVariant(variant.options);
      routes.set(dir, { body: html, type: 'text/html; charset=utf-8' });
      for (const [name, asset] of assets) {
        routes.set(`${dir}${name}`, { body: asset.body, type: asset.type });
      }
      pages.push({ family: family.id, variant: variant.id, path: dir });
    }
  }
  return { routes, pages };
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(`${args.error}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    out(USAGE);
    return;
  }
  if (args.list) {
    for (const family of FAMILIES) {
      out(`${pad(family.id, 34)}${family.variants.length} variants — ${family.title}`);
    }
    return;
  }

  let families = FAMILIES;
  if (args.families.length > 0) {
    families = args.families.map((id) => {
      const found = familyById(id);
      if (!found) {
        process.stderr.write(
          `Unknown family “${id}”. Known: ${FAMILIES.map((f) => f.id).join(', ')}\n`
        );
        process.exit(2);
      }
      return found;
    });
  }

  /**
   * Declarations first, before anything is measured.
   *
   * A family that does not classify every metric is not a family that fails —
   * it is a family whose result cannot be read at all, because the metrics it
   * forgot are silently not being compared. That is a configuration error and
   * it stops the run.
   */
  const misconfigured = families
    .map((family) => ({ family, problems: declarationProblems(family) }))
    .filter((entry) => entry.problems.length > 0);

  /**
   * The baseline is checked in the same breath and for the same reason.
   *
   * An accepted-failure list is the one file in this suite that can turn a red
   * into a green, so a malformed entry is not a detail — it is a mute switch
   * nobody validated. Checked whole rather than only for the families being
   * run: `--family icon-technique` must still notice that somebody added an
   * entry naming a metric that does not exist.
   */
  const baselineFaults = baselineProblems();

  if (misconfigured.length > 0 || baselineFaults.length > 0) {
    out('SUITE MISCONFIGURED — nothing was measured.');
    out('');
    for (const { family, problems } of misconfigured) {
      out(`  ${family.id}`);
      for (const problem of problems) out(`    ${problem}`);
    }
    if (misconfigured.length > 0) {
      out('');
      out('Every family must name every metric in metrics.mjs exactly once, across');
      out('preserves and pinnedInstead. A metric nobody classified is a metric nobody');
      out('checks — and a metric in pinnedInstead that no variant pins is the same hole');
      out('wearing a justification.');
    }
    if (baselineFaults.length > 0) {
      out('  known-limitations.mjs');
      for (const problem of baselineFaults) out(`    ${problem}`);
      out('');
      out('An accepted failure has to describe a real assertion, name the code it lives in,');
      out('and record what every variant measured. An entry that does not is not an');
      out('acceptance, it is an unreviewed mute.');
    }
    process.exitCode = 2;
    return;
  }

  /**
   * `--check` stops here, and the exit above is the reason it exists.
   *
   * Everything that can turn a red into a green in this suite has now been
   * validated — every family classifies every metric, every exemption is pinned
   * on every variant with values that differ, every accepted failure names an
   * owner, real evidence and the measured value of each variant — and none of it
   * needed a browser or a page. That matters because those checks are the guard
   * against the suite itself, and the last hole in them was found by a reviewer
   * rather than by CI: `mayDiffer` muted a real regression with the word
   * "flaky" and printed AGREE, exit 0.
   *
   * A guard that only runs where Chromium installs cleanly is a guard with a
   * platform dependency it does not need. This half runs in seconds, anywhere.
   */
  if (args.check) {
    const exempted = FAMILIES.reduce((n, f) => n + f.pinnedInstead.length, 0);
    const accepted = acceptancesFor(FAMILIES);
    out('Suite configuration is sound — nothing was measured.');
    out('');
    /**
     * The first line counts the families this invocation selected; the rest
     * count the whole file. That is not an inconsistency, it is what was
     * checked: `declarationProblems` runs on the selection, and
     * `baselineProblems` deliberately runs on everything so that
     * `--family icon-technique` still refuses a bad acceptance elsewhere.
     */
    out(`  ${families.length} selected famil(ies) classify all ${METRIC_KEYS.length} metrics`);
    out(`  ${exempted} metric(s) exempt from comparison, each pinned on every variant`);
    out(
      `  ${accepted.disagreements.length + accepted.pinnedMisses.length} accepted ` +
        `limitation(s), each with an owner, evidence and per-variant values`
    );
    out(`  ${NOT_ASSERTED.length} shape(s) recorded as not asserted`);
    out('');
    out('This says the suite cannot be silently muted. It says nothing about the');
    out('scanner: run it without --check for that.');
    return;
  }

  const { routes, pages } = buildRoutes(families);
  const server = await serveFixtures(routes);

  if (args.serve) {
    out(`Serving ${routes.size} routes at ${server.origin}`);
    out('');
    for (const page of pages) out(`  ${server.origin}${page.path}`);
    out('');
    out('Ctrl-C to stop. Nothing is being measured.');
    await new Promise(() => {});
    return;
  }

  const options = launchOptions();
  let browser;
  try {
    browser = await chromium.launch(options);
  } catch (err) {
    await server.close();
    out('SUITE COULD NOT RUN — no browser.');
    out('');
    out(`  ${String(err.message ?? err).split('\n')[0]}`);
    out('');
    out('  Point it at a Chromium that works rather than patching the scanner:');
    out('    PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run metamorphic');
    process.exitCode = 2;
    return;
  }

  const provenance = browserProvenance(browser, options);
  const started = Date.now();
  const readings = new Map(); // `${family}/${variant}` -> reading
  let axeVersion = null;
  const failedScans = [];

  try {
    const context = await launchContext(browser, args.profile);
    for (const [index, page] of pages.entries()) {
      const label = `${page.family}/${page.variant}`;
      progress(`[${String(index + 1).padStart(2)}/${pages.length}] ${label}`);
      const result = await scanPage(context, `${server.origin}${page.path}`);
      if (result.error) failedScans.push({ label, error: result.error });
      else axeVersion ??= result.axeVersion ?? null;
      readings.set(label, measure(result));
    }
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }

  /* ---------------------------------------------------------------- */
  /* Compare                                                           */
  /* ---------------------------------------------------------------- */

  out('');
  out('Metamorphic suite — the assertion is agreement, not a value');
  out(`  browser     ${provenance.browserVersion ?? 'not recorded'}`);
  out(`  executable  ${provenance.browserPath ?? 'not recorded'}`);
  out(`  axe-core    ${axeVersion ?? 'not recorded'}`);
  out(`  profile     ${args.profile}`);
  out(`  fixtures    ${pages.length} pages, generated`);
  {
    // Printed on every run, whatever the outcome. A baseline that only becomes
    // visible when it fires is one nobody audits.
    const all = acceptancesFor(FAMILIES);
    const accepted = all.disagreements.length + all.pinnedMisses.length;
    out(
      `  baseline    ${accepted} accepted limitation(s), ` +
        `${NOT_ASSERTED.length} shape(s) not asserted`
    );
    /**
     * Exemptions get a number at the top for the same reason the baseline does.
     *
     * `mayDiffer` — the field this replaced — was a mute that appeared nowhere
     * but a footnote inside the family it muted, and a reviewer's spliced
     * regression rode out on exactly that invisibility. A total on the header,
     * across every family and not just the ones this invocation ran, means the
     * count moving is visible in a CI log to somebody who read nothing else.
     */
    const exempted = FAMILIES.reduce((n, f) => n + f.pinnedInstead.length, 0);
    const inFamilies = FAMILIES.filter((f) => f.pinnedInstead.length > 0).length;
    out(
      `  exemptions  ${exempted} metric(s) not compared, pinned per variant instead` +
        (exempted > 0 ? `, in ${inFamilies} famil${inFamilies === 1 ? 'y' : 'ies'}` : '')
    );
  }
  out('');

  const results = [];
  for (const family of families) {
    const familyReadings = family.variants.map((variant) => ({
      variant: variant.id,
      reading: readings.get(`${family.id}/${variant.id}`) ?? measure(null),
    }));

    const disagreed = [];
    const unmeasured = [];
    const agreed = [];
    /** Accepted and reproducing exactly. Printed, marked, and not a failure. */
    const known = [];
    /** Accepted, still disagreeing, but not with the values that were accepted. */
    const drifted = [];
    for (const key of family.preserves) {
      const comparison = compareMetric(familyReadings, key);
      /**
       * Order matters, and this is the one place it carries a rule rather than
       * a preference. `not-measured` is tested first and never consults the
       * baseline: a null is the absence of a measurement, not a disagreement
       * about a page, and nothing in this suite may accept one. A metric that
       * is on the accepted list and comes back unmeasured fails, exactly as it
       * would if the list were empty.
       */
      if (comparison.status === 'not-measured') {
        unmeasured.push({ key, comparison });
        continue;
      }
      if (comparison.status === 'agree') {
        agreed.push({ key, comparison });
        continue;
      }
      const entry = acceptedDisagreement(family.id, key);
      if (!entry) {
        disagreed.push({ key, comparison });
        continue;
      }
      const match = disagreementMatches(entry, comparison);
      if (match.ok) known.push({ key, comparison, entry });
      else drifted.push({ key, comparison, entry, match });
    }

    /**
     * Pinned values, where a family states one.
     *
     * Kept apart from the agreement comparison all the way through — separate
     * list, separate section, separate line in the summary — because they fail
     * for different reasons and want different responses. A disagreement says
     * the scanner answered one page two ways and nobody has to know which is
     * right. A missed expectation says a number somebody wrote down in
     * families.mjs is not what came back, and either the probe regressed or that
     * number was wrong. Blurring the two would let the weaker claim borrow the
     * stronger one's authority.
     */
    const missed = [];
    const knownMissed = [];
    for (const variant of family.variants) {
      const reading = readings.get(`${family.id}/${variant.id}`) ?? measure(null);
      for (const [key, expected] of Object.entries(variant.expects ?? {})) {
        const actual = reading[key];
        if (JSON.stringify(actual) === JSON.stringify(expected)) continue;
        const entry = acceptedPinnedMiss(family.id, variant.id, key);
        // Same rule as above, restated rather than shared because it is the one
        // that must never be relaxed by refactoring: a measurement that did not
        // happen is not a measurement anybody agreed to accept.
        const acceptable =
          entry && actual !== null && JSON.stringify(actual) === JSON.stringify(entry.actual);
        if (acceptable) knownMissed.push({ variant: variant.id, key, expected, actual, entry });
        else missed.push({ variant: variant.id, key, expected, actual, entry: entry ?? null });
      }
    }
    results.push({
      family,
      familyReadings,
      disagreed,
      unmeasured,
      agreed,
      known,
      drifted,
      missed,
      knownMissed,
    });
  }

  /* ---------------------------------------------------------------- */
  /* Stale acceptances                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * An accepted limitation that has stopped reproducing.
   *
   * This fails the run, and the failure is the whole point of the list being
   * exact. Two things produce it and both need a person: the tool got better,
   * in which case the entry is stale and deleting it is the commit; or
   * something moved underneath and this family is now measuring a different
   * page, in which case the green is not real. A list that quietly tolerates
   * either is how a suite decays from a check into a decoration.
   *
   * Only entries for families that actually ran are considered — `--family X`
   * must not report every other acceptance as stale.
   */
  const inScope = acceptancesFor(families);
  const claimed = new Set();
  for (const r of results) {
    for (const k of r.known) claimed.add(`d:${r.family.id}/${k.key}`);
    for (const d of r.drifted) claimed.add(`d:${r.family.id}/${d.key}`);
    for (const m of [...r.knownMissed, ...r.missed]) {
      if (m.entry) claimed.add(`p:${r.family.id}/${m.variant}/${m.key}`);
    }
  }
  const stale = [
    ...inScope.disagreements
      .filter((e) => !claimed.has(`d:${e.family}/${e.metric}`))
      .map((entry) => ({ entry, kind: 'disagreement' })),
    ...inScope.pinnedMisses
      .filter((e) => !claimed.has(`p:${e.family}/${e.variant}/${e.metric}`))
      .map((entry) => ({ entry, kind: 'pinned value' })),
  ];

  for (const result of results) {
    const { family, familyReadings, disagreed, unmeasured, agreed } = result;
    const { known, drifted, missed, knownMissed } = result;
    const ok =
      disagreed.length === 0 &&
      unmeasured.length === 0 &&
      missed.length === 0 &&
      drifted.length === 0;
    const carriesKnown = known.length > 0 || knownMissed.length > 0;
    /**
     * Three words, not two. A family that passes only because the baseline
     * accepts something is not in the same state as one that simply agreed,
     * and the report has to be readable at a glance by somebody who did not
     * write the baseline.
     */
    const label = !ok ? 'DISAGREE' : carriesKnown ? 'KNOWN   ' : 'AGREE   ';
    out(`${label}  ${family.id}`);
    out(`          ${family.title}`);
    const pinnedCount = family.variants.reduce(
      (n, v) => n + Object.keys(v.expects ?? {}).length,
      0
    );
    out(
      `          ${family.variants.length} variants, ` +
        `${family.preserves.length} preserved, ${family.pinnedInstead.length} pinned instead` +
        (pinnedCount > 0 ? `, ${pinnedCount} pins` : '')
    );
    /**
     * An exempt metric prints its pins, not just its excuse.
     *
     * The line used to read `exempt: ghostControls — flaky`, which is what a
     * mute looks like from the outside and is exactly how the reviewer's
     * spliced regression read on the way to exit 0. Printing the value the
     * family expects for every variant means the reader can see that the metric
     * is still asserted, and see what it is asserted to be, without opening
     * families.mjs.
     */
    for (const entry of family.pinnedInstead) {
      const pins = family.variants
        .map((v) => `${v.id}=${show(v.expects?.[entry.metric])}`)
        .join(', ');
      out(`          not compared, pinned per variant: ${entry.metric}`);
      out(`            ${pins}`);
      for (const line of wrap(entry.because, '            ')) out(line);
    }
    out('');

    if (unmeasured.length > 0) {
      out('    NOT MEASURED — a variant produced no answer, which is not a zero and');
      out('    not an agreement. Fix this before reading anything else below.');
      for (const { key, comparison } of unmeasured) reportMetric(key, comparison);
      out('');
    }
    if (disagreed.length > 0) {
      for (const { key, comparison } of disagreed) {
        reportMetric(key, comparison);
        out('');
      }
    }
    if (drifted.length > 0) {
      out('    ACCEPTED LIMITATION HAS CHANGED SHAPE — this metric is on the list in');
      out('    known-limitations.mjs, but not with these values. What was accepted was a');
      out('    specific set of numbers, so nobody has agreed to this one. Re-measure, then');
      out('    either fix it or update the entry deliberately.');
      for (const { key, comparison, entry, match } of drifted) {
        reportMetric(key, comparison);
        for (const { variant, recorded, measured: got } of match.differing) {
          out(`      ${variant}: accepted ${show(recorded)}, measured ${show(got)}`);
        }
        if (match.recordedSpread !== null && match.measuredSpread !== null) {
          out(`      spread accepted ${match.recordedSpread}, measured ${match.measuredSpread}`);
        }
        out(`      owner: ${entry.owner}`);
        out('');
      }
    }
    if (known.length > 0 || knownMissed.length > 0) {
      out('    KNOWN LIMITATION — accepted in known-limitations.mjs. It prints because an');
      out('    accepted failure that goes invisible is a forgotten one; it does not fail the');
      out('    run; and it starts failing again the day it stops reproducing.');
      out('');
      for (const { key, comparison, entry } of known) {
        reportMetric(key, comparison, '      ');
        out(`        owner    ${entry.owner}`);
        out(`        measured ${entry.evidence}`);
        for (const line of wrap(firstParagraph(entry.because), '        ')) out(line);
        out('');
      }
      for (const { variant, key, expected, actual, entry } of knownMissed) {
        out(`      ${variant}  ${metricLabel(key)} — ${key}`);
        out(`        pinned ${show(expected)}, measured ${show(actual)} — accepted`);
        out(`        owner    ${entry.owner}`);
        out(`        measured ${entry.evidence}`);
        for (const line of wrap(firstParagraph(entry.because), '        ')) out(line);
        out('');
      }
    }
    if (missed.length > 0) {
      out('    PINNED VALUE MISSED — this family states what these must be, and says why');
      out('    in its own comment in families.mjs. Read that before changing either side.');
      for (const { variant, key, expected, actual, entry } of missed) {
        out(`      ${variant}  ${metricLabel(key)} — ${key}`);
        out(`        expected ${show(expected)}, measured ${show(actual)}`);
        if (entry) {
          out(
            `        known-limitations.mjs accepts ${show(entry.actual)} here, not ` +
              `${show(actual)} — the acceptance does not cover this`
          );
        }
      }
      out('');
    }
    if (args.verbose) {
      for (const { key, comparison } of agreed) {
        out(`    ${pad(key, 24)} ${show(comparison.values[0].value)}  (all ${familyReadings.length})`);
      }
      out('');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Verdict                                                           */
  /* ---------------------------------------------------------------- */

  const failing = results.filter(
    (r) =>
      r.disagreed.length > 0 ||
      r.unmeasured.length > 0 ||
      r.missed.length > 0 ||
      r.drifted.length > 0
  );
  const acceptedCount = results.reduce((n, r) => n + r.known.length + r.knownMissed.length, 0);
  const seconds = Math.round((Date.now() - started) / 1000);

  out('─'.repeat(72));
  if (failedScans.length > 0) {
    out(`${failedScans.length} page(s) the scanner refused to measure:`);
    for (const { label, error } of failedScans) out(`  ${label} — ${error}`);
    out('');
  }
  out(
    `${results.length - failing.length}/${results.length} families agree · ` +
      (acceptedCount > 0 ? `${acceptedCount} known limitation(s) accepted · ` : '') +
      `${pages.length} pages in ${seconds}s`
  );

  if (stale.length > 0) {
    out('');
    out('STALE ACCEPTED LIMITATION — this is a failure, and it is meant to be.');
    out('');
    for (const { entry, kind } of stale) {
      const where =
        kind === 'disagreement'
          ? `${entry.family} / ${entry.metric}`
          : `${entry.family} / ${entry.variant} / ${entry.metric}`;
      out(`  ${where} — accepted as a known ${kind}, and it did not happen this run.`);
      out(`    owner: ${entry.owner}`);
    }
    out('');
    out('Either the tool got better and the entry should be deleted in the same commit as');
    out('the fix, or something moved underneath and this family is no longer measuring');
    out('what the entry describes — in which case the green is not real. A list that');
    out('tolerates entries which stopped reproducing is how a suite decays into');
    out('decoration, so "nothing is wrong here any more" has to be a failure too.');
    process.exitCode = 1;
  }

  if (failing.length > 0) {
    out('');
    for (const { family, disagreed, unmeasured, missed, drifted } of failing) {
      const parts = [
        disagreed.length > 0 &&
          `${disagreed.length} metric(s) disagree: ${disagreed.map((d) => d.key).join(', ')}`,
        drifted.length > 0 &&
          `${drifted.length} accepted limitation(s) changed shape: ${drifted.map((d) => d.key).join(', ')}`,
        unmeasured.length > 0 && `${unmeasured.length} metric(s) not measured`,
        missed.length > 0 &&
          `${missed.length} pinned value(s) missed: ${[...new Set(missed.map((m) => m.key))].join(', ')}`,
      ].filter(Boolean);
      out(`  ${family.id} — ${parts.join('; ')}`);
    }
    out('');
    out('A disagreement is not a flaky test. Either the variants are not behaviourally');
    out('identical — in which case the family is wrong and families.mjs must say so —');
    out('or the scanner returns different answers for the same page written two ways,');
    out('which is the bug this suite exists to find.');
    process.exitCode = 1;
  }

  /**
   * The coverage boundary, printed on every run.
   *
   * These are not results. They are the questions this suite has been asked and
   * cannot answer, and they belong beside the answers rather than in a file
   * somebody has to know to open — the alternative is that "we never checked
   * that" and "we checked and it was fine" look identical from here.
   */
  if (NOT_ASSERTED.length > 0) {
    out('');
    out(`Not asserted — ${NOT_ASSERTED.length} shape(s) this suite takes no position on:`);
    for (const entry of NOT_ASSERTED) {
      out('');
      for (const line of wrap(entry.shape, '  ')) out(line);
      if (entry.wouldContradict) out(`    would contradict: ${entry.wouldContradict}`);
      for (const line of wrap(firstParagraph(entry.because), '    ')) out(line);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(2);
});
