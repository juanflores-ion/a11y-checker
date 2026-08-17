/** Types for the shared scan-target allowlist, imported by the hosted route. */
export function trackedHosts(): string[];
export function parseAllowedHosts(configured: string | undefined | null, tracked?: string[]): string[];
export function hostAllowed(hostname: string, allowed: string[]): boolean;
