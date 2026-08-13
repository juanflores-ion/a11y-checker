/**
 * The variant families.
 *
 * A family is a set of pages that differ in exactly one way that no user, screen
 * reader or agent could observe, together with a written statement of which
 * measurements that difference is allowed to touch. The assertion is never "the
 * answer is N". It is "these must agree".
 *
 * ── Every metric must be classified, and the runner enforces it ──────────
 *
 * The hard lesson from the session that produced this suite: a variant that used
 * `<a href="#">` as its trigger added a nav link, the nav-link count moved, and
 * the suite reported a defect that lived in the *test*. The response is not "be
 * careful". It is that `preserves` and `pinnedInstead` between them must name
 * every metric in metrics.mjs — no more, no less — and run.mjs refuses to run a
 * family that leaves one unclassified or names one twice.
 *
 * That makes the failure mode loud in the right direction. Forgetting a metric
 * is a configuration error the runner reports and exits non-zero on; it can
 * never quietly become "this family doesn't check that".
 *
 * ── `pinnedInstead` is not a mute, and used to be one ────────────────────
 *
 * This field was called `mayDiffer` and it took a metric plus a sentence. The
 * sentence was the entire check: `declarationProblems` asked only that `because`
 * be a non-empty string. An adversarial reviewer spliced a real, reproducible
 * disagreement into a family — ghostControls 6 against 0, the handler-identity
 * finding — exempted it with `because: 'flaky'`, and the suite printed
 * "AGREE, 1/1 families agree", exit 0, with the word "flaky" on one line that
 * reads like a footnote. It was not even counted in the baseline total. That is
 * the tenth instance of this project's only failure mode: something is found,
 * something suppresses it, and NOTHING is published in its place.
 *
 * So prose no longer buys an exemption. `pinnedInstead` now means one thing that
 * the runner can verify without reading English: every variant in this family
 * pins this metric with `expects`, and the pins are not all the same value.
 * Agreement is the wrong assertion here because the family says the number MUST
 * move, and it says which way, per variant, in this file. The exemption is not a
 * hole — it is a stronger claim than the one it replaces, and a regression
 * spliced into a pinned metric fails on the pin.
 *
 * There is no longer any way to declare a metric unchecked. If a metric really
 * does disagree for a reason nobody can fix, that is an entry in
 * known-limitations.mjs: named owner, evidence naming the browser and axe
 * version and the command, and the measured value of EVERY variant. It prints on
 * every run, it is counted, and it fails the day it stops reproducing. A
 * suppression is only legitimate when the thing it defers to is itself
 * published.
 *
 * The fixtures in fixtures.mjs were built so that each transform is
 * metric-neutral by construction, and where a transform could not be (the closed
 * `<details>` mechanism carries its own trigger) the fixture comment says so and
 * a second family holds that axis still. If you find yourself reaching for
 * `pinnedInstead`, check first whether the fixture can be made neutral instead.
 *
 * ── The one place a value is stated, and what it costs ───────────────────
 *
 * A variant may carry `expects: { metric: value }`, and the runner fails the
 * family when the measurement is not that value. This is a concession and it is
 * fenced accordingly, because stating expected values is precisely what the
 * hand-written benchmark did and precisely why it caught at most one of five
 * shipped faults: the fixture's label and the probe's rule come from the same
 * head.
 *
 * It buys two things agreement alone cannot express.
 *
 *   A transform that is *deliberately* behavioural. Giving a menu a button whose
 *   `aria-controls` really resolves to it changes what an agent can do, so the
 *   number must move — and "it moved" is not the claim. The claim is which way.
 *   The metric is exempted from agreement and pinned per variant instead, so the
 *   exemption is not a hole.
 *
 *   A floor that agreement cannot hold. Three variants that all report nothing
 *   agree perfectly. Where the family exists to say a rescue must keep firing —
 *   or must not start firing everywhere — the shared value is the whole point,
 *   and without it "delete the rescue" and "delete the probe" both pass.
 *
 * Everywhere else, do not. If a family can be written as agreement, write it as
 * agreement: nobody has to know the right answer, and that is the only property
 * that has ever found an unknown fault here.
 */

import { METRIC_KEYS } from './metrics.mjs';

/** Shorthand: this family claims the transform touches nothing at all. */
const preservesEverything = () => ({ preserves: [...METRIC_KEYS], pinnedInstead: [] });

/**
 * The analytics families need a page whose ghost candidates are countable and
 * numerous: `SHARED_HANDLER_SHARE` only engages once four or more candidates
 * carry a listener, so a page with one hamburger cannot exercise it at all.
 * Six role-less back controls is Insureon's actual mobile shape.
 */
const CARD_PAGE = { hamburger: false, cards: 6 };

export const FAMILIES = [
  {
    id: 'hiding-mechanism',
    title: 'An announced panel scores the same however it is hidden',
    why:
      'probes.mjs used to enumerate hiding mechanisms in two places — four in one, ' +
      'six three hundred lines away — so a panel hidden with content-visibility: hidden ' +
      'was reported by neither. The enumeration now lives in axe, which is the point: ' +
      'it widens for every mechanism at once. These eight are the same fact about the ' +
      'page written eight ways, and measured in Chromium 149 all eight leave the panel ' +
      'contents out of the accessibility tree. If any one of them drifts out of axe\'s ' +
      'knowledge, this family is what says so.',
    ...preservesEverything(),
    variants: [
      { id: 'display-none', options: { hiding: 'display-none' } },
      { id: 'visibility-hidden', options: { hiding: 'visibility-hidden' } },
      { id: 'visibility-collapse', options: { hiding: 'visibility-collapse' } },
      { id: 'hidden-attr', options: { hiding: 'hidden-attr' } },
      { id: 'hidden-until-found', options: { hiding: 'hidden-until-found' } },
      { id: 'content-visibility', options: { hiding: 'content-visibility' } },
      { id: 'inert', options: { hiding: 'inert' } },
      { id: 'closed-details', options: { hiding: 'closed-details' } },
    ],
  },

  {
    id: 'icon-technique',
    title: 'The glyph inside a control does not decide whether the control is found',
    why:
      'This is the family that earned the technique its place in the plan. Five ' +
      'hamburgers differing only in icon technique scored 0, 0, 1, 1, 1 against the ' +
      'pre-fix probe, with no human label anywhere — the only unknown fault the whole ' +
      'investigation turned up, and it was found by disagreement alone. All five below ' +
      'are the same control: a 44x44 hit area with a real click listener, no accessible ' +
      'name, and no way for a keyboard to reach it. An agent is equally stuck on all ' +
      'five, so the numbers must be equal on all five.',
    ...preservesEverything(),
    variants: [
      { id: 'aria-hidden-span', options: { icon: 'aria-hidden-span' } },
      { id: 'svg-title', options: { icon: 'svg-title' } },
      { id: 'background-image', options: { icon: 'background-image' } },
      { id: 'pseudo-before', options: { icon: 'pseudo-before' } },
      { id: 'img-alt-empty', options: { icon: 'img-alt-empty' } },
    ],
  },

  {
    id: 'declared-relationship',
    title: 'A declared relationship announces its panel however it is written',
    why:
      'The scanner counts a hidden region as findable only when the markup DECLARES ' +
      'which control opens it, because that is the only form an agent can compute. ' +
      'Every variant below writes that declaration a different way — aria-controls at ' +
      'the wrapper, aria-controls at the inner panel, aria-owns, a trigger in the site ' +
      'header nowhere near what it opens, and a native <summary> where the spec writes ' +
      'the edge for you. All five say the same thing, so all five must score the same. ' +
      'This family caught the drift it exists for on its first run: declaredTargets() ' +
      'resolved aria-owns while announces() did not know the attribute, so the trigger ' +
      'was found and the verdict still came back unannounced. Both now read one list.',
    ...preservesEverything(),
    variants: [
      { id: 'sibling-controls', options: { trigger: 'sibling-controls' } },
      { id: 'sibling-inner-controls', options: { trigger: 'sibling-inner-controls' } },
      { id: 'aria-owns', options: { trigger: 'aria-owns' } },
      { id: 'remote-controls', options: { trigger: 'remote-controls' } },
      { id: 'closed-details', options: { trigger: 'closed-details' } },
    ],
  },

  {
    id: 'undeclared-relationship',
    title: 'An undeclared trigger announces nothing, wherever it stands',
    why:
      'The mirror of declared-relationship, and the rule that replaced two months of ' +
      'narrowing heuristics. aria-expanded and aria-haspopup are STATE: they say ' +
      'something opens, never what. Pairing one with a region requires reading the ' +
      'layout, which a sighted person does and an agent cannot, so this scanner does ' +
      'not credit it. Every measured false clean on the headline metric came through ' +
      'the heuristic that did — a <summary> three levels down an unrelated <details>, ' +
      'a "Manage cookie preferences" button five wrappers away, an aria-haspopup chat ' +
      'button in a header — and each fix narrowed which neighbours counted while the ' +
      'next shape stayed open. Measured on both brands: a hamburger carrying ' +
      'aria-expanded beside a visibility:hidden drawer with no id, 68 and 64 links ' +
      'credited to a relationship nobody wrote down. These three variants move the ' +
      'undeclared trigger around; none of them may rescue the panel, so all three ' +
      'must score the same. This family is what stops the heuristic growing back.',
    ...preservesEverything(),
    variants: [
      { id: 'sibling-haspopup', options: { trigger: 'sibling-haspopup' } },
      { id: 'sibling-expanded', options: { trigger: 'sibling-expanded' } },
      { id: 'nested-trigger', options: { trigger: 'nested-trigger' } },
    ],
  },

  {
    id: 'inert-wrapper',
    title: 'Meaningless divs in the way change nothing',
    why:
      'Wrapping a subtree in extra non-semantic divs is what every layout refactor, ' +
      'grid system and component boundary does, and it changes nothing an agent can ' +
      'perceive. It does change how far disclosureFor() has to walk to relate a trigger ' +
      'to a panel, and which region the outermost-of-state dedup selects. The wrappers ' +
      'carry no CSS rules at all and are inserted from the outside of every control — ' +
      'wrapping *inside* a candidate changes which element is innermost, which is a ' +
      'different transform with a different claim, and belongs to icon-technique.',
    ...preservesEverything(),
    variants: [
      { id: 'depth-0', options: { wrapDepth: 0 } },
      { id: 'depth-1', options: { wrapDepth: 1 } },
      { id: 'depth-2', options: { wrapDepth: 2 } },
      { id: 'depth-4', options: { wrapDepth: 4 } },
    ],
  },

  {
    id: 'class-hash-churn',
    title: 'Regenerating CSS-in-JS class names changes nothing',
    why:
      'Class hashes like backButton--CYYVi change on every deploy, which is why the ' +
      'README\'s rule is "don\'t track individual elements" and why phantomMenu stopped ' +
      'being a hardcoded [class*="megaMenu"] selector and became "the largest hidden ' +
      'panel". This family is that rule made executable: nothing in the scan may key on ' +
      'a class name. It is cheap and it is the one family expected to stay green ' +
      'forever — which is exactly what makes it valuable the day somebody reaches for a ' +
      'selector again.',
    ...preservesEverything(),
    variants: [
      { id: 'salt-k3f9x', options: { salt: 'k3f9x' } },
      { id: 'salt-CYYVi', options: { salt: 'CYYVi' } },
      { id: 'salt-1wy0on6', options: { salt: '1wy0on6' } },
      { id: 'salt-a', options: { salt: 'a' } },
    ],
  },

  {
    id: 'shared-analytics-keeps-findings',
    title: 'Page-wide analytics must not erase real findings',
    why:
      'sgtracker.js:4 as a test, in the direction nobody checks. Six role-less back ' +
      'controls, each with its own real click handler, are six findings. Loading an ' +
      'analytics script that binds one more handler to all of them adds telemetry and ' +
      'removes nothing — every one of those controls still does what it did. If ' +
      'SHARED_HANDLER_SHARE ever disqualifies the controls along with the tracker, the ' +
      'page reports clean and the tool has shipped its third false clean. Load order is ' +
      'varied too, because a guard that depends on which script parsed first is not a ' +
      'guard.',
    ...preservesEverything(),
    variants: [
      { id: 'no-tracker', options: { ...CARD_PAGE, ownHandlers: 'per-instance' } },
      {
        id: 'tracker-after',
        options: { ...CARD_PAGE, ownHandlers: 'per-instance', tracker: true },
      },
      {
        id: 'tracker-first',
        options: { ...CARD_PAGE, ownHandlers: 'per-instance', tracker: true, trackerFirst: true },
      },
    ],
  },

  {
    id: 'shared-analytics-invents-nothing',
    title: 'Page-wide analytics must not manufacture findings',
    why:
      'The direction the guard was actually built for. On Insureon every one of ' +
      'thirty-seven confirmed listeners resolved to a single line of one analytics ' +
      'file, and the probe read each as proof that a decorative element was secretly a ' +
      'control: fourteen defects reported against source files containing no handler. ' +
      'The elements below do nothing when clicked. Binding a page-wide beacon to them ' +
      'must leave them exactly as uninteresting as they were with no script on the page ' +
      'at all.',
    ...preservesEverything(),
    variants: [
      { id: 'no-script', options: { ...CARD_PAGE, ownHandlers: 'none' } },
      { id: 'tracker-only', options: { ...CARD_PAGE, ownHandlers: 'none', tracker: true } },
      {
        id: 'tracker-only-first',
        options: { ...CARD_PAGE, ownHandlers: 'none', tracker: true, trackerFirst: true },
      },
    ],
  },

  {
    id: 'handler-identity',
    title: 'Six controls are six controls whether or not they share a handler function',
    why:
      'A pure refactor: declare the click handler once and hand the same function to ' +
      'all six controls, or give each its own inline copy. Same behaviour, same DOM, ' +
      'same accessibility tree, same everything a person or an agent can observe.\n\n' +
      'It is a family because of what CDP keys a listener on. Measured with ' +
      'DOMDebugger.getEventListeners in Chromium 149, scriptId:line:column locates the ' +
      'handler *function*, not the addEventListener call: three elements sharing one ' +
      'named handler came back with one identical key, 6:0:13 — byte-for-byte the shape ' +
      'a page-wide tracker produces — while three with their own inline handlers came ' +
      'back 7:0:74, 7:1:74, 7:2:74. SHARED_HANDLER_SHARE disqualifies a key carried by ' +
      'most candidates, on the premise that "a real control\'s handler is attached for ' +
      'that control". A component library attaches one handler to every instance of a ' +
      'component, so the premise does not hold on a React or Sitecore site — which is ' +
      'every site this scanner points at.\n\n' +
      '── This family is RED, and it is the test that is right ──\n\n' +
      'Six instances of one component sharing a callback are six real controls, so six is ' +
      'the answer on both variants and the family stays as it is. The disagreement is in ' +
      'core.mjs, which this file does not own, so it is documented here rather than ' +
      'papered over — a red nobody has explained becomes a red everybody ignores.\n\n' +
      'The obvious discriminator was measured before writing this. If a tracker binds to ' +
      'heterogeneous junk and a component binds to N instances of one shape, then the ' +
      'HOMOGENEITY of the bound set should separate them where the share cannot. Measured ' +
      'in Chromium 149.0.7827.55 with axe-core 4.13.0, over CDP, counting distinct ' +
      '`tag|class|WxH` shapes per handler key:\n\n' +
      '  component only, six identical cards      1 key,  6 candidates, share 1.00, 1 shape\n' +
      '  page-wide tracker, mixed elements        1 key, 11 candidates, share 1.00, 6 shapes\n' +
      '  both, which is what a real site is       tracker 11/11 share 1.00, 6 shapes\n' +
      '                                           component 6/11 share 0.55, 1 shape\n' +
      '  tracker bound only to the six cards      1 key,  6 candidates, share 1.00, 1 shape\n\n' +
      'So homogeneity does separate them on the shape the incident actually had: the ' +
      'tracker key and the component key are indistinguishable by share — 1.00 against ' +
      '0.55, both over the 0.5 threshold — and differ by 6 shapes against 1. And that ' +
      'third row is not a hypothetical: scanned through the real scanPage, the page ' +
      'carrying six working component controls AND analytics published 0 of 11 candidates, ' +
      'confirmedListener=false on every one. The guard against fourteen false positives ' +
      'costs every real finding on any page that also has a tracker.\n\n' +
      'What homogeneity cannot do is the fourth row. A tracker that happens to bind only ' +
      'to one component\'s instances produces a signature identical to the component ' +
      'itself — same key, same share, same single shape — and no signal available to the ' +
      'probe tells them apart, because at that point nothing on the page does. Adopting ' +
      'homogeneity alone would report those six as controls, which is the direction that ' +
      'produced the Insureon incident.\n\n' +
      '── The homogeneity guard was then built and run, and it is the wrong fix ──\n\n' +
      'An earlier draft of this comment ended by recommending it anyway: disqualify only ' +
      'keys bound to more than one shape, "keeps the incident fixed and returns this ' +
      'family to green". Half of that is true. It was implemented in a throwaway copy of ' +
      'core.mjs — shape read per candidate over CDP as `tag|class|WxH`, the share test ' +
      'replaced by `shapes > 1` — and run against the three families that bound the ' +
      'question, Chromium 149.0.7827.55, axe-core 4.13.0:\n\n' +
      '  handler-identity                  AGREE     (6 and 6)\n' +
      '  shared-analytics-keeps-findings    AGREE\n' +
      '  shared-analytics-invents-nothing   DISAGREE  no-script 0, tracker-only 6,\n' +
      '                                               tracker-only-first 6\n\n' +
      'Six fabricated controls on a page whose elements do nothing when clicked. The ' +
      'recommendation traded this red for the Insureon incident itself, because ' +
      '`shared-analytics-invents-nothing` IS the fourth row: `trackerScript()` binds to ' +
      '`[data-mm]`, and on CARD_PAGE that is exactly the six identical cards.\n\n' +
      'The two families are contradictory demands on the evidence a listener carries, and ' +
      'that is measurable rather than arguable. Their pages were dumped and compared: ' +
      'identical DOM once the script tags are stripped, and over CDP each publishes one ' +
      'handler key across all six candidates — component `6:2:17 x6`, tracker `6:5:14 x6` ' +
      '— with `DOMDebugger.getEventListeners` returning `type, useCapture, passive, once, ' +
      'scriptId, lineNumber, columnNumber, backendNodeId` and nothing else. Whatever a ' +
      'guard reading that answers for one page it must answer for the other.\n\n' +
      'So this red does not close by tuning the guard, and anyone who tries will move it ' +
      'into the family below. The one real difference is the addEventListener CALL SITE ' +
      '— six separate calls naming six elements, against one call inside a loop — and ' +
      'that is the field CDP does not carry. Reaching it means instrumenting ' +
      '`addEventListener` before page scripts run, which sees nothing bound in another ' +
      'realm and nothing bound before the patch, and which on a React site reads the ' +
      'delegating root rather than the control. That is a design decision about what ' +
      'evidence this scanner collects, not a fix, and it belongs to whoever owns core.mjs. ' +
      'Until then the honest state is a red with its reason written down.',
    ...preservesEverything(),
    variants: [
      { id: 'per-instance-handlers', options: { ...CARD_PAGE, ownHandlers: 'per-instance' } },
      { id: 'shared-component-handler', options: { ...CARD_PAGE, ownHandlers: 'shared-function' } },
    ],
  },

  /* ================================================================== */
  /* The false-clean families                                            */
  /*                                                                     */
  /* Everything above varies a page and requires the answer to hold      */
  /* still. Everything below came out of an adversarial review of the    */
  /* axe.commons migration, which found three shapes where the presence  */
  /* of one element silently deleted another element's finding — on the  */
  /* two metrics this tool leads on, against pages that any reviewer     */
  /* would call ordinary. The suite did not catch them, and not because  */
  /* the technique failed: no family covered the shape. A correct-       */
  /* looking page reporting zero defects is the worst failure this       */
  /* project can have and it has shipped that twice, so each shape gets  */
  /* a family of its own and the smallest page that can hold it.         */
  /* ================================================================== */

  {
    id: 'neighbour-irrelevance',
    title: 'A broken control is broken regardless of who stands next to it',
    why:
      'The sibling rescue in the ghost probe was written for react-select: a chevron that ' +
      'looks dead in isolation is not dead when the combobox that operates it sits beside ' +
      'it. As written it asked only that SOME element under the same parent announced a ' +
      'disclosure — never that the neighbour had anything to do with the candidate. ' +
      'Proximity is not a relationship, and a header is where unrelated controls stand ' +
      'closest together.\n\n' +
      'Every variant below is the same hamburger: role-less, nameless, no keyboard route ' +
      'in, one real click listener. Beside it stands nothing, a logo link, a chat button ' +
      'with aria-haspopup, an account button whose aria-controls resolves to a panel ' +
      'elsewhere on the page, a native search <details>, a search field, a filter field or ' +
      'a combobox. None of those opens the menu; a person still cannot operate it with a ' +
      'keyboard and an agent still cannot find it. A hamburger next to an account or chat ' +
      'disclosure is the commonest mobile header on the web, and it is exactly what this ' +
      'probe exists to catch — so if the count is lower beside one neighbour than beside ' +
      'another, the tool has published a clean page with a dead control on it, which is the ' +
      'incident class this project has shipped twice.\n\n' +
      'The count is also pinned at one, and that is not belt and braces. Nine variants ' +
      'that all report nothing agree perfectly, so agreement alone is satisfied by ' +
      'widening the rescue until it swallows the hamburger everywhere — the same clean ' +
      'page, reached from the other side. What must hold is that the page has exactly one ' +
      'control on it that nobody can operate, which is what the markup says it has.\n\n' +
      '── The four text-field variants, and why they are here ─────────────\n\n' +
      'The first fix for this family narrowed the rescue from "some neighbour announces ' +
      'something" to "a neighbour is a text-entry widget that announces something", and ' +
      'measured against the branch as it stood before the split, four more shapes went ' +
      'silent that main reported: an <input type="search" aria-expanded aria-controls>, an ' +
      '<input aria-label="Filter" aria-controls> with role textbox and no popup of any ' +
      'kind, an <input role="combobox">, and that same combobox one wrapper further out, ' +
      'outside the burger\'s own header. Four costumes of one mistake — a set of roles was ' +
      'widened until it covered the case in hand, and each widening carried the next false ' +
      'clean in with it. searchbox, textbox and spinbutton have no popup in ARIA at all, so ' +
      'there is no pattern under which the thing standing beside one is part of it.\n\n' +
      'The last two are the sharp ones and they are answerable rather than lucky: the page ' +
      'these are measured on is a banner landmark holding a burger, a brand and a field, ' +
      'and the page combobox-chevron-stays-rescued is measured on is an unlabelled box ' +
      'holding exactly a text field and its indicator — which is what the combobox pattern ' +
      'is. scenarios.mjs states that distinction where the markup is, and states what to do ' +
      'if a future rescue cannot key on it: put the pair on the known-limitation list, ' +
      'rather than delete the variant nobody can answer.',
    ...preservesEverything(),
    variants: [
      {
        id: 'alone',
        options: { scenario: 'neighbour', neighbour: 'none' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'plain-link',
        options: { scenario: 'neighbour', neighbour: 'plain-link' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'haspopup-button',
        options: { scenario: 'neighbour', neighbour: 'haspopup-button' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'expanded-controls-elsewhere',
        options: { scenario: 'neighbour', neighbour: 'expanded-controls-elsewhere' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'details-summary',
        options: { scenario: 'neighbour', neighbour: 'details-summary' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'search-input-controls',
        options: { scenario: 'neighbour', neighbour: 'search-input-controls' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'filter-input-controls',
        options: { scenario: 'neighbour', neighbour: 'filter-input-controls' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'combobox-input',
        options: { scenario: 'neighbour', neighbour: 'combobox-input' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'combobox-one-wrapper-up',
        options: { scenario: 'neighbour', neighbour: 'combobox-one-wrapper-up' },
        expects: { ghostControls: 1 },
      },
    ],
  },

  {
    id: 'combobox-chevron-stays-rescued',
    title: 'The rescue the sibling rule was written for must keep firing',
    why:
      'The other half of neighbour-irrelevance, and the reason that family cannot be ' +
      'satisfied by deleting the rescue. react-select\'s chevron is role-less, nameless, ' +
      'out of the tab order and carries a real listener — every test in the ghost probe ' +
      'says defect, and it is nothing of the kind: an agent tabs to the combobox beside it ' +
      'and the menu opens. Reporting it describes the library\'s DOM, not a barrier, and ' +
      'this scanner\'s recurring failure is reporting correct implementations.\n\n' +
      'This family states a value, which the preamble above fences carefully, because ' +
      'agreement alone cannot hold a floor: three variants that all report the chevron ' +
      'agree exactly as well as three that all rescue it. Pinned at zero, "narrow the ' +
      'rescue until it never fires" fails here while neighbour-irrelevance passes, and ' +
      'the two together describe the only shape that satisfies both — a relationship ' +
      'between the candidate and the control that announces it.\n\n' +
      'The three variants are the same widget with the chevron at three depths, because ' +
      'depth is what the live shape turns on: react-select puts the chevron inside ' +
      'IndicatorsContainer, a sibling of the container holding the input, so a rescue that ' +
      'looks only at the chevron\'s own parent never sees the combobox at all.',
    ...preservesEverything(),
    variants: [
      {
        id: 'sibling-of-input',
        options: { scenario: 'combobox', combobox: 'sibling-of-input' },
        expects: { ghostCandidates: 0, ghostControls: 0 },
      },
      {
        id: 'indicators-wrapper',
        options: { scenario: 'combobox', combobox: 'indicators-wrapper' },
        expects: { ghostCandidates: 0, ghostControls: 0 },
      },
      {
        id: 'indicators-wrapper-deep',
        options: { scenario: 'combobox', combobox: 'indicators-wrapper-deep' },
        expects: { ghostCandidates: 0, ghostControls: 0 },
      },
    ],
  },

  {
    id: 'unrelated-disclosure',
    title: 'A trigger announces what it controls, not what it stands beside',
    why:
      'The headline metric, and the shape that put six findable-by-nobody links at zero. ' +
      'A :hover mega-menu is out of the accessibility tree with nothing in the tree that ' +
      'says it exists — ION\'s actual desktop menu, and the defect this probe was built ' +
      'for. Put an unrelated <details> in the same column and the sibling fallback finds ' +
      'its <summary>, announces() answers true for any <summary> at all, and the six links ' +
      'are published as zero. Nothing required the panel to be inside that summary\'s own ' +
      '<details>.\n\n' +
      'The first five variants are pages where an agent cannot reach the menu, and a ' +
      'reader can check that from the markup alone: opening the Help disclosure reveals a ' +
      'phone number, the Account button opens #acct in the main content, the Filters ' +
      'widget in the nav opens its own panel, and the More disclosure round the fifth one ' +
      'is ALREADY OPEN. The sixth is the same page with a button whose aria-controls really ' +
      'does resolve to the menu, where an agent can. That ' +
      'difference is real, so this family pins values per variant rather than requiring ' +
      'agreement across all six — 6, 6, 6, 6, 6, then 0. Agreement across the first five ' +
      'would catch the <summary> bug; only the last stops the fix being "nothing ever ' +
      'announces anything", which would report every correct disclosure on the web and is ' +
      'the false-positive direction this scanner keeps failing in.\n\n' +
      'The open-details variant is the <summary> bug\'s second costume, and it arrived ' +
      'through the fix for the first. Once a <summary> was made to announce only its own ' +
      '<details>, an <details open> whose body holds a :hover-only submenu satisfied that ' +
      'exactly: the summary declares the <details>, the <details> contains the panel, ' +
      'containment fires. Measured, main published 6 and the branch published 0. What the ' +
      'containment rule asserts is "open the trigger\'s target and the region arrives", and ' +
      'that is a claim about a CLOSED disclosure — an <details> that is already open ' +
      'reveals nothing when you operate it. Both ways of writing "closed" are in the DOM ' +
      'already, so this needs no inference: a <details> without open, and ' +
      'aria-expanded="false".\n\n' +
      'The nav-widget variant is here because the first fix for the <summary> bug ' +
      'reintroduced the false clean through it, measured: a trigger that declares no ' +
      'target falls through to adjacency, "adjacent" was read as anywhere under the ' +
      'region\'s parent, and a region whose parent is the <nav> is adjacent to every ' +
      'component on the site. Two levels out from the bug being fixed, in the metric being ' +
      'fixed. It costs one variant to make that permanent.\n\n' +
      'A bare <button aria-expanded> sibling carrying no IDREF used to be excluded here ' +
      'as undecidable. It is decided now: it declares no target, so it announces ' +
      'nothing, and undeclared-relationship asserts that directly. The cases below are ' +
      'the ones where the DOM answers WHICH region: a <summary> owns its own <details> ' +
      'and an IDREF resolves where it resolves.',
    preserves: [
      ...METRIC_KEYS.filter(
        (k) => !['unannouncedPanels', 'unannouncedFocusable', 'unannouncedLinks'].includes(k)
      ),
    ],
    pinnedInstead: [
      {
        metric: 'unannouncedPanels',
        because:
          'the last variant gives the menu a real aria-controls trigger, which is a ' +
          'behavioural change and not a hole: every variant pins this value explicitly, ' +
          '1 on the five where nothing announces the menu and 0 on the one where ' +
          'something does.',
      },
      {
        metric: 'unannouncedFocusable',
        because:
          'same transform, same pinning — 6, 6, 6, 6, 6, then 0 once the menu is ' +
          'announced. Agreement would assert the opposite of what this family is for.',
      },
      {
        metric: 'unannouncedLinks',
        because:
          'the headline metric and the one the false clean landed on; pinned on every ' +
          'variant so the exemption cannot become "this family does not check that".',
      },
    ],
    variants: [
      {
        id: 'alone',
        options: { scenario: 'disclosure', megaSibling: 'none' },
        expects: { unannouncedPanels: 1, unannouncedFocusable: 6, unannouncedLinks: 6 },
      },
      {
        id: 'unrelated-details',
        options: { scenario: 'disclosure', megaSibling: 'unrelated-details' },
        expects: { unannouncedPanels: 1, unannouncedFocusable: 6, unannouncedLinks: 6 },
      },
      {
        id: 'expanded-controls-elsewhere',
        options: { scenario: 'disclosure', megaSibling: 'expanded-controls-elsewhere' },
        expects: { unannouncedPanels: 1, unannouncedFocusable: 6, unannouncedLinks: 6 },
      },
      {
        id: 'unrelated-widget-in-nav',
        options: { scenario: 'disclosure', megaSibling: 'unrelated-widget-in-nav' },
        expects: { unannouncedPanels: 1, unannouncedFocusable: 6, unannouncedLinks: 6 },
      },
      {
        id: 'open-details-around-menu',
        options: { scenario: 'disclosure', megaSibling: 'open-details-around-menu' },
        expects: { unannouncedPanels: 1, unannouncedFocusable: 6, unannouncedLinks: 6 },
      },
      {
        id: 'controls-the-menu',
        options: { scenario: 'disclosure', megaSibling: 'controls-the-menu' },
        expects: { unannouncedPanels: 0, unannouncedFocusable: 0, unannouncedLinks: 0 },
      },
    ],
  },

  {
    id: 'pointer-origin-eligibility',
    title: 'Which ancestor holds the pointer style must not decide whether anything is reported',
    why:
      '"One control is one candidate" is the right rule and it is why a hamburger\'s own ' +
      'glyph stopped displacing it. It works by crediting an inherited cursor to the ' +
      'outermost element that has it and treating everything below as the same control ' +
      'seen again — but it credits it to whatever element happens to hold the style, ' +
      'including elements the probe would never report: a <ul>, which is not in the ' +
      'candidate selector at all, or a block over the 640x480 size gate. The signal then ' +
      'has no eligible origin, the options below are dropped as somebody else\'s, and the ' +
      'somebody else is reported by nothing. Both vanish — the same shape as the bug the ' +
      'rule was written to fix, one level out.\n\n' +
      'All four variants below are three nameless role-less options with their own click ' +
      'listeners, differing only in which ancestor carries cursor:pointer: the <ul>, a ' +
      'div over the size gate, a section over the size gate, or nothing at all with each ' +
      'option carrying its own. An agent is equally stuck on all four. A stylesheet moving ' +
      'a cursor declaration one level up is a refactor nobody would review twice, and it ' +
      'must not be able to empty the page of findings.\n\n' +
      'Pinned at three, because here the cheapest way to reach agreement is the wrong ' +
      'direction: extend the ancestor check to the whole chain and all four variants ' +
      'report nothing, in perfect agreement, on a page with three dead controls. Three is ' +
      'what the markup says — three options, three click listeners, three elements with ' +
      'no name, no role and no keyboard route in.',
    ...preservesEverything(),
    variants: [
      {
        id: 'ul-ancestor',
        options: { scenario: 'pointer', pointerAncestor: 'ul' },
        expects: { ghostControls: 3 },
      },
      {
        id: 'oversized-div',
        options: { scenario: 'pointer', pointerAncestor: 'oversized-div' },
        expects: { ghostControls: 3 },
      },
      {
        id: 'oversized-section',
        options: { scenario: 'pointer', pointerAncestor: 'oversized-section' },
        expects: { ghostControls: 3 },
      },
      {
        id: 'own-cursor',
        options: { scenario: 'pointer', pointerAncestor: 'own-cursor' },
        expects: { ghostControls: 3 },
      },
    ],
  },

  {
    id: 'pointer-origin-absorbs-hit-area',
    title: 'An eligible clickable box is still one control, not one per thing inside it',
    why:
      'The guard on the family above, in the direction that family cannot see. Both ' +
      'variants here put the pointer on an element that IS reportable — inside the size ' +
      'gate, in the candidate selector, role-less and nameless — so absorbing what is ' +
      'inside it is correct: the box is what an author made clickable, and a padded hit ' +
      'area with a glyph in it is one control however many elements the glyph takes. ' +
      'Pinned at one apiece, because agreement alone would be satisfied by reporting ' +
      'four.\n\n' +
      'Overshooting here is not hypothetical: "take every element and let the innermost ' +
      'win" is what shipped, and the icon-technique family is the receipt — five ' +
      'behaviourally identical hamburgers scoring 1, 0, 1, 1, 1 on candidates and ' +
      '1, 0, 0, 0, 1 on published controls, because the glyph took the control\'s place ' +
      'and was then dropped itself.',
    ...preservesEverything(),
    variants: [
      {
        id: 'padded-hit-area',
        options: { scenario: 'pointer', pointerHost: 'padded-hit-area' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'clickable-box',
        options: { scenario: 'pointer', pointerHost: 'clickable-box' },
        expects: { ghostControls: 1 },
      },
    ],
  },

  {
    id: 'absorbing-ancestor-must-publish',
    title: 'Whatever absorbs a click signal has to be the thing that publishes it',
    why:
      'The rule this family states is the one that unifies every regression the split was ' +
      'called for: a finding may be suppressed only when the thing it defers to is itself ' +
      'published, or is a control an agent can demonstrably use. A suppression that leaves ' +
      'NOTHING behind is not a refinement, it is a false clean, and every one of the eight ' +
      'measured regressions had that shape.\n\n' +
      'Here it is in its smallest form. A 300x100 promo card is clickable all over and ' +
      'carries a 24x24 dismiss control in its corner. The card is inside the size gate, in ' +
      'the candidate net, role-less and nameless, so it is eligible — and absorbing the ' +
      'dismiss control\'s inherited cursor is CORRECT, because a padded hit area with ' +
      'something inside it is one control. That is the family below this one, and it is ' +
      'not in dispute.\n\n' +
      'What the four variants vary is whether the card, having taken the signal, then ' +
      'survives to be published. Three later gates can drop it and the dismiss control ' +
      'trips none of them: a working <a href> inside it (a wrapper round something an ' +
      'agent can use — react-select\'s real rescue), an authored aria-label, and a ' +
      'tabindex. Each is a correct reason not to report the CARD. None is a reason to ' +
      'report nothing. Measured against the branch as it stood before the split, ' +
      'Chromium 149.0.7827.55 with axe-core 4.13.0: the bare card published one finding ' +
      'and the other three published zero.\n\n' +
      'That is measurable as a regression rather than arguable, and the reason it survived ' +
      'a fix round is structural: the origination test consults five of the eight gates the ' +
      'main loop applies, so it can hand a signal to an element that the loop will later ' +
      'throw away. Sharing one gate list would close it; so would refusing to absorb into ' +
      'an element that is not published. This family does not say which — it says the page ' +
      'may not go quiet.\n\n' +
      'Pinned at one, and agreement alone would not have caught this: before the split the ' +
      'three suppressed variants agreed with each other perfectly, at zero. The pin is what ' +
      'says the page has a control on it that nobody can operate.\n\n' +
      '── This family holds all eighteen metrics, and briefly did not ─────\n\n' +
      'Worth recording, because it is an argument for not reaching for an exemption. An ' +
      'earlier revision of probes.mjs published the right ghostControls here and still ' +
      'moved the two counts above it: 1 candidate and 1 clickable-no-role on the bare card, ' +
      '2 and 3 on the other three, because a card that stopped absorbing its contents ' +
      'contributed its contents instead of itself. There is a reading on which that is ' +
      'legitimate — the transform IS behavioural, and whether the card is one control or a ' +
      'container is exactly what it changes — and this family was briefly written that way, ' +
      'with both metrics exempt and a paragraph justifying it.\n\n' +
      'It was measured again a revision later and all eighteen agreed. The exemption was ' +
      'buying nothing except a hole, which is what an unpinned exemption always cost: the ' +
      'justification was plausible, it was written in good faith, and it was wrong about ' +
      'what the code could do. That shape is no longer expressible — `pinnedInstead` ' +
      'requires a pin on every variant — but the lesson survives the mechanism. Preserve ' +
      'everything until something that cannot be made to agree proves it cannot, and then ' +
      'put it on the known-limitation list where a person has to look at it.',
    ...preservesEverything(),
    variants: [
      {
        id: 'bare-card',
        options: { scenario: 'absorbing', absorbing: 'bare-card' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'card-with-link',
        options: { scenario: 'absorbing', absorbing: 'card-with-link' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'named-card',
        options: { scenario: 'absorbing', absorbing: 'named-card' },
        expects: { ghostControls: 1 },
      },
      {
        id: 'tabbable-card',
        options: { scenario: 'absorbing', absorbing: 'tabbable-card' },
        expects: { ghostControls: 1 },
      },
    ],
  },

  {
    id: 'offcanvas-drawer-mirrors',
    title: 'A drawer parked off the left edge and off the right edge are the same page',
    why:
      'The original phantom menu, and the one this tool is named for: four links in the ' +
      'accessibility tree, four links in the tab order, and nowhere on screen for a person ' +
      'to see them. The wrapper is overflow: hidden, which is a clip and not a scrollbar — ' +
      'no gesture brings the drawer back.\n\n' +
      'The four variants are two positions reached by two mechanisms, and they are mirror ' +
      'images: right:100% parks the drawer\'s right edge on the wrapper\'s left edge, ' +
      'left:100% parks its left edge on the wrapper\'s right edge, and the two translateX ' +
      'variants reach the same two places with a transform instead of an offset. A page ' +
      'and its mirror image are the same page. A scanner that answers them differently has ' +
      'told you nothing about either, and mirror-image disagreement is this suite\'s own ' +
      'criterion for a bug.\n\n' +
      'Measured against the branch as it stood before the split, Chromium 149.0.7827.55: ' +
      'the two LEFT variants were reported and the two RIGHT ones were not — 1 hidden panel ' +
      'holding 4 controls against 0, phantom 4 against 0, phantomPanelState announced ' +
      'against none, and the published verdict needs-work against clear. Five metrics, ' +
      'including the one the dashboard leads on. The cause was the guard added for clipped ' +
      'carousels, which asks whether a scroll container could bring the region into view; ' +
      'a container\'s scrollable extent runs right and down only, so the guard is ' +
      'asymmetric where the page is not. The browser\'s asymmetry is real and it is exactly ' +
      'why the answer must not be derived from it: overflow: hidden is not scrollable by ' +
      'the user in EITHER direction.\n\n' +
      'Pinned at one panel and four controls, because agreement alone is satisfied by ' +
      'reporting neither mirror — which is the false clean this family exists to stop, ' +
      'reached from the other side.',
    ...preservesEverything(),
    variants: [
      {
        id: 'left-offset',
        options: { scenario: 'offcanvas', offcanvas: 'left-offset' },
        expects: { hiddenPanels: 1, hiddenPanelFocusable: 4, phantomFocusable: 4 },
      },
      {
        id: 'right-offset',
        options: { scenario: 'offcanvas', offcanvas: 'right-offset' },
        expects: { hiddenPanels: 1, hiddenPanelFocusable: 4, phantomFocusable: 4 },
      },
      {
        id: 'left-transform',
        options: { scenario: 'offcanvas', offcanvas: 'left-transform' },
        expects: { hiddenPanels: 1, hiddenPanelFocusable: 4, phantomFocusable: 4 },
      },
      {
        id: 'right-transform',
        options: { scenario: 'offcanvas', offcanvas: 'right-transform' },
        expects: { hiddenPanels: 1, hiddenPanelFocusable: 4, phantomFocusable: 4 },
      },
    ],
  },

  {
    id: 'clipped-container',
    title: 'A clipped carousel slide must not set the verdict for the whole page',
    why:
      'An open question, held to its minimum answer. OFF_SCREEN is now axe\'s ' +
      'isVisibleOnScreen, which knows about overflow clipping that the six geometric lines ' +
      'it replaced did not — so an ordinary two-slide carousel now reports its second ' +
      'slide as a panel that is off screen. A clipped slide whose links stay in the tab ' +
      'order is a real keyboard problem by most readings. It is also, by this project\'s ' +
      'own rule, not the thing this tool reports: hidden is not unfindable, every link is ' +
      'in the accessibility tree, and there is no unfindable content on the page at all.\n\n' +
      'Whichever way that is settled, one thing is not a judgement call. All six variants ' +
      'below hold the same six links, in a carousel and in normal flow, and nothing else. ' +
      'A carousel is the commonest layout on the commercial web; a scanner that publishes ' +
      '"blocking" for every page carrying one has stopped being usable, and each of those ' +
      'pages then buries whatever real finding it also had.\n\n' +
      'The published verdict is pinned at clear on every variant, and the panel counts are ' +
      'compared like everything else. They used to be exempt — hiddenPanels, ' +
      'hiddenPanelFocusable, phantomFocusable and phantomPanelState, four metrics excused ' +
      'with a sentence each on the grounds that the family "takes no position". Measured ' +
      'on this tree — Chromium 149.0.7827.55, axe-core 4.13.0, desktop profile, ' +
      '2026-08-13, node scanner/metamorphic/run.mjs --family clipped-container — all six ' +
      'variants report 0 hidden panels, 0 controls inside them, 0 phantom focusable and ' +
      'phantomPanelState none: the exemption was excusing an agreement. It is deleted ' +
      'rather than kept ' +
      'because an exemption nobody needs is the mute button this suite was found to have ' +
      '— see the `pinnedInstead` section at the top of this file for the reproduction.\n\n' +
      'Two of the four could never have differed anyway, and that is worth writing down ' +
      'once so nobody re-adds them. verdictFromProbes is pinned clear on all six, and ' +
      'under metrics.mjs it is clear exactly when phantomPanelState is none, which is in ' +
      'turn only reachable with phantomFocusable at 0. So the pin already forced two of ' +
      'the exempted metrics to agree; exempting them bought nothing and hid that fact.\n\n' +
      'Read what remains honestly: under today\'s model.ts the ' +
      'verdict is a function of the phantom-panel state and nothing else, so the only way ' +
      'to satisfy this family today is for probes.mjs to stop calling pure overflow ' +
      'clipping off-screen. If the team instead keeps recording it and changes the verdict ' +
      'layer, metrics.mjs\'s restatement of pageVerdict() has to move in the same commit ' +
      'or this family goes quiet while claiming to check the thing it was written for. And ' +
      'if the team decides a clipped slide IS a hidden panel, this family goes red on ' +
      'hiddenPanels — which is the point: that decision gets recorded in ' +
      'known-limitations.mjs with the measured numbers, where it prints on every run, ' +
      'rather than disappearing into a sentence here.\n\n' +
      '── Why overflow is an axis, and what this family is worth ──────────\n\n' +
      'The five values do not mean the same thing to a person: auto and scroll put the ' +
      'second slide one gesture away, hidden and clip do not, visible never hid it. So ' +
      'this is not an invariance claim about the slide. It is an invariance claim about ' +
      'the PAGE, which is the stronger of the two and the one that survived: six named ' +
      'links, every one in the accessibility tree and in the tab order, is not a blocking ' +
      'page whatever one container\'s overflow property says.\n\n' +
      'Be honest about what this catches. It passed before the split and it passes after, ' +
      'so it is not evidence about the regression that produced the drawer family below — ' +
      'it is the guard in the other direction. Deleting the clipped-carousel handling ' +
      'outright is the obvious way to make the drawer mirrors agree, and it would republish ' +
      'every carousel on the web as blocking; this family is what fails when somebody ' +
      'reaches for that. The two are a pair and neither is sufficient alone.',
    ...preservesEverything(),
    variants: [
      {
        id: 'flow-container',
        options: { scenario: 'clipped', clipped: 'flow' },
        expects: { verdictFromProbes: 'clear' },
      },
      {
        id: 'carousel-hidden',
        options: { scenario: 'clipped', clipped: 'carousel-hidden' },
        expects: { verdictFromProbes: 'clear' },
      },
      {
        id: 'carousel-auto',
        options: { scenario: 'clipped', clipped: 'carousel-auto' },
        expects: { verdictFromProbes: 'clear' },
      },
      {
        id: 'carousel-scroll',
        options: { scenario: 'clipped', clipped: 'carousel-scroll' },
        expects: { verdictFromProbes: 'clear' },
      },
      {
        id: 'carousel-clip',
        options: { scenario: 'clipped', clipped: 'carousel-clip' },
        expects: { verdictFromProbes: 'clear' },
      },
      {
        id: 'carousel-visible',
        options: { scenario: 'clipped', clipped: 'carousel-visible' },
        expects: { verdictFromProbes: 'clear' },
      },
    ],
  },
];

/**
 * Check a family classifies every metric exactly once, and that every metric it
 * exempts from comparison is pinned instead. Returns a list of problems, empty
 * when the family is well-formed.
 *
 * A family that does not is a configuration error, not a test failure, and
 * run.mjs treats it as one: it is reported separately and it stops the run.
 * Silently comparing whatever happened to be listed is how a suite becomes
 * decorative.
 *
 * This function is the suite's own guard against the suite, so its failures are
 * worth more than its passes: the mute button found in review lived here, in a
 * check that asked only whether a sentence was non-empty.
 */
export function declarationProblems(family) {
  const problems = [];
  if (!Array.isArray(family.preserves)) problems.push('has no preserves list');
  /**
   * `mayDiffer` was the mute button — a metric plus any non-empty sentence, and
   * the metric stopped being compared. A reviewer spliced the real
   * handler-identity disagreement (ghostControls 6 against 0) into a family,
   * wrote `because: 'flaky'`, and got AGREE / exit 0 with nothing published in
   * its place. It is refused by name rather than ignored, because the shape is
   * in this repo's history and in every stale branch: silently reading it as
   * "declares nothing" would turn the old mute into an unclassified metric,
   * which is a config error, but a confusing one.
   */
  if ('mayDiffer' in family) {
    problems.push(
      'declares “mayDiffer”, which no longer exists — it excused a metric from ' +
        'comparison on the strength of a sentence. Use “pinnedInstead” (every variant ' +
        'pins the metric, values differ) or record the disagreement in known-limitations.mjs'
    );
  }
  if (!Array.isArray(family.pinnedInstead)) {
    problems.push('has no pinnedInstead list (use [] to exempt nothing)');
  }
  if (!Array.isArray(family.variants) || family.variants.length < 2) {
    problems.push('has fewer than two variants, so it compares nothing');
  }
  if (problems.length > 0) return problems;

  const exempt = family.pinnedInstead;
  const named = [...family.preserves, ...exempt.map((e) => e.metric)];

  const seen = new Set();
  for (const key of named) {
    if (!METRIC_KEYS.includes(key)) problems.push(`declares unknown metric “${key}”`);
    if (seen.has(key)) problems.push(`declares “${key}” twice`);
    seen.add(key);
  }
  for (const key of METRIC_KEYS) {
    if (!seen.has(key)) problems.push(`does not say whether it preserves “${key}”`);
  }

  /**
   * `pinnedInstead` is verified structurally, and that is the whole fix.
   *
   * The old check asked whether `because` was a non-empty string, which is a
   * check on prose and therefore not a check. These three ask the family for
   * something it cannot write without having decided the answer per variant:
   * the metric is pinned on EVERY variant, and the pins are not all the same
   * value. Both halves are load-bearing.
   *
   *   Pinned on every variant — an unpinned variant is a variant nothing checks,
   *   which is the hole this field used to be. With all of them pinned, a
   *   regression spliced into an exempt metric fails on the pin instead of
   *   vanishing.
   *
   *   Values not all equal — if they were, `preserves` says it better and says
   *   it without a special case. This is what stops the field being re-derived
   *   as a mute: to exempt a metric you must write down a DIFFERENT expected
   *   number for at least one variant, in this file, in the diff. That can still
   *   be a lie, but it is a visible lie rather than a silent deletion.
   *
   * `because` is still required and still prose, but it is no longer what buys
   * the exemption — it explains a decision the runner has already verified.
   */
  const pinsByMetric = new Map(); // metric -> [{ variant, serialized }]
  for (const variant of family.variants) {
    for (const [key, value] of Object.entries(variant.expects ?? {})) {
      if (!pinsByMetric.has(key)) pinsByMetric.set(key, []);
      pinsByMetric.get(key).push({ variant: variant.id, serialized: JSON.stringify(value) });
    }
  }
  for (const entry of exempt) {
    const label = `exempts “${entry.metric}”`;
    if (typeof entry.because !== 'string' || entry.because.trim().length < 40) {
      problems.push(`${label} without saying why in more than a word`);
    }
    const pins = pinsByMetric.get(entry.metric) ?? [];
    const pinnedVariants = new Set(pins.map((p) => p.variant));
    const missing = family.variants.map((v) => v.id).filter((id) => !pinnedVariants.has(id));
    if (missing.length > 0) {
      problems.push(
        `${label} but does not pin it on ${missing.length} variant(s) — ${missing.join(', ')}. ` +
          'An exempt metric nothing pins is a metric nothing checks'
      );
      continue;
    }
    if (new Set(pins.map((p) => p.serialized)).size < 2) {
      problems.push(
        `${label} but pins the same value on every variant, so they agree — put it in ` +
          'preserves, which asserts that without a special case'
      );
    }
  }

  /**
   * Pinned values are checked the same way and for the same reason.
   *
   * A typo in an `expects` key would otherwise pin nothing at all and pass
   * quietly, which is the exact failure this whole function exists to make
   * impossible: a check that did not run must never be reachable from the same
   * code path as a check that passed.
   *
   * The second rule catches the contradiction. A metric pinned to two different
   * values across variants is a metric the family says must differ, and if it is
   * also in `preserves` the agreement comparison fails no matter what the
   * scanner does — a family that can never be green is not a test, it is noise
   * that teaches people to ignore a red suite.
   *
   * The third rule is `null`, and it is here because closing the `mayDiffer`
   * mute opened a smaller one in the same shape. run.mjs compares a pin by
   * serialising both sides, so `expects: { ghostControls: null }` MATCHES a
   * metric the scanner failed to measure and reports no miss — and a metric in
   * `pinnedInstead` is not compared for agreement either, which is where
   * `not-measured` is normally caught. Pinned null on an exempt metric is
   * therefore a page that can go unmeasured and still read green: this
   * project's entire failure history in two words. A null is the absence of a
   * measurement and can never be the expected one.
   *
   * The fourth is duplicate variant ids. Fixtures are served at
   * `/f/<family>/<variant>/`, so two variants sharing an id are one page
   * measured twice — which agrees with itself, perfectly, forever.
   */
  const pinned = new Map(); // metric -> set of expected values, serialized
  const seenVariants = new Set();
  for (const variant of family.variants ?? []) {
    if (seenVariants.has(variant.id)) {
      problems.push(
        `has two variants called “${variant.id}” — they share one fixture URL, so the ` +
          'family would be comparing one page with itself'
      );
    }
    seenVariants.add(variant.id);
    for (const [key, value] of Object.entries(variant.expects ?? {})) {
      if (!METRIC_KEYS.includes(key)) {
        problems.push(`variant “${variant.id}” pins unknown metric “${key}”`);
        continue;
      }
      if (value === null || value === undefined) {
        problems.push(
          `variant “${variant.id}” pins “${key}” to not-measured, which every failed scan ` +
            'matches — a measurement that did not happen is not an expected value'
        );
      }
      if (!pinned.has(key)) pinned.set(key, new Set());
      pinned.get(key).add(JSON.stringify(value));
    }
  }
  for (const [key, values] of pinned) {
    if (values.size > 1 && family.preserves.includes(key)) {
      problems.push(
        `pins “${key}” to ${values.size} different values but also requires agreement on it`
      );
    }
  }
  return problems;
}

export const familyById = (id) => FAMILIES.find((f) => f.id === id) ?? null;
