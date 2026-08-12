#!/usr/bin/env node
/**
 * The twin harness — run both probe implementations against the same page load
 * and print every place they disagree.
 *
 *   node scanner/verify-twin.mjs [--only BRAND[:PAGE]] [--viewport desktop,mobile]
 *
 * ── Why this exists, and why "the same page load" is the whole point ──────
 *
 * `probes.mjs` has just stopped hand-implementing five things Chromium already
 * computes — tree membership, the accname algorithm, focusability, ARIA IDREF
 * resolution and on-screen visibility — and started asking `axe.commons`, the
 * library already injected into every page for `axe.run`. That is a change to
 * five of the most load-bearing predicates in the tool, and the numbers it
 * produces are published to stakeholders.
 *
 * The obvious way to size that change is to scan before and after and subtract.
 * That way is wrong here, and the reason is measured: insureon.com serves three
 * different documents to identical requests — eight plain `curl` fetches came
 * back 394,816 / 394,824 / 434,507 / 703,895 bytes, a 1.78× spread — and across
 * sixteen consecutive scans of its home page `clickableNoRole` read 1 (×5),
 * 36 (×6) and 87 (×5) while the page itself never changed. A before/after taken
 * on two page loads cannot separate the migration from the site. Half the
 * delta would be the weather.
 *
 * So both implementations run inside a single `page.evaluate`, against one DOM,
 * at one moment. Whatever the site is serving that second, it serves it to both.
 * Site variance cancels exactly rather than approximately, and every number
 * below is a difference between two readings of the same document.
 *
 * ── What it settles ──────────────────────────────────────────────────────
 *
 * Two claims gate trusting the migration, and neither had been measured:
 *
 *   1. That `axe.commons` behaves the same inside the real pipeline — after
 *      `axe.run` has built and torn down its own tree, on live production
 *      pages — as it did in the isolated harnesses where it was validated.
 *   2. The size of the metric shift.
 *
 * Claim 1 gets a controlled experiment rather than an assertion. Both probes
 * run twice: once *before* `axe.run` and once *after* it, in the same page
 * load. The old probe never touches axe, so any cold-to-hot movement on the old
 * side is the page changing under us and nothing else. That is the control. If
 * the new side moves and the old side doesn't, `axe.run` is interfering; if
 * both move, the page is churning and neither reading is trustworthy on that
 * metric. Without the control an unstable page and a broken primitive look
 * identical.
 *
 * ── Where the "before" column comes from ─────────────────────────────────
 *
 * From git, not from a copy. `git show main:scanner/probes.mjs` is the code
 * that produced the published runs; a transcription of it into this file would
 * be a fourth thing to keep in step, and the diff it is here to measure would
 * silently become a diff against a paraphrase. The blob is evaluated in the
 * page as-is.
 *
 * The per-element rows go one step further and use the *actual* closures out of
 * both probes — `removedFromTree` and `accessibleName` as they really run, not
 * this file's idea of them — by splicing a single assignment in front of each
 * function's final `return {`. It is a textual edit and it is guarded on both
 * sides: if the splice point is not where it is expected to be, the harness
 * refuses to run rather than comparing something else and calling it a probe.
 *
 * ── Who adjudicates ──────────────────────────────────────────────────────
 *
 * A disagreement between two hand-checked implementations is not evidence for
 * either of them. So for tree membership, accessible name and focusability
 * there is a third opinion that neither side can argue with: Chromium's own
 * accessibility tree, read over CDP and joined to the DOM on `backendDOMNodeId`
 * with node *absence* as the membership test. This is the same join that scored
 * the two implementations on the primitives fixture — the hand-written
 * `removedFromTree` disagreed with the browser on 9 of 59 links, `axe` on 0 of
 * 59 — run here against live production instead.
 *
 * CDP cannot adjudicate everything and is not asked to. It carries no geometry,
 * so it has nothing to say about off-screen panels, and it is main-frame only.
 * Where it is silent the harness says so rather than guessing.
 *
 * ── The rule that doesn't bend ───────────────────────────────────────────
 *
 * This is a measuring instrument for a measuring instrument, so it inherits the
 * same rule: a comparison that did not happen must never render as agreement.
 * Every predicate is wrapped, every throw is counted in its own column, and no
 * element is ever recorded as "the two agree" because asking failed. Caps on
 * list sizes report that they bit, so a truncated count reads as "at least N".
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';

import {
  DEFAULT_PROFILE,
  PROFILES,
  PROFILE_NAMES,
  browserProvenance,
  launchContext,
  launchOptions,
  resolveAxeSource,
} from './core.mjs';
import { collectMeasurements } from './probes.mjs';
import { targetList } from './targets.mjs';

/* ------------------------------------------------------------------ */
/* Args                                                                */
/* ------------------------------------------------------------------ */

const USAGE = `
Twin harness — both probe implementations, one page load, every disagreement.

  node scanner/verify-twin.mjs [options]

  --only BRAND[:PAGE]   Scan a subset, e.g. "insureon" or "insureon:home".
  --url URL             Scan one arbitrary URL instead of the target list.
  --viewport LIST       Device profiles, comma separated. Default: ${DEFAULT_PROFILE}.
                        Known: ${PROFILE_NAMES.join(', ')}.
  --baseline-ref REF    Git ref holding the pre-migration probes.mjs.
                        Default: main. The harness verifies the blob really is
                        the hand-written implementation and refuses to run if
                        it is not — once this branch merges, "main" stops being
                        the baseline and silently comparing new against new
                        would produce a reassuring page of zeroes.
  --no-cdp              Skip the Chromium accessibility-tree adjudication.
                        Faster, and the only option on a non-Chromium browser,
                        but then nothing independent says which side is right.
  --out FILE            Write the full JSON record here.
                        Default: a timestamped file in the system temp dir.
  --report FILE         Re-print the report from a record --out wrote earlier,
                        without launching a browser. A run against 20 live
                        targets costs several minutes and is not reproducible —
                        these sites serve different documents to identical
                        requests — so re-reading a record has to be free, or
                        the temptation is to re-run and quietly get different
                        numbers.

The scan browser is chosen exactly as scan.mjs chooses it, so
PLAYWRIGHT_CHROMIUM_PATH applies here too.
`;

function parseArgs(argv) {
  const args = {
    only: undefined,
    url: undefined,
    viewports: [DEFAULT_PROFILE],
    baselineRef: 'main',
    cdp: true,
    out: undefined,
    report: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report') args.report = argv[++i];
    else if (arg === '--only') args.only = argv[++i];
    else if (arg === '--url') args.url = argv[++i];
    else if (arg === '--viewport') args.viewports = argv[++i].split(',').map((s) => s.trim());
    else if (arg === '--baseline-ref') args.baselineRef = argv[++i];
    else if (arg === '--no-cdp') args.cdp = false;
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else {
      throw new Error(`Unknown argument “${arg}”. Run with --help.`);
    }
  }
  return args;
}

/* ------------------------------------------------------------------ */
/* The two probe sources                                               */
/* ------------------------------------------------------------------ */

/**
 * Names of the closures spliced out of each probe.
 *
 * These are the five re-implemented primitives on the old side and the five
 * borrowed ones on the new side, plus the composites built directly on top of
 * them. Nothing else is extracted: the moment this list grows into "and also
 * the probe logic" the harness stops comparing primitives and starts
 * re-implementing the probes, which is the fault it exists to measure.
 */
const OLD_HELPERS = [
  'removedFromTree',
  'accessibleName',
  'isFocusable',
  'controllerOf',
  'hidingMechanism',
  'hidesItself',
];

const NEW_HELPERS = [
  'inTree',
  'onScreen',
  'accessibleName',
  'inTabOrder',
  'isControl',
  'referrersTo',
  'classify',
];

/**
 * Splice `window.<global> = { …helpers }` in front of a probe's final
 * `return {`, so the closures it actually used are readable once it has run.
 *
 * The alternative was copying six functions into this file, and a copy of the
 * code under test is not a test of the code. The cost is a textual edit, and
 * the edit is checked: the splice point has to be the return that builds the
 * measurement object — identified by the field that has led it since the first
 * commit — or this throws. A silently misplaced splice would produce a harness
 * that compares two undefineds and reports perfect agreement, which is exactly
 * the false-clean shape this project has already shipped twice.
 */
function spliceHelperExport(source, globalName, helpers) {
  const marker = source.lastIndexOf('return {');
  if (marker === -1) {
    throw new Error(`Could not find a final "return {" in the ${globalName} probe source.`);
  }
  const following = source.slice(marker, marker + 200);
  if (!following.includes('namelessButtons')) {
    throw new Error(
      `The final "return {" in the ${globalName} probe source is not the measurement ` +
        `object (expected "namelessButtons" among its fields, saw: ` +
        `${JSON.stringify(following.slice(0, 80))}). The probe has been restructured; ` +
        `fix this splice rather than comparing whatever it happens to pick up.`
    );
  }
  const assignment = `window.${globalName} = { ${helpers.join(', ')} };\n`;
  return source.slice(0, marker) + assignment + source.slice(marker);
}

/** Strip the ESM export so the body can be evaluated with `new Function`. */
const asPlainFunction = (source) => source.replace(/^export\s+function/m, 'function');

const shortHash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

/**
 * The pre-migration probe, read out of git rather than transcribed.
 *
 * The guards matter more than the read. `main` is the right default today and
 * will be the wrong one the moment this branch lands, at which point the
 * baseline blob becomes a copy of the new implementation and every column in
 * this report reads zero — a result indistinguishable from "the migration
 * changed nothing", and far more likely to be believed. So the blob has to look
 * like the hand-written implementation: it must carry `removedFromTree`, and it
 * must not mention `axe.commons`. Failing either, this refuses to run.
 */
function loadBaselineProbe(ref) {
  let source;
  try {
    source = execFileSync('git', ['show', `${ref}:scanner/probes.mjs`], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(
      `Could not read scanner/probes.mjs at ${ref}: ${err.message}. ` +
        `Pass --baseline-ref with a ref that predates the axe.commons migration.`
    );
  }
  // The *definition*, not the word. The post-migration file still discusses
  // `removedFromTree` at length in the comment explaining why it was removed,
  // so a substring check on the name passes on exactly the blob this is meant
  // to reject — a guard that is only decorative is worse than none, because it
  // reads as protection.
  if (!/const\s+removedFromTree\s*=/.test(source)) {
    throw new Error(
      `scanner/probes.mjs at ${ref} does not define the hand-written “removedFromTree”, ` +
        `so it is not the pre-migration probe. Comparing the new implementation against ` +
        `itself would print a page of zeroes and read as “nothing changed”.`
    );
  }
  if (source.includes('axe.commons')) {
    throw new Error(
      `scanner/probes.mjs at ${ref} already uses axe.commons, so it is not the baseline. ` +
        `Name an earlier ref with --baseline-ref.`
    );
  }
  let sha = null;
  try {
    sha = execFileSync('git', ['rev-parse', '--short', ref], { encoding: 'utf8' }).trim();
  } catch {
    // Provenance we could not establish is recorded as absent, never guessed.
  }
  return { source, sha };
}

/* ------------------------------------------------------------------ */
/* The metrics both sides are read on                                  */
/* ------------------------------------------------------------------ */

/**
 * One flat record per measurement, so before and after can be subtracted field
 * by field without either side deciding what counts.
 *
 * `defect` follows the project's own split and is not a judgement made here.
 * A correct page has every defect metric at zero. The others are magnitudes
 * that are *expected* to be non-zero on a correct page — `clickableNoRole`
 * counts every clickable card on the site, `unreachablePanels` lists announced
 * panels too — and a report that totals them together would turn a page full of
 * well-built disclosures into a page full of faults.
 */
const METRICS = [
  { key: 'namelessButtons', defect: true, of: (m) => m.namelessButtons?.length ?? null },
  { key: 'namelessLinks', defect: true, of: (m) => m.namelessLinks?.length ?? null },
  { key: 'emptyHref', defect: true, of: (m) => m.emptyHref?.length ?? null },
  // `hasMain` has to be an actual boolean. A probe that did not run leaves it
  // undefined, and `=== false ? 1 : 0` would quietly answer "0 pages missing a
  // main landmark" — a clean result manufactured out of a missing measurement.
  { key: 'noMain', defect: true, of: (m) => (typeof m.hasMain === 'boolean' ? (m.hasMain ? 0 : 1) : null) },
  { key: 'ghostCandidates', defect: false, of: (m) => m.ghostControls?.length ?? null },
  { key: 'ghostPublished', defect: true, of: (m) => m.ghostPublished ?? null },
  { key: 'clickableNoRole', defect: false, of: (m) => m.clickableNoRole ?? null },
  { key: 'hiddenPanels', defect: true, of: (m) => m.hiddenPanels?.length ?? null },
  // `phantomMenu: null` means the page genuinely has no off-screen panel, which
  // is a real zero. A phantomMenu that exists but is missing the field is not,
  // so the two cases are kept apart rather than both collapsing to 0.
  {
    key: 'phantomFocusable',
    defect: false,
    of: (m) => (m.phantomMenu === null ? 0 : (m.phantomMenu?.focusable ?? null)),
  },
  {
    key: 'phantomLinks',
    defect: false,
    of: (m) => (m.phantomMenu === null ? 0 : (m.phantomMenu?.links ?? null)),
  },
  { key: 'unreachablePanels', defect: false, of: (m) => m.unreachableTotals?.panels ?? null },
  {
    key: 'unannouncedPanels',
    defect: true,
    of: (m) => m.unreachableTotals?.unannouncedPanels ?? null,
  },
  {
    key: 'unannouncedFocusable',
    defect: true,
    of: (m) => m.unreachableTotals?.unannouncedFocusable ?? null,
  },
  {
    key: 'unannouncedLinks',
    defect: true,
    of: (m) => m.unreachableTotals?.unannouncedLinks ?? null,
  },
  { key: 'navTotal', defect: false, of: (m) => m.navLinks?.total ?? null },
  { key: 'navInTree', defect: false, of: (m) => m.navLinks?.inTree ?? null },
];

/** The published headline: links an agent cannot find, summed over a brand. */
const HEADLINE_METRIC = 'unannouncedLinks';

function metricsOf(measurements) {
  const out = {};
  for (const m of METRICS) {
    let value = null;
    try {
      value = m.of(measurements);
    } catch {
      value = null;
    }
    out[m.key] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* In-page: both probes and every primitive, one serialisation boundary */
/* ------------------------------------------------------------------ */

/**
 * Everything that has to see the same DOM happens here, in one evaluate.
 *
 * Splitting this into several round trips would put page script — analytics,
 * lazy hydration, a carousel timer — between the two readings, and on these
 * sites that is not hypothetical. The whole design of the harness rests on both
 * probes seeing one document, so they are called four lines apart in one
 * function rather than from Node.
 *
 * Must be self-contained: Playwright serialises this to a string, so it can
 * close over nothing. Everything it needs arrives in `args`.
 */
function twinInPage(args) {
  const { oldSource, newSource, phase, rowCap, elementCap } = args;

  const build = (source) => new Function(`${source}\nreturn collectMeasurements;`)();

  const trunc = (s, n = 240) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '');
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
    return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ''}`;
  };

  /* ---- run both probes, back to back, on one DOM ------------------ */

  const timings = {};
  let t = performance.now();
  const before = build(oldSource)();
  timings.oldProbeMs = Math.round(performance.now() - t);
  // The ghost handles have to be rescued immediately: both probes publish to
  // the same `window.__ghostCandidateEls`, by design, and the second call
  // overwrites the first.
  window.__twinOldGhostEls = window.__ghostCandidateEls ?? [];

  t = performance.now();
  const after = build(newSource)();
  timings.newProbeMs = Math.round(performance.now() - t);
  window.__twinNewGhostEls = window.__ghostCandidateEls ?? [];

  const oldH = window.__twinOldHelpers;
  const newH = window.__twinNewHelpers;
  if (!oldH || !newH) {
    throw new Error(
      'The helper splice did not take: one of the probes ran without publishing its ' +
        'closures. Refusing to report agreement between two undefined functions.'
    );
  }
  for (const [label, bag, names] of [
    ['old', oldH, args.oldHelperNames],
    ['new', newH, args.newHelperNames],
  ]) {
    for (const name of names) {
      if (typeof bag[name] !== 'function') {
        throw new Error(`The ${label} probe published no “${name}”; the splice is stale.`);
      }
    }
  }

  /* ---- the primitive comparison ----------------------------------- */

  // On the cold pass (before axe.run) only the probe totals are wanted: the
  // point of that pass is the stability control, and doing the whole per-element
  // sweep twice would double the harness's own footprint on the page for
  // nothing.
  if (phase === 'cold') {
    return { before, after, timings, primitives: null, tagged: 0, phase };
  }

  const axe = window.axe;
  const { dom, text, aria } = axe.commons;

  /**
   * `axe.commons` needs the virtual tree `axe.setup()` builds, and the new
   * probe tears its own down in a `finally` — correctly, so a throw cannot pin
   * `axe._tree` to a document the next page has already replaced. So the
   * comparison builds one for itself, on the same terms the probe uses.
   */
  axe.teardown();
  axe.setup(document.documentElement);

  /** Elements any row refers to, in a stable order, for the CDP join. */
  const twinEls = [];
  const twinIdx = new Map();
  const tag = (el) => {
    if (twinIdx.has(el)) return twinIdx.get(el);
    if (twinEls.length >= elementCap) return -1;
    const i = twinEls.length;
    twinEls.push(el);
    twinIdx.set(el, i);
    return i;
  };

  /**
   * Ask both sides about one element and record it only if they differ.
   *
   * A predicate that throws is counted in its own column and never resolved to
   * a value: "we could not tell" and "false" are different answers, and
   * collapsing them is how a measurement that did not happen turns into a
   * finding — or, worse, into a clean result.
   *
   * `material` is the guard against a true number that means nothing. Both
   * probes ask for an accessible name only *after* an element has passed the
   * tree-membership filter, so the two implementations can disagree about the
   * name of a link inside a closed mega-menu all day without a single metric
   * moving — and on a real page there are hundreds of those. Reported flat,
   * they bury the handful of in-tree disagreements that actually change a
   * published figure, and they cannot be adjudicated either, because an element
   * absent from the accessibility tree has no accessible name for Chromium to
   * be asked about. So immaterial disagreements are counted and set aside
   * rather than dropped: the count is the honest record that they happened.
   */
  const compare = (name, elements, oldFn, newFn, note, material) => {
    const stat = {
      primitive: name,
      note,
      compared: 0,
      agree: 0,
      disagree: 0,
      disagreeImmaterial: 0,
      materialNote: null,
      oldThrew: 0,
      newThrew: 0,
      capped: false,
      rows: [],
    };
    for (const el of elements) {
      let o;
      let n;
      let oe = false;
      let ne = false;
      try {
        o = oldFn(el);
      } catch {
        oe = true;
      }
      try {
        n = newFn(el);
      } catch {
        ne = true;
      }
      stat.compared += 1;
      if (oe) stat.oldThrew += 1;
      if (ne) stat.newThrew += 1;
      if (oe || ne) continue; // never scored as agreement
      if (o === n) {
        stat.agree += 1;
        continue;
      }
      if (material) {
        let isMaterial = false;
        try {
          isMaterial = material(el);
        } catch {
          // Could not tell whether it matters, so treat it as though it does.
          isMaterial = true;
        }
        if (!isMaterial) {
          stat.disagreeImmaterial += 1;
          continue;
        }
      }
      stat.disagree += 1;
      if (stat.rows.length >= rowCap) {
        stat.capped = true;
        continue;
      }
      stat.rows.push({
        idx: tag(el),
        selector: describe(el),
        tag: el.tagName.toLowerCase(),
        old: o,
        new: n,
        html: trunc(el.outerHTML, 180),
      });
    }
    return stat;
  };

  /**
   * "Would either probe ever ask this question about this element?"
   *
   * Both implementations gate the name and tab-order checks on their own
   * tree-membership answer, and the two answers differ — that is the point of
   * this harness — so the gate has to be the union. An element only one side
   * considers in the tree is still material: the disagreement about its name
   * can move that side's metric.
   */
  const eitherSideSeesIt = (el) => {
    let o = false;
    let n = false;
    try {
      o = !oldH.removedFromTree(el);
    } catch {
      o = true;
    }
    try {
      n = newH.inTree(el);
    } catch {
      n = true;
    }
    return o || n;
  };

  const list = (selector) => [...document.querySelectorAll(selector)];

  /* 1. Tree membership. The primitive every other probe filters on first. */
  const TREE_SET =
    'a[href],button,[role="button"],input,select,textarea,summary,[tabindex],[contenteditable="true"]';
  const treeEls = list(TREE_SET);
  const tree = compare(
    'tree-membership',
    treeEls,
    (el) => !oldH.removedFromTree(el),
    (el) => newH.inTree(el),
    'old: hand-written six-mechanism ancestor walk. new: axe.commons.dom.isVisibleToScreenReaders.'
  );

  /* 2. Accessible name. Only emptiness drives a probe, so it is scored on
        emptiness — but the strings are carried so a human can see what moved.

        The ghost candidates from both sides are folded into the element set,
        and that is where this primitive actually bites: `textContent` named a
        hamburger from the `<span aria-hidden="true">☰</span>` inside it, the
        ghost probe skipped anything with a name, and five behaviourally
        identical hamburgers scored 0, 0, 0, 0, 1. None of those elements is a
        button or a link, so a set built from tag names alone would miss the
        entire failure. */
  const NAME_SET = 'button,[role="button"],a[href]';
  const nameEls = [
    ...new Set([
      ...list(NAME_SET),
      ...(window.__twinOldGhostEls ?? []),
      ...(window.__twinNewGhostEls ?? []),
    ]),
  ];
  const name = compare(
    'accessible-name',
    nameEls,
    (el) => (oldH.accessibleName(el) ? 'named' : 'nameless'),
    (el) => (newH.accessibleName(el) ? 'named' : 'nameless'),
    'old: aria-label → aria-labelledby → textContent → title → img[alt] → value. ' +
      'new: axe.commons.text.accessibleText (the real accname algorithm).',
    eitherSideSeesIt
  );
  name.materialNote =
    'Immaterial = both sides agree the element is out of the tree, so neither probe ' +
    'ever asks it for a name and no metric can move.';
  // Attach the two strings to each row: "nameless on one side" is the finding,
  // but which name appeared or vanished is what makes it adjudicable.
  for (const row of name.rows) {
    const el = twinEls[row.idx];
    if (!el) continue;
    try {
      row.oldName = trunc(oldH.accessibleName(el), 80);
    } catch {
      row.oldName = null;
    }
    try {
      row.newName = trunc(newH.accessibleName(el), 80);
    } catch {
      row.newName = null;
    }
  }

  /* 3a. Focusability, as the panel probes count it: is this a control at all,
         setting aside whether the region around it is open? */
  const FOCUS_SET = 'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';
  const focusEls = list(FOCUS_SET);
  const focusControl = compare(
    'focusable-control',
    focusEls,
    (el) => oldH.isFocusable(el),
    (el) => newH.isControl(el),
    'old: !hasAttribute("disabled") && tabindex !== "-1". ' +
      'new: :disabled + axe.utils.parseTabindex + axe widget roles, with input[type=hidden] excluded.'
  );

  /* 3b. Tab order, as the ghost probe and the panel `tabbable` count ask it.
         Same materiality gate as the name: both are only ever asked about
         elements their own side already believes are in the tree. */
  const focusTabOrder = compare(
    'in-tab-order',
    [...new Set([...focusEls, ...(window.__twinOldGhostEls ?? []), ...(window.__twinNewGhostEls ?? [])])],
    (el) => el.tabIndex >= 0,
    (el) => newH.inTabOrder(el),
    'old: el.tabIndex >= 0. new: axe.commons.dom.isInTabOrder.',
    eitherSideSeesIt
  );
  focusTabOrder.materialNote =
    'Immaterial = both sides agree the element is out of the tree. axe folds visibility ' +
    'into isInTabOrder, so it answers false for everything inside a closed panel — which ' +
    'is correct and is not a disagreement about focusability.';

  /* 4. IDREF resolution. The old side saw only the first [aria-controls]; the
        new side sees every ARIA IDREF pointing here, in both directions. */
  const idrefEls = list('[id]');
  const idref = {
    primitive: 'idref-resolution',
    note:
      'old: document.querySelector(`[aria-controls="id"]`) — first match only. ' +
      'new: axe.commons.aria.getAccessibleRefs — every idref attribute in the spec.',
    compared: 0,
    agree: 0,
    disagree: 0,
    oldThrew: 0,
    newThrew: 0,
    capped: false,
    // A widened answer is not automatically a better one: aria-labelledby is an
    // IDREF too, and a heading that merely labels a panel must never be
    // mistaken for the button that opens it. So the rows are split by kind
    // rather than lumped into one "differs" count.
    kinds: { newFoundControls: 0, newFoundOnlyOther: 0, oldOnly: 0, differentFirst: 0 },
    rows: [],
  };
  for (const el of idrefEls) {
    let o;
    let n;
    try {
      o = oldH.controllerOf(el);
    } catch {
      idref.oldThrew += 1;
      continue;
    }
    try {
      n = newH.referrersTo(el);
    } catch {
      idref.newThrew += 1;
      continue;
    }
    idref.compared += 1;
    const refs = n ?? [];
    const controlsRefs = refs.filter((r) => {
      const v = r.getAttribute && r.getAttribute('aria-controls');
      return !!v && v.split(/\s+/).includes(el.id);
    });
    let kind = null;
    if (!o && controlsRefs.length > 0) kind = 'newFoundControls';
    else if (!o && refs.length > 0) kind = 'newFoundOnlyOther';
    else if (o && refs.length === 0) kind = 'oldOnly';
    else if (o && refs.length > 0 && !refs.includes(o)) kind = 'differentFirst';
    if (!kind) {
      idref.agree += 1;
      continue;
    }
    idref.disagree += 1;
    idref.kinds[kind] += 1;
    if (idref.rows.length >= rowCap) {
      idref.capped = true;
      continue;
    }
    idref.rows.push({
      idx: tag(el),
      selector: describe(el),
      tag: el.tagName.toLowerCase(),
      kind,
      old: o ? describe(o) : null,
      new: refs.map(describe).slice(0, 5),
      newControls: controlsRefs.map(describe).slice(0, 5),
      html: trunc(el.outerHTML, 180),
    });
  }

  /* 5 + region state. On-screen visibility, and the classification the two
       hiding probes are built out of — which is where the panel metrics move. */
  const REGION_SELECTOR = 'div,nav,ul,section,aside,form,details';
  const OLD_FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex],[contenteditable="true"]';
  const NEW_FOCUSABLE =
    'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';

  // Only regions either side would look at twice: a page has thousands of divs
  // and comparing all of them buries the ones that carry navigation.
  const regionCandidates = list(REGION_SELECTOR).filter(
    (el) => el.querySelectorAll(NEW_FOCUSABLE).length >= 3
  );

  const onScreen = compare(
    'on-screen',
    regionCandidates,
    (el) => oldH.hidingMechanism(el, getComputedStyle(el), el.getBoundingClientRect()).length === 0,
    (el) => newH.onScreen(el),
    'old: six geometric tests (zero size, off either edge, above the document, opacity 0, clip-path). ' +
      'new: axe.commons.dom.isVisibleOnScreen, which also knows overflow clipping, scroll containers and stacking.',
    // The old side never asked this question about a region it had already
    // ruled out of the tree, so a difference there is not a difference in what
    // was reported. `content-visibility: hidden` is the case: the old
    // `removedFromTree` did know it, the old `hidesItself` did not, and the
    // region fell between the two probes rather than being misjudged by either.
    // That gap is a region-state finding, not an on-screen one.
    (el) => !oldH.removedFromTree(el)
  );
  onScreen.materialNote =
    'Immaterial = the old side had already ruled the region out of the tree, so it never ' +
    'asked whether it was on screen.';

  /**
   * The state each probe pair assigns a region — the thing that actually
   * decides whether a panel is reported, and by which probe.
   *
   * The old side's two loops did not partition: `hiddenPanels` skipped anything
   * `removedFromTree` matched, and `unreachablePanels` only looked at regions
   * that hid *themselves*. A region whose ancestor hides it, which does not hide
   * itself, fell between them and was reported by neither. That gap is given its
   * own state here — `ancestor-hidden` — rather than being folded into one of
   * the two, because "reported by nothing" is the outcome a defensive tool must
   * never produce quietly, and counting it is the only way to see it.
   */
  const oldRegionState = (el) => {
    if (oldH.hidesItself(el).length > 0) {
      const parentHidden = !!el.parentElement && oldH.removedFromTree(el.parentElement);
      if (parentHidden) return 'nested-in-hidden';
      const controls = [...el.querySelectorAll(OLD_FOCUSABLE)].filter(oldH.isFocusable);
      return controls.length >= 3 ? 'out-of-tree' : 'too-few-controls';
    }
    if (oldH.removedFromTree(el)) return 'ancestor-hidden';
    const controls = [...el.querySelectorAll(OLD_FOCUSABLE)]
      .filter(oldH.isFocusable)
      .filter((f) => !oldH.removedFromTree(f));
    if (controls.length < 3) return 'too-few-controls';
    const why = oldH.hidingMechanism(el, getComputedStyle(el), el.getBoundingClientRect());
    return why.length > 0 ? 'off-screen' : 'on-screen';
  };

  const newRegionState = (el) => {
    const result = newH.classify(el);
    if (!result) return 'too-few-controls';
    return result.state;
  };

  const region = {
    primitive: 'region-state',
    note:
      'The classification the panel probes are built on. old: two loops that did not partition — ' +
      'a region hidden by an ancestor but not by itself was reported by neither. ' +
      'new: one classify() pass, three states, both probes reading from it.',
    compared: 0,
    agree: 0,
    disagree: 0,
    oldThrew: 0,
    newThrew: 0,
    capped: false,
    transitions: {},
    rows: [],
  };
  for (const el of regionCandidates) {
    let o;
    let n;
    try {
      o = oldRegionState(el);
    } catch {
      region.oldThrew += 1;
      continue;
    }
    try {
      n = newRegionState(el);
    } catch {
      region.newThrew += 1;
      continue;
    }
    region.compared += 1;
    if (o === n) {
      region.agree += 1;
      continue;
    }
    region.disagree += 1;
    const key = `${o} → ${n}`;
    region.transitions[key] = (region.transitions[key] ?? 0) + 1;
    if (region.rows.length >= rowCap) {
      region.capped = true;
      continue;
    }
    region.rows.push({
      idx: tag(el),
      selector: describe(el),
      tag: el.tagName.toLowerCase(),
      old: o,
      new: n,
      links: el.querySelectorAll('a[href]').length,
      inNav: !!el.closest('nav,[role="navigation"]'),
      html: trunc(el.outerHTML, 180),
    });
  }

  /**
   * Evidence for the regions the two sides classify differently.
   *
   * A metric that goes *up* after a migration is the one people are entitled to
   * push back on, and "the new code found five more unfindable links" is not an
   * answer — it is the claim. So every region the new side newly calls
   * out-of-tree hands over a sample of the links inside it, and Chromium is
   * asked whether they are really gone from the accessibility tree. If they are
   * present, the new finding is a false positive and this is where it shows up.
   *
   * A sample rather than all of them: one region on these sites holds twenty
   * links, the answer is the same for all of them, and the element budget is
   * better spent covering more regions than more links inside one.
   */
  for (const row of region.rows) {
    if (row.idx < 0) continue;
    const el = twinEls[row.idx];
    if (!el) continue;
    row.linkIdx = [...el.querySelectorAll('a[href]')]
      .slice(0, 6)
      .map(tag)
      .filter((i) => i >= 0);
  }

  /**
   * Every navigation link, tagged whether or not the two sides disagree.
   *
   * `navLinks.inTree` is the tree-structural half of the headline and the one
   * figure that held steady — 7 of 63 on every one of sixteen scans — while
   * everything around it swung by 86. If the migration moves it, that has to be
   * adjudicated against Chromium rather than argued about, so the whole set
   * goes to CDP, not only the rows where the implementations differ.
   */
  const navSeen = new Set();
  for (const nav of document.querySelectorAll('nav,[role="navigation"]')) {
    for (const a of nav.querySelectorAll('a[href]')) navSeen.add(a);
  }
  const navRows = [];
  for (const a of navSeen) {
    let o = null;
    let n = null;
    try {
      o = !oldH.removedFromTree(a);
    } catch {
      o = null;
    }
    try {
      n = newH.inTree(a);
    } catch {
      n = null;
    }
    navRows.push({
      idx: tag(a),
      selector: describe(a),
      href: (a.getAttribute('href') || '').slice(0, 120),
      old: o,
      new: n,
      html: trunc(a.outerHTML, 160),
    });
  }

  axe.teardown();

  /* The ghost candidate lists, described for the report. Identity is by index
     into the same arrays Node confirms over CDP, so the two never drift. */
  const ghostList = (els) =>
    els.map((el, i) => ({ i, selector: describe(el), html: trunc(el.outerHTML, 160) }));

  window.__twinEls = twinEls;

  return {
    before,
    after,
    timings,
    phase,
    tagged: twinEls.length,
    taggedCapped: twinEls.length >= elementCap,
    primitives: {
      tree,
      name,
      focusControl,
      focusTabOrder,
      idref,
      onScreen,
      region,
    },
    navRows,
    ghosts: {
      old: ghostList(window.__twinOldGhostEls),
      new: ghostList(window.__twinNewGhostEls),
    },
    docNodes: document.querySelectorAll('*').length,
  };
}

/* ------------------------------------------------------------------ */
/* CDP — the third opinion                                             */
/* ------------------------------------------------------------------ */

/**
 * Join every element the harness tagged to Chromium's own accessibility tree.
 *
 * The join is on `backendDOMNodeId`, and the membership test is node *absence*.
 * That is not a stylistic choice: a hidden subtree is not present-and-flagged
 * in `getFullAXTree`, it is simply gone, and an earlier design that proposed
 * reading an `ignored` flag was killed on exactly this — `content-visibility:
 * hidden` and `hidden="until-found"` both report `ignored:false, ignoredReasons:[]`,
 * so a correct closed accordion is byte-identical to an empty visible div.
 * Absence is the only signal the interface actually carries.
 *
 * `ignored` is still recorded, and kept as its own third state rather than
 * folded into either answer. Chromium marks plain layout containers
 * `ignored: uninteresting`, which says nothing about whether a link inside them
 * is reachable, and quietly resolving that to "not in the tree" would invent
 * disagreements on generic wrappers. Where the verdict turns on it, the report
 * says so.
 *
 * Two limits, stated rather than worked around: the AX tree is main-frame only,
 * so the ~700–770 nodes these pages put in child frames are outside every
 * number here, and AX nodes carry no geometry of any kind, so CDP has nothing
 * to say about off-screen panels and is not asked.
 */
async function adjudicateOverCdp(page) {
  const tagged = await page.evaluate(() => {
    const els = window.__twinEls ?? [];
    els.forEach((el, i) => {
      try {
        el.setAttribute('data-twin-idx', String(i));
      } catch {
        // An element that refuses an attribute simply goes unadjudicated.
      }
    });
    return els.length;
  });
  if (tagged === 0) return { available: false, reason: 'nothing was tagged', byIdx: {} };

  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable');

    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const idxToBackend = new Map();
    const stack = [root];
    let domNodes = 0;
    while (stack.length) {
      const node = stack.pop();
      domNodes += 1;
      const attrs = node.attributes;
      if (attrs) {
        for (let i = 0; i < attrs.length; i += 2) {
          if (attrs[i] === 'data-twin-idx') idxToBackend.set(Number(attrs[i + 1]), node.backendNodeId);
        }
      }
      if (node.children) stack.push(...node.children);
      if (node.shadowRoots) stack.push(...node.shadowRoots);
      if (node.contentDocument) stack.push(node.contentDocument);
    }

    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const ax = new Map();
    for (const node of nodes) {
      if (node.backendDOMNodeId == null) continue;
      const prev = ax.get(node.backendDOMNodeId);
      // One DOM node can surface more than once; an unignored appearance is the
      // stronger evidence and wins.
      if (!prev || (prev.ignored === true && node.ignored !== true)) {
        ax.set(node.backendDOMNodeId, node);
      }
    }

    const byIdx = {};
    for (const [idx, backendId] of idxToBackend) {
      const node = ax.get(backendId);
      const props = node?.properties ?? [];
      const focusable = props.find((p) => p.name === 'focusable')?.value?.value ?? null;
      /**
       * `disabled` is carried because Chromium expresses "not focusable" by
       * *omitting* `focusable` rather than by setting it false, and a missing
       * property is not an answer.
       *
       * Measured on this build: `<button disabled aria-label="previous">` comes
       * back with `properties: [disabled=true, invalid="false"]` and no
       * `focusable` at all, while the enabled button beside it carries
       * `focusable=true`. Without this the six disabled carousel buttons that
       * are the only material focusability disagreement on either production
       * brand score as "Chromium has no answer", which reads as a limit of the
       * browser when the browser in fact answered plainly.
       */
      const disabled = props.find((p) => p.name === 'disabled')?.value?.value ?? null;
      byIdx[idx] = {
        present: !!node,
        ignored: node?.ignored === true,
        role: node?.role?.value ?? null,
        name: node?.name?.value ?? null,
        focusable,
        disabled,
      };
    }

    return {
      available: true,
      axNodes: nodes.length,
      domNodes,
      joined: idxToBackend.size,
      tagged,
      byIdx,
    };
  } catch (err) {
    // An adjudication that failed is reported as unavailable, never as
    // agreement with whichever side happens to be reading.
    return { available: false, reason: String(err.message ?? err), byIdx: {} };
  } finally {
    await cdp?.detach().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* CDP — listener confirmation, per candidate list                      */
/* ------------------------------------------------------------------ */

/**
 * A transcription of `confirmClickListeners` from core.mjs, which is module
 * private and cannot be imported.
 *
 * It is here under protest, and the report says so: this is the one place the
 * harness runs a copy of the code under test rather than the code itself, so a
 * drift between the two makes the ghost column wrong without making the scanner
 * wrong. It is included anyway because without it the ghost comparison can only
 * report candidates, and the dashboard does not publish candidates — it filters
 * them on `confirmedListener !== false`, and on insureon mobile that filter
 * removes the hamburger and all five back controls. A candidate delta and a
 * published delta are different numbers, and the published one is the one that
 * reaches stakeholders.
 *
 * Run once per candidate list rather than once over the union, because the
 * shared-handler denominator is "candidates carrying some activation listener"
 * and that set differs between the two implementations. Judging both sides by a
 * merged denominator would report a number neither would ever publish.
 */
const ACTIVATION_EVENTS = new Set([
  'click',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchend',
  'keydown',
]);
const SHARED_HANDLER_SHARE = 0.5;

async function confirmListeners(page, globalName, count) {
  const out = new Array(count).fill(null).map(() => ({ confirmedListener: null, shared: null }));
  if (count === 0) return out;
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
    const scripts = new Map();
    await cdp.send('Debugger.enable').catch(() => {});
    cdp.on('Debugger.scriptParsed', (e) => scripts.set(e.scriptId, e.url));

    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `window.${globalName}`,
      returnByValue: false,
    });
    if (!result?.objectId) return out;

    const props = await cdp.send('Runtime.getProperties', {
      objectId: result.objectId,
      ownProperties: true,
    });

    const found = new Map();
    const frequency = new Map();
    for (const prop of props.result) {
      if (!/^\d+$/.test(prop.name) || !prop.value?.objectId) continue;
      const index = Number(prop.name);
      if (index >= count) continue;
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
        objectId: prop.value.objectId,
        depth: 0,
      });
      const activation = (listeners ?? []).filter((l) => ACTIVATION_EVENTS.has(l.type));
      const entries = activation.map((l) => ({
        key: `${l.scriptId}:${l.lineNumber}:${l.columnNumber}`,
        script: scripts.get(l.scriptId) ?? null,
      }));
      found.set(index, entries);
      for (const key of new Set(entries.map((e) => e.key))) {
        frequency.set(key, (frequency.get(key) ?? 0) + 1);
      }
    }

    const total = [...found.values()].filter((entries) => entries.length > 0).length;
    const shared = new Set(
      [...frequency.entries()]
        .filter(([, n]) => total >= 4 && n / total >= SHARED_HANDLER_SHARE)
        .map(([key]) => key)
    );

    for (const [index, entries] of found) {
      const own = entries.filter((e) => !shared.has(e.key));
      out[index] = {
        confirmedListener: own.length > 0,
        shared: own.length === 0 && entries.length > 0,
        script: (own[0] ?? entries[0])?.script ?? null,
      };
    }
  } catch {
    // Unconfirmed, which the dashboard's filter treats as "still report it".
  } finally {
    await cdp?.detach().catch(() => {});
  }
  return out;
}

/** The dashboard's own filter, so the harness publishes what the viewer would. */
const publishedGhosts = (confirmations) =>
  confirmations.filter((c) => c.confirmedListener !== false).length;

/* ------------------------------------------------------------------ */
/* One page                                                            */
/* ------------------------------------------------------------------ */

/**
 * The page setup is core.mjs's, line for line — same `domcontentloaded`, same
 * 2,200ms settle, same HTTP and soft-404 rejections, same injection and same
 * readiness assertions.
 *
 * Not because the duplication is pleasant, but because a twin measured under
 * different conditions than the scanner is measuring a different page. The
 * settle time in particular is load-bearing on these sites: they hydrate late,
 * and a probe that runs at 1,000ms sees a different DOM than one that runs at
 * 2,200ms. `scanPage` opens and closes its own page, so it cannot be borrowed
 * for a run that has to reach into the same page load twice.
 */
async function twinPage(context, url, { axeSource, cdp: useCdp, rowCap, elementCap, sources }) {
  const page = await context.newPage();
  const started = Date.now();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const status = response?.status() ?? 0;
    if (status >= 400) return { url, error: `HTTP ${status} — the server did not serve this page` };

    await page.waitForTimeout(2200);

    const title = await page.title();
    if (/\b404\b|page not found/i.test(title)) {
      return { url, error: `Soft 404 — served HTTP ${status} but the page is an error page (“${title}”)` };
    }

    await page.addScriptTag({ content: axeSource });
    const ready = await page.evaluate(() => {
      const c = window.axe?.commons;
      return (
        typeof window.axe?.run === 'function' &&
        typeof c?.dom?.isVisibleToScreenReaders === 'function' &&
        typeof c?.dom?.isVisibleOnScreen === 'function' &&
        typeof c?.text?.accessibleText === 'function' &&
        typeof c?.aria?.getAccessibleRefs === 'function' &&
        typeof window.axe?.setup === 'function'
      );
    });
    if (!ready) return { url, error: 'axe-core or axe.commons did not load — nothing was measured.' };

    const args = {
      oldSource: sources.oldSpliced,
      newSource: sources.newSpliced,
      oldHelperNames: OLD_HELPERS,
      newHelperNames: NEW_HELPERS,
      rowCap,
      elementCap,
    };

    /**
     * The stability control, and the whole of the answer to "does axe.commons
     * behave the same inside the real pipeline?".
     *
     * Both probes run once here, before `axe.run` has ever built a tree, and
     * again below after it has built and torn one down. The old probe never
     * touches axe, so its cold-to-hot movement is the page changing and nothing
     * else. Any *additional* movement on the new side is attributable to
     * `axe.run`. Without the control, an unstable page and a broken primitive
     * are the same observation.
     */
    const cold = await page.evaluate(twinInPage, { ...args, phase: 'cold' });

    const axeStarted = Date.now();
    const axeResults = await page.evaluate(async () => window.axe.run(document));
    const axeMs = Date.now() - axeStarted;

    const hot = await page.evaluate(twinInPage, { ...args, phase: 'hot' });

    // The ghost lists as the dashboard would publish them, one CDP pass each.
    const oldConfirm = await (useCdp
      ? confirmListeners(page, '__twinOldGhostEls', hot.ghosts.old.length)
      : Promise.resolve(hot.ghosts.old.map(() => ({ confirmedListener: null, shared: null }))));
    const newConfirm = await (useCdp
      ? confirmListeners(page, '__twinNewGhostEls', hot.ghosts.new.length)
      : Promise.resolve(hot.ghosts.new.map(() => ({ confirmedListener: null, shared: null }))));

    hot.before.ghostPublished = publishedGhosts(oldConfirm);
    hot.after.ghostPublished = publishedGhosts(newConfirm);
    cold.before.ghostPublished = null; // never confirmed on the cold pass
    cold.after.ghostPublished = null;

    // Tagging mutates the DOM, so it happens last — after every probe and every
    // primitive has already read the page.
    const cdpResult = useCdp ? await adjudicateOverCdp(page) : { available: false, reason: '--no-cdp' };

    return {
      url,
      title,
      httpStatus: status,
      axeVersion: axeResults?.testEngine?.version ?? null,
      axeNodes: (axeResults?.violations ?? []).reduce((s, v) => s + v.nodes.length, 0),
      axeMs,
      elapsedMs: Date.now() - started,
      cold: { before: metricsOf(cold.before), after: metricsOf(cold.after) },
      hot,
      before: metricsOf(hot.before),
      after: metricsOf(hot.after),
      ghostConfirmations: { old: oldConfirm, new: newConfirm },
      cdp: cdpResult,
    };
  } catch (err) {
    return { url, error: String(err.message ?? err) };
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* Adjudication, in Node                                               */
/* ------------------------------------------------------------------ */

/**
 * Score the tree-membership, name and focusability rows against Chromium.
 *
 * Only these three: they are the primitives Chromium's AX tree actually carries
 * an answer for. On-screen visibility has no representation in an AX node —
 * there is no geometry field of any kind — and IDREF relations are dropped by
 * Chromium for five of seven hiding mechanisms, with zero `controls` relations
 * appearing on either production home page. Handing those to CDP would produce
 * a confident verdict from an interface that does not hold the answer, which is
 * how the last architecture proposal got 9 of 12 wrong.
 */
function adjudicate(pageResult) {
  const cdp = pageResult.cdp;
  const verdicts = {};
  if (!cdp?.available) return { available: false, reason: cdp?.reason ?? 'no CDP', verdicts };

  const score = (stat, kind) => {
    const tally = { oldRight: 0, newRight: 0, bothWrong: 0, undecidable: 0, rows: [] };
    for (const row of stat.rows ?? []) {
      const ax = cdp.byIdx[row.idx];
      if (!ax) {
        tally.undecidable += 1;
        continue;
      }
      let truth = null;
      let basis = null;
      if (kind === 'tree') {
        // Absence is the membership test. Present-but-ignored is kept separate:
        // Chromium marks plain layout containers "uninteresting", which is not
        // an answer about reachability, so it is never silently read as one.
        if (!ax.present) {
          truth = false;
          basis = 'absent from the AX tree';
        } else if (ax.ignored) {
          truth = null;
          basis = 'present but ignored — Chromium does not answer this one';
        } else {
          truth = true;
          basis = `present as ${ax.role ?? 'unknown role'}`;
        }
      } else if (kind === 'name') {
        if (!ax.present) {
          truth = null;
          basis = 'not in the AX tree, so it has no accessible name to compare';
        } else {
          truth = (ax.name ?? '').trim() ? 'named' : 'nameless';
          basis = `Chromium name ${JSON.stringify((ax.name ?? '').slice(0, 60))}`;
        }
      } else if (kind === 'focusable') {
        if (ax.focusable !== null && ax.focusable !== undefined) {
          truth = ax.focusable === true;
          basis = `AX focusable=${ax.focusable}`;
        } else if (ax.disabled === true) {
          // Chromium drops `focusable` and states `disabled` instead. A disabled
          // control is out of the tab order by specification, not by heuristic,
          // so this is the browser answering rather than the harness guessing.
          truth = false;
          basis = 'AX disabled=true, and no focusable property — not in the tab order';
        } else if (!ax.present) {
          truth = null;
          basis = 'not in the AX tree, so it has no tab-order state to compare';
        } else {
          truth = null;
          basis = 'no focusable and no disabled property on the AX node';
        }
      }
      if (truth === null) {
        tally.undecidable += 1;
        if (tally.rows.length < 40) tally.rows.push({ ...row, truth: null, basis, verdict: 'undecidable' });
        continue;
      }
      const oldRight = row.old === truth;
      const newRight = row.new === truth;
      let verdict;
      if (newRight && !oldRight) {
        tally.newRight += 1;
        verdict = 'new';
      } else if (oldRight && !newRight) {
        tally.oldRight += 1;
        verdict = 'old';
      } else {
        // They disagreed, so they cannot both match; this is both missing.
        tally.bothWrong += 1;
        verdict = 'neither';
      }
      if (tally.rows.length < 40) tally.rows.push({ ...row, truth, basis, verdict });
    }
    return tally;
  };

  const p = pageResult.hot?.primitives;
  if (p) {
    verdicts.tree = score(p.tree, 'tree');
    verdicts.name = score(p.name, 'name');
    verdicts.focusTabOrder = score(p.focusTabOrder, 'focusable');
  }

  /**
   * The regions the new side newly calls out-of-tree, scored on their contents.
   *
   * This is the check on the migration's own findings. Every extra link in the
   * defect count comes from a region that changed state, so if Chromium still
   * has those links in its tree the new number is inflated and this is the
   * column that says so.
   */
  const regionEvidence = {
    regions: 0,
    linksChecked: 0,
    absent: 0,
    presentIgnored: 0,
    present: 0,
    samples: [],
  };
  for (const row of pageResult.hot?.primitives?.region?.rows ?? []) {
    if (row.new !== 'out-of-tree') continue;
    regionEvidence.regions += 1;
    for (const i of row.linkIdx ?? []) {
      const ax = cdp.byIdx[i];
      if (!ax) continue;
      regionEvidence.linksChecked += 1;
      if (!ax.present) regionEvidence.absent += 1;
      else if (ax.ignored) regionEvidence.presentIgnored += 1;
      else {
        regionEvidence.present += 1;
        // A link Chromium still has is the shape of a false positive, so it is
        // carried out by name rather than left as a count.
        if (regionEvidence.samples.length < 20) {
          regionEvidence.samples.push({
            region: row.selector,
            oldState: row.old,
            role: ax.role,
            name: (ax.name ?? '').slice(0, 60),
          });
        }
      }
    }
  }
  verdicts.regionContents = regionEvidence;

  // The navigation links get scored whether or not the implementations
  // disagreed, because `navLinks.inTree` is half the headline.
  const nav = { total: 0, oldRight: 0, newRight: 0, bothRight: 0, undecidable: 0, disagreed: 0 };
  for (const row of pageResult.hot?.navRows ?? []) {
    const ax = cdp.byIdx[row.idx];
    nav.total += 1;
    if (!ax || (ax.present && ax.ignored)) {
      nav.undecidable += 1;
      continue;
    }
    const truth = ax.present;
    const oldRight = row.old === truth;
    const newRight = row.new === truth;
    if (row.old !== row.new) nav.disagreed += 1;
    if (oldRight && newRight) nav.bothRight += 1;
    else if (oldRight) nav.oldRight += 1;
    else if (newRight) nav.newRight += 1;
  }
  verdicts.navLinks = nav;

  return { available: true, axNodes: cdp.axNodes, joined: cdp.joined, verdicts };
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

const say = (s = '') => process.stdout.write(`${s}\n`);
const rule = (label) => {
  say();
  say(`── ${label} ${'─'.repeat(Math.max(0, 74 - label.length))}`);
};

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

function delta(before, after) {
  if (before === null || after === null) return 'not measured';
  const d = after - before;
  if (d === 0) return '=';
  return d > 0 ? `+${d}` : String(d);
}

function sumMetrics(records) {
  const out = {};
  for (const m of METRICS) {
    let total = 0;
    let anyMeasured = false;
    for (const r of records) {
      const v = r[m.key];
      if (v === null || v === undefined) continue;
      anyMeasured = true;
      total += v;
    }
    // A metric no page measured stays null. Summing absent values to zero is
    // the exact bug that let a probe which never ran publish a clean brand.
    out[m.key] = anyMeasured ? total : null;
  }
  return out;
}

function reportMetricTable(label, before, after) {
  say();
  say(`  ${pad(label, 26)}${padL('before', 8)}${padL('after', 8)}${padL('delta', 9)}   kind`);
  say(`  ${'-'.repeat(60)}`);
  for (const m of METRICS) {
    const b = before[m.key];
    const a = after[m.key];
    const changed = b !== a;
    say(
      `  ${pad(m.key, 26)}${padL(b ?? '—', 8)}${padL(a ?? '—', 8)}${padL(delta(b, a), 9)}` +
        `   ${m.defect ? 'defect' : 'magnitude'}${changed ? '  <<' : ''}`
    );
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (args.report) {
    const record = JSON.parse(fs.readFileSync(args.report, 'utf8'));
    say();
    say('TWIN HARNESS — re-read from a record. No browser was launched.');
    say(`  recorded       ${record.meta?.startedAt ?? 'not recorded'}`);
    say(`  browser        ${record.meta?.browserVersion ?? 'not recorded'}`);
    say(`  before         ${record.meta?.baselineRef ?? '?'} (${record.meta?.baselineSha ?? '?'}) — probe ${record.meta?.beforeProbeHash ?? '?'}`);
    say(`  after          probe ${record.meta?.afterProbeHash ?? '?'}`);
    reportEverything(record);
    return;
  }

  for (const name of args.viewports) {
    if (!PROFILES[name]) throw new Error(`Unknown viewport “${name}”. Known: ${PROFILE_NAMES.join(', ')}`);
  }

  const axeSource = resolveAxeSource();
  if (!axeSource) throw new Error('axe-core could not be resolved; run npm install in scanner/.');

  const baseline = loadBaselineProbe(args.baselineRef);
  const oldPlain = asPlainFunction(baseline.source);
  const newPlain = collectMeasurements.toString();

  const sources = {
    oldSpliced: spliceHelperExport(oldPlain, '__twinOldHelpers', OLD_HELPERS),
    newSpliced: spliceHelperExport(newPlain, '__twinNewHelpers', NEW_HELPERS),
  };

  let targets = args.url
    ? [{ brand: 'ad-hoc', key: 'url', url: args.url }]
    : targetList();
  if (args.only) {
    const [brand, key] = args.only.split(':');
    targets = targets.filter((t) => t.brand === brand && (!key || t.key === key));
    if (targets.length === 0) throw new Error(`No targets match --only ${args.only}`);
  }

  const opts = launchOptions();
  const browser = await chromium.launch(opts);
  const provenance = browserProvenance(browser, opts);

  const record = {
    meta: {
      startedAt: new Date().toISOString(),
      ...provenance,
      baselineRef: args.baselineRef,
      baselineSha: baseline.sha,
      // The exact code in each column, named rather than assumed. Both
      // published runs were produced by probe code that no longer exists and by
      // an unrecorded browser, and nothing anywhere said so.
      beforeProbeHash: shortHash(oldPlain),
      afterProbeHash: shortHash(newPlain),
      viewports: args.viewports,
      cdp: args.cdp,
      targets: targets.length,
    },
    pages: [],
  };

  say();
  say('TWIN HARNESS — both probe implementations, one page load per reading.');
  say(`  browser        ${provenance.browserVersion ?? 'not recorded'}`);
  say(`  browser path   ${provenance.browserPath ?? 'not recorded'}`);
  say(`  before         ${args.baselineRef}${baseline.sha ? ` (${baseline.sha})` : ''} — probe ${record.meta.beforeProbeHash}`);
  say(`  after          working tree — probe ${record.meta.afterProbeHash}`);
  say(`  targets        ${targets.length} × ${args.viewports.join(', ')}`);
  say(`  adjudication   ${args.cdp ? "Chromium's own AX tree over CDP" : 'DISABLED (--no-cdp)'}`);

  for (const viewport of args.viewports) {
    const context = await launchContext(browser, viewport);
    rule(`${viewport}`);
    for (const [i, target] of targets.entries()) {
      const progress = `[${String(i + 1).padStart(2)}/${targets.length}]`;
      const result = await twinPage(context, target.url, {
        axeSource,
        cdp: args.cdp,
        rowCap: 400,
        elementCap: 6000,
        sources,
      });
      const row = { viewport, brand: target.brand, key: target.key, ...result };
      if (!result.error) row.adjudication = adjudicate(result);
      record.pages.push(row);

      if (result.error) {
        say(`  ${progress} ${target.brand}/${target.key} — FAILED: ${result.error}`);
        continue;
      }
      const moved = METRICS.filter((m) => result.before[m.key] !== result.after[m.key]);
      const summary = moved.length
        ? moved
            .map((m) => `${m.key} ${result.before[m.key]}→${result.after[m.key]}`)
            .join(', ')
        : 'identical on every metric';
      say(`  ${progress} ${pad(`${target.brand}/${target.key}`, 30)} ${summary}`);
    }
    await context.close();
  }

  await browser.close();
  record.meta.finishedAt = new Date().toISOString();

  reportEverything(record);

  const outPath =
    args.out ??
    path.join(os.tmpdir(), `agent-a11y-twin-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
  say();
  say(`Full record: ${outPath}`);
}

function reportEverything(record) {
  const ok = record.pages.filter((p) => !p.error);
  const failed = record.pages.filter((p) => p.error);

  /* ---- 1. the stability control ----------------------------------- */

  rule('STABILITY CONTROL — is the page still, and does axe.run disturb it?');
  say();
  say('  Both probes read twice in the same page load: once before axe.run, once after.');
  say('  The old probe never touches axe, so its movement is the page churning and');
  say('  nothing else. Movement on the new side beyond that is attributable to axe.run.');
  say();
  let oldChurn = 0;
  let newChurn = 0;
  const churnRows = [];
  /**
   * A metric only counts as having moved if it was measured on both passes.
   *
   * `ghostPublished` is the case, and it caught this report out once already:
   * the cold pass deliberately skips the CDP listener confirmation, so the
   * metric is `null` there and a number here. Subtracting those produced
   * "the page moved on 20 of 20 pages" from a run where nothing had moved at
   * all — a harness artefact presented as a finding about the sites. Absence is
   * not a value, and it is not a delta either.
   */
  const bothMeasured = (a, b, key) => a[key] !== null && b[key] !== null;
  for (const p of ok) {
    const oldMoved = METRICS.filter(
      (m) => bothMeasured(p.cold.before, p.before, m.key) && p.cold.before[m.key] !== p.before[m.key]
    );
    const newMoved = METRICS.filter(
      (m) => bothMeasured(p.cold.after, p.after, m.key) && p.cold.after[m.key] !== p.after[m.key]
    );
    if (oldMoved.length) oldChurn += 1;
    if (newMoved.length) newChurn += 1;
    if (oldMoved.length || newMoved.length) {
      churnRows.push({
        page: `${p.viewport} ${p.brand}/${p.key}`,
        old: oldMoved.map((m) => `${m.key} ${p.cold.before[m.key]}→${p.before[m.key]}`),
        new: newMoved.map((m) => `${m.key} ${p.cold.after[m.key]}→${p.after[m.key]}`),
      });
    }
  }
  say(`  pages measured               ${ok.length}`);
  say(`  old probe moved cold→hot     ${oldChurn}   (page churn, axe-independent)`);
  say(`  new probe moved cold→hot     ${newChurn}   (page churn + any axe.run interaction)`);
  for (const r of churnRows.slice(0, 20)) {
    say(`    ${pad(r.page, 34)} old: ${r.old.join(', ') || '—'}`);
    say(`    ${pad('', 34)} new: ${r.new.join(', ') || '—'}`);
  }
  if (churnRows.length > 20) say(`    … and ${churnRows.length - 20} more, in the JSON record.`);
  say();
  if (newChurn > oldChurn) {
    say('  READ THIS: the new probe moved on more pages than the old one. That is the');
    say('  signature of axe.run interfering with axe.commons, which is exactly the claim');
    say('  this harness was built to settle. Treat the migration as unverified.');
  } else if (newChurn === 0 && oldChurn === 0) {
    say('  Neither probe moved. The pages were still, and axe.run left axe.commons alone.');
  } else {
    say('  The new probe did not move on more pages than the old one, so nothing here');
    say('  points at axe.run. Any movement listed above is the site, not the migration.');
  }

  /* ---- 2. per-brand before/after ---------------------------------- */

  rule('PER-METRIC TOTALS, per brand and viewport');
  const groups = new Map();
  for (const p of ok) {
    const key = `${p.viewport} · ${p.brand}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const [key, pages] of groups) {
    const before = sumMetrics(pages.map((p) => p.before));
    const after = sumMetrics(pages.map((p) => p.after));
    say();
    say(`  ${key}  (${pages.length} pages measured)`);
    reportMetricTable('metric', before, after);
  }

  /* ---- 3. the headline -------------------------------------------- */

  rule('THE HEADLINE — links an agent cannot find');
  say();
  say('  The published figure is unannouncedLinks summed over a brand at the primary');
  say('  (desktop) viewport. It is one nav template counted once per sampled page, so it');
  say('  is proportional to the length of targets.mjs — a fact worth remembering before');
  say('  reading any movement below as a change on the site.');
  for (const [key, pages] of groups) {
    const before = sumMetrics(pages.map((p) => p.before))[HEADLINE_METRIC];
    const after = sumMetrics(pages.map((p) => p.after))[HEADLINE_METRIC];
    const navB = sumMetrics(pages.map((p) => p.before)).navInTree;
    const navA = sumMetrics(pages.map((p) => p.after)).navInTree;
    const navT = sumMetrics(pages.map((p) => p.before)).navTotal;
    say();
    say(`  ${key}`);
    say(`    unannouncedLinks   ${before ?? '—'} → ${after ?? '—'}   (${delta(before, after)})`);
    say(`    navLinks in tree   ${navB ?? '—'} → ${navA ?? '—'} of ${navT ?? '—'}   (${delta(navB, navA)})`);
    if (pages.length < 10) {
      say(`    partial: ${pages.length} of 10 pages, so this total is not the published figure.`);
    }
  }

  /* ---- 4. per-element disagreements ------------------------------- */

  rule('PER-ELEMENT DISAGREEMENTS, by primitive');
  const primitiveKeys = ['tree', 'name', 'focusControl', 'focusTabOrder', 'idref', 'onScreen', 'region'];
  for (const pk of primitiveKeys) {
    const stats = ok.map((p) => p.hot?.primitives?.[pk]).filter(Boolean);
    if (stats.length === 0) continue;
    const total = stats.reduce(
      (acc, s) => ({
        compared: acc.compared + s.compared,
        agree: acc.agree + s.agree,
        disagree: acc.disagree + s.disagree,
        immaterial: acc.immaterial + (s.disagreeImmaterial ?? 0),
        oldThrew: acc.oldThrew + s.oldThrew,
        newThrew: acc.newThrew + s.newThrew,
        capped: acc.capped || s.capped,
      }),
      { compared: 0, agree: 0, disagree: 0, immaterial: 0, oldThrew: 0, newThrew: 0, capped: false }
    );
    say();
    say(`  ${stats[0].primitive}`);
    say(`    ${stats[0].note}`);
    say(
      `    compared ${total.compared}   agree ${total.agree}   DISAGREE ${total.disagree}` +
        `   old threw ${total.oldThrew}   new threw ${total.newThrew}` +
        (total.capped ? '   (row cap hit — treat listed rows as a sample)' : '')
    );
    if (stats[0].materialNote) {
      say(`    plus ${total.immaterial} disagreements that cannot move a metric.`);
      say(`    ${stats[0].materialNote}`);
    }

    if (pk === 'region') {
      const transitions = {};
      for (const s of stats) {
        for (const [k, n] of Object.entries(s.transitions ?? {})) {
          transitions[k] = (transitions[k] ?? 0) + n;
        }
      }
      const ordered = Object.entries(transitions).sort((a, b) => b[1] - a[1]);
      for (const [k, n] of ordered) say(`      ${padL(n, 6)}  ${k}`);
    }
    if (pk === 'idref') {
      const kinds = {};
      for (const s of stats) {
        for (const [k, n] of Object.entries(s.kinds ?? {})) kinds[k] = (kinds[k] ?? 0) + n;
      }
      for (const [k, n] of Object.entries(kinds)) say(`      ${padL(n, 6)}  ${k}`);
    }

    // A few real rows, so the number is inspectable rather than trusted.
    const sample = [];
    for (const p of ok) {
      for (const row of p.hot?.primitives?.[pk]?.rows ?? []) {
        if (sample.length < 12) sample.push({ page: `${p.viewport} ${p.brand}/${p.key}`, ...row });
      }
    }
    for (const row of sample) {
      const extra =
        row.oldName !== undefined
          ? `  old=${JSON.stringify(row.oldName)} new=${JSON.stringify(row.newName)}`
          : '';
      say(`      ${pad(row.page, 26)} ${pad(row.selector, 30)} ${row.old} → ${row.new}${extra}`);
      // Class hashes churn and half these selectors are a bare tag name, so the
      // markup goes with the row: a finding nobody can locate is not a finding.
      say(`      ${pad('', 26)} ${String(row.html ?? '').replace(/\s+/g, ' ').slice(0, 110)}`);
    }
  }

  /* ---- 5. adjudication -------------------------------------------- */

  rule("ADJUDICATION — Chromium's own accessibility tree, over CDP");
  const adjudicated = ok.filter((p) => p.adjudication?.available);
  say();
  say(`  pages adjudicated  ${adjudicated.length} of ${ok.length}`);
  // A cap that bit is stated here rather than left to surface as a pile of
  // "Chromium has no answer", which reads like a limit of the browser when it
  // is a limit of this harness.
  const cappedPages = ok.filter((p) => p.hot?.taggedCapped);
  if (cappedPages.length) {
    say(`  element cap hit on ${cappedPages.length} page(s): rows past the cap went`);
    say('  unadjudicated and are counted as "no answer" below. Raise elementCap and re-run');
    say('  before reading those columns as a limit of the AX tree.');
  }
  const joined = adjudicated.reduce((s, p) => s + (p.cdp?.joined ?? 0), 0);
  const taggedTotal = adjudicated.reduce((s, p) => s + (p.cdp?.tagged ?? 0), 0);
  if (taggedTotal) {
    say(`  elements joined to the AX tree  ${joined} of ${taggedTotal} tagged`);
  }
  if (adjudicated.length === 0) {
    const reasons = new Set(ok.map((p) => p.adjudication?.reason).filter(Boolean));
    say(`  reason: ${[...reasons].join('; ') || 'unknown'}`);
    say('  Nothing independent scored the disagreements above. Do not read either side');
    say('  as correct on the strength of this run.');
  } else {
    for (const kind of ['tree', 'name', 'focusTabOrder']) {
      const t = adjudicated.reduce(
        (acc, p) => {
          const v = p.adjudication.verdicts[kind];
          if (!v) return acc;
          return {
            oldRight: acc.oldRight + v.oldRight,
            newRight: acc.newRight + v.newRight,
            bothWrong: acc.bothWrong + v.bothWrong,
            undecidable: acc.undecidable + v.undecidable,
          };
        },
        { oldRight: 0, newRight: 0, bothWrong: 0, undecidable: 0 }
      );
      say();
      say(`  ${kind}`);
      say(`    Chromium agrees with the NEW implementation   ${t.newRight}`);
      say(`    Chromium agrees with the OLD implementation   ${t.oldRight}`);
      say(`    Chromium agrees with neither                  ${t.bothWrong}`);
      say(`    Chromium has no answer                        ${t.undecidable}`);
      if (t.oldRight > t.newRight) {
        say('    READ THIS: the old implementation was closer to the browser on this');
        say('    primitive. That is the migration making a measurement worse, and it is');
        say('    the single most important line in this report.');
      }
      const rows = [];
      for (const p of adjudicated) {
        for (const r of p.adjudication.verdicts[kind]?.rows ?? []) {
          if (r.verdict !== 'undecidable' && rows.length < 10) {
            rows.push({ page: `${p.viewport} ${p.brand}/${p.key}`, ...r });
          }
        }
      }
      for (const r of rows) {
        say(`      ${pad(r.page, 26)} ${pad(r.selector, 30)} old=${r.old} new=${r.new}  → ${r.verdict}  (${r.basis})`);
      }
    }

    const ev = adjudicated.reduce(
      (acc, p) => {
        const v = p.adjudication.verdicts.regionContents;
        if (!v) return acc;
        return {
          regions: acc.regions + v.regions,
          linksChecked: acc.linksChecked + v.linksChecked,
          absent: acc.absent + v.absent,
          presentIgnored: acc.presentIgnored + v.presentIgnored,
          present: acc.present + v.present,
          samples: [...acc.samples, ...v.samples].slice(0, 12),
        };
      },
      { regions: 0, linksChecked: 0, absent: 0, presentIgnored: 0, present: 0, samples: [] }
    );
    say();
    say('  regions the new side newly calls out-of-tree — do their links really vanish?');
    say(`    regions reclassified              ${ev.regions}`);
    say(`    links inside them checked         ${ev.linksChecked}`);
    say(`    ABSENT from Chromium's AX tree    ${ev.absent}   (the new finding is real)`);
    say(`    present but ignored               ${ev.presentIgnored}`);
    say(`    PRESENT in Chromium's AX tree     ${ev.present}   (would be a false positive)`);
    if (ev.present > 0) {
      say('    READ THIS: Chromium still has these links. The regions below were counted');
      say('    as unreachable by the new code and should not have been.');
      for (const s of ev.samples) {
        say(`      ${pad(s.region, 34)} was ${pad(s.oldState, 18)} ${s.role} ${JSON.stringify(s.name)}`);
      }
    }

    const nav = adjudicated.reduce(
      (acc, p) => {
        const v = p.adjudication.verdicts.navLinks;
        return {
          total: acc.total + v.total,
          oldRight: acc.oldRight + v.oldRight,
          newRight: acc.newRight + v.newRight,
          bothRight: acc.bothRight + v.bothRight,
          undecidable: acc.undecidable + v.undecidable,
          disagreed: acc.disagreed + v.disagreed,
        };
      },
      { total: 0, oldRight: 0, newRight: 0, bothRight: 0, undecidable: 0, disagreed: 0 }
    );
    say();
    say('  navigation links (scored whether or not the implementations disagreed)');
    say(`    links joined to the AX tree   ${nav.total}`);
    say(`    the two implementations differ ${nav.disagreed}`);
    say(`    both match Chromium            ${nav.bothRight}`);
    say(`    only NEW matches Chromium      ${nav.newRight}`);
    say(`    only OLD matches Chromium      ${nav.oldRight}`);
    say(`    Chromium has no answer         ${nav.undecidable}`);
  }

  /* ---- 6. failures ------------------------------------------------ */

  if (failed.length) {
    rule('PAGES THAT DID NOT MEASURE');
    say();
    say('  These contribute nothing to any total above. A page that failed is not a page');
    say('  with no problems.');
    for (const p of failed) say(`    ${pad(`${p.viewport} ${p.brand}/${p.key}`, 34)} ${p.error}`);
  }

  rule('WHAT THIS RUN DOES NOT SETTLE');
  say();
  say('  · One sample per page. insureon.com serves three different documents to identical');
  say('    requests, so an absolute number here is one reading. The before/after delta is');
  say('    variance-free because both readings come from one page load; the totals are not.');
  say('  · The AX tree is main-frame only. Roughly 700–770 nodes per production page live');
  say("    in child frames and are outside every figure above, on both sides.");
  say('  · CDP carries no geometry, so nothing independent scored the on-screen primitive');
  say('    or the off-screen half of the region states.');
  say('  · The ghost columns run a transcription of core.mjs’s module-private');
  say('    confirmClickListeners. A drift there makes this report wrong, not the scanner.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
