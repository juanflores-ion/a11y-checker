/** Types for the fixed scan target list, imported by the Measure page. */
export const PAGE_KEYS: string[];
export const TARGETS: Record<string, Record<string, string>>;
export function targetList(): Array<{ brand: string; key: string; url: string }>;
