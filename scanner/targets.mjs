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

export function targetList() {
  const out = [];
  for (const [brand, pages] of Object.entries(TARGETS)) {
    for (const key of PAGE_KEYS) {
      if (pages[key]) out.push({ brand, key, url: pages[key] });
    }
  }
  return out;
}
