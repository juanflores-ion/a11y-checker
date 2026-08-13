/**
 * The twenty scan targets: ten page types per brand.
 *
 * Page keys are fixed and must match the viewer's canonical order. If a URL
 * needs changing (a category page gets retired, say), change the URL and keep
 * the key — the whole dashboard aggregates on rule id + page key, so changing
 * a key silently breaks every trend line that depends on it.
 */
export const PAGE_KEYS = [
  'home',
  'policy',
  'major',
  'minor',
  'article',
  'resources',
  'about',
  'contact',
  'legal',
  'a11y-stmt',
];

export const TARGETS = {
  insureon: {
    home: 'https://www.insureon.com/',
    policy: 'https://www.insureon.com/small-business-insurance/general-liability',
    major: 'https://www.insureon.com/retail-business-insurance',
    minor: 'https://www.insureon.com/retail-business-insurance/clothing-stores',
    article: 'https://www.insureon.com/blog/how-small-businesses-can-reduce-liabilities',
    resources: 'https://www.insureon.com/resources',
    about: 'https://www.insureon.com/about-us',
    contact: 'https://www.insureon.com/contact-us',
    legal: 'https://www.insureon.com/legal/privacy-policy',
    'a11y-stmt': 'https://www.insureon.com/legal/accessibility-statement',
  },
  techinsurance: {
    home: 'https://www.techinsurance.com/',
    policy: 'https://www.techinsurance.com/general-liability-insurance',
    major: 'https://www.techinsurance.com/it-consultant-insurance',
    minor: 'https://www.techinsurance.com/technology-business-insurance/software-development',
    article: 'https://www.techinsurance.com/resources/how-to-file-a-business-insurance-claim',
    resources: 'https://www.techinsurance.com/resources',
    about: 'https://www.techinsurance.com/about-us',
    contact: 'https://www.techinsurance.com/contact-us',
    legal: 'https://www.techinsurance.com/legal/privacy-policy',
    'a11y-stmt': 'https://www.techinsurance.com/legal/accessibility-statement',
  },
};

/**
 * Ten of these 404'd as of 10 Aug 2026 — both sites had restructured their
 * URLs since the list was written, and because the scanner was measuring the
 * 404 pages rather than skipping them, the run read as a large improvement.
 * The engine now rejects any non-OK response, so a stale URL shows up as a
 * failed page instead of a fake win. Re-check this list when a run reports
 * failures: it usually means a URL moved, not that a site broke.
 *
 * Changed here: both brands' legal and accessibility pages moved under
 * /legal/, TechInsurance's policy page left /small-business-insurance/, its
 * sub-category pages moved to /technology-business-insurance/, and both
 * article targets were replaced with articles that currently exist. Page
 * *keys* are unchanged, so the trend lines survive — but article and minor
 * now point at different articles, so treat their history across 10 Aug as a
 * change of subject rather than a change in the sites.
 */

/**
 * ── Page identity: which document did we actually measure? ────────────────
 *
 * A URL is assumed to name a page. Sometimes it does not. Insureon's homepage
 * is one Sitecore item under a content test, and the same URL returns one of
 * three materially different documents depending on which combination the CM
 * assigns the visitor — measured 13 Aug 2026 over eight loads with a fresh
 * profile each time: 971, 893 and 1191 DOM nodes, three different headlines,
 * each internally byte-stable. Nothing about the scan varied. The page did.
 *
 * A number measured against an unknown document is not a measurement, and the
 * failure is quiet: the homepage row moves, nobody can say why, and a trend
 * line reads as a change to the site. This is the same argument that put
 * `probeVersion` and `browserVersion` on every run — you cannot compare two
 * figures without knowing what produced each — applied to the subject rather
 * than to the instrument.
 *
 * So a target may declare how to read which variant of itself was served. The
 * declaration lives HERE, beside the URLs, because it is knowledge about a
 * site. `probes.mjs` measures agent readiness and must not learn what Sitecore
 * is: a measurement engine that knows one CMS is how `[class*="megaMenu"]`
 * happened, and every hardcoded site fact in this tool's history has had to be
 * removed again.
 *
 * The contract:
 *
 *   key   what question is being asked, stable across runs so two runs can be
 *         compared on it
 *   why   for whoever reads a run file in a year
 *   read  runs INSIDE the page, self-contained (it is serialised across the
 *         boundary, so it may close over nothing). Returns a short stable
 *         string, or `null` when it genuinely cannot tell.
 *
 * Three states must stay distinguishable, and the reader is why:
 *   field absent   this target declares no identity, or the run predates this
 *   value: null    asked, and the page did not answer
 *   value: "…"     asked and answered
 * Collapsing the middle one into a default is the false-clean shape this
 * codebase has shipped twice. It never gets a default.
 *
 * Identity is recorded and never interpreted. Nothing in the defect set reads
 * it, so it cannot move a number in either direction — by construction, not by
 * care.
 */
const IDENTITIES = {
  insureon: {
    home: {
      key: 'homepage-variant',
      why:
        'One Sitecore item under a content test serves three different homepages from ' +
        'this URL. The rendered hero component names which one, and it is the only ' +
        'thing in the delivered page that does: there is no variant cookie, no ' +
        'dataLayer field and no meta tag. Measured 13 Aug 2026 — Homepage-Hero-Columns ' +
        'is the legacy page, Homepage-Hero-V2 and Homepage-Hero-V3 are the two ' +
        'refreshed ones, and the hero matched the visible headline on 6 of 6 loads.',
      read: () => {
        // JSS embeds the layout it rendered from. Not `__NEXT_DATA__` — looking
        // for that one and finding nothing is what produced a confident "the
        // page carries no variant information", which was wrong.
        const el = document.getElementById('__JSS_STATE__');
        if (!el) return null;
        let route;
        try {
          const state = JSON.parse(el.textContent);
          route = state?.sitecore?.route ?? state?.props?.pageProps?.layoutData?.sitecore?.route;
        } catch {
          return null; // present but unparseable is "cannot tell", not "no variant"
        }
        if (!route || !route.placeholders) return null;
        const hero = Object.values(route.placeholders)
          .flat()
          .map((rendering) => rendering && rendering.componentName)
          .find((name) => typeof name === 'string' && name.startsWith('Homepage-Hero-'));
        return hero ?? null;
      },
    },
  },
};

/**
 * The reader for a target, or undefined. Scanner-side only.
 *
 * Kept off `targetList()` deliberately. That list is rendered by the Measure
 * page, which hands it to a Client Component, and a React Server Component
 * boundary refuses to serialise a function — the build fails with "Functions
 * cannot be passed directly to Client Components". So the viewer gets the
 * describable half and the engine looks the callable half up by name.
 *
 * That split is worth keeping even without the boundary: the app has no use for
 * a function it can never run, and the fewer places this reader can be reached
 * from, the fewer places can start depending on what it returns.
 */
export function identityFor(brand, key) {
  return IDENTITIES[brand]?.[key];
}

/**
 * Every target, with the *serialisable* half of its identity declaration —
 * enough for the Measure page to say a page identifies itself and why, without
 * carrying the reader across a boundary that cannot take it.
 */
export function targetList() {
  const out = [];
  for (const [brand, pages] of Object.entries(TARGETS)) {
    for (const key of PAGE_KEYS) {
      if (pages[key]) {
        const identity = IDENTITIES[brand]?.[key];
        out.push({
          brand,
          key,
          url: pages[key],
          ...(identity ? { identity: { key: identity.key, why: identity.why } } : {}),
        });
      }
    }
  }
  return out;
}
