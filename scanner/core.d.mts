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

/** Opens a context with the Lighthouse mobile profile the scores are computed on. */
export function launchContext(browser: any): Promise<any>;

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
