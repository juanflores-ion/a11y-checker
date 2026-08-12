/**
 * Types for the scan engine, which is plain ESM JavaScript so the CLI can run
 * it with no build step. The Next API route imports the same file, and needs
 * these to typecheck.
 */
import type { PageResult } from '../src/lib/model';

export interface LaunchOptions {
  headless: boolean;
  executablePath?: string;
}

export function launchOptions(): LaunchOptions;

/**
 * Which browser produced a run, for `RunMeta`.
 *
 * Both fields are optional, and that is deliberate rather than lax: three runs
 * on disk predate any provenance at all, and "absent" has to keep rendering as
 * *not recorded* rather than being filled in with a plausible value. Spread the
 * result into `meta` so a key we could not establish simply isn't there.
 */
export interface BrowserProvenance {
  /** e.g. "Chromium 149.0.7827.55". */
  browserVersion?: string;
  /** The executable actually launched, not the one Playwright would have picked. */
  browserPath?: string;
}

/**
 * Pass the options you launched with — `browserType.executablePath()` reports
 * the default build even when `executablePath` overrode it. Call while the
 * browser is open.
 */
export function browserProvenance(
  browser: any,
  launchOpts?: { executablePath?: string }
): BrowserProvenance;

/** Retained so pre-profile run files still describe themselves; those were mobile. */
export const VIEWPORT: { width: number; height: number; isMobile: boolean };

export interface DeviceProfile {
  name: string;
  label: string;
  width: number;
  height: number;
  isMobile: boolean;
  hasTouch: boolean;
  deviceScaleFactor: number;
  userAgent: string;
}

/**
 * These sites branch their markup on the device, server-side, so the profile
 * decides which page is measured. Desktop leads: it is what agents are served.
 */
export const PROFILES: Record<string, DeviceProfile>;
export const PROFILE_NAMES: string[];
export const DEFAULT_PROFILE: string;
export function resolveProfile(name?: string): DeviceProfile;

/** Opens a context at the named profile, user-agent and viewport in step. */
export function launchContext(browser: any, profileName?: string): Promise<any>;

/**
 * Scan one URL in an existing context. Resolves to a measured page, or to
 * `{ url, error }` when the page could not be measured — never throws for a
 * page-level failure.
 */
/** Resolves axe's engine source, or null when it can't be found here. */
export function resolveAxeSource(): string | null;

export function scanPage(
  context: any,
  url: string,
  options?: { axeSource?: string }
): Promise<PageResult & { axeVersion?: string | null; httpStatus?: number }>;
