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
   * Staging origin, when there is one. Prefilled on the Compare page so QA
   * doesn't have to remember it. Null until a staging host exists.
   */
  staging: string | null;
}

export const SITES: Record<Brand, SiteConfig> = {
  insureon: {
    url: 'https://www.insureon.com/',
    host: 'www.insureon.com',
    staging: null,
  },
  techinsurance: {
    url: 'https://www.techinsurance.com/',
    host: 'www.techinsurance.com',
    staging: null,
  },
};

/** Every production URL, for the "scan everything" shortcut on Measure. */
export function productionUrls(): string[] {
  return Object.values(SITES).map((s) => s.url);
}
