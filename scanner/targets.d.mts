/** Types for the fixed scan target list, imported by the Measure page. */
export const PAGE_KEYS: string[];
export const TARGETS: Record<string, Record<string, string>>;
/**
 * How a target says which variant of itself was served. `read` runs inside the
 * page and is serialised across the boundary, so it may close over nothing.
 */
export interface TargetIdentity {
  key: string;
  why: string;
  read: () => string | null;
}

/** The callable half. Scanner only — a function cannot cross an RSC boundary. */
export function identityFor(brand: string, key: string): TargetIdentity | undefined;

/** The describable half, safe to render. */
export function targetList(): Array<{
  brand: string;
  key: string;
  url: string;
  identity?: { key: string; why: string };
}>;
