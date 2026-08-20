/**
 * The sites this tool tracks.
 *
 * One place to add a brand: everything else keys off `BRANDS` in model.ts and
 * the run files themselves. Kept separate from `model.ts` because these are
 * deployment facts (which host is production, which is staging) rather than
 * shape-of-the-data facts.
 */
import type { Brand } from './model';

export interface SiteConfig {
  /** Production origin — what the scheduled runs measure. */
  url: string;
  /** Shown when someone is about to scan it live. */
  host: string;
  /**
   * Staging origin, when there is one. Fills the After side on Scan → Before /
   * after so QA doesn't have to remember it, and is on the hosted route's
   * allowlist. Reachable only inside the org network — see "Reach staging
   * through a tunnel" in the README. Null until a staging host exists.
   */
  staging: string | null;
}

export const SITES: Record<Brand, SiteConfig> = {
  insureon: {
    url: 'https://www.insureon.com/',
    host: 'www.insureon.com',
    staging: 'https://cd-preview.ion.staging.forsureon.com/',
  },
  techinsurance: {
    url: 'https://www.techinsurance.com/',
    host: 'www.techinsurance.com',
    staging: 'https://cd-preview.tig.staging.forsureon.com/',
  },
};

/** Every production URL, for the "scan everything" shortcut on Measure. */
export function productionUrls(): string[] {
  return Object.values(SITES).map((s) => s.url);
}

/**
 * The staging twin of a production URL: same path, staging origin.
 *
 * This is what lets Scan → Full run take a whole site's tracked targets and
 * point them at staging instead — the targets give the production side, and
 * each one's staging twin is the same path on the site's staging origin.
 * Returns null when the brand has no staging origin, or when the URL
 * given is not a URL. Assumes staging mirrors production's paths, which is
 * what a preview of the same site is; a staging host that served a different
 * path layout would need its own target list, not a rewrite here.
 */
export function stagingTwin(brand: Brand, productionUrl: string): string | null {
  const staging = SITES[brand]?.staging;
  if (!staging) return null;
  try {
    const prod = new URL(productionUrl);
    return new URL(prod.pathname + prod.search, staging).toString();
  } catch {
    return null;
  }
}
