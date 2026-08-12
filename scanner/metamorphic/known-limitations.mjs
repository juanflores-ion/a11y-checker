/**
 * The accepted-failure baseline, and the coverage boundary.
 *
 * ── The problem this solves ──────────────────────────────────────────────
 *
 * Some families are red for a reason nobody disputes. `handler-identity` is the
 * standing example: six instances of one component sharing one callback are six
 * real controls, the family is right, and the disagreement lives in a listener
 * heuristic in core.mjs that cannot separate a component from a tracker on the
 * evidence CDP carries. Its own comment in families.mjs measures the case and
 * says why the obvious fix is worse.
 *
 * A suite that is permanently red is a broken instrument. Nobody can tell an
 * expected red from a new one; within a week nobody reads the output; and the
 * first genuinely new regression lands in a wall of noise that everyone has
 * already learned to scroll past. This project has shipped a false clean twice,
 * and both times something WAS saying so — quietly, next to things that were
 * always saying so.
 *
 * So a known red is written down here, exactly, and stops failing the exit code.
 * Everything else fails, as before.
 *
 * ── The four rules, and why each one is here ─────────────────────────────
 *
 *   1. A disagreement on this list PRINTS, marked KNOWN, and does not fail.
 *      An accepted failure that becomes invisible is not accepted, it is
 *      forgotten, and it will be re-derived from scratch by whoever meets it
 *      next.
 *
 *   2. A disagreement NOT on this list fails, exit 1. Unchanged.
 *
 *   3. An entry that STOPS reproducing fails, loudly. Two things can cause it
 *      and both need a person: the tool got better and the entry is stale, or
 *      something moved underneath and this family is now measuring a different
 *      page. Stale accepted-failure lists are the mechanism by which a suite
 *      rots from a check into a decoration, and the only defence is that
 *      "nothing is wrong here any more" is also a failure.
 *
 *   4. An entry matches only when EVERY variant's measured value is exactly
 *      what was recorded. Not the spread, not the direction — the values. A
 *      spread that grew is refused because a different spread is a different
 *      set of values; so is a spread that shrank, and so is the same spread
 *      arrived at from different numbers. Recording the values rather than a
 *      bound is what makes rule 3 possible at all.
 *
 * ── Adding an entry is meant to cost something ───────────────────────────
 *
 * There is no wildcard, no `skip: true`, no per-family mute. An entry has to
 * name the family, the metric, and the measured value of EVERY variant in that
 * family — which you cannot write without having run it — plus who owns the
 * code the disagreement actually lives in, the evidence it was measured with,
 * and a reason in prose. `baselineProblems` below refuses the run if any of
 * that is missing, if the metric is one the family does not compare, if the
 * recorded values do not actually disagree, or if a variant is missing or
 * invented. That is deliberate friction: an escape hatch that costs one line
 * gets used as one.
 *
 * One thing can never be accepted, at any price: `not measured`. A null is not
 * a disagreement about a page, it is the absence of a measurement, and this
 * project's whole failure history is checks that did not run reading as checks
 * that passed. `baselineProblems` refuses a null-valued entry and the runner
 * never consults this file for an unmeasured metric.
 */

import { familyById } from './families.mjs';
import { METRIC_KEYS } from './metrics.mjs';

/* ------------------------------------------------------------------ */
/* Accepted disagreements                                              */
/* ------------------------------------------------------------------ */

/**
 * A family whose variants return different values, accepted as it stands.
 *
 * @typedef {object} AcceptedDisagreement
 * @property {string} family    family id, from families.mjs
 * @property {string} metric    metric key, from metrics.mjs, which that family preserves
 * @property {object} values    every variant id -> the value measured for it
 * @property {string} because   why this is accepted rather than fixed
 * @property {string} owner     the file or component the disagreement lives in
 * @property {string} evidence  what measured it: browser, axe, profile, date
 */
export const ACCEPTED_DISAGREEMENTS = [
  {
    family: 'handler-identity',
    metric: 'ghostControls',
    values: { 'per-instance-handlers': 6, 'shared-component-handler': 0 },
    owner: 'scanner/core.mjs — SHARED_HANDLER_SHARE in confirmClickListeners',
    evidence:
      'Chromium 149.0.7827.55, axe-core 4.13.0, desktop profile, 2026-08-12, ' +
      'node scanner/metamorphic/run.mjs --family handler-identity',
    because:
      'The family is right and the scanner is wrong, which is why this is accepted rather ' +
      'than argued: six instances of one component sharing one callback are six real ' +
      'controls. The disagreement is in a listener heuristic in core.mjs, which the ' +
      'metamorphic suite does not own.\n\n' +
      'It is accepted rather than fixed because the fix is measurably worse. The family\'s ' +
      'own comment in families.mjs carries the numbers: over CDP a component binding one ' +
      'handler to six identical cards and a tracker binding one handler to the same six ' +
      'produce the SAME evidence — one key, six candidates, share 1.00, one shape — because ' +
      'DOMDebugger.getEventListeners reports scriptId:line:column of the handler function ' +
      'and nothing about the addEventListener call site. A homogeneity guard was built and ' +
      'run: it returned this family to green and turned shared-analytics-invents-nothing ' +
      'red, publishing six fabricated controls on a page whose elements do nothing when ' +
      'clicked. That is the Insureon incident, traded for this red.\n\n' +
      'Closing it means instrumenting addEventListener before page scripts run, which is a ' +
      'decision about what evidence this scanner collects rather than a bug fix, and it ' +
      'belongs to whoever owns core.mjs. Until then the honest state is a red with its ' +
      'reason written down — and, now, one that does not drown the next real regression.',
  },
];

/* ------------------------------------------------------------------ */
/* Accepted pinned-value misses                                        */
/* ------------------------------------------------------------------ */

/**
 * A variant whose pinned value is not what comes back, accepted as it stands.
 *
 * Kept apart from the list above for the reason run.mjs keeps the two failures
 * apart everywhere else: a disagreement says the scanner answered one page two
 * ways and nobody has to know which is right, and a missed pin says a number
 * somebody wrote down in families.mjs is not what came back. Accepting one is
 * not the same act as accepting the other, and blurring them would let the
 * weaker claim borrow the stronger one's authority.
 *
 * Empty, and that is the current honest state rather than an oversight. Every
 * pin in families.mjs is met by the tree it was written against.
 *
 * @typedef {object} AcceptedPinnedMiss
 * @property {string} family    family id
 * @property {string} variant   variant id within that family
 * @property {string} metric    metric key, pinned on that variant in families.mjs
 * @property {*}      expected  the pin, repeated here so a drifting pin is caught
 * @property {*}      actual    what the scanner returns instead
 * @property {string} because   why this is accepted rather than fixed
 * @property {string} owner     the file or component it lives in
 * @property {string} evidence  what measured it
 */
export const ACCEPTED_PINNED_MISSES = [];

/* ------------------------------------------------------------------ */
/* The coverage boundary                                               */
/* ------------------------------------------------------------------ */

/**
 * Shapes this suite deliberately takes NO position on.
 *
 * Nothing here fails and nothing here passes — these are cases where the suite
 * has been asked for an answer and the honest reply is that the question is not
 * decidable as the metric is currently defined, or that the gap is real and out
 * of scope for the change in hand. They print with the report because a
 * limitation nobody can see is a limitation everybody re-discovers, and because
 * the alternative — leaving them implied by the absence of a family — is how
 * "we never checked that" becomes indistinguishable from "we checked and it was
 * fine".
 *
 * `wouldContradict` is optional and is a tripwire rather than decoration: where
 * an entry exists because some other family already asserts the opposite, that
 * family is named and `baselineProblems` refuses the run if it is renamed or
 * removed. An undecidability that outlives the thing that made it undecidable
 * is just a stale note.
 */
export const NOT_ASSERTED = [
  {
    shape:
      'A <button aria-expanded> accordion sharing a parent with an unrelated :hover ' +
      'mega-menu. Six links an agent cannot find are published as 0.',
    wouldContradict: 'trigger-placement',
    because:
      'Undecidable as the metric is defined, and identical on main, so it is not a ' +
      'regression. A bare aria-expanded trigger declares no target: nothing in the DOM ' +
      'says what it controls, and this tool has already decided that the conventional ' +
      'sibling shape counts — trigger-placement asserts exactly that over its ' +
      'sibling-expanded and sibling-haspopup variants, on markup indistinguishable from ' +
      'this. A family asserting the opposite would make the suite red whichever way ' +
      'probes.mjs was written. Deciding it means changing what "announced" means — either ' +
      'requiring an IDREF, which reports every correct disclosure that omits one, or ' +
      'giving the metric a confidence band. Both are product decisions, not fixes.',
  },
  {
    shape:
      'A region stranded by overflow: clip. Nothing reports it — not this branch, and not ' +
      'main.',
    because:
      'A real false negative, acknowledged rather than closed. Measured on a two-slide ' +
      'carousel varying only the container overflow, Chromium 149.0.7827.55: clip is the ' +
      'one value where the browser does NOT scroll the content into view on focus ' +
      '(scrollLeft 0 -> 0, against 0 -> 306 for hidden, auto and scroll) and it is also ' +
      'the one value axe answers isVisibleOnScreen: true for. So the case that really does ' +
      'strand its content is the case nothing sees. Closing it is a widening of what this ' +
      'probe finds rather than a correction to it, and it does not belong in a fix for a ' +
      'regression. clipped-container carries a carousel-clip variant so the shape is at ' +
      'least measured on every run.',
  },
  {
    shape:
      'An off-canvas drawer parked outside a container whose overflow is auto or scroll, ' +
      'where left and right legitimately differ.',
    wouldContradict: 'offcanvas-drawer-mirrors',
    because:
      'The mirror-image claim is asserted for overflow: hidden only, and that is a fact ' +
      'about browsers rather than a hole. A scroll container\'s scrollable extent runs ' +
      'right and down from its origin: content parked past the right edge of an auto or ' +
      'scroll container is one gesture away, and the identical content parked past the ' +
      'left edge is not reachable at all. The page is symmetric and the browser is not, so ' +
      'requiring the two to agree there would require the scanner to be wrong about one of ' +
      'them. hidden and clip are the values where neither side is reachable, and hidden is ' +
      'where the regression was measured.',
  },
];

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const serialize = (v) => JSON.stringify(v ?? null);

/**
 * Check the baseline is well-formed, against the families it refers to.
 *
 * Returns a list of problems, empty when the file is sound. run.mjs treats a
 * non-empty list the way it treats a malformed family — a configuration error
 * that stops the run before anything is measured, rather than a test failure —
 * because a baseline nobody can parse cannot be trusted to be accepting only
 * what it claims to accept.
 */
export function baselineProblems() {
  const problems = [];

  const requireProse = (entry, label, field) => {
    const value = entry[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      problems.push(`${label} has no ${field}`);
    }
  };

  /* -- accepted disagreements -------------------------------------- */

  const seenDisagreement = new Set();
  for (const entry of ACCEPTED_DISAGREEMENTS) {
    const label = `accepted disagreement ${entry.family}/${entry.metric}`;
    const family = familyById(entry.family);
    if (!family) {
      problems.push(`${label} names a family that does not exist`);
      continue;
    }
    if (!METRIC_KEYS.includes(entry.metric)) {
      problems.push(`${label} names a metric that does not exist`);
      continue;
    }
    /**
     * A metric the family exempts is never compared, so an entry accepting a
     * disagreement on it accepts nothing and would report stale forever.
     */
    if (!family.preserves.includes(entry.metric)) {
      problems.push(`${label} accepts a metric this family does not preserve`);
    }
    const key = `${entry.family}/${entry.metric}`;
    if (seenDisagreement.has(key)) problems.push(`${label} is listed twice`);
    seenDisagreement.add(key);

    requireProse(entry, label, 'because');
    requireProse(entry, label, 'owner');
    requireProse(entry, label, 'evidence');

    const values = entry.values;
    if (!values || typeof values !== 'object') {
      problems.push(`${label} records no measured values`);
      continue;
    }
    const variantIds = family.variants.map((v) => v.id);
    for (const id of variantIds) {
      if (!(id in values)) problems.push(`${label} does not record a value for “${id}”`);
    }
    for (const id of Object.keys(values)) {
      if (!variantIds.includes(id)) problems.push(`${label} records “${id}”, not a variant`);
    }
    /**
     * `null` is "not measured" and is never acceptable — see this file's
     * preamble. It is checked here as well as at the point of use so a
     * null-valued entry cannot sit in the file looking legitimate.
     */
    if (Object.values(values).some((v) => v === null || v === undefined)) {
      problems.push(`${label} records a not-measured value, which can never be accepted`);
    }
    if (new Set(Object.values(values).map(serialize)).size < 2) {
      problems.push(`${label} records values that agree, so there is nothing to accept`);
    }
  }

  /* -- accepted pinned misses -------------------------------------- */

  const seenMiss = new Set();
  for (const entry of ACCEPTED_PINNED_MISSES) {
    const label = `accepted pinned miss ${entry.family}/${entry.variant}/${entry.metric}`;
    const family = familyById(entry.family);
    if (!family) {
      problems.push(`${label} names a family that does not exist`);
      continue;
    }
    const variant = family.variants.find((v) => v.id === entry.variant);
    if (!variant) {
      problems.push(`${label} names a variant that does not exist`);
      continue;
    }
    if (!METRIC_KEYS.includes(entry.metric)) {
      problems.push(`${label} names a metric that does not exist`);
      continue;
    }
    const key = `${entry.family}/${entry.variant}/${entry.metric}`;
    if (seenMiss.has(key)) problems.push(`${label} is listed twice`);
    seenMiss.add(key);

    /**
     * The pin is repeated in the entry so that changing it in families.mjs
     * invalidates the acceptance. An accepted miss is an agreement about two
     * specific numbers; if either moves, nobody has agreed to anything.
     */
    const pinned = variant.expects ?? {};
    if (!(entry.metric in pinned)) {
      problems.push(`${label} accepts a miss on a metric this variant does not pin`);
    } else if (serialize(pinned[entry.metric]) !== serialize(entry.expected)) {
      problems.push(
        `${label} records expected ${serialize(entry.expected)} but families.mjs pins ` +
          `${serialize(pinned[entry.metric])}`
      );
    }
    if (entry.actual === null || entry.actual === undefined) {
      problems.push(`${label} records a not-measured value, which can never be accepted`);
    }
    if (serialize(entry.actual) === serialize(entry.expected)) {
      problems.push(`${label} records an actual value equal to the pin, so nothing is missed`);
    }

    requireProse(entry, label, 'because');
    requireProse(entry, label, 'owner');
    requireProse(entry, label, 'evidence');
  }

  /* -- the coverage boundary --------------------------------------- */

  for (const [index, entry] of NOT_ASSERTED.entries()) {
    const label = `not-asserted entry ${index + 1}`;
    requireProse(entry, label, 'shape');
    requireProse(entry, label, 'because');
    if (entry.wouldContradict !== undefined) {
      if (!familyById(entry.wouldContradict)) {
        problems.push(
          `${label} says it would contradict “${entry.wouldContradict}”, which is not a family`
        );
      }
    }
  }

  return problems;
}

/* ------------------------------------------------------------------ */
/* Lookup and matching                                                 */
/* ------------------------------------------------------------------ */

export const acceptedDisagreement = (familyId, metric) =>
  ACCEPTED_DISAGREEMENTS.find((e) => e.family === familyId && e.metric === metric) ?? null;

export const acceptedPinnedMiss = (familyId, variantId, metric) =>
  ACCEPTED_PINNED_MISSES.find(
    (e) => e.family === familyId && e.variant === variantId && e.metric === metric
  ) ?? null;

const spreadOf = (values) => {
  const numbers = values.filter((v) => typeof v === 'number');
  if (numbers.length !== values.length || numbers.length === 0) return null;
  return Math.max(...numbers) - Math.min(...numbers);
};

/**
 * Does what was just measured match what this entry recorded?
 *
 * Exact, per variant. Returns `{ ok }` when it does, and when it does not,
 * everything a person needs to decide which side moved — including both
 * spreads, because "the spread grew" is the specific thing rule 4 forbids and
 * it should be legible in the failure rather than inferred from two lists.
 */
export function disagreementMatches(entry, comparison) {
  const measured = Object.fromEntries(comparison.values.map((v) => [v.variant, v.value]));
  const differing = [];
  for (const [variant, recorded] of Object.entries(entry.values)) {
    if (serialize(measured[variant]) !== serialize(recorded)) {
      differing.push({ variant, recorded, measured: measured[variant] });
    }
  }
  if (differing.length === 0) return { ok: true };
  return {
    ok: false,
    differing,
    recordedSpread: spreadOf(Object.values(entry.values)),
    measuredSpread: comparison.spread,
  };
}

/** Every accepted entry that belongs to one of the families being run. */
export function acceptancesFor(families) {
  const ids = new Set(families.map((f) => f.id));
  return {
    disagreements: ACCEPTED_DISAGREEMENTS.filter((e) => ids.has(e.family)),
    pinnedMisses: ACCEPTED_PINNED_MISSES.filter((e) => ids.has(e.family)),
  };
}

