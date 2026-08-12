/**
 * The fixture generator.
 *
 * ── Why these pages are generated and not authored ───────────────────────
 *
 * The benchmark this suite replaces was a folder of hand-written pages, each
 * carrying the answer its author believed was correct. It was measured against
 * the pre-fix probe code and caught at most one of the five false-positive
 * classes that had already shipped, because of a property no amount of care
 * fixes: the fixture's label and the probe's rule come from the same head. A
 * hand-labelled benchmark cannot exceed its author's model of the browser, and
 * every one of those faults *was* a gap in that model. The textbook-correct
 * accordion and the textbook-correct mega-menu both came back silent.
 *
 * So nothing here is labelled. There is one page builder with a handful of
 * independent axes — how a panel is hidden, how a glyph is put in a button, how
 * a trigger is related to what it opens, how many meaningless divs sit in the
 * way, what the CSS-in-JS class hashes happen to be this deploy, and what is
 * bound to the click. A family is a cross-section of that space: hold every axis
 * fixed but one, and require the scanner to return the same numbers. Nobody has
 * to know what the right number is. The disagreement is the bug.
 *
 * ── And a second builder, for the shapes this page cannot isolate ────────
 *
 * `scenarios.mjs` holds the focused pages, selected by the `scenario` axis and
 * dispatched from `buildVariant` below. They exist because of what makes this
 * page good: it carries five mechanisms at once, so a family that varies one
 * axis exercises all five. The families written after the false-clean review
 * need the opposite — one mechanism per page — because each is about one element
 * silently deleting another element's finding, and on a page holding five
 * mechanisms "the count moved by one" cannot be attributed to the element that
 * moved it. Same rules apply there: generated, unlabelled, and every metric
 * classified by the family that uses it.
 *
 * ── The page every family measures ───────────────────────────────────────
 *
 * One page, so a transform on any axis is exercised against all five properties
 * probes.mjs measures at once. It carries, deliberately, both a correct
 * implementation and a defective one of each kind, because a suite that only
 * holds "stays clean" cannot catch a probe that has gone silent — which is the
 * failure mode this project has shipped twice:
 *
 *   hamburger    a role-less, nameless `div` with a real click listener.
 *                MUST be reported. The defect.
 *   mega panel   out of the accessibility tree, announced by a trigger.
 *                MUST NOT be reported as unannounced. The correct implementation.
 *   hover menu   out of the tree, announced by nothing at all — ION's actual
 *                desktop mega-menu. MUST be reported. The defect.
 *   drawer       in the tree, translated off screen, announced by a trigger.
 *                MUST be reported as a hidden panel — hidden is not unfindable,
 *                but a panel full of controls nobody can see is still a finding.
 *   nav          two ordinary visible links, so `navLinks.inTree` has a floor
 *                that a broken tree-membership primitive would move.
 *
 * Every count below is what the page is built to produce, not what the scanner
 * is asserted to say. Nothing in this file states an expected result; run.mjs
 * compares variants against each other and never against a number.
 */

import { SCENARIO_DEFAULTS, SCENARIOS, buildScenario } from './scenarios.mjs';

/* ------------------------------------------------------------------ */
/* Axes                                                                */
/* ------------------------------------------------------------------ */

/**
 * How the mega panel is taken out of the accessibility tree.
 *
 * Measured in Chromium 149 with the pinned axe-core 4.13.0: every one of these
 * eight leaves `isVisibleToScreenReaders` false on the links inside, so all
 * eight are the same fact about the page expressed eight ways. Two of them
 * (`content-visibility: hidden`, `hidden="until-found"`) leave the *container*
 * in the tree while dropping everything inside it, which is why probes.mjs
 * classifies a region on its contents rather than on its own box — and why
 * those two belong here rather than in a comment.
 *
 * The pre-migration probe enumerated four mechanisms in one place and six three
 * hundred lines away, so a panel hidden with `content-visibility: hidden` was
 * reported by neither. This family exists so that gap cannot reopen silently:
 * widening happens inside axe now, for every mechanism at once, and if it ever
 * stops happening the variants stop agreeing.
 */
const HIDING = {
  'display-none': { klass: 'hideDisplayNone', attrs: '' },
  'visibility-hidden': { klass: 'hideVisibilityHidden', attrs: '' },
  'visibility-collapse': { klass: 'hideVisibilityCollapse', attrs: '' },
  'hidden-attr': { klass: null, attrs: ' hidden' },
  'hidden-until-found': { klass: null, attrs: ' hidden="until-found"' },
  'content-visibility': { klass: 'hideContentVisibility', attrs: '' },
  /**
   * `inert` does not hide anything visually — the panel is on screen and
   * unusable. It is in this family anyway because the property under test is
   * tree membership, not paint: measured, axe answers `isVisibleToScreenReaders`
   * false for an inert subtree, so an agent is in exactly the position the other
   * seven put it in. If a future axe stops knowing `inert`, this variant is the
   * one that will say so.
   */
  inert: { klass: null, attrs: ' inert' },
  /**
   * A closed `<details>` brings its own trigger; there is no way to express this
   * mechanism without one. That makes it the single variant in this family that
   * moves two axes at once, which would normally be a defect in the test. It is
   * tolerable here only because the trigger axis is held constant *and*
   * independently varied by the trigger-placement family over the same page —
   * if swapping a `<button>` for a `<summary>` moved any number, that family
   * would fail first and this one's verdict would be uninterpretable.
   */
  'closed-details': { klass: null, attrs: '', structural: true },
};

/**
 * Five ways to put a glyph in a control, all behaviourally identical: a 44×44
 * hit area carrying a real click listener, with no accessible name and no way
 * for a keyboard to reach it.
 *
 * This is the family that earned the technique its place. Five hamburgers that
 * differed only in icon technique scored `0, 0, 1, 1, 1` against the pre-fix
 * probe, with no human label anywhere in sight — the only unknown fault found
 * in the entire investigation, and it was found by disagreement alone.
 */
const ICONS = {
  'aria-hidden-span': (c) => `<span class="${c('icon')}" aria-hidden="true">&#9776;</span>`,
  'svg-title': (c) =>
    `<svg class="${c('icon')}" viewBox="0 0 24 24" width="24" height="24" fill="none" ` +
    `stroke="currentColor" stroke-width="2"><title>Menu</title>` +
    `<path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
  'background-image': (c) => `<span class="${c('iconBg')}"></span>`,
  'pseudo-before': (c) => `<span class="${c('iconPseudo')}"></span>`,
  'img-alt-empty': (c) => `<img class="${c('icon')}" src="icon.svg" alt="" width="24" height="24">`,
};

/**
 * How the thing that opens the mega panel is related to it.
 *
 * `disclosureFor()` in probes.mjs resolves this two ways — an ARIA IDREF in
 * either direction, then the conventional sibling shape — and the two paths were
 * written weeks apart. An announced panel is announced however the relationship
 * is expressed, so every one of these must land on the same verdict. The
 * `remote-*` variant is the only one the sibling path cannot rescue, and the
 * `aria-owns` variant is the one the pre-migration single-attribute lookup
 * missed outright.
 */
const TRIGGERS = {
  'sibling-controls': { attrs: ' aria-expanded="false" aria-controls="megaWrap"' },
  'sibling-inner-controls': { attrs: ' aria-expanded="false" aria-controls="megaPanel"' },
  'sibling-haspopup': { attrs: ' aria-haspopup="true"' },
  'sibling-expanded': { attrs: ' aria-expanded="false"' },
  'aria-owns': { attrs: ' aria-expanded="false" aria-owns="megaWrap"' },
  /** Wrapped in a meaningless div, so the sibling scan has to look inside it. */
  'nested-trigger': { attrs: ' aria-expanded="false"', box: true },
  /**
   * In the site header, nowhere near what it opens. Nothing is a sibling of the
   * panel, so this variant is announced by `getAccessibleRefs` or not at all.
   */
  'remote-controls': { attrs: ' aria-expanded="false" aria-controls="megaWrap"', remote: true },
  /** The native disclosure. No ARIA at all, and correct without any. */
  'closed-details': { attrs: '', structural: true },
};

/**
 * How a control's own click handler is written.
 *
 * These two are the same program. Six controls, each with a click handler, each
 * doing the same thing; whether the engine allocated one closure or six is
 * invisible to every user and every agent. It is a refactor, and a refactor is
 * the purest metamorphic transform there is.
 *
 * It is an axis because of what CDP actually keys a listener on. Measured with
 * `DOMDebugger.getEventListeners` in Chromium 149: `scriptId:lineNumber:
 * columnNumber` locates the **handler function**, not the `addEventListener`
 * call. Three elements sharing one named handler came back with one identical
 * key, `6:0:13` — byte-for-byte the shape a page-wide tracker produces. Three
 * elements with their own inline handlers came back `7:0:74`, `7:1:74`,
 * `7:2:74`.
 *
 * `SHARED_HANDLER_SHARE` in core.mjs disqualifies a key carried by most
 * candidates, on the reasoning that "a real control's handler is attached for
 * that control". A component library attaches one handler to every instance of
 * a component, which makes that premise false on exactly the kind of site this
 * scanner points at.
 */
const OWN_HANDLERS = new Set(['none', 'per-instance', 'shared-function']);

export const AXES = {
  hiding: Object.keys(HIDING),
  icon: Object.keys(ICONS),
  trigger: Object.keys(TRIGGERS),
  ownHandlers: [...OWN_HANDLERS],
  scenario: ['full-page', ...Object.keys(SCENARIOS)],
};

export const DEFAULTS = {
  ...SCENARIO_DEFAULTS,
  hiding: 'display-none',
  trigger: 'sibling-controls',
  icon: 'aria-hidden-span',
  /** Levels of meaningless `<div>` wrapped around each marked subtree. */
  wrapDepth: 0,
  /** The CSS-in-JS hash of the day. Churns on every deploy; must mean nothing. */
  salt: 'k3f9x',
  ownHandlers: 'per-instance',
  /** Load `sgtracker.js` alongside whatever the components bound. */
  tracker: false,
  /** Load the analytics script before the component's own handlers. */
  trackerFirst: false,
  /** The ghost hamburger in the header. Off for the analytics families. */
  hamburger: true,
  /** Role-less back controls, the shape a shared tracker binds to en masse. */
  cards: 0,
};

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

/**
 * One declaration per class stem, so class names can be regenerated wholesale
 * from a salt. Real CSS-in-JS emits `backButton--CYYVi` and a new hash next
 * deploy; the README's own rule is "don't track individual elements", and this
 * is that rule made executable.
 *
 * The `shell*` stems are deliberately absent: the wrappers the inert-wrapper
 * family inserts carry no rules whatsoever, because a wrapper that styled
 * anything would be testing the style, not the wrapper.
 */
const CSS_RULES = [
  ['siteHeader', '', 'display:flex;align-items:center;gap:12px;padding:8px 16px'],
  ['brand', '', 'font-weight:700'],
  ['menuToggle', '', 'cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center'],
  ['icon', '', 'display:inline-block;width:24px;height:24px'],
  [
    'iconBg',
    '',
    'display:inline-block;width:24px;height:24px;background-size:24px 24px;background-image:' +
      "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' " +
      "viewBox='0 0 24 24'%3E%3Cpath d='M3 6h18M3 12h18M3 18h18' stroke='%23000' " +
      "stroke-width='2'/%3E%3C/svg%3E\")",
  ],
  ['iconPseudo', '', 'display:inline-block;width:24px;height:24px;line-height:24px'],
  ['iconPseudo', '::before', 'content:"\\2630"'],
  ['primaryNav', '', 'display:flex;align-items:center;gap:16px;padding:8px 16px'],
  ['megaWrap', '', 'padding:8px'],
  ['megaPanel', '', 'display:flex;flex-direction:column'],
  ['hideDisplayNone', '', 'display:none'],
  ['hideVisibilityHidden', '', 'visibility:hidden'],
  ['hideVisibilityCollapse', '', 'visibility:collapse'],
  ['hideContentVisibility', '', 'content-visibility:hidden'],
  ['drawerHost', '', 'position:relative'],
  ['drawer', '', 'position:fixed;top:0;left:0;width:280px;height:100%;transform:translateX(-100%);display:flex;flex-direction:column'],
  ['hoverItem', '', 'position:relative'],
  ['hoverLabel', '', 'display:inline-block;padding:4px'],
  ['hoverMenu', '', 'display:none;position:absolute;top:100%;left:0;width:240px'],
  ['cardRow', '', 'display:flex;gap:8px;padding:8px 16px'],
  ['backButton', '', 'cursor:pointer;width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center'],
  ['content', '', 'padding:16px'],
];

/* ------------------------------------------------------------------ */
/* Scripts                                                             */
/* ------------------------------------------------------------------ */

/**
 * The controls' own click handlers, written one of two ways.
 *
 * `per-instance` gives every control its own inline function literal, each on
 * its own line, so each gets a distinct `scriptId:line:column`. `shared-function`
 * declares the handler once and hands the same function to every control, which
 * is what a component library emits and what React, Vue and Sitecore's own
 * components all do.
 *
 * Both bind a real handler to every control. Nothing an agent, a screen reader
 * or a person could observe distinguishes them.
 */
function componentScript({ hamburger, cards, shape }) {
  const targets = [
    ...(hamburger ? ['[data-mm="hamburger"]'] : []),
    ...Array.from({ length: cards }, (_, i) => `[data-mm-idx="${i}"]`),
  ];
  const head = [
    '// The controls on this page bind their own handlers. Not analytics: this',
    '// script exists because these elements do something when you click them.',
  ];

  if (shape === 'shared-function') {
    return `${[
      ...head,
      'function activate(e) { document.documentElement.dataset.opened = e.currentTarget.className; }',
      ...targets.map((t) => `document.querySelector('${t}').addEventListener('click', activate);`),
    ].join('\n')}\n`;
  }

  return `${[
    ...head,
    ...targets.map(
      (t, i) =>
        `document.querySelector('${t}').addEventListener('click', ` +
        `function () { document.documentElement.dataset.opened = '${i}'; });`
    ),
  ].join('\n')}\n`;
}

/**
 * `sgtracker.js:4`, reproduced as a test.
 *
 * On insureon.com every single confirmed listener — all thirty-seven — resolved
 * to one line of one analytics file, and the probe read each of them as proof
 * that a decorative icon was secretly a control. It reported fourteen defects
 * that did not exist, against source files containing no handler at all.
 *
 * The binding below is one call site inside a loop, which is exactly the shape
 * that produced that incident: same `scriptId:line:column` for every element it
 * touches. `SHARED_HANDLER_SHARE` in core.mjs exists to disqualify it as
 * evidence. Two invariances follow, and they pull in opposite directions —
 * adding this file must not erase a real finding, and it must not manufacture
 * one. Both are families in families.mjs; neither is a number.
 */
function trackerScript() {
  return [
    '// Page-wide analytics. One handler, bound to everything that looks clickable.',
    '// A real control\'s handler is attached for that control; this one is attached',
    '// for the page, so it says nothing about any element it lands on.',
    'var els = document.querySelectorAll("[data-mm]");',
    'for (var i = 0; i < els.length; i += 1) els[i].addEventListener("click", track);',
    'function track() { /* beacon */ }',
    '',
  ].join('\n');
}

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
  '<path d="M3 6h18M3 12h18M3 18h18" stroke="#000" stroke-width="2" fill="none"/></svg>\n';

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Build one variant.
 *
 * Returns the page and the assets it needs, keyed by filename. Every variant is
 * served from its own directory (see serve.mjs) so `component.js` and
 * `sgtracker.js` get a fresh script id per variant and one variant's parse can
 * never be reused for another's.
 */
export function buildVariant(options = {}) {
  const o = { ...DEFAULTS, ...options };

  /**
   * The focused pages are built elsewhere and deliberately.
   *
   * This page carries five mechanisms at once, which is what makes it worth
   * measuring an axis against — and what makes it useless for the families that
   * came out of the false-clean review, where one element deleting another
   * element's finding has to be attributable to that element and nothing else.
   * scenarios.mjs holds those. The dispatch is here so every family still goes
   * through one entry point and run.mjs never has to know which kind it built.
   */
  if (o.scenario !== 'full-page') return buildScenario(o);

  const unknown = [
    !HIDING[o.hiding] && `hiding=${o.hiding}`,
    !TRIGGERS[o.trigger] && `trigger=${o.trigger}`,
    !ICONS[o.icon] && `icon=${o.icon}`,
    !OWN_HANDLERS.has(o.ownHandlers) && `ownHandlers=${o.ownHandlers}`,
  ].filter(Boolean);
  if (unknown.length > 0) {
    throw new Error(`buildVariant: unknown axis value(s): ${unknown.join(', ')}`);
  }

  const c = (stem) => `${stem}_${o.salt}`;

  /**
   * Wrap a subtree in `depth` meaningless divs.
   *
   * Applied from the *outside* of every control, never between a control and
   * its own icon. Wrapping inside a candidate changes which element is the
   * innermost candidate, and that is a different transform with a different
   * claim — it belongs to the icon-technique family, which varies exactly that
   * and nothing else. Conflating the two would produce a family whose failure
   * could not be attributed to either.
   */
  const shell = (stem, inner) => {
    let html = inner;
    for (let i = o.wrapDepth; i >= 1; i -= 1) html = `<div class="${c(`${stem}${i}`)}">${html}</div>`;
    return html;
  };

  const links = (prefix, n, label) =>
    Array.from(
      { length: n },
      (_, i) => `<a href="/${prefix}/${i + 1}">${escapeText(label)} ${i + 1}</a>`
    ).join('');

  /* -- the ghost hamburger: the defect that must stay reported -------- */

  const hamburger = o.hamburger
    ? shell(
        'hamShell',
        `<div class="${c('menuToggle')}" data-mm="hamburger">${ICONS[o.icon](c)}</div>`
      )
    : '';

  /* -- the mega panel: the correct implementation that must stay clean - */

  const hide = HIDING[o.hiding];
  const trigger = TRIGGERS[o.trigger];
  const detailsShape = o.hiding === 'closed-details' || o.trigger === 'closed-details';

  const megaInner = `<div id="megaPanel" class="${c('megaPanel')}">${links('mega', 6, 'Mega link')}</div>`;
  const hideClass = !detailsShape && hide.klass ? ` ${c(hide.klass)}` : '';
  const hideAttrs = detailsShape ? '' : hide.attrs;
  const megaWrap = shell(
    'panelShell',
    `<div id="megaWrap" class="${c('megaWrap')}${hideClass}"${hideAttrs}>${megaInner}</div>`
  );

  let megaDisclosure;
  let headerTrigger = '';
  if (detailsShape) {
    megaDisclosure = shell(
      'discShell',
      `<details class="${c('megaDetails')}"><summary>Insurance</summary>${megaWrap}</details>`
    );
  } else if (trigger.remote) {
    /**
     * No local trigger at all, so nothing is a sibling of the panel and no
     * enclosing `.disclosure` div can stand in for one. The wrapper is dropped
     * rather than left empty: an empty wrapper around an out-of-tree panel is
     * itself an out-of-tree region, it would be the outermost one, and the
     * family would then be measuring the wrapper instead of the panel.
     */
    headerTrigger = `<button type="button" class="${c('remoteTrigger')}"${trigger.attrs}>Insurance</button>`;
    megaDisclosure = megaWrap;
  } else {
    const button = `<button type="button" class="${c('megaTrigger')}"${trigger.attrs}>Insurance</button>`;
    const triggerHtml = trigger.box ? `<div class="${c('triggerBox')}">${button}</div>` : button;
    megaDisclosure = shell('discShell', `<div class="${c('disclosure')}">${triggerHtml}${megaWrap}</div>`);
  }

  /* -- the hover menu: out of the tree, announced by nothing ---------- */

  const hoverMenu = shell(
    'hoverShell',
    `<div class="${c('hoverItem')}"><span class="${c('hoverLabel')}">Products</span>` +
      `<div class="${c('hoverMenu')}">${links('hover', 5, 'Hover link')}</div></div>`
  );

  /* -- the drawer: in the tree, off screen, announced ----------------- */

  const drawer = shell(
    'drawerShell',
    `<div class="${c('drawerHost')}">` +
      `<button type="button" class="${c('drawerTrigger')}" aria-expanded="false" aria-controls="drawer">Open menu</button>` +
      `<div id="drawer" class="${c('drawer')}">${links('drawer', 4, 'Drawer link')}</div>` +
      `</div>`
  );

  /* -- role-less back controls, for the analytics families ------------ */

  const cards =
    o.cards > 0
      ? `<div class="${c('cardRow')}">${Array.from(
          { length: o.cards },
          (_, i) =>
            `<div class="${c('backButton')}" data-mm="card" data-mm-idx="${i}">` +
            `<span class="${c('icon')}" aria-hidden="true">&#8249;</span></div>`
        ).join('')}</div>`
      : '';

  /* -- assets and scripts -------------------------------------------- */

  const assets = new Map();
  if (o.icon === 'img-alt-empty' && o.hamburger) {
    assets.set('icon.svg', { body: ICON_SVG, type: 'image/svg+xml' });
  }

  const wantsOwn = o.ownHandlers !== 'none';
  const wantsTracker = o.tracker === true;
  const scriptTags = [];
  if (wantsOwn) {
    assets.set('component.js', {
      body: componentScript({ hamburger: o.hamburger, cards: o.cards, shape: o.ownHandlers }),
      type: 'text/javascript; charset=utf-8',
    });
  }
  if (wantsTracker) {
    assets.set('sgtracker.js', { body: trackerScript(), type: 'text/javascript; charset=utf-8' });
  }
  // Load order is an axis of its own: a tracker that binds first still binds
  // from one call site, and the guard must not care which script ran when.
  const ownTag = '<script src="component.js"></script>';
  const trackerTag = '<script src="sgtracker.js"></script>';
  if (wantsOwn && wantsTracker) {
    scriptTags.push(...(o.trackerFirst ? [trackerTag, ownTag] : [ownTag, trackerTag]));
  } else if (wantsOwn) scriptTags.push(ownTag);
  else if (wantsTracker) scriptTags.push(trackerTag);

  const css = CSS_RULES.map(([stem, pseudo, decl]) => `.${c(stem)}${pseudo}{${decl}}`).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Metamorphic fixture</title>
<style>
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font:16px/1.5 system-ui,-apple-system,sans-serif}
a{color:#0645ad}
${css}
</style>
</head>
<body>
<header class="${c('siteHeader')}">${hamburger}<span class="${c('brand')}">Fixture Insurance</span>${headerTrigger}</header>
<nav class="${c('primaryNav')}" aria-label="Primary">
<a href="/quote">Get a quote</a>
<a href="/claims">Claims</a>
${megaDisclosure}
${hoverMenu}
${drawer}
</nav>
<main class="${c('content')}">
<h1>Metamorphic fixture</h1>
<p>Generated. Nothing here asserts a value; the assertion is that variants agree.</p>
${cards}
</main>
${scriptTags.join('\n')}
</body>
</html>
`;

  return { html, assets };
}
