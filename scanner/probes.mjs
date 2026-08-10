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

  /** True when some ancestor genuinely removes this from the accessibility tree. */
  const removedFromTree = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (
        s.display === 'none' ||
        s.visibility === 'hidden' ||
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

    const focusables = [...el.querySelectorAll(FOCUSABLE)].filter(isFocusable);
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
     */
    const parent = el.parentElement;
    const siblings = parent ? [...parent.children].filter((c) => c !== el) : [];
    const triggerCandidates = [
      ...siblings.filter((c) => c.matches(NATIVE_INTERACTIVE) || c.getAttribute('role') === 'button'),
      ...siblings.flatMap((c) => [...c.querySelectorAll('button,a[href],[role="button"]')]),
    ];
    const trigger = triggerCandidates[0] ?? null;

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
  };
}
