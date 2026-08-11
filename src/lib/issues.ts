/**
 * The issue catalogue — the human layer over the scan data.
 *
 * The scanner answers "how many nodes failed rule X". Nobody outside
 * engineering can act on that. This file answers the two questions a QA, SEO
 * or Product reader actually has:
 *
 *   1. What breaks on production, in a sentence, in their language?
 *   2. Why does it cost us anything, and what would fix it?
 *
 * Numbers are never written down here. Every figure on screen is resolved
 * from the current run at build time (see `resolveMetric` in aggregate.ts), so
 * this file can never drift out of step with the measurements. What *is*
 * written down is the judgement: severity, plain-English framing, the fix, and
 * the risk of making it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS FILE DOES NOT TRACK PROGRESS
 *
 * It deliberately carries no "fixed / in progress / shipped" state. That was
 * tried and removed: nobody could keep it honest by hand, and a stale green
 * bar telling Product something was fixed when it wasn't is worse than showing
 * nothing. Whether a fix landed is answered by measuring, not by asserting —
 * scan staging from Measure, or diff it against production from Compare.
 *
 * So this describes what production has, today. Nothing else.
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { Brand } from './model';

/**
 * Deliberately three levels, not axe's four. "Minor" invites shipping with
 * known dead ends, and the distinction between axe's moderate and minor
 * doesn't survive contact with a prioritisation meeting.
 */
export type Severity = 'blocking' | 'serious' | 'moderate';

export const SEVERITY_LABEL: Record<Severity, string> = {
  blocking: 'Blocking',
  serious: 'Serious',
  moderate: 'Moderate',
};

export const SEVERITY_BLURB: Record<Severity, string> = {
  blocking: 'An agent or keyboard user hits a dead end and the journey stops here.',
  serious: 'The journey continues, but degraded — slower, confusing, or partly unreachable.',
  moderate: 'Nothing stops working; the page is harder for an agent to read correctly.',
};

/**
 * How the finding was caught. This distinction is the single most important
 * thing on the dashboard: the flagship example — a hamburger menu built from
 * a `<div>` — is invisible to every automated audit while being the only way
 * into mobile navigation. A green axe report is not the same as done, and the
 * UI has to keep saying so.
 */
export type Detection = 'scanner' | 'manual';

/**
 * A number to pull from the current run rather than hardcode. Resolved per
 * brand at build time so the catalogue never carries a stale figure.
 */
export type MetricRef =
  | { kind: 'rule'; ruleId: string; label: string }
  | { kind: 'phantom'; label: string }
  | { kind: 'phantom-links'; label: string }
  | { kind: 'nameless-buttons'; label: string }
  | { kind: 'nameless-links'; label: string }
  | { kind: 'empty-href'; label: string }
  | { kind: 'pages-missing-main'; label: string }
  // Added by the probe rewrite: these measure what axe structurally cannot.
  | { kind: 'ghost-controls'; label: string }
  /** Ghost controls whose selector contains this fragment, e.g. "backButton". */
  | { kind: 'ghost-controls-matching'; match: string; label: string }
  | { kind: 'clickable-no-role'; label: string }
  | { kind: 'hidden-panels'; label: string }
  | { kind: 'hidden-panel-controls'; label: string }
  /** Hidden panels excluding the largest one — the mega-menu is counted separately. */
  | { kind: 'secondary-hidden-panel-controls'; label: string }
  // Added with the desktop profile: content out of the tree that nothing announces.
  /** The verdict: out of the tree *and* unannounced. */
  | { kind: 'unfindable-links'; label: string }
  /** Descriptive: out of the tree, announced or not. Not a defect on its own. */
  | { kind: 'nav-links-hidden'; label: string }
  | { kind: 'nav-links-in-tree'; label: string }
  | { kind: 'nav-links-total'; label: string }
  | { kind: 'unannounced-panels'; label: string };

export interface CodeSampleRef {
  caption: string;
  code: string;
  /** Which brand this sample came from, when it differs between the two. */
  brand?: Brand;
}

export interface Issue {
  id: string;
  /** Plain English. No rule ids, no file paths — those live further down. */
  title: string;
  severity: Severity;
  brands: Brand[];
  detection: Detection;

  /** One sentence. What a person or an agent actually experiences. */
  whatBreaks: string;
  /** The commercial or accessibility consequence, for a non-engineer. */
  whyItMatters: string;
  /** The mechanism, for QA and engineering. Technical, but still prose. */
  technical: string;

  /** Live figures pulled from the current run. */
  metrics: MetricRef[];
  /** Real markup captured by the scanner, never hand-written. */
  samples?: CodeSampleRef[];
  /** Source locations, resolved during the investigation. */
  sources?: string[];

  fix: {
    /** What would change, for a non-engineer. */
    summary: string;
    /** What would change, in code. */
    technical: string;
    risk: string;
    riskLevel: 'very-low' | 'low' | 'medium';
  };
  /** How to confirm it's actually gone, once someone has changed it. */
  verify: string;

  /**
   * false = a brand or design decision with a different owner, tracked here
   * but deliberately not part of this workstream. Shown separately so nobody
   * reads it as a failure being quietly ignored.
   */
  inScope: boolean;
}

/* ------------------------------------------------------------------ */

const SEVERITY_RANK: Record<Severity, number> = { blocking: 0, serious: 1, moderate: 2 };

/**
 * Severity first, then the order they're written in below.
 *
 * The catalogue order is editorial and load-bearing: the closed menu is the
 * root cause the other findings hang off, so it has to read first among the
 * blockers. Sorting alphabetically inside a severity band — the obvious
 * default — put "The close button on pop-ups" at number one and buried the
 * headline finding at number two.
 */
export function sortIssues(issues: Issue[]): Issue[] {
  const order = new Map(ISSUES.map((issue, i) => [issue.id, i]));
  return [...issues].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
}

export function issueById(id: string): Issue | undefined {
  return ISSUES.find((i) => i.id === id);
}

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

export const ISSUES: Issue[] = [
  {
    id: 'phantom-menu',
    title: 'The closed mobile menu is still switched on underneath',
    severity: 'blocking',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'The mobile menu looks closed, but every link inside it is still live and still announced. An agent reading the page is handed roughly seventy navigation links that go nowhere, on every single page.',
    whyItMatters:
      'This is the root cause behind most of what the automated audits flag. An assistant trying to find a quote form has to wade through seventy dead controls first, on every page it visits — and a keyboard user has to press Tab seventy times to get past a menu they never opened.',
    technical:
      'The menu is hidden with transform: translate(-100%) and pointer-events: none only. There is no display:none, no visibility:hidden, no aria-hidden and no inert, and every submenu is mounted at once. Moving something off-screen does not remove it from the accessibility tree, so all of it stays exposed and tabbable while pointer-events makes it unclickable — reachable and useless at the same time.',
    metrics: [
      { kind: 'phantom', label: 'Focusable controls in the closed menu' },
      { kind: 'phantom-links', label: 'Of those, links' },
      { kind: 'hidden-panel-controls', label: 'Across every page scanned' },
    ],
    sources: ['Navigation/CommonMenu/MegaMenu/styles.module.scss'],
    fix: {
      summary:
        'Hide the closed menu properly, so the browser genuinely takes it out of play rather than just sliding it out of sight.',
      technical:
        'Add inert (or aria-hidden plus a tabindex sweep) to the closed panel, or switch the hiding mechanism to visibility:hidden, which the transition can still animate. Keep the transform for the slide animation.',
      risk: 'The menu open/close animation has to be re-checked — visibility and inert both interact with transitions. No visual change if done right.',
      riskLevel: 'low',
    },
    verify:
      'Re-scan and check "Focusable controls in the closed menu" reads 0. Or, by hand: load the page, do not open the menu, and press Tab — focus should never land inside it.',
    inScope: true,
  },

  {
    id: 'hamburger-unnamed',
    title: 'The menu button is not a button, and has no name',
    severity: 'blocking',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'The hamburger icon that opens mobile navigation is a plain container with a click handler. It has no name and no role, so an agent cannot tell it is a button, and a keyboard user cannot reach it at all.',
    whyItMatters:
      'It is the only way into mobile navigation. Every off-the-shelf audit reports a clean result here, because a rule about buttons cannot fire on something that never claims to be one — which is exactly why this went unnoticed. Our scanner now measures it directly.',
    technical:
      'The control is a bare <div onClick> carrying data-test-id="nav-hamburger-icon". axe\'s button-name rule only fires on elements with a button role, so a <div> is structurally invisible to it — a false negative, not a pass. It is also absent from the tab order, because a div has no implicit tabindex. Our probe finds it by the property that actually matters: it carries a real click listener, has no accessible name, and cannot be reached by keyboard.',
    metrics: [
      { kind: 'ghost-controls-matching', match: 'menu', label: 'Menu buttons an agent can\'t identify' },
    ],
    sources: ['Navigation/MobileMenu/index.js'],
    fix: {
      summary:
        'Make it a real button with a name, so it is reachable by keyboard and identifiable by an agent.',
      technical:
        'Convert the <div onClick> to <button type="button" aria-label="Open menu"> with aria-expanded reflecting state. Reset the UA button styles.',
      risk: 'Measured: the tap target shrinks from 50px to about 42px without a UA style reset, because the control is sized in em and a button carries a different default font-size. Reset it explicitly.',
      riskLevel: 'medium',
    },
    verify:
      'Re-scan and check the count reaches 0. Then confirm by hand, because the count alone can\'t tell you the button works: tab to the hamburger and press Enter; the menu should open.',
    inScope: true,
  },

  {
    id: 'quote-search-unlabelled',
    title: 'The profession box that starts a quote has no label',
    severity: 'blocking',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'The type-ahead field where a customer enters their profession — the first step of getting a quote — is announced with no name at all. An agent can see a text box, but nothing tells it what to type there.',
    whyItMatters:
      'This is the entry point to the funnel. Everything else on the site can be perfect and an assistant still cannot start a quote, because it cannot work out what the one field on the screen is for. If an AI assistant is going to complete a journey anywhere, it is this one.',
    technical:
      'The field renders as role="combobox" with no accessible name — no aria-label, no aria-labelledby, and the visible heading above it is not programmatically associated. Insureon carries this twice, because an A/B variant (search-app-start-top20) mounts a second copy of the same component.',
    metrics: [{ kind: 'rule', ruleId: 'label', label: 'Unlabelled form fields' }],
    samples: [
      {
        caption: 'The combobox input, as the browser exposes it',
        code: '<input class="" autocapitalize="none" autocomplete="off" autocorrect="off" id="react-select-2-input" spellcheck="false" role="combobox">',
      },
    ],
    sources: [
      'quotes/…/Select/SelectAsync.tsx',
      'quotes/…/Select/SelectInert.tsx',
      'Insureon only: the search-app-start-top20 A/B variant duplicates both',
    ],
    fix: {
      summary: 'Give the field a name that says what it is for.',
      technical:
        'Add aria-label="Search for your profession" to the combobox input, in both the standard and A/B variants. Hardcoded English, matching the existing convention in both repos.',
      risk: 'Attribute-only change. Nothing moves on screen.',
      riskLevel: 'very-low',
    },
    verify:
      'Re-scan and check "Unlabelled form fields" reads 0 on both brands. Then the real test: ask an agentic browser to get a general liability quote and see whether it can find and fill the profession field.',
    inScope: true,
  },

  {
    id: 'modal-close-unnamed',
    title: 'The close button on pop-ups has no name',
    severity: 'blocking',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'The X that closes the quote pop-up is an empty button. It is the only way out of that dialog, and nothing describes what it does.',
    whyItMatters:
      'An agent that opens the quote modal and cannot close it is stuck — the session ends there. Same for anyone using a screen reader: they are trapped in a dialog with an unlabelled exit.',
    technical:
      'An empty <button> with the icon supplied through CSS rather than markup, so there is no text, no aria-label and no child image alt for the name computation to fall back on.',
    metrics: [
      { kind: 'rule', ruleId: 'button-name', label: 'Buttons with no name' },
      { kind: 'nameless-buttons', label: 'Unnamed buttons found directly' },
    ],
    sources: ['page-components/Modal/CloseButton.tsx:9'],
    fix: {
      summary: 'Name the close button.',
      technical: 'Add aria-label="Close" to the button element.',
      risk: 'Attribute-only change. Nothing moves on screen.',
      riskLevel: 'very-low',
    },
    verify: 'Re-scan and check "Buttons with no name" drops. Confirm the name in the Accessibility pane.',
    inScope: true,
  },

  {
    id: 'desktop-menu-hover-only',
    title: 'The desktop menu only opens on hover',
    severity: 'blocking',
    brands: ['insureon'],
    detection: 'manual',
    whatBreaks:
      'On a desktop screen the main navigation opens when the mouse moves over it, and by no other means. There is nothing to click and nothing to focus, so an agent or a keyboard user cannot open it at all.',
    whyItMatters:
      'Fifty-six category links — the whole product taxonomy an assistant would use to find the right policy — are simply unreachable without a mouse. An agent has no mouse.',
    technical:
      'The mega-menu is driven by CSS :hover / mouseenter with no click or focus handler and no keyboard-operable trigger. No automated rule covers "opens only on hover", so this does not appear in any scan report.',
    metrics: [],
    sources: ['Navigation/DesktopMenu/index.js:66'],
    fix: {
      summary:
        'Make the desktop menu open by click or keyboard as well as hover, so it can be reached without a mouse.',
      technical:
        'Give the top-level items a real button trigger with aria-expanded, opening on click and on Enter/Space, keeping hover as an additional convenience.',
      risk: 'This one needs a product and design decision on how the menu should open before engineering starts — hover-and-click together has real interaction trade-offs.',
      riskLevel: 'medium',
    },
    verify:
      'By hand, on desktop: Tab to the top-level nav item and press Enter. The submenu should open and its links should be reachable.',
    inScope: true,
  },

  {
    id: 'menu-back-unnamed',
    title: 'The back control inside the menu has no name',
    severity: 'serious',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'Stepping back up a level inside the mobile menu is done with an empty control. It has no name, so nothing indicates what it does.',
    whyItMatters:
      'One of the two defects PageSpeed named — and it is worse than reported. It fires five times per page on TechInsurance, not once, because every submenu mounts its own copy.',
    technical:
      'On TechInsurance this is an empty <button>, so button-name fires on all five instances per page. On Insureon the same control is a <div>, which means the rule structurally cannot fire — Insureon reads zero on that rule, and that zero is a measurement artefact, not health. The second row below is the same control counted by property rather than by tag, and it shows the fifty Insureon instances the rule cannot see.',
    metrics: [
      { kind: 'rule', ruleId: 'button-name', label: 'Buttons with no name (axe)' },
      { kind: 'ghost-controls-matching', match: 'backbutton', label: 'Back controls an agent can\'t identify' },
    ],
    samples: [
      {
        caption: 'TechInsurance — the empty back button, five per page',
        code: '<button class="backButton--CYYVi"></button>',
        brand: 'techinsurance',
      },
    ],
    sources: ['SubmenuNavBar.js:5'],
    fix: {
      summary: 'Name the control, and on Insureon make it a real button first.',
      technical:
        'Add aria-label="Back". On Insureon, convert the <div> to a <button type="button"> so it is keyboard-operable and so the rule can measure it at all.',
      risk: 'Attribute-only on TechInsurance. The Insureon div-to-button conversion needs the same UA style reset as the hamburger.',
      riskLevel: 'low',
    },
    verify:
      'TechInsurance: re-scan, "Buttons with no name" should drop by five per page. Insureon: the count will go *up* from zero before it goes down — that is the rule finally being able to see the control. Confirm by hand.',
    inScope: true,
  },

  {
    id: 'empty-link',
    title: 'A link that points nowhere renders on every page',
    severity: 'serious',
    brands: ['techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'An empty link with an empty destination is rendered unconditionally. It has no text and goes nowhere, but it is still in the tab order and still announced.',
    whyItMatters:
      'The second of the two defects PageSpeed named. An agent following links has to try it and find out it does nothing; a keyboard user lands on an invisible stop.',
    technical:
      'An <a href=""> with no content, rendered without a guard. An empty href resolves to the current page, so it is a real, focusable link to nowhere.',
    metrics: [
      { kind: 'rule', ruleId: 'link-name', label: 'Links with no name' },
      { kind: 'empty-href', label: 'Links with an empty destination' },
    ],
    samples: [
      {
        caption: 'TechInsurance — captured on the home page',
        code: '<a href="" class="escape--s+X-e"></a>',
        brand: 'techinsurance',
      },
    ],
    sources: ['Bottom-CTA.tsx:28'],
    fix: {
      summary: 'Stop rendering the link when there is nothing to link to.',
      technical: 'Guard the render on a non-empty href, rather than emitting an empty anchor.',
      risk: 'Removing a rendered element — worth a visual check, though the element is empty and invisible today.',
      riskLevel: 'low',
    },
    verify: 'Re-scan and check "Links with no name" and "Links with an empty destination" both read 0.',
    inScope: true,
  },

  {
    id: 'related-topics-phantom',
    title: 'A second hidden panel on the blog is also still switched on',
    severity: 'serious',
    brands: ['insureon'],
    detection: 'scanner',
    whatBreaks:
      'The collapsed "related topics" panels on blog articles use the same broken hiding technique as the menu. Their tag links stay live and tabbable while collapsed.',
    whyItMatters:
      'It confirms the menu was not a one-off. The same mistake is repeated in a second component, which means the pattern itself needs fixing rather than the one instance — otherwise it comes back.',
    technical:
      'The .hidden class sets max-height:0 and opacity:0 only. Neither removes an element from the accessibility tree. The scanner no longer looks for this component by name — it looks for the property, so any component making the same mistake is caught. The figures below exclude each page\'s largest hidden region, which is the mega-menu counted above.',
    metrics: [
      { kind: 'secondary-hidden-panel-controls', label: 'Controls trapped in other hidden panels' },
      { kind: 'hidden-panels', label: 'Hidden-but-live regions per run' },
    ],
    sources: ['components/RelatedTopics/styles.module.scss:118'],
    fix: {
      summary: 'Hide collapsed panels properly, the same way as the menu.',
      technical:
        'Add inert or visibility:hidden to the collapsed state alongside the existing max-height animation.',
      risk: 'The expand/collapse animation needs re-checking.',
      riskLevel: 'low',
    },
    verify:
      'Re-scan and check the trapped-control count falls to zero once the mega-menu is excluded. By hand on a blog article: collapse the panel, then Tab — focus should skip its links.',
    inScope: true,
  },

  {
    id: 'hover-only-navigation',
    title: 'On desktop, most of the navigation is invisible to an agent',
    severity: 'blocking',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'The desktop mega-menu is hidden with display:none until a mouse hovers it, and nothing else on the page says those destinations exist. An agent reading the home page finds a handful of navigation links instead of the full set — the rest are in the HTML but absent from the accessibility tree.',
    whyItMatters:
      'This is the layout agents are actually served. Measured against production, a desktop browser, an unrecognised user-agent and a request with no user-agent at all are all sent the desktop markup; only a recognised mobile user-agent gets the mobile one. So the version an assistant sees is the version where most of the site map is missing, and it cannot browse to pages it never learns about. It also cannot hover — there is no pointer to hover with.',
    technical:
      'Sitecore resolves a deviceLayout server-side from the user-agent, and Navigation.tsx branches on it through the Media component, rendering exactly one of MobileMenu/TabletMenu/DesktopMenu. On desktop the mega-menu panels are display:none until :hover, which removes them from the accessibility tree entirely. That is why the other probes never reported it: they all skip content properly out of the tree, on the reasoning that a closed menu should be. The distinction that matters is not whether content is hidden but whether anything in the tree announces it — a disclosure button with aria-expanded is a promise an agent can act on, a :hover rule is not. None of these panels have one. Note this is the mirror image of the mobile failure, not a duplicate of it: on mobile the same links are in the tree but trapped off-screen in the drawer.',
    metrics: [
      { kind: 'unfindable-links', label: 'Links an agent cannot find' },
      { kind: 'unannounced-panels', label: 'Hidden regions nothing announces' },
      { kind: 'nav-links-in-tree', label: 'Navigation links it can find' },
      { kind: 'nav-links-total', label: 'Navigation links in the page' },
    ],
    sources: [
      'page-components/Navigation/Navigation.tsx',
      'components/Media/index.tsx — breakpoint resolution',
      'page-components/Navigation/DesktopMenu/MegaMenu/styles.module.scss',
    ],
    fix: {
      summary:
        'Make the menu open from the keyboard, and say what it controls, instead of relying on hover.',
      technical:
        'Give each top-level menu item a real button with aria-expanded and aria-controls pointing at its panel, toggle the panel on click and focus as well as hover, and keep the panel display:none while closed. The hiding is correct — what is missing is the control that announces it.',
      risk: 'Touches the primary navigation on every page, and the hover interaction has to keep working for mouse users.',
      riskLevel: 'medium',
    },
    verify:
      'Re-scan at the desktop profile and check that "links an agent cannot find" reaches zero. Do not expect the nav links to appear in the accessibility tree while the menu is closed — they should not, and a fix that merely exposes them trades this defect for the trapped-controls one. What has to change is that the trigger announces the panel. By hand: load the desktop site and Tab — every top-level menu should open and expose its links without touching the mouse.',
    inScope: true,
  },

  {
    id: 'no-main-landmark',
    title: 'No page marks where its main content starts',
    severity: 'moderate',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'Not one page carries the standard marker that says "the actual content begins here". Every page on both sites is missing it.',
    whyItMatters:
      'It is how an agent skips the navigation and gets to the answer. Without it, an assistant re-reads the header and menu on every page it visits before finding anything useful — slower, and more likely to summarise the wrong thing.',
    technical:
      'No <main> element and no role="main" anywhere in the document, so axe\'s landmark-one-main fires on all ten page types for both brands.',
    metrics: [{ kind: 'pages-missing-main', label: 'Pages with no main marker' }],
    samples: [
      {
        caption: 'The rule fires against the document root — there is nothing else to point at',
        code: '<html lang="en">',
      },
    ],
    fix: {
      summary: 'Wrap the page content in the standard main-content marker.',
      technical: 'Wrap the content region in <main> in the shared layout for both brands.',
      risk: 'Measured, and real: inserting an element into the DOM breaks CSS sibling selectors. Insureon has 26 "+" combinators and 11 nth-child rules in global layout CSS, TechInsurance 29 and 4. Two known breaks: .legal + .Footer, and .CarrierBand + .Footer at styles/space.scss:322. The remaining adjacency selectors have not been individually checked.',
      riskLevel: 'medium',
    },
    verify:
      'Re-scan and check "Pages with no main marker" reads 0. Then a visual QA pass across all ten page types, mobile and desktop, because of the selector risk above.',
    inScope: true,
  },

  {
    id: 'content-outside-landmarks',
    title: 'Most page content sits outside any labelled region',
    severity: 'moderate',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'Large parts of each page are not inside any named region, so there is no structure for an agent to navigate by — just an undifferentiated run of content.',
    whyItMatters:
      'It is the difference between an assistant being able to say "the pricing section says X" and having to guess from a wall of text. Lower confidence answers, and more of them wrong.',
    technical:
      'axe\'s region rule fires on every top-level node not contained in a landmark. Counts move by a node or two between runs from content changes, so small drift here is churn rather than regression.',
    metrics: [{ kind: 'rule', ruleId: 'region', label: 'Nodes outside a landmark' }],
    fix: {
      summary: 'Group page content into labelled regions, starting with the biggest offenders.',
      technical:
        'Introduce the appropriate landmark elements (header, nav, main, aside, footer) around existing content blocks, and fix the shared components that generate unwrapped sections.',
      risk: 'Same sibling-selector risk as the main marker, since it also inserts elements.',
      riskLevel: 'medium',
    },
    verify:
      'The target here is "sharply reduced", not zero — there is no clean pass/fail line, so read this one as a trend rather than a gate.',
    inScope: true,
  },

  {
    id: 'heading-order',
    title: 'Headings skip levels',
    severity: 'moderate',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'Some pages jump from one heading level to another without the one in between, so the outline of the page does not reflect how it is actually organised.',
    whyItMatters:
      'Headings are how an agent builds a table of contents for the page. A broken outline means content gets attributed to the wrong section.',
    technical:
      'axe\'s heading-order rule. Typically an <h3> or <h4> used for visual size rather than structural depth.',
    metrics: [{ kind: 'rule', ruleId: 'heading-order', label: 'Headings out of order' }],
    samples: [
      {
        caption: 'A policy page — an h3 following an h1, with no h2 between',
        code: '<h3 class="text title_WFhZg">General liability insurance</h3>',
      },
    ],
    fix: {
      summary: 'Use the heading level that matches the structure, and style it to the size you want.',
      technical: 'Correct the heading levels in the affected components; move sizing to CSS.',
      risk: 'Visual check needed wherever heading level and font size were coupled.',
      riskLevel: 'low',
    },
    verify: 'Re-scan and check "Headings out of order" reads 0.',
    inScope: true,
  },

  {
    id: 'aria-hidden-focus',
    title: 'Content marked as hidden is still reachable',
    severity: 'serious',
    brands: ['insureon'],
    detection: 'scanner',
    whatBreaks:
      'Some elements are explicitly marked hidden from assistive technology while still being focusable, which is a direct contradiction.',
    whyItMatters:
      'Focus lands on something the browser has been told does not exist. For a screen reader user that is a silent stop; for an agent it is a control it cannot identify.',
    technical:
      'axe\'s aria-hidden-focus rule: an element inside an aria-hidden="true" subtree that is still in the tab order.',
    metrics: [
      { kind: 'rule', ruleId: 'aria-hidden-focus', label: 'Hidden but focusable elements' },
    ],
    fix: {
      summary: 'Take hidden content out of the tab order as well as out of the tree.',
      technical: 'Add inert to the hidden subtree, or remove the focusable descendants from the tab order.',
      risk: 'Attribute-only change.',
      riskLevel: 'very-low',
    },
    verify: 'Re-scan and check "Hidden but focusable elements" reads 0.',
    inScope: true,
  },

  {
    id: 'shared-components',
    title: 'The shared building blocks reintroduce these problems',
    severity: 'moderate',
    brands: ['insureon', 'techinsurance'],
    detection: 'manual',
    whatBreaks:
      'The components that generate links, images and expandable panels across both sites are where most of these defects originate, so fixing individual pages does not hold.',
    whyItMatters:
      'Ninety-four of the 169 findings sit in shared components. Fix them once and a large share of the list clears at the source — skip them and the same defects come back with the next feature.',
    technical:
      'Of Insureon\'s 110 findings, 56 are in shared components; of TechInsurance\'s 59, 38 are. Thirty-four of Insureon\'s findings mirror TechInsurance defects exactly, which is why the two tickets are meant to be done together.',
    metrics: [],
    fix: {
      summary: 'Fix the shared components rather than each page that uses them.',
      technical:
        'Address the link, image and disclosure primitives so names, landmarks and hiding behaviour are correct by default.',
      risk: 'Broad blast radius by definition — these components are used everywhere, so this needs the widest visual QA of any phase.',
      riskLevel: 'medium',
    },
    verify:
      'Re-scan all ten page types on both brands and confirm the per-page counts drop together rather than one page at a time.',
    inScope: true,
  },

  {
    id: 'clickable-without-role',
    title: 'Cards and list items respond to clicks but announce nothing',
    severity: 'moderate',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'Large parts of each page — product cards, accordion rows, carousel dots — react to a click while telling an agent nothing about themselves. A mouse user discovers them by hovering. An agent has no hover and no way to know they do anything.',
    whyItMatters:
      'Individually most are harmless, because a real link usually sits inside the card as well. In bulk they are why an agent has to guess at a page: hundreds of elements that behave one way and describe themselves another. It is also how the two genuinely broken controls above went unnoticed for so long — they were hiding in this crowd.',
    technical:
      'Elements with a confirmed activation listener and no interactive ARIA role. Counted as a magnitude rather than listed, because the actionable subset — the ones that additionally have no name and no keyboard route — is reported separately above.',
    metrics: [
      { kind: 'clickable-no-role', label: 'Clickable elements with no role' },
      { kind: 'ghost-controls', label: 'Of those, unnamed and unreachable' },
    ],
    fix: {
      summary:
        'Where a card is genuinely a control, make it one. Where it is a convenience click target wrapping a real link, leave it alone.',
      technical:
        'Give real controls a role and a name, or move the handler onto the link or button already inside. Blanket-converting every clickable div would be worse than the problem.',
      risk: 'Low individually, wide in aggregate — this touches shared card and list components.',
      riskLevel: 'medium',
    },
    verify:
      'Re-scan and watch the unnamed-and-unreachable count first. The overall clickable count is context, not a target — driving it to zero is not the goal.',
    inScope: true,
  },

  {
    id: 'colour-only-links',
    title: 'Links in body text are identified by colour alone',
    severity: 'serious',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks:
      'Inline links inside paragraphs are distinguished from the surrounding text only by their colour — no underline, no other cue.',
    whyItMatters:
      'Anyone who cannot distinguish the two colours cannot tell there is a link there. Some pairs measure as low as 1.10:1.',
    technical:
      'axe\'s link-in-text-block rule. Counts drift between runs with content changes, so small movements here are not regressions.',
    metrics: [{ kind: 'rule', ruleId: 'link-in-text-block', label: 'Colour-only links' }],
    fix: {
      summary: 'A styling decision — underline inline links, or raise the colour difference.',
      technical: 'Brand-level CSS change to inline link styling.',
      risk: 'Changes how every article page looks. Owned by design, not by this workstream.',
      riskLevel: 'medium',
    },
    verify: 'Parked pending a design decision.',
    inScope: false,
  },

  {
    id: 'contrast',
    title: 'Some text does not have enough contrast against its background',
    severity: 'moderate',
    brands: ['insureon', 'techinsurance'],
    detection: 'scanner',
    whatBreaks: 'Text and background colours are too close together to read comfortably.',
    whyItMatters:
      'A readability problem for people, and it is measured by the same automated audits — but it is a brand palette decision with a different owner, so it is tracked here rather than fixed here.',
    technical: 'axe\'s color-contrast rule. Drifts with content, like the other styling rules.',
    metrics: [{ kind: 'rule', ruleId: 'color-contrast', label: 'Low-contrast text nodes' }],
    fix: {
      summary: 'A brand palette decision, deliberately kept out of this workstream.',
      technical: 'Palette-level CSS change.',
      risk: 'Changes brand colours site-wide.',
      riskLevel: 'medium',
    },
    verify: 'Parked pending a design decision.',
    inScope: false,
  },
];

/* ------------------------------------------------------------------ */
/* The investigation behind the catalogue                              */
/* ------------------------------------------------------------------ */

/**
 * Findings from the codebase audit, as distinct from the live scan. The scanner measures what a browser exposes on ten page types; the
 * audit read both codebases and found defects the scanner cannot reach.
 * Both numbers matter and they measure different things, so the UI never
 * adds them together.
 */
export const AUDIT = {
  pageTypesScanned: 10,
  byBrand: {
    insureon: { total: 110, critical: 9, high: 16, medium: 39, low: 46, shared: 56 },
    techinsurance: { total: 59, critical: 3, high: 19, medium: 17, low: 20, shared: 38 },
  },
  total: 169,
  inSharedComponents: 94,
  /** Insureon findings that mirror a TechInsurance defect exactly. */
  mirrored: 34,
} as const;

/* ------------------------------------------------------------------ */
/* Rollups                                                             */
/* ------------------------------------------------------------------ */

export function issuesForBrand(brand: Brand): Issue[] {
  return ISSUES.filter((i) => i.brands.includes(brand));
}

/** Issues affecting this brand, hardest-blocking first, excluding parked ones. */
export function trackedIssuesForBrand(brand: Brand): Issue[] {
  return sortIssues(ISSUES.filter((i) => i.inScope && i.brands.includes(brand)));
}

/** How many issues of each severity this brand carries. Drives the site cards. */
export function severityCounts(brand: Brand): Record<Severity, number> {
  const counts: Record<Severity, number> = { blocking: 0, serious: 0, moderate: 0 };
  for (const issue of trackedIssuesForBrand(brand)) counts[issue.severity] += 1;
  return counts;
}

/** Issues no automated scanner can catch — the "a clean report isn't done" set. */
export function manualOnlyIssues(): Issue[] {
  return ISSUES.filter((i) => i.detection === 'manual');
}
