/**
 * The focused fixtures.
 *
 * ── Why a second builder ─────────────────────────────────────────────────
 *
 * `fixtures.mjs` builds one page carrying every shape at once — a ghost
 * hamburger, a correct mega-menu, a hover menu, a drawer and a nav — because the
 * families that measure it vary an axis that touches all five and the page is
 * the cheapest way to exercise them together.
 *
 * The pages here are the opposite, deliberately. Each one holds a single
 * mechanism and the smallest amount of markup around it that makes the mechanism
 * legal HTML, because each was written after a review found a false clean that
 * the big page could not have attributed: three of them are shapes where one
 * element's presence silently deletes another element's finding. On a page
 * carrying five mechanisms, "the count moved by one" cannot be traced to the one
 * that moved it. On these it can only mean the thing the family is named after.
 *
 * They are still generated and still unlabelled — the counts below are what the
 * markup produces, not what the scanner is asserted to say. Where a family does
 * assert a value it says so in its own comment in families.mjs and carries the
 * expectation on the variant, so it is visible in the file a reviewer reads.
 *
 * ── The five shapes, and the false cleans they exist to catch ────────────
 *
 *   neighbour     A nameless, role-less, unreachable hamburger in a small
 *                 header, with the element standing next to it varied. The
 *                 sibling rescue written for react-select's chevron asked only
 *                 that SOME element under the same parent announced a
 *                 disclosure, so a hamburger beside a chat button, an account
 *                 button or a search `<details>` — the commonest mobile header
 *                 on the web — reported clean.
 *   combobox      react-select's actual shape: the chevron, the combobox that
 *                 operates it, and the container that holds both. The rescue
 *                 exists for this and it must keep firing, so that narrowing it
 *                 cannot become deleting it.
 *   disclosure    A `:hover` mega-menu with a neighbour varied. A `<summary>`
 *                 announces its own `<details>` and nothing else; a button
 *                 whose `aria-controls` resolves somewhere else announces that
 *                 somewhere else; a whole other component in the same nav
 *                 announces its own panel. Six links an agent cannot find were
 *                 published as zero because one of those stood near them — the
 *                 first two before the fix, the third after it.
 *   pointer       Three nameless role-less options under an ancestor that
 *                 carries the pointer cursor. `cursor` inherits, so the probe
 *                 credits the signal to the outermost element that has it — and
 *                 when that element is not itself eligible to be reported,
 *                 both it and the options vanish.
 *   absorbing     The same signal-absorption, one level along: the ancestor IS
 *                 eligible, takes the finding, and is then dropped by a later
 *                 gate it alone can trip — a name, a tab stop, or a working
 *                 control inside it. Whatever suppresses the ancestor, the dead
 *                 control it absorbed has to reappear.
 *   clipped       A two-slide carousel against the same links in normal flow,
 *                 across every `overflow` value. An open question rather than a
 *                 defect; what the family pins is that the answer cannot flip
 *                 the whole page's verdict by itself.
 *   offcanvas     A drawer parked just outside one edge of a clipping wrapper,
 *                 built four ways that are mirror images of each other. Left
 *                 and right are the same fact about the page.
 *
 * ── Nothing here has a glyph inside the control ──────────────────────────
 *
 * Every nameless control on these pages draws its icon with a CSS
 * `background-image` on the control itself, rather than wrapping a `<span>` or
 * an `<svg>` around one. That is not a style preference, it is what makes these
 * pages usable as a REGRESSION test rather than only as an invariance test.
 *
 * A glyph child is a second candidate: it inherits `cursor: pointer`, it is
 * inside the candidate net, and both the pre-migration probe and this one have
 * to decide which of the two is the control. Measured against
 * `git show main:scanner/probes.mjs` — Chromium 149.0.7827.55, axe-core 4.13.0 —
 * the burger below scored `ghostControls 0` on ALL FIVE neighbour variants while
 * it carried a `<span aria-hidden>&#9776;</span>`: the span displaced the
 * control and was then dropped itself on a `textContent` name. That is main's
 * own icon-technique fault, it has its own family on the big page, and while it
 * is in the way here it hides the thing these pages are for — you cannot tell
 * "the neighbour silenced the burger" from "the glyph did" if both answers are
 * zero. With the glyph moved into CSS, main answers 1 on every variant and any
 * zero measured here is attributable to the mechanism the family is named after.
 */

/* ------------------------------------------------------------------ */
/* Shared skeleton                                                     */
/* ------------------------------------------------------------------ */

/**
 * The same document shell `fixtures.mjs` emits, minus the big page's body.
 *
 * Kept here rather than imported so the two builders cannot pull each other
 * around: a change made for a focused page must not be able to move the page
 * seven established families are measured against.
 */
const page = ({ title, css, body, scripts = [] }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font:16px/1.5 system-ui,-apple-system,sans-serif}
a{color:#0645ad}
.content{padding:16px}
${css}
</style>
</head>
<body>
${body}
${scripts.map((src) => `<script src="${src}"></script>`).join('\n')}
</body>
</html>
`;

/**
 * One real click listener per control, each on its own line.
 *
 * Every element these bind to is genuinely operated by a mouse, which is what
 * makes it a finding when a keyboard and an agent cannot reach it. One line per
 * binding so each gets its own `scriptId:line:column` over CDP and no fixture
 * here can accidentally trip `SHARED_HANDLER_SHARE` in core.mjs — that guard has
 * two families of its own on the big page and has no business deciding the
 * outcome of these.
 */
const ownHandlers = (selectors) =>
  `${[
    '// The controls on this page bind their own handlers. Not analytics: this',
    '// script exists because these elements do something when you click them.',
    ...selectors.map(
      (sel, i) =>
        `document.querySelector('${sel}').addEventListener('click', ` +
        `function () { document.documentElement.dataset.opened = '${i}'; });`
    ),
  ].join('\n')}\n`;

const script = (selectors) => ({
  scripts: ['component.js'],
  assets: new Map([
    ['component.js', { body: ownHandlers(selectors), type: 'text/javascript; charset=utf-8' }],
  ]),
});

const linkList = (prefix, from, count, label) =>
  Array.from(
    { length: count },
    (_, i) => `<a href="/${prefix}/${from + i}">${label} ${from + i}</a>`
  ).join('');

/**
 * The glyph, always `aria-hidden`.
 *
 * The icon-technique family on the big page varies this axis across five
 * techniques and requires all five to agree, so these pages do not need to: one
 * technique, held constant, keeps a disagreement here attributable to the
 * mechanism the family is named after.
 *
 * Used only where the family is ABOUT a control with something inside it —
 * `pointer-origin-absorbs-hit-area`, where a padded hit area wrapped round a
 * glyph is the whole subject. Everywhere else the glyph is drawn in CSS by
 * `BACKGROUND_GLYPH` below; the file's preamble says why that distinction
 * decides whether these pages can be measured against main at all.
 */
const glyph = (ch) => `<span class="glyph" aria-hidden="true">${ch}</span>`;

/**
 * The same icon, painted by the control instead of nested inside it.
 *
 * A CSS declaration, applied to whichever class the page hands it. An element
 * styled with this has NO children, so it is exactly one candidate however the
 * probe decides which element owns an inherited `cursor: pointer` — which is
 * what keeps every page below measurable against the pre-migration probe as
 * well as this one.
 */
const BACKGROUND_GLYPH =
  "background-repeat:no-repeat;background-position:center;background-size:20px 20px;" +
  "background-image:url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' " +
  "viewBox='0 0 24 24'%3E%3Cpath d='M3 6h18M3 12h18M3 18h18' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E\")";

/* ------------------------------------------------------------------ */
/* neighbour — D1: proximity is not a relationship                     */
/* ------------------------------------------------------------------ */

/**
 * A hamburger that no keyboard and no agent can operate, in a 400×60 header.
 *
 * The header is sized explicitly because the rescue under test only searches a
 * parent that is itself control-sized (≤ 640×480), and a `<header>` left to
 * itself is as wide as the viewport. 400×60 is the measured shape of the mobile
 * header this is drawn from, and it is the shape in which the rescue fires.
 *
 * `#acct` is present in every variant, including the ones with no button to
 * point at it. The variants must differ in exactly one element — the neighbour —
 * and an IDREF target that appears and disappears with the button would be a
 * second difference for the disclosure probes to see.
 *
 * ── The brand, and why a page region is not a widget ─────────────────────
 *
 * Every variant carries a brand `<span>` beside the burger, and the header is a
 * `<header>` — a `banner` landmark — rather than a bare `<div>`. Both are
 * load-bearing, and the reason is the family two sections down.
 *
 * `combobox-chevron-stays-rescued` requires a nameless clickable BESIDE a
 * combobox to go unreported, because that is react-select and reporting it
 * describes a library's DOM rather than a barrier. Two of the neighbours below
 * are comboboxes, and this family requires the burger beside one to stay
 * reported. Those two demands are only satisfiable if the pages differ in
 * something a probe can read. They do, in two ways that ARIA and HTML both
 * name: this page is a landmark region holding three unrelated things, and
 * react-select's page is an unlabelled box holding exactly a text field and its
 * indicator — which is what the combobox pattern actually is, two elements
 * acting as one widget.
 *
 * If a future rescue cannot key on that difference, then these two shapes are
 * indistinguishable and the pair is undecidable. Say so on the known-limitation
 * list rather than deleting a variant from either family: a suite that drops
 * the case it cannot answer stops being able to tell you it cannot answer it.
 */
const NEIGHBOURS = {
  /** Nobody standing next to it. The floor: what the page is worth alone. */
  none: { inBar: '', outside: '' },
  /** A logo link. Announces nothing, and never rescued anything. The control. */
  'plain-link': { inBar: '<a href="/">Home</a>', outside: '' },
  /** Chat widgets. `aria-haspopup` says a dialog opens — not that this opens it. */
  'haspopup-button': {
    inBar: '<button type="button" aria-haspopup="dialog">Chat</button>',
    outside: '',
  },
  /** An account menu that genuinely controls something else on the page. */
  'expanded-controls-elsewhere': {
    inBar: '<button type="button" aria-expanded="false" aria-controls="acct">Account</button>',
    outside: '',
  },
  /** Native search disclosure. Its `<summary>` announces its own panel, not this one. */
  'details-summary': {
    inBar: '<details class="find"><summary>Search</summary><p>Type to search.</p></details>',
    outside: '',
  },
  /**
   * A site search field that opens the account panel. Role `searchbox`.
   *
   * ARIA gives `searchbox` no popup at all, so nothing beside one can be "the
   * button that displays it" — but a rescue keyed on text-entry roles in
   * general accepts it. Measured against the branch as it stood before the
   * split: main reported `div.burger`, the branch reported nothing.
   */
  'search-input-controls': {
    inBar:
      '<input class="field" type="search" aria-label="Search" aria-expanded="false" ' +
      'aria-controls="acct">',
    outside: '',
  },
  /**
   * A filter field with an IDREF and no popup of any kind. Role `textbox`.
   *
   * The same regression one role further out, and the plainest statement of it:
   * `textbox` has no popup in ARIA, so there is no pattern under which the
   * thing beside it is part of it.
   */
  'filter-input-controls': {
    inBar: '<input class="field" type="text" aria-label="Filter" aria-controls="acct">',
    outside: '',
  },
  /**
   * A real combobox, standing in the header rather than in a widget.
   *
   * This is the sharp one, and the preamble above says why it is answerable:
   * the combobox pattern is a text field and ONE indicator acting as a single
   * widget, and a banner landmark holding a burger, a brand and a search field
   * is not that. An agent that tabs to this combobox gets a list of insurance
   * types; it does not get the navigation menu.
   */
  'combobox-input': {
    inBar:
      '<input class="field" role="combobox" aria-expanded="false" aria-haspopup="listbox" ' +
      'aria-autocomplete="list" aria-label="Insurance type">',
    outside: '',
  },
  /**
   * The same combobox, one wrapper further out, outside the burger's own header.
   *
   * The rescue climbs until an ancestor is bigger than a control, so a combobox
   * that is not even in the same header as the burger is still inside the first
   * box the walk accepts. Measured before the split: the burger went unreported
   * here too. Distance is no more of a relationship than adjacency is.
   */
  'combobox-one-wrapper-up': {
    inBar: '',
    outside:
      '<input class="field" role="combobox" aria-expanded="false" aria-haspopup="listbox" ' +
      'aria-autocomplete="list" aria-label="Insurance type">',
  },
};

function neighbourPage(o) {
  const neighbour = NEIGHBOURS[o.neighbour];
  const { scripts, assets } = script(['[data-mm="hamburger"]']);
  return {
    assets,
    html: page({
      title: 'Neighbour irrelevance',
      css: [
        // ≤ 640×480 on both, so the rescue's climb reaches the shell and the
        // `combobox-one-wrapper-up` variant is inside its search rather than
        // outside it. A variant the mechanism cannot see tests nothing.
        '.shell{width:420px}',
        '.bar{width:400px;height:60px;display:flex;align-items:center;gap:8px;padding:8px 16px}',
        `.burger{cursor:pointer;width:44px;height:44px;${BACKGROUND_GLYPH}}`,
        '.brand{font-weight:700;white-space:nowrap}',
        '.field{width:90px;min-width:0}',
        '.panel{padding:8px}',
      ].join('\n'),
      body: [
        '<div class="shell">',
        '<header class="bar">',
        '<div class="burger" data-mm="hamburger"></div>',
        '<span class="brand">Fixture</span>',
        neighbour.inBar,
        '</header>',
        neighbour.outside,
        '</div>',
        '<main class="content">',
        '<h1>Neighbour irrelevance</h1>',
        '<p>The hamburger above opens the menu with a mouse and by no other means.</p>',
        '<div id="acct" class="panel">Signed in as Jo.</div>',
        '</main>',
      ].join('\n'),
      scripts,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* combobox — D1's other half: the rescue must keep firing             */
/* ------------------------------------------------------------------ */

/**
 * react-select, as it renders.
 *
 * The chevron is a role-less, nameless `div` with a real click listener and no
 * way for a keyboard to reach it — every test in the ghost probe says defect.
 * It is not one: the `<input role="combobox" aria-expanded>` beside it operates
 * the same widget, an agent tabs to that, and the menu opens. Reporting the
 * chevron describes the library's DOM rather than a barrier.
 *
 * The three variants are the same widget with the chevron at three depths,
 * because the depth is what the live shape turns on: react-select puts the
 * chevron inside `IndicatorsContainer`, a *sibling* of the container holding the
 * input, so a rescue that only looks at the chevron's own parent never sees the
 * combobox at all.
 */
const COMBOBOX_INPUT =
  '<input class="cbx" role="combobox" aria-expanded="false" aria-haspopup="listbox" ' +
  'aria-autocomplete="list" aria-label="Insurance type">';

const CHEVRON = `<div class="chev" data-mm="chevron">${glyph('&#9662;')}</div>`;

const COMBOBOX_SHAPES = {
  /** Chevron and combobox share a parent — the shape the rescue was written against. */
  'sibling-of-input': `${COMBOBOX_INPUT}${CHEVRON}`,
  /** react-select's real DOM: each half in its own container. */
  'indicators-wrapper':
    `<div class="valueBox">${COMBOBOX_INPUT}</div>` + `<div class="indicators">${CHEVRON}</div>`,
  /** The same, one component boundary deeper. Layout divs must not decide this. */
  'indicators-wrapper-deep':
    `<div class="valueBox"><div class="inner">${COMBOBOX_INPUT}</div></div>` +
    `<div class="indicators"><div class="inner">${CHEVRON}</div></div>`,
  /**
   * react-select with nothing selected, as it actually renders: the placeholder
   * text stands beside the input's wrapper, an indicator separator stands
   * beside the chevron's, and emotion's SSR `<style>` tags sit next to the
   * nodes they style. Insureon's profession picker, 17 Aug 2026 — the shape on
   * which the rescue was found not to fire, because the placeholder is neither
   * half nor a wrapper of one. The whole control box carries `cursor: pointer`
   * on that site (see `.select` below), which is what makes the placeholder a
   * candidate in its own right and the case worth having here.
   */
  'with-placeholder':
    '<style data-emotion="css placeholder">.placeholder{color:#808080}</style>' +
    `<div class="valueBox"><div class="placeholder" id="rs-placeholder">Insurance type</div><div class="inner">${COMBOBOX_INPUT}</div></div>` +
    `<div class="indicators"><span class="sep"></span><div class="inner">${CHEVRON}</div></div>`,
};

function comboboxPage(o) {
  const { scripts, assets } = script(['[data-mm="chevron"]']);
  return {
    assets,
    html: page({
      title: 'Combobox chevron',
      css: [
        // cursor: pointer on the whole box is how insureon.com ships react-select;
        // it makes every inert child compute to pointer too, which is the shape
        // the rescue has to see through.
        '.select{width:260px;display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid #ccc;cursor:pointer}',
        '.valueBox{flex:1;display:flex;align-items:center;gap:6px}',
        '.placeholder{flex:1;font-size:14px}',
        '.sep{display:inline-block;width:1px;height:20px;background:#ccc}',
        '.inner{display:flex;align-items:center}',
        '.indicators{display:flex;align-items:center}',
        '.cbx{width:100%;border:0}',
        '.chev{cursor:pointer;width:24px;height:24px;display:flex;align-items:center;justify-content:center}',
        '.glyph{display:inline-block;width:24px;height:24px}',
      ].join('\n'),
      body: [
        '<main class="content">',
        '<h1>Combobox chevron</h1>',
        `<div class="select">${COMBOBOX_SHAPES[o.combobox]}</div>`,
        '</main>',
      ].join('\n'),
      scripts,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* disclosure — D2: a trigger announces what it actually controls      */
/* ------------------------------------------------------------------ */

/**
 * A `:hover` mega-menu — ION's actual desktop shape — with the element beside it
 * varied.
 *
 * The menu is out of the accessibility tree and nothing opens it from the
 * keyboard, so its six links are six links an agent cannot find. That is true of
 * the first three variants whatever stands next to them: a `<summary>` opens the
 * `<details>` it belongs to, and a button whose `aria-controls` resolves to
 * `#acct` opens `#acct`. Neither reveals this menu, and a reader can check that
 * from the markup without knowing anything about the probe.
 *
 * The fourth variant is the same page with a button that really does control the
 * menu, and there the six links are findable. That one difference is real, which
 * is why this family carries values rather than agreement alone.
 */
const MEGA_SIBLINGS = {
  /** Nothing at all. Hover is the only way in. */
  none: { col: '', nav: '' },
  /** A help disclosure. Its summary announces its own `<p>`, not the menu. */
  'unrelated-details': {
    col: '<details class="help"><summary>Help</summary><p>Call us on 0800 000 000.</p></details>',
    nav: '',
  },
  /** An account menu that genuinely controls `#acct`, elsewhere on the page. */
  'expanded-controls-elsewhere': {
    col: '<button type="button" aria-expanded="false" aria-controls="acct">Account</button>',
    nav: '',
  },
  /**
   * A whole other component in the same nav — a disclosure with its own trigger
   * and its own panel, standing where a filter bar or a language picker stands.
   *
   * Not in the column with the menu: one nav, two independent components. This
   * is the shape a first fix for the <summary> bug reintroduced the false clean
   * through — the trigger declares no target, so adjacency is admissible, and
   * "adjacent" was read as "anywhere under the menu's parent", which on a nav is
   * every component the site has. Same fault as the <summary> one, two levels
   * out, and the reason it needs its own variant is that the fix for one is
   * where the other appears.
   */
  'unrelated-widget-in-nav': {
    col: '',
    nav:
      '<div class="widget"><button type="button" aria-expanded="false">Filters</button>' +
      '<div class="fpanel">Sort by price, rating or distance.</div></div>',
  },
  /**
   * The column is an OPEN `<details>`, and the menu is inside it.
   *
   * A native disclosure that is already open, with a `:hover`-only submenu in
   * its body — a "More" panel holding a flyout, which is an ordinary way to
   * build a second-level menu. The `<summary>` is a real trigger and it really
   * does operate this `<details>`, so a rule that asks only "does the trigger's
   * declared target contain the region" answers yes.
   *
   * It is still the wrong answer, and the markup says so without needing a
   * probe: the `<details>` is ALREADY OPEN. Operating that summary closes the
   * disclosure; it cannot reveal the menu, because the menu is not hidden by
   * the `<details>` — it is hidden by `display: none` until hover, exactly as
   * in the four variants above. Measured against the branch as it stood before
   * the split: main published 6 links an agent cannot find and the branch
   * published 0.
   *
   * The containment inference is only sound while the trigger is shut. Both
   * ways of writing "shut" are already in the DOM — a `<details>` without
   * `open`, and `aria-expanded="false"` — so nothing has to be guessed here.
   */
  'open-details-around-menu': { col: '<summary>More</summary>', nav: '', column: 'details' },

  /** The real relationship. This one does announce the menu. */
  'controls-the-menu': {
    col: '<button type="button" aria-expanded="false" aria-controls="mega">Products</button>',
    nav: '',
  },
};

function disclosurePage(o) {
  const sibling = MEGA_SIBLINGS[o.megaSibling];
  /**
   * The column is a `<div>` in every variant but one, where it is an open
   * `<details>` carrying the same class. Same box, same `:hover` rule, same
   * position in the nav — the transform is which component the column is, which
   * is the whole subject of that variant.
   */
  const columnTag = sibling.column === 'details' ? 'details open' : 'div';
  const columnClose = sibling.column === 'details' ? 'details' : 'div';
  return {
    assets: new Map(),
    html: page({
      title: 'Unrelated disclosure',
      css: [
        '.primaryNav{display:flex;align-items:flex-start;gap:16px;padding:8px 16px}',
        '.col{position:relative}',
        '.mega{display:none;position:absolute;top:100%;left:0;width:240px;flex-direction:column}',
        '.col:hover .mega{display:flex}',
        '.widget{width:220px}',
        '.fpanel{padding:4px}',
        '.panel{padding:8px}',
      ].join('\n'),
      body: [
        '<nav class="primaryNav" aria-label="Primary">',
        '<a href="/quote">Get a quote</a>',
        sibling.nav,
        `<${columnTag} class="col">${sibling.col}` +
          `<div id="mega" class="mega">${linkList('mega', 1, 6, 'Mega link')}</div></${columnClose}>`,
        '</nav>',
        '<main class="content">',
        '<h1>Unrelated disclosure</h1>',
        '<div id="acct" class="panel">Signed in as Jo.</div>',
        '</main>',
      ].join('\n'),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* pointer — D3: the signal needs an eligible origin                   */
/* ------------------------------------------------------------------ */

/**
 * Three nameless, role-less options with real click listeners, under an
 * ancestor that carries `cursor: pointer`.
 *
 * `cursor` inherits, so the probe credits the signal to the outermost element
 * that has it and treats everything below as the same control seen again. That
 * rule is right — it is what stopped a hamburger's own glyph from displacing it
 * — but it is applied to whatever element happens to hold the style, including
 * elements the probe would never report: a `<ul>`, which is not in the candidate
 * selector at all, or a block wider than the size gate. When the origin is
 * ineligible, the options are attributed to something that is reported by
 * nothing, and three findings become none.
 *
 * The options are nameless because that is the shape under test — colour
 * swatches, plan tiles, icon-only pickers. Each draws its own icon in CSS and
 * holds no element at all, so an option is exactly one candidate and a zero
 * measured here is the ancestor's doing rather than a glyph's. The file's
 * preamble has the measurement that forced this.
 */
const OPTIONS = `<ul class="opts">${Array.from(
  { length: 3 },
  (_, i) => `<li class="opt" data-mm-idx="${i}"></li>`
).join('')}</ul>`;

const POINTER_ANCESTORS = {
  /** The pointer sits on the `<ul>`, which the candidate selector does not include. */
  ul: { open: '', close: '', ulClass: 'opts pointer' },
  /** A block wider than the 640×480 gate: eligible tag, ineligible size. */
  'oversized-div': { open: '<div class="wideBox pointer">', close: '</div>', ulClass: 'opts' },
  /** The same, on a tag the selector does include, so the gate is what decides. */
  'oversized-section': {
    open: '<section class="wideBox pointer">',
    close: '</section>',
    ulClass: 'opts',
  },
  /** No inherited pointer anywhere: each option carries its own. */
  'own-cursor': { open: '<div class="plainBox">', close: '</div>', ulClass: 'opts ownPointer' },
};

/**
 * The other direction, held still so a fix to the above cannot overshoot.
 *
 * A padded hit area is one control, not two, and a clickable box holding three
 * options is one control as well — the box is what an author made clickable and
 * what the pointer originates on. Both are inside the size gate and both are
 * things the probe would report on their own, so absorbing what is inside them
 * is correct. Getting this wrong in the other direction is the icon-technique
 * incident: five identical hamburgers scoring 0, 0, 1, 1, 1 because the glyph
 * inside took the control's place.
 */
const POINTER_HOSTS = {
  'padded-hit-area': `<div class="hitArea" data-mm="hit">${glyph('&#9776;')}</div>`,
  'clickable-box': `<div class="hitArea tall" data-mm="hit">${OPTIONS}</div>`,
};

function pointerPage(o) {
  const host = POINTER_HOSTS[o.pointerHost];
  const selectors = host
    ? ['[data-mm="hit"]']
    : ['[data-mm-idx="0"]', '[data-mm-idx="1"]', '[data-mm-idx="2"]'];
  const { scripts, assets } = script(selectors);

  const ancestor = host ? null : POINTER_ANCESTORS[o.pointerAncestor];
  const body = host
    ? host
    : `${ancestor.open}${OPTIONS.replace('class="opts"', `class="${ancestor.ulClass}"`)}${ancestor.close}`;

  return {
    assets,
    html: page({
      title: 'Pointer origin',
      css: [
        '.opts{list-style:none;margin:0;padding:0;width:180px}',
        `.opt{width:180px;height:24px;${BACKGROUND_GLYPH}}`,
        '.glyph{display:inline-block;width:24px;height:24px}',
        '.pointer{cursor:pointer}',
        '.ownPointer .opt{cursor:pointer}',
        '.wideBox{width:800px;height:200px;padding:8px}',
        '.plainBox{width:800px;height:200px;padding:8px;cursor:default}',
        '.hitArea{cursor:pointer;width:220px;height:44px;display:flex;align-items:center;justify-content:center}',
        '.hitArea.tall{height:96px}',
      ].join('\n'),
      body: ['<main class="content">', '<h1>Pointer origin</h1>', body, '</main>'].join('\n'),
      scripts,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* absorbing — R2: what absorbs a signal has to publish it             */
/* ------------------------------------------------------------------ */

/**
 * A promo card that is clickable all over, with a small dismiss control in its
 * corner, and one thing varied about the card itself.
 *
 * The card is 300×100 — under the size gate, in the candidate net, role-less
 * and nameless — so unlike the `pointer` pages above it IS eligible to be
 * reported, and absorbing the dismiss control's inherited `cursor: pointer` is
 * the right answer: a padded hit area with something in it is one control. That
 * is `pointer-origin-absorbs-hit-area`, and it is correct.
 *
 * What the four variants below vary is whether the card, having absorbed the
 * signal, then survives to be published. Three gates can drop it, and every one
 * of them is a gate the dismiss control does not trip:
 *
 *   a working control inside it   `<a href>` — the card is a wrapper around
 *                                 something an agent can use, which is
 *                                 react-select's shape and a real rescue.
 *   an authored name              `aria-label` — an agent can say what it is.
 *   a tab stop                    `tabindex="0"` — an agent can reach it.
 *
 * In each case the card is correctly not reported, and in each case the dismiss
 * control is still nameless, still unreachable, and still carries its own click
 * listener. Measured against the branch as it stood before the split: the bare
 * card published one finding and the other three published NOTHING. The card
 * took the signal and was then excused, and the control it took it from was
 * excused with it. That is the same silent deletion the origination rule was
 * written to fix, one gate further along.
 *
 * The `<p>` of copy is in every variant so the card has content of its own and
 * the transform is genuinely one element's worth.
 */
const ABSORBING_CARDS = {
  /** Nothing suppresses the card, so the card is the finding. */
  'bare-card': { attrs: '', extra: '' },
  /** A real link an agent can use. The card is a wrapper; the dismiss is not. */
  'card-with-link': { attrs: '', extra: '<a class="more" href="/renewal">Read more</a>' },
  /** An authored name on the card. Says nothing about the control in its corner. */
  'named-card': { attrs: ' aria-label="Renewal offer"', extra: '' },
  /** A tab stop on the card. Reaches the card, never the dismiss. */
  'tabbable-card': { attrs: ' tabindex="0"', extra: '' },
};

function absorbingPage(o) {
  const card = ABSORBING_CARDS[o.absorbing];
  const { scripts, assets } = script(['[data-mm="card"]', '[data-mm="dismiss"]']);
  return {
    assets,
    html: page({
      title: 'Absorbing ancestor',
      css: [
        '.card{cursor:pointer;position:relative;width:300px;height:100px;padding:8px}',
        '.copy{margin:0;width:240px}',
        `.dismiss{position:absolute;top:4px;right:4px;width:24px;height:24px;${BACKGROUND_GLYPH}}`,
      ].join('\n'),
      body: [
        '<main class="content">',
        '<h1>Absorbing ancestor</h1>',
        `<div class="card" data-mm="card"${card.attrs}>`,
        '<p class="copy">Save 20% when you renew before 1 September.</p>',
        card.extra,
        '<div class="dismiss" data-mm="dismiss"></div>',
        '</div>',
        '</main>',
      ].join('\n'),
      scripts,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* offcanvas — R3: left and right are the same fact                    */
/* ------------------------------------------------------------------ */

/**
 * A navigation drawer parked just outside one edge of an `overflow: hidden`
 * wrapper, built four ways.
 *
 * Four tabbable links, a trigger that really controls the drawer, and a wrapper
 * the user cannot scroll — `overflow: hidden` is not a scrollbar, it is a clip.
 * This is the original phantom menu the tool is named for: the links are in the
 * accessibility tree and in the tab order, and there is nowhere on screen for a
 * person to see them.
 *
 * The four are mirror images in pairs. `right:100%` puts the drawer's right
 * edge on the wrapper's left edge; `left:100%` puts its left edge on the
 * wrapper's right edge. `translateX(-100%)` from `left:0` and `translateX(100%)`
 * from `right:0` are the same two positions reached by the other mechanism. A
 * page and its mirror image are the same page, and a scanner that answers them
 * differently has told you nothing about either.
 *
 * Measured against the branch as it stood before the split, Chromium
 * 149.0.7827.55: the two LEFT variants were reported and the two RIGHT ones
 * were not, because the guard added for clipped carousels asks whether a
 * scroll container could bring the region into view — and a container's
 * scrollable extent runs right and down only. The browser's asymmetry is real;
 * the page's is not.
 *
 * The wrapper is a direct child of `<body>` and full width on purpose. The
 * pre-migration probe called a region off screen when `rect.left` reached the
 * document's own width, so a wrapper inset by a `padding: 16px` content column
 * would park the right-hand drawer 16px short of that line and answer
 * "on screen" for reasons that have nothing to do with the mirror.
 */
const OFFCANVAS_SIDES = {
  'left-offset': 'right:100%',
  'right-offset': 'left:100%',
  'left-transform': 'left:0;transform:translateX(-100%)',
  'right-transform': 'right:0;transform:translateX(100%)',
};

function offcanvasPage(o) {
  return {
    assets: new Map(),
    html: page({
      title: 'Off-canvas drawer',
      css: [
        '.wrap{position:relative;width:100%;height:120px;overflow:hidden}',
        '.drawer{position:absolute;top:0;width:280px;display:flex;flex-direction:column}',
        ...Object.entries(OFFCANVAS_SIDES).map(([id, decl]) => `.${id}{${decl}}`),
      ].join('\n'),
      body: [
        '<div class="wrap">',
        '<button type="button" aria-expanded="false" aria-controls="drawer">Open menu</button>',
        `<div id="drawer" class="drawer ${o.offcanvas}">${linkList('drawer', 1, 4, 'Drawer link')}</div>`,
        '</div>',
        '<main class="content">',
        '<h1>Off-canvas drawer</h1>',
        '<p>The drawer above is parked outside the wrapper, which cannot be scrolled.</p>',
        '</main>',
      ].join('\n'),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* clipped — D4: an open question that must not settle the page        */
/* ------------------------------------------------------------------ */

/**
 * Six links, in a two-slide carousel or in normal flow.
 *
 * Nothing is hidden in the sense this tool reports: every link is in the
 * accessibility tree, every link is in the tab order, and the second slide is
 * one swipe away. What the second slide is not is painted, because the carousel
 * clips it — and axe knows about overflow clipping, so the migration to
 * `isVisibleOnScreen` started classifying it as a panel that is off screen.
 *
 * Whether that is a finding is a judgement the team has to make. What is not a
 * judgement call is that it decides the page's published verdict on its own:
 * this is the commonest layout on the commercial web, and a scanner that calls
 * every page carrying a carousel `blocking` has stopped being usable.
 */
/**
 * The `overflow` axis is varied rather than fixed at `hidden`, and the five
 * values do NOT all mean the same thing to a person.
 *
 * `auto` and `scroll` genuinely put the second slide one gesture away; `hidden`
 * and `clip` do not; `visible` never hid it at all. So this is not an
 * invariance claim about the slide — the family exempts every panel metric and
 * says so. What it holds still is the only part that is the same across all
 * five: a page whose entire content is six links, all named, all in the
 * accessibility tree and all in the tab order, is not a blocking page, and no
 * value of one container's `overflow` property can make it one.
 */
const CLIPPED = {
  flow: 'flowBox',
  'carousel-hidden': 'carousel ovHidden',
  'carousel-auto': 'carousel ovAuto',
  'carousel-scroll': 'carousel ovScroll',
  'carousel-clip': 'carousel ovClip',
  'carousel-visible': 'carousel ovVisible',
};

function clippedPage(o) {
  const container = CLIPPED[o.clipped];
  return {
    assets: new Map(),
    html: page({
      title: 'Clipped container',
      css: [
        '.carousel{width:300px;display:flex}',
        '.ovHidden{overflow:hidden}',
        '.ovAuto{overflow:auto}',
        '.ovScroll{overflow:scroll}',
        '.ovClip{overflow:clip}',
        '.ovVisible{overflow:visible}',
        '.flowBox{width:300px;display:flex;flex-direction:column}',
        '.slide{flex:0 0 300px;width:300px;display:flex;flex-direction:column;padding:8px}',
      ].join('\n'),
      body: [
        '<main class="content">',
        '<h1>Clipped container</h1>',
        `<div class="${container}">`,
        `<div class="slide">${linkList('slide', 1, 3, 'Slide link')}</div>`,
        `<div class="slide">${linkList('slide', 4, 3, 'Slide link')}</div>`,
        '</div>',
        '</main>',
      ].join('\n'),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

/**
 * Every focused page, by the axis that selects it. `full-page` is absent on
 * purpose: that one lives in fixtures.mjs and is the default.
 */
export const SCENARIOS = {
  neighbour: { build: neighbourPage, axis: 'neighbour', values: Object.keys(NEIGHBOURS) },
  combobox: { build: comboboxPage, axis: 'combobox', values: Object.keys(COMBOBOX_SHAPES) },
  disclosure: { build: disclosurePage, axis: 'megaSibling', values: Object.keys(MEGA_SIBLINGS) },
  pointer: {
    build: pointerPage,
    axis: 'pointerAncestor',
    values: [...Object.keys(POINTER_ANCESTORS), ...Object.keys(POINTER_HOSTS)],
  },
  absorbing: { build: absorbingPage, axis: 'absorbing', values: Object.keys(ABSORBING_CARDS) },
  offcanvas: { build: offcanvasPage, axis: 'offcanvas', values: Object.keys(OFFCANVAS_SIDES) },
  clipped: { build: clippedPage, axis: 'clipped', values: Object.keys(CLIPPED) },
};

export const SCENARIO_DEFAULTS = {
  /** Which page shape to build. `full-page` is the one in fixtures.mjs. */
  scenario: 'full-page',
  neighbour: 'none',
  combobox: 'sibling-of-input',
  megaSibling: 'none',
  pointerAncestor: 'ul',
  /**
   * Set instead of `pointerAncestor` to build the absorption cases, where the
   * pointer-bearing element is itself reportable and correctly takes the finding.
   */
  pointerHost: null,
  absorbing: 'bare-card',
  offcanvas: 'left-offset',
  clipped: 'flow',
};

/**
 * Build a focused page, refusing an axis value nobody defined.
 *
 * A typo in a family's options must not quietly build the default page and
 * report agreement about something the suite never measured — that is the
 * "the check did not run" failure this project has shipped twice, in miniature.
 */
export function buildScenario(o) {
  const scenario = SCENARIOS[o.scenario];
  if (!scenario) {
    throw new Error(
      `buildScenario: unknown scenario “${o.scenario}”. Known: ${Object.keys(SCENARIOS).join(', ')}`
    );
  }
  const value = o.scenario === 'pointer' && o.pointerHost ? o.pointerHost : o[scenario.axis];
  if (!scenario.values.includes(value)) {
    throw new Error(
      `buildScenario: unknown ${scenario.axis} “${value}” for scenario “${o.scenario}”. ` +
        `Known: ${scenario.values.join(', ')}`
    );
  }
  return scenario.build(o);
}
