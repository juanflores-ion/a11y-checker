/**
 * What gets compared, and what "disagree" means.
 *
 * ── Why this list and not axe's ──────────────────────────────────────────
 *
 * Every metric here is one probes.mjs computes, or — for the last two — one the
 * dashboard computes from nothing but probes.mjs output, which is what makes
 * "did this move the published verdict" answerable here. axe's own rule results are
 * deliberately absent: they are a third party's measurement, they legitimately
 * differ between the variants (an `aria-hidden` panel full of links trips
 * `aria-hidden-focus`; a `display: none` one cannot), and they are not what this
 * suite is for. The subject is the five primitives the scanner used to
 * hand-implement — tree membership, accessible name, focusability, IDREF
 * resolution and on-screen visibility — and every number below is downstream of
 * at least one of them.
 *
 * ── Not measured is not zero ─────────────────────────────────────────────
 *
 * A field that is absent, a field of the wrong type, or a page the scanner
 * refused to measure reads `null` here and never `0`. `null` fails the family it
 * appears in, unconditionally and without being compared to anything: two
 * variants that both failed to measure have not agreed about anything. This is
 * the same rule aggregate.ts applies with `notMeasured`, and it is here for the
 * same reason — this project has twice published a clean result produced by a
 * check that never ran.
 */

/** `[]` is a measurement whose answer is zero; a missing field is not. */
const arrayCount = (v) => (Array.isArray(v) ? v.length : null);
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const flag = (v) => (typeof v === 'boolean' ? v : null);

/**
 * The published ghost-control count, as the dashboard computes it.
 *
 * C3 of the shared contract: a candidate whose listener the browser explicitly
 * denied is not a defect, and `confirmedListener === null` means CDP could not
 * answer, which is not a denial. `src/lib/model.ts` owns this definition for the
 * viewer and exports `countsAsGhostControl`; the scanner cannot import it — the
 * viewer and the scanner share no code and no dependencies, which is what keeps
 * the viewer a portable static export. So it is restated here, once, next to a
 * pointer at the file that owns it. If the two ever disagree, model.ts is right.
 */
const countsAsGhostControl = (control) => control?.confirmedListener !== false;

/**
 * `sum(field)` over a list, or `null` if the list was never measured. Written
 * out rather than reached for with `?? 0`, because `?? 0` on an absent probe is
 * precisely the bug that shipped in compare.ts.
 */
const sumOf = (list, field) =>
  Array.isArray(list) ? list.reduce((total, item) => total + (finite(item?.[field]) ?? 0), 0) : null;

/**
 * What the dashboard says about the off-screen panel, and then about the page.
 *
 * Same arrangement as `countsAsGhostControl` above and for the same reason:
 * `src/lib/model.ts` owns both definitions — `phantomPanelState()` and
 * `pageVerdict()` — and the scanner cannot import them, because the viewer and
 * the scanner share no code and no dependencies. They are restated here, once,
 * next to a pointer at the file that owns them. If the two ever disagree,
 * model.ts is right and this is the copy that must move.
 *
 * The reason a suite about probe output reaches this far downstream at all: a
 * probe number nobody reads is a curiosity, and a probe number that alone
 * decides whether a page is published as `blocking` is a headline. The
 * clipped-container family turns on exactly that distinction, so the verdict has
 * to be visible to it.
 *
 * ── Why axe's violations are left out of the verdict ────────────────────
 *
 * `pageVerdict()` also escalates on a critical or serious axe violation. That
 * half is deliberately not restated, for the reason the preamble already gives:
 * axe's rule results legitimately differ between variants — an `aria-hidden`
 * panel full of links trips `aria-hidden-focus` and a `display: none` one cannot
 * — so folding them in would make this metric disagree for reasons that are not
 * about the probes at all. What is left is the verdict as the probes alone
 * determine it, which is also the exact question the clipped-container family
 * asks: can this one panel, on its own, set the verdict for the whole page.
 *
 * Note what that leaves, and do not mistake it for a coincidence: with the axe
 * half removed the verdict is a pure relabelling of the phantom state. On a page
 * whose only finding is one clipped carousel slide, that slide IS the published
 * verdict. That is the finding, not an artefact of writing it this way.
 */
const phantomPanelState = (p) => {
  if (!('phantomMenu' in p)) return null;
  const pm = p.phantomMenu;
  if (!pm) return 'none'; //         measured: no off-screen panel at all
  if (pm.focusable === 0) return 'none'; // an empty region traps nobody
  /**
   * model.ts carries a second path that recovers these two fields from
   * `hiddenPanels` when a historic run file predates them. Nothing here is
   * historic — every page in this suite is scanned by the build under test — so
   * a missing field means the scanner stopped emitting it, and the honest answer
   * to that is "not measured". `null` fails the family; a guessed `false` would
   * quietly turn a broken field into a defect, and a guessed `true` into a clean.
   */
  if (typeof pm.hasKeyboardTrigger !== 'boolean') return null;
  if (typeof pm.triggerHasAriaExpanded !== 'boolean') return null;
  return pm.hasKeyboardTrigger && pm.triggerHasAriaExpanded ? 'announced' : 'unannounced';
};

export const METRICS = [
  {
    key: 'namelessButtons',
    label: 'nameless buttons',
    read: (p) => arrayCount(p.namelessButtons),
  },
  { key: 'namelessLinks', label: 'nameless links', read: (p) => arrayCount(p.namelessLinks) },
  { key: 'emptyHref', label: 'empty href', read: (p) => arrayCount(p.emptyHref) },
  { key: 'hasMain', label: 'has main landmark', read: (p) => flag(p.hasMain) },
  {
    key: 'ghostCandidates',
    label: 'ghost candidates (before listener confirmation)',
    /**
     * The candidate net, ahead of CDP. Separated from the published count
     * because they fail differently: this one moves when the DOM walk picks a
     * different element, the one below moves when the listener lookup lands on
     * an element that does not own the handler. A single number would blur the
     * two and make a disagreement unattributable.
     */
    read: (p) => arrayCount(p.ghostControls),
  },
  {
    key: 'ghostControls',
    label: 'ghost controls (published)',
    read: (p) =>
      Array.isArray(p.ghostControls) ? p.ghostControls.filter(countsAsGhostControl).length : null,
  },
  {
    key: 'clickableNoRole',
    label: 'clickable, no role (magnitude)',
    /** Not a defect — C3 — but it must still not move when nothing behavioural did. */
    read: (p) => finite(p.clickableNoRole),
  },
  { key: 'hiddenPanels', label: 'hidden panels', read: (p) => arrayCount(p.hiddenPanels) },
  {
    key: 'hiddenPanelFocusable',
    label: 'controls inside hidden panels',
    read: (p) => sumOf(p.hiddenPanels, 'focusable'),
  },
  {
    key: 'phantomFocusable',
    label: 'phantom menu focusable',
    /**
     * `phantomMenu: null` is a measured answer — the page has no hidden panel —
     * and reads 0. A page whose scan never produced the field at all reads
     * `null`. The data contract distinguishes these and so does this.
     */
    read: (p) => {
      if (!('phantomMenu' in p)) return null;
      if (p.phantomMenu === null) return 0;
      return finite(p.phantomMenu?.focusable);
    },
  },
  {
    key: 'unreachablePanels',
    label: 'panels out of the tree',
    /** Not a defect — C3. Out of the tree is how a closed menu is meant to behave. */
    read: (p) => finite(p.unreachableTotals?.panels),
  },
  {
    key: 'unannouncedPanels',
    label: 'panels nothing announces',
    read: (p) => finite(p.unreachableTotals?.unannouncedPanels),
  },
  {
    key: 'unannouncedFocusable',
    label: 'controls an agent cannot find',
    read: (p) => finite(p.unreachableTotals?.unannouncedFocusable),
  },
  {
    key: 'unannouncedLinks',
    label: 'links an agent cannot find',
    read: (p) => finite(p.unreachableTotals?.unannouncedLinks),
  },
  { key: 'navLinksTotal', label: 'nav links in the DOM', read: (p) => finite(p.navLinks?.total) },
  { key: 'navLinksInTree', label: 'nav links in the tree', read: (p) => finite(p.navLinks?.inTree) },
  {
    key: 'phantomPanelState',
    label: 'what the dashboard says about the off-screen panel',
    read: phantomPanelState,
  },
  {
    key: 'verdictFromProbes',
    label: 'page verdict, on the probes’ evidence alone',
    /**
     * `pageVerdict()` from model.ts with the axe half removed — see the block
     * comment above `phantomPanelState` for why, and for why this being a
     * relabelling of the state is the point rather than a redundancy.
     */
    read: (p) => {
      const state = phantomPanelState(p);
      if (state === null) return null;
      if (state === 'unannounced') return 'blocking';
      if (state === 'announced') return 'needs-work';
      return 'clear';
    },
  },
];

export const METRIC_KEYS = METRICS.map((m) => m.key);
const BY_KEY = new Map(METRICS.map((m) => [m.key, m]));
export const metricLabel = (key) => BY_KEY.get(key)?.label ?? key;

/**
 * Read every metric off one `scanPage` result.
 *
 * A page the scanner refused — `{ url, error }` — yields `null` for every
 * metric rather than an object of zeros. A failed scan is not a clean page, and
 * it must not be able to agree with anything.
 */
export function measure(result) {
  const reading = {};
  const failed = !result || typeof result !== 'object' || result.error;
  for (const metric of METRICS) {
    if (failed) {
      reading[metric.key] = null;
      continue;
    }
    let value = null;
    try {
      value = metric.read(result);
    } catch {
      // A reader that threw measured nothing. Never a zero.
      value = null;
    }
    reading[metric.key] = value ?? null;
  }
  return reading;
}

/**
 * Compare one metric across a family's variants.
 *
 * Returns `{ status, values, spread }` where status is:
 *   'agree'         every variant returned the same value
 *   'disagree'      they did not — the finding
 *   'not-measured'  at least one variant produced no measurement at all
 *
 * `not-measured` is kept separate from `disagree` and reported first, because
 * they need different responses: one is a bug in what the scanner computes, the
 * other is a bug in whether it ran. Collapsing them is how "the check did not
 * exist" once rendered as a good result.
 */
export function compareMetric(readings, key) {
  const values = readings.map(({ variant, reading }) => ({ variant, value: reading[key] }));
  if (values.some((v) => v.value === null)) {
    return { status: 'not-measured', values, spread: null };
  }
  const distinct = [...new Set(values.map((v) => JSON.stringify(v.value)))];
  if (distinct.length === 1) return { status: 'agree', values, spread: 0 };

  const numbers = values.map((v) => v.value).filter((v) => typeof v === 'number');
  const spread = numbers.length === values.length ? Math.max(...numbers) - Math.min(...numbers) : null;
  return { status: 'disagree', values, spread };
}
