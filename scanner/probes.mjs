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
 * anything `removedFromTree()` matches, on the reasoning that content properly
 * out of the tree is correctly hidden and not worth reporting. For a closed
 * dialog that is exactly right. For the site's primary navigation it is exactly
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
  /* Shared vocabulary                                                 */
  /* ---------------------------------------------------------------- */

  const NATIVE_INTERACTIVE = 'a[href],button,input,select,textarea,summary,label,[contenteditable="true"],audio[controls],video[controls]';

  // Roles that make an element announce itself as something you can operate.
  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'switch', 'combobox', 'textbox', 'searchbox',
    'slider', 'spinbutton', 'treeitem', 'gridcell', 'listbox', 'menuitemradio',
  ]);

  const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex],[contenteditable="true"]';

  /** Short, human-readable locator. Not for machine matching — class hashes churn. */
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
    return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ''}`;
  };

  /**
   * True when some ancestor genuinely removes this from the accessibility tree.
   *
   * All six mechanisms, not the obvious four. `hidden` (including
   * `hidden="until-found"`) and `content-visibility: hidden` remove a subtree
   * from the tree and from the tab order just as surely as `display: none` —
   * they are simply newer, and they are what a well-built collapsible uses,
   * because they keep the content findable by browser find-in-page.
   *
   * Missing them meant the probe reported a *correctly implemented* accordion
   * as five tabbable controls hidden off-screen. The better the implementation,
   * the more confidently it was flagged, which is the worst possible direction
   * for a check like this to fail in.
   */
  const removedFromTree = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (
        s.display === 'none' ||
        s.visibility === 'hidden' ||
        // `auto` only skips rendering when off-screen and stays in the tree;
        // only `hidden` actually removes the subtree.
        s.contentVisibility === 'hidden' ||
        n.hasAttribute('hidden') ||
        n.getAttribute('aria-hidden') === 'true' ||
        n.hasAttribute('inert')
      ) {
        return true;
      }
    }
    return false;
  };

  /** aria-label → aria-labelledby → text → title → child img[alt] → value. */
  const accessibleName = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();

    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const resolved = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim();
      if (resolved) return resolved;
    }

    const text = (el.textContent ?? '').trim();
    if (text) return text;

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    const alt = el.querySelector('img[alt]')?.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();

    const value = el.getAttribute('value');
    if (value && value.trim()) return value.trim();

    return '';
  };

  const isFocusable = (el) =>
    !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1';

  const controllerOf = (el) => {
    if (!el.id) return null;
    try {
      return document.querySelector(`[aria-controls="${CSS.escape(el.id)}"]`);
    } catch {
      return null; // exotic id that won't escape
    }
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
   */
  const disclosureFor = (el) => {
    // The explicit contract first: something points at this, or at anything
    // containing it, by id.
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const byControls = controllerOf(n);
      if (byControls) return byControls;
    }
    // Otherwise the conventional shape: a trigger sitting beside the panel.
    const parent = el.parentElement;
    if (!parent) return null;
    for (const c of [...parent.children].filter((c) => c !== el)) {
      if (c.matches(NATIVE_INTERACTIVE) || c.getAttribute('role') === 'button') return c;
      const inner = c.querySelector('button,a[href],[role="button"]');
      if (inner) return inner;
    }
    return null;
  };

  /* ---------------------------------------------------------------- */
  /* 1 + 2. Named controls (the original checks, unchanged)            */
  /* ---------------------------------------------------------------- */

  const namelessButtons = [];
  const namelessLinks = [];
  const emptyHref = [];

  for (const el of document.querySelectorAll('button,[role="button"]')) {
    if (removedFromTree(el)) continue;
    if (!accessibleName(el)) namelessButtons.push(trunc(el.outerHTML));
  }

  for (const el of document.querySelectorAll('a[href]')) {
    if (removedFromTree(el)) continue;
    if (!accessibleName(el)) namelessLinks.push(trunc(el.outerHTML));
    if (el.getAttribute('href') === '') emptyHref.push(trunc(el.outerHTML));
  }

  const hasMain = !!document.querySelector('main,[role="main"]');

  /* ---------------------------------------------------------------- */
  /* 1. PRESENCE — controls that never declare themselves as controls  */
  /* ---------------------------------------------------------------- */

  /**
   * Candidates: elements that look operable to a sighted mouse user but carry
   * no interactive role. `cursor: pointer` is the strongest available signal
   * from the DOM alone — a real click listener can't be read from page script.
   * Node confirms these against the browser's own listener registry over CDP
   * (see `confirmClickListeners` in core.mjs); this list is the candidate net,
   * not the verdict.
   */
  const ghostControls = [];
  const ghostEls = [];
  let clickableNoRole = 0;
  for (const el of document.querySelectorAll('div,span,li,i,svg,p,section,header,figure')) {
    if (removedFromTree(el)) continue;
    if (el.closest(NATIVE_INTERACTIVE)) continue; // already inside a real control

    const role = (el.getAttribute('role') || '').toLowerCase();
    if (INTERACTIVE_ROLES.has(role)) continue; // declares itself properly

    const cs = getComputedStyle(el);
    const hasOnClick = el.hasAttribute('onclick');
    const pointer = cs.cursor === 'pointer';
    if (!hasOnClick && !pointer) continue;

    // A pointer cursor on a big layout block is styling, not a control.
    const rect = el.getBoundingClientRect();
    if (rect.width > 640 || rect.height > 480) continue;
    if (rect.width === 0 && rect.height === 0) continue;

    // If a descendant is itself a candidate, prefer the innermost — that's the
    // control; the parent is usually just a padded hit area.
    const innerCandidate = [...el.querySelectorAll('div,span,i,svg')].some((d) => {
      if (d.closest(NATIVE_INTERACTIVE)) return false;
      if (INTERACTIVE_ROLES.has((d.getAttribute('role') || '').toLowerCase())) return false;
      return d.hasAttribute('onclick') || getComputedStyle(d).cursor === 'pointer';
    });
    if (innerCandidate) continue;

    // Every element that responds to a click without declaring a role. Most
    // are harmless: a whole card made clickable for convenience, with a real
    // link inside it. Counted as a magnitude, not listed.
    clickableNoRole += 1;

    // The harmful subset, and the only one worth naming: no accessible name
    // *and* no way for a keyboard to reach it. An agent cannot identify it,
    // cannot operate it, and — because it carries no role — no automated
    // audit will ever mention it. This is the hamburger.
    const name = accessibleName(el);
    const reachable = el.tabIndex >= 0;
    if (name || reachable) continue;

    /**
     * A wrapper around a working control is not a dead end.
     *
     * The defect being measured is "there is no way to operate this". If the
     * element contains a real, focusable, in-tree control, there is a way — an
     * agent uses that. react-select is the standard case: an unlabelled outer
     * `div` around an `<input>` carrying `aria-expanded` and `aria-autocomplete`.
     * Reporting the wrapper describes the library's DOM, not a barrier.
     */
    const worksThroughDescendant = [...el.querySelectorAll(NATIVE_INTERACTIVE)].some(
      (d) => isFocusable(d) && !removedFromTree(d)
    );
    if (worksThroughDescendant) continue;

    ghostControls.push({
      selector: describe(el),
      html: trunc(el.outerHTML),
      tag: el.tagName.toLowerCase(),
      testId: el.getAttribute('data-test-id') || null,
      hasOnClickAttr: hasOnClick,
      cursorPointer: pointer,
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
  /* 4. NO GHOSTS — regions in the tree but not on screen              */
  /* ---------------------------------------------------------------- */

  /**
   * "Hidden by appearance only": still in the accessibility tree, still full
   * of tabbable controls, but not visible. Deliberately defined by the
   * *property* rather than by a selector, so it catches any component that
   * makes this mistake — not just the one that was known about when this was
   * written.
   *
   * Below-the-fold is normal and is not a fault: only content pushed off the
   * left/right of the document, collapsed to zero, or fully transparent counts.
   */
  const docWidth = document.documentElement.scrollWidth;

  const hidingMechanism = (el, cs, rect) => {
    const why = [];
    if (rect.width === 0 || rect.height === 0) why.push('collapsed to zero size');
    if (rect.right <= 0) why.push('translated off the left edge');
    if (rect.left >= docWidth) why.push('translated off the right edge');
    if (rect.bottom + window.scrollY <= 0) why.push('positioned above the document');
    if (parseFloat(cs.opacity) === 0) why.push('opacity: 0');
    if (cs.clipPath && cs.clipPath !== 'none') why.push(`clip-path: ${cs.clipPath}`);
    return why;
  };

  const panels = [];
  for (const el of document.querySelectorAll('div,nav,ul,section,aside,form')) {
    if (removedFromTree(el)) continue; // correctly hidden — nothing to report

    /**
     * Tree membership is per element, not per container.
     *
     * A wrapper can be collapsed to zero height while its contents are
     * `display: none` — which is what a correctly built disclosure looks like
     * while closed. Counting the wrapper's descendants without this filter
     * reported 160 tabbable controls on a menu where nothing was reachable at
     * all, turning a correct implementation into a defect.
     */
    const focusables = [...el.querySelectorAll(FOCUSABLE)]
      .filter(isFocusable)
      .filter((f) => !removedFromTree(f));
    if (focusables.length < 3) continue; // a panel, not a stray control

    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const why = hidingMechanism(el, cs, rect);
    if (why.length === 0) continue; // visible, as it should be

    panels.push({ el, cs, rect, why, focusables });
  }

  // Keep only the outermost of any nested set — an off-screen menu contains
  // off-screen submenus, and reporting all of them inflates the count.
  const outermost = panels.filter((p) => !panels.some((q) => q !== p && q.el.contains(p.el)));

  const hiddenPanels = outermost.map(({ el, cs, rect, why, focusables }) => {
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
      why,
      transform: cs.transform === 'none' ? null : cs.transform,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      maxHeight: cs.maxHeight,
      ariaHidden: el.getAttribute('aria-hidden'),
      inert: el.hasAttribute('inert'),
      pointerEvents,
      exposedInTree: true, // by construction — removedFromTree() excluded the rest
      links: el.querySelectorAll('a[href]').length,
      buttons: el.querySelectorAll('button,[role="button"]').length,
      focusable: focusables.length,
      tabbable: focusables.filter((f) => f.tabIndex >= 0).length,
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
   * tree that says so. A disclosure button with `aria-expanded` is a promise an
   * agent can act on; a `:hover` rule is not reachable and not discoverable.
   */
  const hidesItself = (el) => {
    const s = getComputedStyle(el);
    const why = [];
    // `display` computes per element, so this matches only the element that
    // sets it — which is what makes it the boundary of the hidden subtree.
    if (s.display === 'none') why.push('display: none');
    if (s.visibility === 'hidden') why.push('visibility: hidden');
    if (el.getAttribute('aria-hidden') === 'true') why.push('aria-hidden="true"');
    if (el.hasAttribute('inert')) why.push('inert');
    return why;
  };

  const unreachableAll = [];
  for (const el of document.querySelectorAll('div,nav,ul,section,aside,form')) {
    const why = hidesItself(el);
    if (why.length === 0) continue;
    // Only the outermost hidden container: if an ancestor is already out of the
    // tree, this one is a detail of it, not a separate finding.
    if (el.parentElement && removedFromTree(el.parentElement)) continue;

    const focusables = [...el.querySelectorAll(FOCUSABLE)].filter(isFocusable);
    if (focusables.length < 3) continue; // a panel, not a stray control

    const trigger = disclosureFor(el);
    // A trigger only counts if an agent could find and use it: in the tree,
    // and advertising that it controls something.
    const triggerInTree = !!trigger && !removedFromTree(trigger);
    const announces =
      !!trigger &&
      (trigger.hasAttribute('aria-expanded') ||
        trigger.hasAttribute('aria-haspopup') ||
        trigger.hasAttribute('aria-controls'));

    unreachableAll.push({
      selector: describe(el),
      why,
      inNav: !!el.closest('nav,[role="navigation"]'),
      links: el.querySelectorAll('a[href]').length,
      buttons: el.querySelectorAll('button,[role="button"]').length,
      focusable: focusables.length,
      hasTrigger: !!trigger,
      triggerInTree,
      /** The whole point: is this findable from the tree, or only by hovering? */
      announced: triggerInTree && announces,
      triggerSelector: trigger ? describe(trigger) : null,
      sample: trunc(el.outerHTML.slice(0, TRUNCATE)),
    });
  }

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
    inTree: [...navSeen].filter((a) => !removedFromTree(a)).length,
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
