/**
 * The in-page measurements.
 *
 * ── Why these, and not others ────────────────────────────────────────────
 *
 * An agent operates a page through the accessibility tree. For every element
 * a person could interact with, three things have to hold:
 *
 *   1. PRESENCE   — it appears in the tree carrying an interactive role.
 *   2. NAME       — it says what it does.
 *   3. OPERABILITY— it can be reached (tab order) and activated.
 *
 * And one thing has to *not* hold:
 *
 *   4. NO GHOSTS  — anything that looks closed or hidden is genuinely out of
 *                   the tree, not merely out of sight.
 *
 * There is a fifth, and it is the mirror image of the fourth:
 *
 *   5. REACHABILITY — content that *is* out of the tree can still be found,
 *                   because something in the tree announces it.
 *
 * axe, and the scanner's original probes, only ever tested (2), and only for
 * elements that already satisfied (1). That is a real blind spot rather than a
 * technicality: a hamburger menu built from `<div onClick>` fails (1) and (3)
 * outright, so no name check ever runs on it and every automated report comes
 * back clean — while it is the only way into mobile navigation.
 *
 * So `ghostControls` tests (1) directly: things that behave like controls but
 * aren't announced as any. And `hiddenPanels` generalises what used to be a
 * single hardcoded `[class*="megaMenu"]` selector into the property that
 * actually mattered — *any* region still in the tree, still full of focusable
 * controls, that isn't on screen.
 *
 * `unreachablePanels` tests (5), and exists because the other probes have a
 * blind spot they cannot see past. Every one of them starts by discarding
 * anything already out of the tree, on the reasoning that content properly out
 * of the tree is correctly hidden and not worth reporting. For a closed dialog
 * that is exactly right. For the site's primary navigation it is exactly
 * wrong, and the difference is measurable: at a desktop viewport Insureon puts
 * 63 navigation links in the DOM and 7 in the accessibility tree, because the
 * mega-menu is `display: none` until a mouse hovers it. Nothing announces the
 * other 56. An agent doesn't fail to *operate* that menu — it never learns the
 * destinations exist.
 *
 * What separates the dialog from the mega-menu is not the hiding, it is whether
 * something still in the tree advertises what is hidden. So that, and not the
 * hiding, is what this probe measures.
 *
 * ── Where the answers come from ──────────────────────────────────────────
 *
 * This file used to hand-implement five things Chromium already computes:
 * accessibility-tree membership, the accessible name algorithm, focusability,
 * ARIA IDREF resolution, and on-screen visibility. Each was a closed list over
 * an open set of browser mechanisms, and that is precisely why the false
 * positives concentrated on modern, *correct* code — a well-built collapsible
 * reaches for the newest mechanism, which is the one missing from the list.
 * The observed signature was "the better the implementation, the more
 * confidently it was flagged", which is the worst possible direction for a
 * check like this to fail in.
 *
 * So none of those five is computed here any more. axe-core is already injected
 * into every page for `axe.run`, and it publishes the same primitives its own
 * rules are built on. They are used instead:
 *
 *   tree membership     axe.commons.dom.isVisibleToScreenReaders
 *   on-screen           axe.commons.dom.isVisibleOnScreen
 *   accessible name     axe.commons.text.accessibleText
 *   focusability        axe.commons.dom.isInTabOrder / getTabbableElements
 *   IDREF resolution    axe.commons.aria.getAccessibleRefs
 *   interactive roles   axe.commons.aria.getRolesByType('widget')
 *
 * Scored against Chromium's own accessibility tree over CDP on the primitives
 * fixture, joined on `backendDOMNodeId` with node *absence* as the membership
 * test: the hand-written `removedFromTree` disagreed with the browser on 9 of
 * 59 links, `isVisibleToScreenReaders` on 0 of 59. The nine were
 * `visibility: collapse` and closed `<details>`, neither of which the old list
 * knew about.
 *
 * The point is not that axe is infallible. It is that this file stops owning
 * the enumeration, and something with a test suite and an industry's worth of
 * users owns it instead. `axe.commons` is an exposed internal rather than a
 * documented API, which is why axe-core is pinned to an exact version, why
 * `meta.axeVersion` is recorded on every run, and why core.mjs fails a scan
 * loudly when the helpers are missing rather than returning a clean page.
 *
 * ── The rule that doesn't bend ───────────────────────────────────────────
 * Nothing here clicks, hovers, focuses or scrolls. Every probe is a read of
 * the DOM and computed style as delivered. That is what keeps one run
 * comparable to the next, and a live scan comparable to a scheduled one.
 */

/** Runs inside the page. One function, so there's a single serialisation boundary. */
export function collectMeasurements() {
  const TRUNCATE = 240;
  const trunc = (s) => (s && s.length > TRUNCATE ? `${s.slice(0, TRUNCATE)}…` : s || '');

  /* ---------------------------------------------------------------- */
  /* The engine                                                        */
  /* ---------------------------------------------------------------- */

  const axe = window.axe;

  /**
   * A measurement that did not happen must never render as a good result.
   *
   * core.mjs checks this before it calls us, the same way it has checked
   * `axe.run` since a Content-Security-Policy silently dropped the injected
   * script and produced a spotless report from a scanner that never ran. This
   * second check is here because these primitives are an exposed internal: a
   * future axe could keep `axe.run` and move `axe.commons`, and the failure
   * mode would be a page that measures clean on every probe in this file.
   * Throwing turns that into `{ url, error }`, which the viewer renders as an
   * explicit failure and counts as zero.
   */
  if (
    typeof axe?.commons?.dom?.isVisibleToScreenReaders !== 'function' ||
    typeof axe?.commons?.text?.accessibleText !== 'function' ||
    typeof axe?.commons?.aria?.getAccessibleRefs !== 'function' ||
    typeof axe?.setup !== 'function'
  ) {
    throw new Error(
      'axe.commons is not available in the page, so tree membership, accessible names, ' +
        'focusability and IDREF resolution could not be measured. Refusing to report a ' +
        'page as clean on primitives that never ran.'
    );
  }

  /**
   * `axe.commons` needs the virtual tree that `axe.setup()` builds; calling it
   * twice throws ("Axe is already setup") rather than quietly handing back a
   * stale one. `axe.run` builds and tears down its own tree, so by the time we
   * get here there is normally nothing set up — but tearing down first is a
   * measured no-op when that is the case, and it makes this function safe to
   * call regardless of what ran before it. The `finally` matters as much: a
   * throw halfway through must not leave `axe._tree` pinned to a document the
   * next page in the loop has already replaced.
   */
  axe.teardown();
  axe.setup(document.documentElement);

  try {
    return measurePage();
  } finally {
    axe.teardown();
  }

  function measurePage() {
    const { dom, text, aria } = axe.commons;

    /* ---------------------------------------------------------------- */
    /* Shared vocabulary                                                 */
    /* ---------------------------------------------------------------- */

    const NATIVE_INTERACTIVE =
      'a[href],button,input,select,textarea,summary,label,[contenteditable="true"],audio[controls],video[controls]';

    /**
     * The candidate net for "things a person could operate". Deliberately a
     * cheap CSS query: it over-selects, and axe decides which of them count.
     * `summary` is in the list because a closed `<details>` is a *correct*
     * disclosure — its trigger has to be seen as a control, or the accordion
     * it fronts gets reported as a region nothing announces.
     */
    const FOCUSABLE =
      'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';

    /**
     * The tags the ghost-control probe will even look at. Named once because
     * two separate tests below ask "would this element itself have been a
     * candidate?", and they have to be asking about the same net.
     */
    const CANDIDATE_TAGS = 'div,span,li,i,svg,p,section,header,figure';

    /** Roles that make an element announce itself as something you can operate. */
    const WIDGET_ROLES = new Set(aria.getRolesByType('widget'));

    /**
     * The ONE role where ARIA puts the control that displays the popup beside
     * the widget rather than on it.
     *
     * `combobox`, and nothing else. The combobox pattern is explicitly two
     * elements — a text field and an optional button that displays the popup —
     * acting as one widget, which is what react-select renders: a chevron in
     * `IndicatorsContainer` beside the container holding the
     * `<input role="combobox">` that actually operates it.
     *
     * `searchbox`, `textbox` and `spinbutton` used to be in this set and they
     * have no business here: none of them has a popup in ARIA at all, so
     * nothing beside one can be "the button that displays it". Measured, that
     * over-wide set is what let an `<input type="search">` (role `searchbox`)
     * and an `<input aria-label="Filter" aria-controls="…">` (role `textbox`,
     * no popup of any kind) each certify a dead hamburger standing next to
     * them — main reported `div.burger`, this file reported nothing. A false
     * clean, which is the incident class this project has already shipped twice.
     */
    const POPUP_PAIRED_ROLE = 'combobox';

    /** A region needs this many controls to be a panel rather than a stray control. */
    const MIN_CONTROLS = 3;

    /** Short, human-readable locator. Not for machine matching — class hashes churn. */
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
      return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ''}`;
    };

    /**
     * Every predicate below is asked once per element and then remembered.
     * The panel probes ask about the same controls from several enclosing
     * regions, and `getRole` and the visibility walks are not free on a page
     * with a thousand candidate containers.
     */
    const memo = (fn) => {
      const cache = new Map();
      return (el) => {
        if (cache.has(el)) return cache.get(el);
        const value = fn(el);
        cache.set(el, value);
        return value;
      };
    };

    /* ---------------------------------------------------------------- */
    /* The five primitives, all borrowed                                 */
    /* ---------------------------------------------------------------- */

    /** In the accessibility tree. Knows every mechanism axe knows, and grows with it. */
    const inTree = memo((el) => dom.isVisibleToScreenReaders(el));

    /** Rendered where a person could see it. Opacity, clip, overflow, off-screen. */
    const onScreen = memo((el) => dom.isVisibleOnScreen(el));

    /**
     * The real accname algorithm, which is the fix for a specific measured
     * failure: the old version read `el.textContent`, so
     * `<span aria-hidden="true">☰</span>` gave a hamburger a name and every
     * check below skipped it. Measured on a fixture holding five hamburgers
     * that differ only in icon technique — `aria-hidden` span, `aria-hidden`
     * svg, `aria-hidden` `<i>`, visually-hidden text, and no icon at all —
     * `textContent` named two of the five and `accessibleText` names none of
     * them, which is the answer all five must share.
     */
    const UNCOMPUTED_NAME = '(name could not be computed)';
    const accessibleName = memo((el) => {
      try {
        return (text.accessibleText(el) || '').trim();
      } catch {
        // "We could not tell" is not "there is no name", and every check below
        // treats an empty name as a defect. Returning "" would manufacture a
        // finding out of a failed measurement, so this returns something truthy
        // and the element goes unreported instead. That is a real gap; it is
        // just not one worth inventing a false positive to close.
        return UNCOMPUTED_NAME;
      }
    });

    /**
     * The name the browser actually publishes for an element with NO role.
     *
     * `accessibleText` above answers "what would this element be called if it
     * were named from its contents", which is the right question for a button
     * or a link and the wrong one for a bare `<div>`. Chromium publishes a name
     * on a role-less element only when an author wrote one — `aria-label`,
     * `aria-labelledby`, or `title` — and publishes nothing at all for text,
     * `<img alt>` or `<svg><title>` inside it. Measured over CDP against
     * Chromium's own accessibility tree; the table is at the call site.
     *
     * So this asks only for the authored name. It still goes through axe rather
     * than reading the three attributes here, because `aria-labelledby` is an
     * IDREF list with its own resolution rules and that is exactly the kind of
     * closed list this file stopped keeping.
     */
    const exposedName = memo((el) => {
      try {
        const vNode = axe.utils.getNodeFromTree(el) ?? el;
        const labelledby = (aria.arialabelledbyText(vNode) || '').trim();
        if (labelledby) return labelledby;
        const label = (aria.arialabelText(vNode) || '').trim();
        if (label) return label;
        return (text.titleText(vNode) || '').trim();
      } catch {
        // Same reasoning as UNCOMPUTED_NAME above: "we could not tell" must not
        // become "there is no name", because the caller reads an empty name as
        // a defect. Report nothing rather than invent a finding.
        return UNCOMPUTED_NAME;
      }
    });

    /** In the tab order, as axe computes it. */
    const inTabOrder = memo((el) => {
      try {
        return dom.isInTabOrder(el);
      } catch {
        return false;
      }
    });

    /**
     * The element's computed role, asked once. `null` means "the browser
     * publishes no role for this" — measured, that is what axe answers for a
     * bare `<div>`, `<span>` and `<section>` without a name.
     */
    const roleOf = memo((el) => {
      try {
        return aria.getRole(el, { noPresentational: true });
      } catch {
        return null;
      }
    });

    /**
     * The two attributes HTML gives a button for naming what it opens.
     *
     * `popovertarget` and `commandfor` are how a disclosure is written today
     * without any ARIA at all, and neither is an ARIA IDREF, so nothing that
     * asks axe about IDREFs can see them. Measured over CDP against Chromium's
     * own accessibility tree, 149.0.7827.55, four buttons on one page:
     *
     *   <button popovertarget="m1">                  expanded=false
     *   <button command="toggle-popover" commandfor>  expanded=false
     *   <button aria-expanded="false" aria-controls>  expanded=false
     *   <button>                                      (no expanded property)
     *
     * The browser already treats the first two as disclosure triggers and
     * publishes exactly what it publishes for the third. A probe that does not
     * would report a correct popover menu as content nothing announces — the
     * "the better the implementation, the more confidently it was flagged"
     * signature this whole file was rewritten to remove, and a false positive
     * rather than a false clean only because nobody has shipped one yet.
     *
     * Two fixed HTML attribute names, not an open set of browser mechanisms —
     * the same latitude the `input[type="hidden"]` exception takes, for the
     * same reason.
     */
    const HTML_INVOKER_ATTRS = ['popovertarget', 'commandfor'];

    /**
     * Every attribute by which an author writes down "this control opens that
     * region". One list, because two lists drift: `declaredTargets` resolved
     * `aria-owns` while `announces()` did not know about it, so a correctly
     * announced panel came back with its trigger found and its verdict
     * unannounced. Caught by trigger-placement's `aria-owns` variant.
     */
    const REFERENCE_ATTRS = ['aria-controls', 'aria-owns', ...HTML_INVOKER_ATTRS];

    /**
     * Asked once for the page, because the referrer lookup below is the one
     * place in this file that runs a document-wide `querySelectorAll` per
     * candidate rather than a cached index — `getAccessibleRefs` has an index
     * and these attributes have none. `referrersTo` is called for every ghost
     * candidate and for every id inside every hidden region: measured over
     * insureon's ten desktop pages today, that is 66 clickable-no-role
     * candidates and 53 unreachable panels' worth of ids, on pages where
     * neither attribute appears at all.
     */
    const HTML_INVOKER_SELECTOR = HTML_INVOKER_ATTRS.map((a) => `[${a}]`).join(',');
    const pageHasHtmlInvokers = !!document.querySelector(HTML_INVOKER_SELECTOR);

    /**
     * Everything in the document that points at this element by an ARIA IDREF —
     * `aria-controls`, `aria-owns`, `aria-labelledby` and the rest, in both
     * directions. axe indexes every idref attribute in the spec once per root
     * and caches it, so this is a map lookup rather than a `querySelector` per
     * candidate.
     *
     * The old version read only the first `[aria-controls="…"]`, which missed
     * `aria-owns` outright: on the fixture it found the controller for one of
     * two correctly-announced panels and reported the other as unfindable.
     *
     * The HTML invokers are queried rather than indexed because axe has no
     * index for them. Without this half a *remote* popover trigger — the shape
     * `remote-controls` tests for ARIA, where nothing is a sibling of the panel
     * — is invisible from the panel's side, and a correct menu reads as
     * unannounced however well it is built.
     */
    const referrersTo = (el) => {
      if (!el.id) return [];
      const refs = [];
      try {
        refs.push(...aria.getAccessibleRefs(el));
      } catch {
        // Resolution failed; the ARIA half contributes nothing.
      }
      if (pageHasHtmlInvokers) {
        try {
          const id = CSS.escape(el.id);
          refs.push(
            ...document.querySelectorAll(HTML_INVOKER_ATTRS.map((a) => `[${a}="${id}"]`).join(','))
          );
        } catch {
          // An id that will not escape. Costs findings in the safe direction —
          // a trigger nothing found can never rescue anything.
        }
      }
      return refs;
    };

    /**
     * "Is this a control a person could reach, setting aside whether the region
     * around it happens to be open?"
     *
     * axe's own `isFocusable` cannot answer this, and the reason matters:
     * `focusDisabled()` — which it calls first — ends in `isHiddenForEveryone()`.
     * So every control inside a closed panel answers *false*, which is correct
     * for a visible page and useless here, where the whole subject is a panel
     * that is closed. Counting controls with it would report zero lost controls
     * exactly where the defect is — a false clean, which is the failure mode
     * this project has already shipped twice.
     *
     * So the visibility half is set aside and each remaining question is still
     * put to something that owns the answer:
     *
     *   :disabled       the browser's own pseudo-class, which already knows a
     *                   control inside `<fieldset disabled>` is disabled. The
     *                   hand-written `!el.hasAttribute('disabled')` did not,
     *                   and that inflated the count feeding "controls an agent
     *                   cannot find" — measured 8 against a true 3.
     *   parseTabindex   axe's parser, so odd `tabindex` values behave.
     *   getRolesByType  axe's list of W3C widget roles, rather than a private
     *                   set maintained in this file.
     *
     * One exception is spelled out rather than delegated: axe's `getRole()`
     * answers `textbox` for `input[type="hidden"]` (measured, 4.13.0), which
     * would put every CSRF token in a form on the list of controls an agent
     * has lost. `type` is one fixed HTML attribute value, not an open set of
     * browser mechanisms, so naming it here does not recreate the fault this
     * file was rewritten to remove.
     */
    const isControl = memo((el) => {
      if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
      if (el.matches(':disabled')) return false;
      const tabindex = axe.utils.parseTabindex(el.getAttribute('tabindex'));
      if (tabindex !== null && tabindex < 0) return false;
      // `roleOf` swallows a thrown role lookup as `null`, so an element axe
      // could not classify falls through to the tabindex answer below.
      const role = roleOf(el);
      if (role && WIDGET_ROLES.has(role)) return true;
      return tabindex !== null && tabindex >= 0;
    });

    /**
     * The tabbable controls *inside* an element, excluding the element itself.
     *
     * `getTabbableElements` wants one of axe's virtual nodes rather than a DOM
     * element, and returns nothing useful for a node axe never walked. Returns
     * DOM elements rather than axe's virtual nodes because the only caller has
     * to put each one to `isUsableControl`, which takes an element.
     */
    const tabbableWithin = (el) => {
      try {
        const vNode = axe.utils.getNodeFromTree(el);
        if (!vNode) return [];
        return dom
          .getTabbableElements(vNode)
          .map((v) => v.actualNode)
          .filter((n) => n && n !== el);
      } catch {
        return [];
      }
    };

    /**
     * What a control SAYS it operates.
     *
     * Four forms, and only four, because only these are the author writing the
     * relationship down: an ARIA IDREF (`aria-controls` / `aria-owns`), the two
     * HTML invoker attributes (`popovertarget` / `commandfor`), and the native
     * disclosure, where a `<summary>` operates the `<details>` it is the summary
     * of. `aria-labelledby` and `aria-describedby` are IDREFs too and are
     * deliberately not here — a heading that labels a panel is not the button
     * that opens it.
     *
     * `popovertarget` and `commandfor` are the same statement written in HTML
     * rather than in ARIA, and they resolve the same way: `HTML_INVOKER_ATTRS`
     * above has the CDP measurement showing Chromium publishes the identical
     * disclosure state for all three.
     *
     * Resolution goes through `axe.commons.dom.idrefs` rather than
     * `getElementById` here, for the reason the rest of this file gives: an
     * IDREF attribute is a *list* with its own resolution rules, and that is
     * exactly the kind of thing this file stopped owning. If the helper ever
     * goes missing the catch returns "declares nothing", which costs findings
     * in the safe direction — an undeclared trigger can never rescue anything,
     * so the failure is a false positive rather than a false clean.
     */
    const declaredTargets = memo((el) => {
      const targets = [];
      try {
        for (const attr of REFERENCE_ATTRS) {
          if (!el.hasAttribute(attr)) continue;
          for (const target of dom.idrefs(el, attr)) {
            if (target && target.nodeType === 1) targets.push(target);
          }
        }
      } catch {
        // Resolution failed; this element is treated as declaring nothing.
      }
      if (el.tagName === 'SUMMARY') {
        const details = el.parentElement;
        if (details && details.tagName === 'DETAILS') targets.push(details);
      }
      return targets;
    });

    /**
     * ── The one predicate: does X actually operate Y? ─────────────────────
     *
     * Three probes used to answer this three different ways, and all three
     * answered it with PROXIMITY — shares a parent, is the parent, sits in the
     * same box. Proximity is not a relationship, and each of the three shipped
     * a false clean because of it. Measured, against the same fixtures on main:
     *
     *   A `<summary>Help</summary>` in one column of a nav "announced" the
     *   `display: none` mega-menu beside it, because a `<summary>` was taken to
     *   announce anything it shared a parent with. Six links an agent cannot
     *   find, published as zero, on the headline metric.
     *
     *   A hamburger beside `<button aria-haspopup="dialog">Chat</button>` was
     *   rescued from `ghostControls`, because *something* nearby announced
     *   *something*. That is the commonest mobile header on the web, and it is
     *   exactly what that probe exists to catch.
     *
     * So the question is asked once, here, and the answer is yes only when the
     * relationship is real:
     *
     *   1. The trigger DECLARES what it operates, and this region is that
     *      target, inside it, or around it. A trigger that names its target has
     *      told us what it is about — and, just as importantly, what it is not
     *      about. That is what stops a `<summary>` from claiming the panel next
     *      door: its `<details>` is right there, and the panel is not in it.
     *   2. The region is inside the trigger. Nothing to infer.
     *   3. The trigger declares NO target, announces a disclosure, and is
     *      PAIRED with the region: its own sibling, or inside a sibling that is
     *      nothing but packaging around it. This is the plain WAI-ARIA
     *      disclosure — `<button aria-expanded>Products</button>` beside its
     *      `<ul>` — where `aria-controls` is optional and most authors omit it.
     *      Adjacency is the only evidence there is, and it is admissible
     *      *because the trigger named nothing that rules the region out*.
     *      Order matters: a trigger that declared a target never reaches here.
     *
     * Rule 3 is the one that has to be kept honest, and it took two goes.
     * "Same parent" let a mega-menu trigger carrying only `aria-expanded` reach
     * across a nav and announce the hover-only menu two branches away, taking
     * five unfindable links to zero — the `<summary>` false clean again, one
     * level out. "Same parent, and the trigger's branch holds no other control"
     * then let a Filters widget whose panel is plain text do the same thing to
     * six more, because a panel with nothing focusable in it counted as
     * nothing at all.
     *
     * So the branch holding the trigger has to be PACKAGING and nothing else:
     * every element in it is the trigger, inside the trigger, or a wrapper
     * around it. Layout divs and component boundaries pass, which is what the
     * inert-wrapper family requires; a branch that also holds a panel, a label
     * or any other content is a different component, and its trigger is about
     * ITS contents. Where that is wrong it over-reports, which is the direction
     * this file is allowed to be wrong in.
     *
     * Rule 1 has a second half, and it is the fix for a measured false clean of
     * its own. `t.contains(region)` is not a fact about the page, it is an
     * INFERENCE: "open t and the region arrives". That inference is only sound
     * while t is closed. Measured, against an `<details open>` whose body also
     * holds a `:hover`-only submenu — the summary declares its `<details>`, the
     * `<details>` contains the panel, so containment fired and the panel came
     * back announced: main published 6 links an agent cannot find, this file
     * published 0. Opening that `<details>` reveals nothing, because it is
     * already open and something else is doing the hiding.
     *
     * So a trigger whose own declared state says OPEN cannot explain a region
     * that is still hidden. `<details open>` and `aria-expanded="true"` are the
     * two ways a trigger says that, and a trigger that says nothing about its
     * state is treated as closed — which is what main does, and the direction
     * that keeps a correct closed accordion from being reported as a defect.
     * The narrowing is confined to the containment inference: where the trigger
     * names the region itself, the author wrote the relationship down and it is
     * honoured whatever the state.
     */
    const operates = (trigger, region) => {
      if (!trigger || !region || trigger === region) return false;
      if (region.contains(trigger)) return false; // the trigger is part of the region

      const declared = declaredTargets(trigger);
      if (declared.length > 0) {
        return declared.some((t) => {
          if (t === region || region.contains(t)) return true;
          return t.contains(region) && declaresClosed(trigger);
        });
      }
      return trigger.contains(region);
    };

    /**
     * The control that opens a hidden region, if one is discoverable from the
     * markup. Shared by both hiding probes so they cannot disagree about what
     * counts as announced.
     *
     * Ancestors count. A disclosure typically puts `aria-controls` on the panel
     * it owns, and the component hides something *inside* that panel — so the
     * hidden element itself is named by nothing, while the thing an agent
     * actually operates sits one level up. Checking only the hidden element
     * reported a correctly built mega-menu as 560 unfindable links, because the
     * button pointed at the wrapper rather than the inner block it hides.
     *
     * If any ancestor is announced, everything inside it is reachable: open that
     * ancestor and the content arrives.
     *
     * Every candidate goes through `operates()`, and nothing is returned that
     * does not. The old version returned the first interactive element it found
     * in a sibling subtree and let the caller decide — which is how a
     * `<summary>` three levels down an unrelated `<details>` came back as the
     * trigger for a mega-menu.
     */
    const disclosureFor = (el) => {
      /**
       * The explicit contract first: something points at this, or at anything
       * containing it, by id.
       *
       * `getAccessibleRefs` widens what the old `[aria-controls="…"]` query
       * could see — `aria-owns` was invisible to it, and on the fixture that
       * cost one of two correctly-announced panels — but it widens in both
       * useful and useless directions, because `aria-labelledby` and
       * `aria-describedby` are IDREFs too. `operates()` is what sorts them out;
       * an announcing operator wins outright, and a non-announcing one is kept
       * only so the run file can say what was found.
       */
      let operator = null;
      const named = [];
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) named.push(n);
      /**
       * And at anything INSIDE it, which is the half the ancestor walk cannot
       * reach. A trigger carrying `aria-controls="megaPanel"` while the wrapper
       * around `megaPanel` is what hides names this region as surely as one
       * pointing at the wrapper does — `operates()` already accepts
       * `region.contains(target)` and has since the migration.
       *
       * It only became reachable when this function stopped being handed the
       * outermost region and started being handed the block that actually
       * hides. Measured by ablation — this one line removed, both probes in a
       * single `page.evaluate` — on a fixture whose trigger declares an inner
       * panel with two meaningless wrappers between it and the wrapper that
       * hides: without the line, `unannouncedLinks` 6 and `announced=false`;
       * with it, 0 and `announced=true`. Six links published as unfindable
       * that a `<button aria-expanded aria-controls>` demonstrably opens.
       */
      named.push(...el.querySelectorAll('[id]'));
      for (const n of named) {
        for (const ref of referrersTo(n)) {
          if (!operates(ref, el)) continue;
          if (announces(ref)) return ref;
          operator ??= ref;
        }
      }
      /**
       * The one relationship that is declared without an id: `<summary>` opens
       * the `<details>` it is the summary of.
       *
       * The spec writes this edge, so it is as machine-determinable as
       * `aria-controls` — an agent reading the tree gets a `DisclosureTriangle`
       * with an expanded state and knows exactly what it governs. It used to be
       * found by accident, because the sibling scan queried for `summary`; that
       * scan is gone, and losing this with it reported the body of every correct
       * native accordion as unfindable. Caught by hiding-mechanism scoring
       * `closed-details` against the seven other mechanisms, not by review.
       */
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        if (n.tagName !== 'DETAILS') continue;
        const summary = [...n.children].find((c) => c.tagName === 'SUMMARY');
        if (summary && operates(summary, el)) return summary;
      }

      /**
       * There is no second chance beyond that, and it is the rule rather than an
       * omission.
       *
       * This used to fall back on adjacency: a trigger sitting beside the panel
       * counted as opening it. That is a visual inference, not a relationship. A
       * `<button aria-expanded>` says something opens; it does not say WHAT. A
       * sighted person reads the answer off the layout. An agent cannot compute
       * it, and this tool measures what an agent can do, so a relationship
       * nobody wrote down does not exist here.
       *
       * The heuristic was not merely unsound in theory. Every measured false
       * clean on this metric came through it: a `<summary>` three levels down an
       * unrelated `<details>`, a "Manage cookie preferences" button five
       * wrappers away, an `aria-haspopup` chat button in a header. Each time the
       * fix was to narrow which neighbours count, and each narrowing left the
       * next shape open, because the evidence itself is the problem.
       *
       * The cost is real and accepted: a correct-for-humans disclosure that
       * names no target now reports as unfindable. That is the honest answer for
       * an agent, and it over-reports, which is the direction this file is
       * allowed to be wrong in.
       */
      return operator;
    };

    /**
     * Does this trigger tell an agent that something is hidden behind it?
     *
     * `<summary>` counts without any ARIA at all. The browser gives a closed
     * `<details>` an expanded state for free — measured over CDP, Chromium
     * exposes the trigger as `DisclosureTriangle` with `expanded=false` — and a
     * native accordion is exactly the correct implementation this scanner keeps
     * being caught reporting as a defect. Requiring authored ARIA on it would
     * invent a sixth false-positive class on the way to fixing five.
     *
     * `popovertarget` and `commandfor` count for the same reason `<summary>`
     * does: the browser gives the trigger a disclosure state without any ARIA
     * being written. Measured over CDP, Chromium 149.0.7827.55 publishes
     * `expanded=false` on a `popovertarget` button and on a
     * `command`/`commandfor` button, identically to `aria-expanded="false"`,
     * and publishes nothing on a plain `<button>` — the table is at
     * `HTML_INVOKER_ATTRS`. Requiring authored ARIA on top of them would invent
     * a false-positive class against the most modern correct way to write a
     * disclosure, which is the exact signature this file exists to kill.
     *
     * A bare `command` with no `commandfor` is deliberately NOT enough. It
     * invokes nothing, so treating it as a disclosure would be a suppression
     * that defers to a control that does not exist — the shape of every
     * false clean this project has shipped.
     *
     * Note what this does NOT say: *which* region the trigger announces. It
     * used to be read as if it did, and a `<summary>` returning an unconditional
     * true is what published six unfindable links as zero. `announces()` says
     * "this is a disclosure trigger"; `operates()` says "of this region". Both
     * are required, everywhere, and they are never interchangeable.
     */
    function announces(el) {
      if (!el) return false;
      if (el.tagName === 'SUMMARY') return true;

      /**
       * `aria-expanded` and `aria-haspopup` are deliberately NOT enough on their
       * own, and this is the rule the whole probe now rests on.
       *
       * They are state declarations: they say "I am a thing that opens". They
       * name nothing, so they cannot say WHAT opens. Reading them as an
       * announcement requires pairing them with a region by position, and
       * position is a visual inference an agent cannot make. Measured on both
       * brands' mobile drawers: a hamburger carrying `aria-expanded` beside a
       * `visibility: hidden` container with no `id` — nothing in the markup
       * connects the two, and the old sibling heuristic credited 68 links to a
       * relationship that was never written down.
       *
       * A trigger becomes an announcement by naming its target, or by being a
       * `<summary>`, where the spec names it for you.
       */

      /**
       * Reference declarations have to actually reference something.
       *
       * `aria-controls`, `popovertarget` and `commandfor` all name an id. A
       * button naming an id that is not on the page declares a relationship to
       * nothing: it reveals nothing, an agent that finds it and presses it gets
       * nothing, and treating it as a disclosure is a suppression deferring to a
       * control that does not exist — the shape of every false clean this
       * project has shipped.
       *
       * Measured: `<button popovertarget="missing">` standing beside a
       * `:hover`-only menu published that menu's six links as zero, because the
       * attribute alone satisfied this test and the sibling scan then reached
       * the button. `aria-controls` has always had the same hole; it is closed
       * here too rather than only for the two attributes that exposed it.
       *
       * Resolution goes through the same `declaredTargets` every other caller
       * uses, so "declares a target" cannot mean one thing here and another in
       * `operates()` — two implementations of one question is how the last two
       * false-positive classes arose.
       */
      if (!REFERENCE_ATTRS.some((attr) => el.hasAttribute(attr))) return false;
      return declaredTargets(el).length > 0;
    }

    /**
     * Does this trigger's own state say the thing it operates is shut?
     *
     * Only `operates()`'s containment inference asks, and the block comment
     * there says why: "open this and the region arrives" is a claim about a
     * closed disclosure, and it is false about an open one. The two states a
     * trigger can actually declare are a `<details>` without `open` and
     * `aria-expanded`; anything that declares neither is read as closed, which
     * is main's behaviour and keeps a correct `aria-haspopup`-only trigger
     * working.
     *
     * `aria-expanded` is read off the trigger and the `open` attribute off the
     * `<details>` the trigger belongs to, because those are the elements the
     * state actually lives on — a `<summary>` carries no state of its own.
     */
    function declaresClosed(trigger) {
      if (trigger.tagName === 'SUMMARY') {
        const details = trigger.parentElement;
        if (details && details.tagName === 'DETAILS' && details.hasAttribute('open')) return false;
      }
      return trigger.getAttribute('aria-expanded') !== 'true';
    }

    /* ---------------------------------------------------------------- */
    /* 1 + 2. Named controls (the original checks, unchanged)            */
    /* ---------------------------------------------------------------- */

    const namelessButtons = [];
    const namelessLinks = [];
    const emptyHref = [];

    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (!inTree(el)) continue;
      if (!accessibleName(el)) namelessButtons.push(trunc(el.outerHTML));
    }

    for (const el of document.querySelectorAll('a[href]')) {
      if (!inTree(el)) continue;
      if (!accessibleName(el)) namelessLinks.push(trunc(el.outerHTML));
      if (el.getAttribute('href') === '') emptyHref.push(trunc(el.outerHTML));
    }

    const hasMain = !!document.querySelector('main,[role="main"]');

    /* ---------------------------------------------------------------- */
    /* 1. PRESENCE — controls that never declare themselves as controls  */
    /* ---------------------------------------------------------------- */

    /**
     * ── One candidate gate, asked once ───────────────────────────────────
     *
     * Elements that look operable to a sighted mouse user but carry no
     * interactive role. `cursor: pointer` is the strongest available signal
     * from the DOM alone — a real click listener can't be read from page
     * script. Node confirms these against the browser's own listener registry
     * over CDP (see `confirmClickListeners` in core.mjs); this list is the
     * candidate net, not the verdict.
     *
     * This used to be written out THREE times — once in the loop below, once in
     * a `isCandidateShaped` helper the origination test consulted, and once in
     * the innermost-descendant test — and the three drifted. The middle copy
     * implemented five of the eight gates, so it answered "that ancestor is a
     * candidate" about an element the loop would never have reported, the child
     * deferred to it, and both vanished. Measured against main on a 300×100
     * clickable card holding a nameless dismiss control and a "Read more" link:
     * main published `div.dismiss`, this file published nothing at all. One copy
     * cannot drift.
     */
    const isCandidate = memo((el) => {
      if (!el || el.nodeType !== 1) return false;
      if (!el.matches(CANDIDATE_TAGS)) return false;
      if (!inTree(el)) return false;
      if (el.closest(NATIVE_INTERACTIVE)) return false; // already inside a real control
      const role = roleOf(el);
      if (role && WIDGET_ROLES.has(role)) return false; // declares itself properly
      // A real click listener can't be read from page script; these two are what
      // the DOM makes available.
      if (!el.hasAttribute('onclick') && getComputedStyle(el).cursor !== 'pointer') return false;
      // A pointer cursor on a big layout block is styling, not a control.
      const rect = el.getBoundingClientRect();
      if (rect.width > 640 || rect.height > 480) return false;
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    });

    /**
     * ── The rescue the sibling rule exists for, and nothing else ─────────
     *
     * react-select's dropdown chevron is a role-less, nameless `div` with a
     * real click listener and no way for a keyboard to reach it. Every test
     * below says ghost and it is nothing of the kind: the
     * `<input role="combobox">` beside it operates the same widget, an agent
     * tabs to that, and the menu opens. Reporting it describes the library's
     * DOM rather than a barrier.
     *
     * ── What this used to be, and the two false cleans it shipped ────────
     *
     * First it asked only that SOME element under the same parent satisfy
     * `announces() && inTree() && inTabOrder()`. Nothing tied that element to
     * this one. Measured against main on a 400×60 header holding a nameless,
     * role-less, unreachable `div.burger`, the burger was rescued — reported by
     * main, silent here — beside `<button aria-haspopup="dialog">`, beside
     * `<button aria-expanded aria-controls="acct">`, and beside
     * `<details><summary>Search</summary></details>`. A hamburger next to an
     * account, chat or search disclosure is the commonest mobile header on the
     * web.
     *
     * Narrowing it to "an announcing text-entry widget" moved the hole rather
     * than closing it. Measured against main on the same header, the burger was
     * still silenced by `<input type="search" aria-expanded aria-controls>`, by
     * a bare `<input role="combobox">` with no name, by
     * `<input aria-label="Filter" aria-controls>` whose role is `textbox` and
     * which has no popup of any kind, and by a combobox one wrapper OUTSIDE the
     * burger's own header — because the search climbed ancestors until the box
     * got bigger than 640×480, and a mobile header never does.
     *
     * ── What it asks now ─────────────────────────────────────────────────
     *
     * Three things, and the suppression is refused unless all three hold. Each
     * one closes one of the measured shapes above:
     *
     *   1. The neighbour is a `combobox` — the one role ARIA pairs with a
     *      separate popup button — and it is a control an agent can
     *      DEMONSTRABLY USE: in the tree, in the tab order, and named. That is
     *      the invariant this whole file is being rebuilt around. A finding may
     *      be suppressed only when the thing it defers to is itself published
     *      or is genuinely usable; deferring to a nameless input is deferring
     *      to nothing.
     *   2. The search stops dead at the first ancestor that publishes a role of
     *      its own. A widget does not span a `banner`, a `navigation`, a `main`
     *      or a `list` — those are page structure, and everything on the far
     *      side of one is a different component. This is what replaces the
     *      640×480 climb, and it is what makes all four header shapes above
     *      report again: the climb never leaves `<header>`.
     *   3. That ancestor is the WIDGET, not a chunk of page: every element
     *      inside it is the candidate, the combobox, inside one of them, a
     *      role-less wrapper around one of them, or the widget's own inert
     *      furniture (placeholder text, a separator, an SSR `<style>` tag — see
     *      `isWidgetFurniture`). react-select passes at every depth it ships —
     *      `IndicatorsContainer` and `ValueContainer` are exactly such wrappers
     *      — and a header that also holds a logo, a heading or a second control
     *      does not.
     *
     * The residual risk, stated rather than hidden: a nameless clickable and a
     * named combobox alone together inside a role-less div are indistinguishable
     * from react-select by anything in the DOM, and are rescued. That is far
     * narrower than "any announcing neighbour", it costs a false positive
     * rather than a false clean wherever it is wrong, and every ghost finding is
     * still gated on the browser's own listener registry before it is published.
     */
    const isUsableControl = (el) => {
      if (!inTree(el) || !inTabOrder(el)) return false;
      const name = accessibleName(el);
      return !!name && name !== UNCOMPUTED_NAME;
    };

    const isUsableCombobox = (el) => roleOf(el) === POPUP_PAIRED_ROLE && isUsableControl(el);

    /**
     * The widget's own furniture, which the packaging test must let through.
     *
     * react-select puts more than the two halves inside its control box: the
     * placeholder text while nothing is selected, the chosen value's label once
     * something is, an indicator separator, and — in server-rendered output —
     * the `<style>` tag emotion writes beside every styled node. None of it has
     * a role, none of it can take focus, and none of it carries a click signal
     * of its own: the placeholder computes to `pointer` only because the whole
     * control box does, and that cursor is the box's, inherited.
     *
     * Measured on insureon.com's profession picker ("What kind of work do you
     * do?", 17 Aug 2026, local build): with the placeholder showing, the rule
     * as it stood — every node is one half or a wrapper of one half — failed on
     * the placeholder div and reported the chevron on every page that carries
     * the picker, which is the exact finding this rescue exists to withhold.
     * The metamorphic fixture had no placeholder, so the suite could not see it;
     * it has one now.
     *
     * Still refused, so the header shapes in `neighbour-irrelevance` keep
     * reporting: anything with a role, anything focusable, and any candidate
     * whose click signal is its own — a second control or a second nameless
     * clickable is not furniture. Hidden inputs are form plumbing, not focus.
     */
    const isWidgetFurniture = (n) =>
      !roleOf(n) &&
      !(n.matches(FOCUSABLE) && !n.matches('input[type="hidden"]')) &&
      (!isCandidate(n) || inheritsSignal(n));

    const isWidgetPackaging = (scope, el, combobox) =>
      [...scope.querySelectorAll('*')].every((n) => {
        if (n === el || el.contains(n)) return true;
        if (n === combobox || combobox.contains(n)) return true;
        // A wrapper around either half is packaging only if it is packaging.
        if (n.contains(el) || n.contains(combobox)) return !roleOf(n);
        return isWidgetFurniture(n);
      });

    const operatedByCombobox = (el) => {
      for (let scope = el.parentElement; scope; scope = scope.parentElement) {
        if (scope === document.body || scope === document.documentElement) return false;
        if (roleOf(scope)) return false; // a page region, not a widget
        const combobox = [...scope.querySelectorAll(FOCUSABLE)].find(
          (c) => c !== el && !el.contains(c) && isUsableCombobox(c)
        );
        if (!combobox) continue;
        return isWidgetPackaging(scope, el, combobox);
      }
      return false;
    };

    /**
     * The other rescue, and the only one that needs no inference at all: some
     * usable control in the document DECLARES this element as what it operates.
     *
     * No climb and no adjacency — `getAccessibleRefs` answers who points here,
     * and `operates()` rules on whether that pointing is operation. That is
     * deliberately the SAME `operates()` the disclosure probes use. There were
     * two implementations of "does X operate Y" in this file, with different
     * containment rules, and that divergence is how two of the false-positive
     * classes arose: one of them read an IDREF as operation while the other did
     * not. One implementation cannot disagree with itself.
     */
    const operatedByDeclaration = (el) =>
      referrersTo(el).some((ref) => isUsableControl(ref) && operates(ref, el));

    /**
     * Would this element be published on its own evidence, before any question
     * of which of two nested elements is "the" control?
     *
     * Split out from the loop because the de-duplication below has to ask it
     * about an ANCESTOR, and the invariant it enforces is stated in terms of
     * publication: a finding may be suppressed only when the thing it defers to
     * is itself published.
     *
     * `exposedName`, not `accessibleName`, and the difference is a measured
     * false negative rather than a nicety. Every element that reaches this line
     * has already failed the role test in `isCandidate` — that is what it is
     * doing here — and Chromium exposes NO name on a role-less element unless an
     * author wrote one. `accessibleText` does not make that distinction: it
     * computes name-from-content for anything it is handed. Measured against
     * Chromium's own tree over CDP, on a `<div>` with no role:
     *
     *     <span aria-hidden>glyph</span>   chromium ""      axe ""
     *     <svg><title>Menu</title>         chromium ""      axe "Menu"
     *     <span>Menu</span>                chromium ""      axe "Menu"
     *     Menu                             chromium ""      axe "Menu"
     *     <img alt="Menu">                 chromium ""      axe "Menu"
     *     aria-label="Menu"                chromium "Menu"  axe "Menu"
     *
     * Only the last row is a name an agent can read. On the other four the probe
     * was skipping a dead control on the strength of text the browser never
     * publishes. Elements that DO carry a role keep the full accname algorithm —
     * that is what `namelessButtons` and `namelessLinks` are built on, where
     * name-from-content is exactly right and the browser agrees.
     *
     * The three rescues are here rather than in the loop for the same reason:
     * an ancestor that is rescued has not been published, so it cannot stand in
     * for anything.
     *
     *   A wrapper around a working control is not a dead end. If the element
     *   contains a real, tabbable, in-tree control, an agent uses that.
     *   `getTabbableElements` rather than a list of native tags, which is what
     *   the first version of this guard used: that list held no `[role]` and no
     *   `[tabindex]`, so it rescued react-select and went on flagging a correct
     *   `<div role="button" tabindex="0" aria-label="…">` one level down.
     *
     *   A control that declares it operates this one, which is the author
     *   writing the relationship down and needs no inference.
     *
     *   And the combobox pairing above, for a widget whose working control is a
     *   sibling rather than a descendant.
     */
    /**
     * Did this element's click signal start here, or did it flow down from an
     * ancestor that is itself a candidate?
     *
     * `cursor` inherits and `onclick` does not, so an `onclick` attribute is
     * always the element's own. Everything else is a proxy: if a candidate
     * ancestor exists then it computes to `pointer` too, and this element may
     * simply be standing in its shadow.
     */
    const inheritsSignal = (el) => {
      if (el.hasAttribute('onclick')) return false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (isCandidate(n)) return true;
      }
      return false;
    };

    const isReportable = memo((el) => {
      if (!isCandidate(el)) return false;
      const role = roleOf(el);
      const name = role ? accessibleName(el) : exposedName(el);
      // No accessible name *and* no way for a keyboard to reach it. An agent
      // cannot identify it, cannot operate it, and — because it carries no role
      // — no automated audit will ever mention it. This is the hamburger.
      if (name || inTabOrder(el)) return false;
      /**
       * `isUsableControl`, not "there is something tabbable in here", and the
       * two lines below are why: they are the same rescue and they already ask
       * that question. This one did not, so it was the one place in the file
       * where a finding could be dropped in favour of something an agent cannot
       * use — the invariant every regression in this project has broken.
       *
       * Measured through the real `scanPage()`, Chromium 149.0.7827.55, on a
       * nameless unreachable burger whose only tabbable descendant is
       * `<a href aria-hidden="true">`: production published `div.burger` and
       * this file published nothing at all. An `aria-hidden` link is not in the
       * tree, so the burger's only "way through" is a control no agent can
       * reach, and deferring to it left the page reading clean.
       */
      if (tabbableWithin(el).some(isUsableControl)) return false;
      if (operatedByDeclaration(el)) return false;
      if (operatedByCombobox(el)) return false;

      /**
       * An element that never carried the signal itself takes the STRICTER name
       * test, and this is the one place `accessibleText` earns its place on a
       * role-less element.
       *
       * The evidence is weaker here by construction: the only reason this looks
       * clickable is that something above it does. On a clickable promo card
       * that is exactly what the card's paragraph of copy is — measured, a
       * `<p class="copy">Save 20% when you renew…</p>` inside a `cursor: pointer`
       * card is in the candidate net, in the tree, nameless by the authored-name
       * test and out of the tab order, so it read as a dead control the moment
       * the card around it was excused. Copy text is not a control, name-from-
       * content is what says so, and requiring it only for inherited signals
       * keeps the measured false negative it would otherwise cause: a hamburger
       * drawn with `<svg><title>Menu</title>` owns its own `cursor` rule, so it
       * is judged on the authored name Chromium actually publishes.
       */
      if (inheritsSignal(el) && accessibleName(el)) return false;
      return true;
    });

    /**
     * One control is one candidate — and the tie is broken by PUBLICATION.
     *
     * `cursor` inherits. A hamburger whose own rule says `cursor: pointer`
     * hands `pointer` to the glyph inside it, to the glyph's wrapper, and to
     * anything else in there, none of which any author made clickable. Read
     * literally, the computed style says a single control is three or four, and
     * the probe then adjudicates each of them separately — which is how one
     * hamburger became a candidate that had a name, a candidate that had no
     * listener, and no published finding at all. The icon-technique family is
     * the receipt: five behaviourally identical hamburgers, five glyph
     * techniques, scoring 1, 0, 1, 1, 1 on candidates and 1, 0, 0, 0, 1 on
     * published controls. The glyph decided whether the control was found.
     *
     * The fix for that was an ORIGINATION rule — credit an inherited cursor to
     * the outermost element that has it — and it leaked twice, both times the
     * same way: it deferred to an ancestor that was never going to be reported.
     * A `<ul style="cursor:pointer">` over three role-less `<li>` (main 3, this
     * file 0). An 800×200 promo card over the size gate holding a 24×24 dismiss
     * (main `div.dismiss`, this file nothing). A 300×100 card UNDER the size
     * gate holding a dismiss and a "Read more" link, where the card absorbed the
     * signal and was then rescued by the link (main `div.dismiss`, this file
     * nothing). Every one is a silent deletion, which is the incident class this
     * project has already shipped twice.
     *
     * So the rule is no longer about where the STYLE originates. It is the
     * invariant, applied literally: this element is dropped only when an
     * ancestor is itself going to be PUBLISHED in its place. The hamburger's
     * glyph still goes, because the hamburger is published. The `<ul>`'s
     * options, the promo card's dismiss and the rescued card's dismiss all stay,
     * because nothing above them is published and dropping them would leave the
     * page reading clean.
     *
     * The one exception is `onclick`, which is the only signal that is provably
     * this element's own rather than inherited: an author wrote it here. Nothing
     * above can stand in for that.
     *
     * The rule runs in both directions, and the second half is what keeps the
     * count at one rather than moving it around. An element that is a candidate
     * but is NOT itself publishable — a card rescued by the link inside it, a
     * chevron rescued by its combobox — steps aside for a publishable descendant
     * where there is one, because that descendant is the same click described
     * from further in. Where there is none it stays as the magnitude's one
     * entry, which is what `clickableNoRole` is counting.
     *
     * The cost of getting this wrong in the other direction is one nesting level
     * in a `selector`, on a widget that is still counted exactly once — against
     * a whole control going unreported. That is not a close trade.
     */
    const representsAControl = (el) => {
      if (!el.hasAttribute('onclick')) {
        for (let n = el.parentElement; n; n = n.parentElement) {
          if (isReportable(n)) return false; // published in its place
        }
      }
      if (isReportable(el)) return true;
      // Nothing to publish, and the signal is not even this element's own — the
      // card's paragraph of copy again. The element that DOES own the signal is
      // already the entry for it, so counting this one as well would report a
      // page as more clickable for having text on it.
      if (inheritsSignal(el)) return false;
      return ![...el.querySelectorAll(CANDIDATE_TAGS)].some(isReportable);
    };

    const ghostControls = [];
    const ghostEls = [];
    let clickableNoRole = 0;
    for (const el of document.querySelectorAll(CANDIDATE_TAGS)) {
      if (!isCandidate(el)) continue;
      // Dropped only because something else is published in its place. See
      // `representsAControl`: a suppression that leaves nothing behind is a
      // false clean, not a refinement.
      if (!representsAControl(el)) continue;

      // Every element that responds to a click without declaring a role. Most
      // are harmless: a whole card made clickable for convenience, with a real
      // link inside it. Counted as a magnitude, not listed.
      clickableNoRole += 1;

      // The harmful subset, and the only one worth naming. `isReportable` holds
      // the reasoning, because the de-duplication above has to ask the same
      // question about an ancestor.
      if (!isReportable(el)) continue;

      ghostControls.push({
        selector: describe(el),
        html: trunc(el.outerHTML),
        tag: el.tagName.toLowerCase(),
        testId: el.getAttribute('data-test-id') || null,
        hasOnClickAttr: el.hasAttribute('onclick'),
        cursorPointer: getComputedStyle(el).cursor === 'pointer',
        keyboardReachable: false,
        // Filled in by Node over CDP — the browser's own listener registry is
        // the authority on whether this is really a control.
        confirmedListener: null,
      });
      ghostEls.push(el);
    }

    // Live handles, same order as ghostCandidates, so Node can confirm each one
    // against the browser's real listener registry over CDP.
    window.__ghostCandidateEls = ghostEls;

    /* ---------------------------------------------------------------- */
    /* 4 + 5. Regions: one classification, two probes                    */
    /* ---------------------------------------------------------------- */

    /**
     * The two hiding probes used to own separate enumerations, and they
     * disagreed. `removedFromTree` knew six mechanisms; `hidesItself`, three
     * hundred lines below it, knew four. A panel hidden with
     * `content-visibility: hidden` fell in the gap and was reported by
     * *neither* — the one outcome a defensive tool must never produce.
     *
     * They are one function now, and that is the point. There is a single pass
     * over candidate regions, a single question asked of axe, and exactly three
     * answers; a region cannot be seen differently by the two probes because
     * neither probe decides. Widening the set of mechanisms happens in axe, for
     * both, at once. The old divergence is not corrected here, it is impossible.
     */
    const OUT_OF_TREE = 'out-of-tree'; // nothing here is in the tree at all
    const OFF_SCREEN = 'off-screen'; //  in the tree, but not where a person can see it
    const ON_SCREEN = 'on-screen'; //    fine

    /**
     * Content an ancestor will scroll into view is not off screen.
     *
     * `isVisibleOnScreen` knows about overflow clipping, which the six
     * geometric lines below it never did. That is a real widening, and on one
     * shape it widens past what this probe means. Measured on a plain two-slide
     * `display: flex` carousel, three links per slide, varying only the
     * container's `overflow` — everything else byte-identical:
     *
     *   overflow    axe isVisibleOnScreen   Chromium scrollLeft on focus
     *   hidden      false                   0 → 306   (revealed)
     *   auto        true                    0 → 306   (revealed)
     *   scroll      true                    0 → 306   (revealed)
     *   clip        true                    0 → 0     (NOT revealed)
     *   visible     true                    n/a
     *
     * So the one value that produced a finding is the one where the browser
     * demonstrably brings the content on screen when a keyboard reaches it, and
     * the one value where the content really is stranded — `clip`, which is not
     * scrollable at all — reported nothing. Through the real `model.ts` that
     * made `overflow: hidden` alone the difference between `pageVerdict`
     * `clear` and `blocking`, on a page where an agent reads every link out of
     * the tree with names and destinations intact. The scanner's own rule is
     * "hidden is not unfindable", and there is nothing unfindable here.
     *
     * A scroll container is therefore treated as on screen for the content it
     * can scroll to, which is what axe already answers for `auto` and `scroll`
     * and what makes all five variants agree. Two things keep this from
     * becoming the false clean it would otherwise be:
     *
     *   The scrollport must be non-empty. A collapsed accordion — `max-height:
     *   0; overflow: hidden` — has `clientHeight` 0, so nothing can be scrolled
     *   into it and it stays reported. Measured: `clientH` 0 against
     *   `scrollH` 19, still reported after this change.
     *
     *   The region must lie inside the scrollable extent. A drawer parked at
     *   `translateX(-100%)` sits at a negative offset that no `scrollLeft` can
     *   reach, so it stays reported too.
     *
     *   And the region must be IN FLOW, which is the correction to the first
     *   version of this rescue. A scroll container scrolls the content laid out
     *   inside it; something absolutely positioned at `left: 100%` or shoved out
     *   by `translateX(100%)` is not laid out inside it, it is parked outside
     *   it. The distinction is not academic — it is the difference between a
     *   carousel slide and an off-canvas drawer, and without it the rescue told
     *   two mirror images opposite stories. Measured, an `overflow: hidden`
     *   wrapper holding four tabbable links: `translateX(-100%)` reported by
     *   main and by this file, `translateX(100%)` and `left: 100%` reported by
     *   main and SILENT here, because positive overflow contributes to
     *   `scrollWidth` and negative overflow does not. The same drawer, mirrored,
     *   answered differently — which is a metamorphic violation on this suite's
     *   own criterion, and an off-canvas drawer whose links stay in the tab
     *   order is the original phantom menu this tool is named for.
     *
     * `overflow` is read here rather than asked of axe, and it is the one list
     * in this file that decides something. It is a five-value W3C-specified
     * set, not an open set of browser mechanisms — the same latitude the
     * `input[type="hidden"]` exception takes, for the same reason. axe's own
     * `getScroll` cannot stand in for it: measured, it answers "not scrollable"
     * for `overflow: hidden`, which is precisely the case that has to be
     * caught.
     *
     * The known gap, stated rather than papered over: `overflow: clip` really
     * does strand its content, and axe calls it visible, so nothing reports it.
     * That is a false negative on main too. Closing it is a widening of what
     * this probe finds rather than a correction to it, and it does not belong
     * in a fix for a regression.
     */
    const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll', 'hidden', 'overlay']);

    /**
     * Is anything between the region and its scroll container taking it out of
     * that container's flow?
     *
     * `position: absolute` / `fixed` and a `transform` are the two ways a drawer
     * gets parked off-canvas, and neither is content the container laid out.
     * Reading the region's own box would not answer this: a translated drawer
     * and a scrolled slide land in the same place.
     */
    const displacedFromFlow = (el, container) => {
      for (let n = el; n && n !== container; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.position === 'absolute' || s.position === 'fixed') return true;
        if (s.transform && s.transform !== 'none') return true;
        if (s.translate && s.translate !== 'none') return true;
      }
      return false;
    };

    const scrollRevealable = (el) => {
      const rect = el.getBoundingClientRect();
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        const scrollsX = SCROLLABLE_OVERFLOW.has(s.overflowX);
        const scrollsY = SCROLLABLE_OVERFLOW.has(s.overflowY);
        if (!scrollsX && !scrollsY) continue;
        // Nothing can be scrolled into a scrollport with no area.
        if (n.clientWidth === 0 || n.clientHeight === 0) continue;
        // Parked outside the container rather than laid out inside it. No outer
        // container can undo that, so this is an answer rather than a skip.
        if (displacedFromFlow(el, n)) return false;

        // Where the region sits in the container's own scrollable content box.
        const box = n.getBoundingClientRect();
        const left = rect.left - box.left + n.scrollLeft - n.clientLeft;
        const top = rect.top - box.top + n.scrollTop - n.clientTop;
        if (left < 0 || top < 0) continue; // behind the scroll origin — unreachable
        if (scrollsX && left + rect.width > n.scrollWidth) continue;
        if (scrollsY && top + rect.height > n.scrollHeight) continue;
        // Clipped on an axis the container cannot scroll is still stranded.
        if (!scrollsX && left + rect.width > n.clientWidth) continue;
        if (!scrollsY && top + rect.height > n.clientHeight) continue;
        return true;
      }
      return false;
    };

    const docWidth = document.documentElement.scrollWidth;

    /**
     * The geometry main decides on, kept as an INDEPENDENT sufficient condition.
     *
     * Delegating on-screen visibility to axe is a widening in almost every
     * direction — it knows about overflow clipping, scroll containers and
     * stacking that these six lines never covered. But "almost" is not "every",
     * and a primitive that answers `true` where main's geometry answered "off
     * screen" would take a panel main reports and publish nothing in its place.
     * That is a silent deletion, and this file is not allowed to produce one at
     * a shape production already catches.
     *
     * So the two are OR'd rather than swapped. axe can only ADD findings here;
     * it can never remove one main would have made. The cost is that main's own
     * over-reporting on this list — any `clip-path` at all, for instance —
     * is inherited along with its coverage, which is the correct direction for a
     * branch whose whole claim is "never worse than production".
     */
    const geometricallyOffScreen = (el) => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        rect.width === 0 ||
        rect.height === 0 ||
        rect.right <= 0 ||
        rect.left >= docWidth ||
        rect.bottom + window.scrollY <= 0 ||
        parseFloat(cs.opacity) === 0 ||
        (!!cs.clipPath && cs.clipPath !== 'none')
      );
    };

    /**
     * ── What decides a region, and what only decides its numbers ─────────
     *
     * The WIDE net answers "is this a panel at all" and "is any of it in the
     * tree". `isControl` answers only "what do we count and report". They were
     * the same question until a review found what that costs: one
     * `[contenteditable="true"]` in a hidden panel deleted the whole panel.
     * `FOCUSABLE` nets a bare contenteditable `div` and `isControl` throws it
     * away — axe gives it no role and it carries no `tabindex` — so a panel of
     * two links and one editor counted 2 controls, fell under `MIN_CONTROLS`,
     * and `classify` returned `null`. Measured through the real `scanPage()`,
     * Chromium 149.0.7827.55: production reported 1 panel, 3 focusable, 2
     * unfindable links; this file reported nothing at all, from NEITHER hiding
     * probe. A silent deletion, which is the incident class this project has
     * already shipped twice.
     *
     * Splitting them is the structural fix rather than the narrow one. Adding a
     * contenteditable branch to `isControl` would close this shape and leave the
     * mechanism intact: any future narrowing of what counts as a control could
     * delete a region again, and it would do it silently. With the gate on the
     * wide net, narrowing `isControl` can only ever change a count.
     *
     * The STATE test keeps the narrow list wherever the narrow list has
     * anything to say, and that asymmetry is deliberate. Judging every region on
     * the wide net would be a NARROWING of `out-of-tree` — a panel holding one
     * in-tree disabled input beside three `hidden` links would stop being
     * reported — and a rule that reports less than production is the failure
     * this whole branch exists to prevent, whichever direction it comes from.
     * Only the one case where the narrow list has nothing left to say falls back
     * to the wide net, because `reachable.length === 0` out of an EMPTY control
     * list would call a visible panel of three bare contenteditables "out of the
     * tree" — a finding invented out of a filter.
     *
     * The cost, stated: the gate now admits regions whose focusables are all
     * `tabindex="-1"` or disabled, which production's gate did not, so a hidden
     * block of those is reported with a control count of 0. That is noise in the
     * over-reporting direction — the direction this file is allowed to be wrong
     * in — against a whole panel going unreported.
     */
    const classify = (el) => {
      const focusable = [...el.querySelectorAll(FOCUSABLE)];
      if (focusable.length < MIN_CONTROLS) return null; // a stray control, not a panel

      const controls = focusable.filter(isControl);
      const reachable = controls.filter(inTree);
      // Judged on the contents, not the container. `content-visibility: hidden`
      // and `hidden="until-found"` leave the element itself in the tree and drop
      // everything inside it, so asking about the box would answer "visible"
      // about a region an agent cannot read a single link out of.
      const outOfTree = controls.length > 0 ? reachable.length === 0 : !focusable.some(inTree);
      if (outOfTree) return { state: OUT_OF_TREE, controls, reachable };
      if (geometricallyOffScreen(el) || (!onScreen(el) && !scrollRevealable(el))) {
        return { state: OFF_SCREEN, controls, reachable };
      }
      return { state: ON_SCREEN, controls, reachable };
    };

    const REGION_SELECTOR = 'div,nav,ul,section,aside,form,details';
    const regions = [];
    for (const el of document.querySelectorAll(REGION_SELECTOR)) {
      const result = classify(el);
      if (result && result.state !== ON_SCREEN) regions.push({ el, ...result });
    }

    /**
     * Keep only the outermost of any nested set, per state — an off-screen menu
     * contains off-screen submenus, and reporting all of them inflates the
     * count. Nesting is compared within a state rather than across: a closed
     * accordion body inside an on-screen wrapper is still the outermost thing
     * that is closed.
     */
    const outermostOf = (state) => {
      const inState = regions.filter((r) => r.state === state);
      return inState.filter((r) => !inState.some((o) => o !== r && o.el.contains(r.el)));
    };

    /**
     * WHICH element hides a region, and by what mechanism. One answer, in two
     * halves, because a caller needs each half and they must never disagree.
     *
     * The sentence is for a human reading the run file, and this list is allowed
     * to be incomplete — that is the entire difference between it and the
     * enumeration it replaces. It used to *decide* whether a region counted, so
     * a mechanism missing from it cost a finding. It decides nothing now, so a
     * mechanism missing from it costs a sentence of explanation.
     *
     * The ELEMENT decides something, and that is new: `unreachableAll` asks
     * `disclosureFor` about it rather than about the region, which is the fix
     * for a measured false clean. The numbers are at that call site. Nothing
     * here changed to make that possible except the return shape — if a
     * mechanism is missing from the list the caller falls back to the region,
     * which is exactly what it did before.
     *
     * The walk starts at one of the controls rather than at the region, because
     * the mechanism is as often below the region as above it. Measured on
     * insureon's general-liability page: the region is a plain `div.block`, and
     * the thing that removes its five links from the tree is an accordion body
     * three levels *inside* it, carrying `hidden="until-found"` and
     * `height: 0` under `overflow: hidden`. Walking up from the region found
     * nothing to say; walking up from a link names it.
     */
    const hidingOf = (el, control) =>
      // The region's own answer first, so an inherited property is credited to
      // the element that sets it rather than to whichever link inherited it.
      hidingWalk(el, el) ?? hidingWalk(control ?? el, el);

    const hidingWalk = (from, el) => {
      for (let n = from; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        const at = n === el ? '' : ` (on ${describe(n)})`;
        const found = (why) => ({ at: n, why: `${why}${at}` });
        if (s.display === 'none') return found('display: none');
        /**
         * `visibility` INHERITS, and that changes who gets the credit.
         *
         * Every descendant of a `visibility: hidden` element computes to
         * `hidden` as well, so a walk that stops at the first element reporting
         * it names whichever node it happened to start from rather than the one
         * that set it. `display`, `content-visibility` and `overflow` do not
         * inherit and need no such guard; the attribute checks below are read
         * off the element itself and cannot inherit either.
         *
         * Measured on ION's mobile drawer, which is `visibility: hidden` and
         * correctly announced by `<button aria-controls="mobile-nav-drawer">`:
         * the plain wrappers inside it — `div.megaMenu_FuyPN`, `ul.navList_FuyPN`,
         * neither carrying an id or a style of its own — were each credited as
         * hiding themselves, judged as independent regions nothing announces,
         * and the monotonicity rule then suppressed the drawer's real
         * announcement. 68 links an agent CAN find, published as 68 it cannot.
         * A correct fix reported as a defect, which is the failure this file
         * exists to prevent, and the same shape as `cursor: pointer` inheriting
         * onto a decorative glyph.
         */
        if (s.visibility === 'hidden' || s.visibility === 'collapse') {
          const parent = n.parentElement;
          const inherited = !!parent && getComputedStyle(parent).visibility === s.visibility;
          if (!inherited) return found(`visibility: ${s.visibility}`);
        }
        if (s.contentVisibility === 'hidden') return found('content-visibility: hidden');
        if (n.getAttribute('aria-hidden') === 'true') return found('aria-hidden="true"');
        if (n.hasAttribute('inert')) return found('inert');
        if (n.hasAttribute('hidden')) {
          const value = n.getAttribute('hidden');
          return found(`hidden${value ? `="${value}"` : ''}`);
        }
        if (n.tagName === 'DETAILS' && !n.hasAttribute('open')) {
          return found('inside a closed <details>');
        }
        if (s.overflow !== 'visible') {
          const r = n.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) {
            return found(`collapsed to zero size under overflow: ${s.overflow}`);
          }
        }
      }
      return null;
    };

    /**
     * Why a region isn't on screen, for a human reading the run file. Same six
     * lines `geometricallyOffScreen` decides on, plus a fallback for the cases
     * only axe saw — "translated off the left edge" tells someone what to look
     * for in a way that "isVisibleOnScreen: false" does not.
     *
     * Below-the-fold is normal and is not a fault. Confirmed rather than
     * assumed: axe answers `isVisibleOnScreen: true` for a block 4,000px down
     * the page and for content scrolled out of view inside a scroll container.
     */
    const describeOffScreen = (el, cs, rect) => {
      const why = [];
      if (rect.width === 0 || rect.height === 0) why.push('collapsed to zero size');
      if (rect.right <= 0) why.push('translated off the left edge');
      if (rect.left >= docWidth) why.push('translated off the right edge');
      if (rect.bottom + window.scrollY <= 0) why.push('positioned above the document');
      if (parseFloat(cs.opacity) === 0) why.push('opacity: 0');
      if (cs.clipPath && cs.clipPath !== 'none') why.push(`clip-path: ${cs.clipPath}`);
      if (why.length === 0) why.push('not rendered on screen');
      return why;
    };

    /* ---------------------------------------------------------------- */
    /* 4. NO GHOSTS — regions in the tree but not on screen              */
    /* ---------------------------------------------------------------- */

    /**
     * "Hidden by appearance only": still in the accessibility tree, still full
     * of tabbable controls, but not visible. Deliberately defined by the
     * *property* rather than by a selector, so it catches any component that
     * makes this mistake — not just the one that was known about when this was
     * written.
     */
    const hiddenPanels = outermostOf(OFF_SCREEN).map(({ el, reachable }) => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // pointer-events is often set on a wrapper rather than the panel itself.
      let pointerEvents = cs.pointerEvents;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        if (getComputedStyle(n).pointerEvents === 'none') {
          pointerEvents = 'none';
          break;
        }
      }

      /**
       * 3. OPERABILITY, at the panel level. A closed panel is fine if something
       * keyboard-reachable opens it. If the only trigger is hover, there is no
       * such element, and the whole panel is unreachable without a mouse.
       *
       * Same resolver as the reachability probe, so the two can't disagree about
       * whether a panel is announced — they were built weeks apart and one used
       * a sibling-only heuristic that missed `aria-controls` entirely.
       */
      const trigger = disclosureFor(el);

      return {
        selector: describe(el),
        why: describeOffScreen(el, cs, rect),
        transform: cs.transform === 'none' ? null : cs.transform,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        maxHeight: cs.maxHeight,
        ariaHidden: el.getAttribute('aria-hidden'),
        inert: el.hasAttribute('inert'),
        pointerEvents,
        exposedInTree: true, // by construction — every control here is in the tree
        links: el.querySelectorAll('a[href]').length,
        buttons: el.querySelectorAll('button,[role="button"]').length,
        focusable: reachable.length,
        tabbable: reachable.filter(inTabOrder).length,
        hasKeyboardTrigger: !!trigger,
        triggerHasAriaExpanded: trigger ? trigger.hasAttribute('aria-expanded') : false,
        sample: trunc(el.outerHTML.slice(0, TRUNCATE)),
      };
    });

    /* ---------------------------------------------------------------- */
    /* 5. REACHABILITY — out of the tree, and nothing announces it       */
    /* ---------------------------------------------------------------- */

    /**
     * The mirror of `hiddenPanels`. That probe reports regions still in the tree
     * but off screen; this one reports regions genuinely out of the tree, which
     * every other probe here deliberately skips.
     *
     * Being out of the tree is not itself a fault — it is how a closed menu is
     * supposed to behave. The fault is being out of the tree with nothing in the
     * tree that says so. A disclosure button with `aria-expanded`, or a plain
     * `<summary>`, is a promise an agent can act on; a `:hover` rule is not
     * reachable and not discoverable.
     *
     * ── A known limitation, written down rather than implied ─────────────
     *
     * One shape is UNDECIDABLE as this metric is defined, and it is worth being
     * explicit about because it looks like a bug and is not one: a
     * `<button aria-expanded>` carrying no IDREF, sharing a parent with an
     * unrelated `:hover` mega-menu, publishes that menu's six unfindable links
     * as zero. Measured, and identical on main — this is not a regression, it is
     * the metric's edge.
     *
     * It cannot be closed by tightening `operates()` rule 3, because the
     * metamorphic suite requires the opposite answer for the same markup:
     * `trigger-placement`'s `sibling-expanded` variant is a bare
     * `<button aria-expanded>` beside its panel, and the tool has already
     * decided the conventional sibling shape counts — most authors omit
     * `aria-controls`, and refusing to read adjacency would report every correct
     * plain disclosure on the web. Two pages with the same DOM need different
     * answers, and nothing in the DOM separates them.
     *
     * The only real fix is a change to what the scanner measures — behavioural
     * evidence rather than markup — and that is a design decision, not a patch.
     * Until then the honest state is a documented false clean at one shape,
     * bounded by `announces()` requiring a declared disclosure and by rule 3
     * requiring the trigger's branch to be packaging and nothing else.
     */
    /**
     * ── Ask about the block that HIDES, not the region it sits in ─────────
     *
     * `classify` calls a region out of the tree when every control inside it is
     * out of the tree, so a wrapper, its wrapper and the whole `<nav>` above all
     * answer the same way. Asking `disclosureFor` about the outer element runs
     * the sibling scan several levels above the block that actually hides, where
     * everything on the page is a neighbour.
     *
     * Measured with both probes in a single `page.evaluate` against one DOM,
     * Chromium 149.0.7827.55, axe-core 4.13.0, and confirmed through the real
     * `scanPage()`: a `:hover` mega-menu three levels inside a nav column, with
     * a `<button aria-expanded>Manage cookie preferences</button>` five
     * meaningless wrappers away in a sibling branch. Production published six
     * links an agent cannot find; this file published 0.
     *
     * `hidingOf` already identifies the element for the `why` sentence, so there
     * is one answer rather than two that can drift.
     *
     * Only downwards. Where the mechanism sits ABOVE the region — a closed
     * `<details>` around it — the region stays the subject, because the
     * `<summary>` that opens it is INSIDE the `<details>` and `operates()`
     * correctly refuses a trigger that is part of the region it is asked about.
     * Descending there would report every native accordion on the web as
     * unannounced.
     */
    const verdictFor = (el, controls) => {
      const hiding = hidingOf(el, controls[0]);
      const hidden = hiding && el.contains(hiding.at) ? hiding.at : el;
      const trigger = disclosureFor(hidden);
      // A trigger only counts if an agent could find and use it: in the tree,
      // and advertising that it controls something.
      const triggerInTree = !!trigger && inTree(trigger);
      return {
        hiding,
        trigger,
        triggerInTree,
        /** The whole point: is this findable from the tree, or only by hovering? */
        announced: triggerInTree && announces(trigger),
      };
    };

    /**
     * ── A container is never cleaner than the things inside it ────────────
     *
     * `outermostOf` exists to stop a menu and its submenus being counted three
     * times, and for that it is right. But it discards the inner regions
     * *before* anything has asked how they fare, and then one verdict — derived
     * from one hiding block — is applied to everything the container swallowed.
     * That is the fault behind both measured false cleans on this metric:
     *
     *   ninth   a `<button aria-expanded>` five wrappers away, in a sibling
     *           branch, silenced a `:hover` mega-menu. Production reported 6
     *           links an agent cannot find; this file reported 0.
     *   tenth   the fix for the ninth moved the question to the block that
     *           actually hides — which is correct — but a portal root holding
     *           two independent hidden blocks then took its whole verdict from
     *           whichever block happened to hold the first control in document
     *           order. One block was genuinely opened by a header button; the
     *           other was `:hover`-only and nothing announced it. Reported 0.
     *           Swapping the two children changed the answer to 9 without
     *           changing anything about the page.
     *
     * Both are the same mistake, and it is not in the trigger search: an
     * announcement that covers one block was allowed to cover its container.
     *
     * So judge every out-of-tree region on its own, then select what to report
     * under one rule — **an announced container is not reported as announced
     * while it still holds an unannounced region.** Publish the unannounced
     * blocks instead, so the count describes only content that is genuinely
     * unfindable rather than the whole wrapper. An announced region that
     * neither contains nor sits inside a reported one is still reported on its
     * own, which is what keeps a correct native accordion silent.
     *
     * The verdict no longer depends on which child comes first, and that is
     * now asserted by a metamorphic family rather than by this comment.
     */
    /**
     * Which regions get reported does not change — `outermostOf` is right that a
     * menu and its submenus are one finding, and re-cutting that set moved
     * counts on correct pages for no gain. What changes is the VERDICT: an
     * announcement earned by one block inside the container no longer speaks
     * for the container.
     *
     * A region that carries its own hiding mechanism is a unit that can be
     * judged. One hidden by an ancestor — the body of a closed `<details>`, a
     * panel inside an `inert` wrapper — is a detail of that ancestor's block and
     * has no trigger of its own to find, because the `<summary>` is a sibling of
     * its parent. Judging those would report the inside of a correct native
     * accordion as unfindable, so they are not consulted.
     */
    const judgeable = regions
      .filter((r) => r.state === OUT_OF_TREE)
      .map(({ el, controls }) => ({ el, ...verdictFor(el, controls) }))
      .filter(({ el, hiding }) => !hiding || el.contains(hiding.at));

    /** True when something strictly inside this region is announced by nothing. */
    const holdsUnannounced = (el) =>
      judgeable.some((j) => j.el !== el && el.contains(j.el) && !j.announced);

    const unreachableAll = outermostOf(OUT_OF_TREE).map(
      ({ el, controls }) => {
        const { hiding, trigger, triggerInTree, announced } = verdictFor(el, controls);
        return {
          selector: describe(el),
          why: hiding ? [hiding.why] : ['not in the accessibility tree'],
          inNav: !!el.closest('nav,[role="navigation"]'),
          links: el.querySelectorAll('a[href]').length,
          buttons: el.querySelectorAll('button,[role="button"]').length,
          focusable: controls.length,
          hasTrigger: !!trigger,
          triggerInTree,
          /**
           * The whole point: is this findable from the tree, or only by hovering?
           *
           * The second clause is the monotonicity rule. A trigger that opens one
           * block inside this region says nothing about the rest of it, and
           * letting it speak for the container is what published six unfindable
           * links as zero — twice, on the same metric, from two different
           * causes.
           */
          announced: announced && !holdsUnannounced(el),
          triggerSelector: trigger ? describe(trigger) : null,
          sample: trunc(el.outerHTML.slice(0, TRUNCATE)),
        };
      }
    );

    // Report every one in the totals, but list only the largest few — a page can
    // legitimately hold dozens of hidden blocks, and a run file is read by humans.
    const unreachableRanked = [...unreachableAll].sort((a, b) => b.focusable - a.focusable);
    const unreachablePanels = unreachableRanked.slice(0, 20);
    const unannounced = unreachableAll.filter((p) => !p.announced);
    const unreachableTotals = {
      panels: unreachableAll.length,
      unannouncedPanels: unannounced.length,
      /** Controls an agent cannot find at all — the number that matters. */
      unannouncedFocusable: unannounced.reduce((s, p) => s + p.focusable, 0),
      unannouncedLinks: unannounced.reduce((s, p) => s + p.links, 0),
    };

    /**
     * The headline, measured directly rather than inferred from the panels: of
     * everywhere this page says you can go, how much of it can an agent see?
     *
     * Counted per element rather than per landmark so overlapping navs — a header
     * nav inside a wrapper nav — can't double-count a link.
     */
    const navSeen = new Set();
    for (const nav of document.querySelectorAll('nav,[role="navigation"]')) {
      for (const a of nav.querySelectorAll('a[href]')) navSeen.add(a);
    }
    const navLinks = {
      total: navSeen.size,
      inTree: [...navSeen].filter(inTree).length,
    };

    /**
     * Kept for continuity: every historical run and every chart keys off
     * `phantomMenu`. It is now simply the largest hidden panel, which on both
     * brands is the mega-menu — but it no longer depends on a class name that
     * a redesign could rename out from under us.
     */
    const worst = [...hiddenPanels].sort((a, b) => b.focusable - a.focusable)[0] ?? null;
    const phantomMenu = worst
      ? {
          transform: worst.transform,
          display: worst.display,
          visibility: worst.visibility,
          ariaHidden: worst.ariaHidden,
          inert: worst.inert,
          pointerEvents: worst.pointerEvents,
          exposedInTree: worst.exposedInTree,
          links: worst.links,
          buttons: worst.buttons,
          focusable: worst.focusable,
          tabbable: worst.tabbable,
          hasKeyboardTrigger: worst.hasKeyboardTrigger,
          triggerHasAriaExpanded: worst.triggerHasAriaExpanded,
        }
      : null;

    return {
      namelessButtons,
      namelessLinks,
      emptyHref,
      hasMain,
      ghostControls,
      clickableNoRole,
      hiddenPanels,
      phantomMenu,
      unreachablePanels,
      unreachableTotals,
      navLinks,
    };
  }
}
