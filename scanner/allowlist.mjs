/**
 * Which hosts a scanner will visit.
 *
 * Both scanners — the hosted /api/scan route and the standalone server — fetch
 * whatever URL they are handed and report what they found. Left open, that is
 * server-side request forgery with a UI on top: point it at an internal host
 * and read back the result. Both therefore check the host against one list,
 * defined here so the rule cannot drift between them.
 *
 * Suffix matching is deliberate: "insureon.com" also allows
 * "staging.insureon.com", but never "insureon.com.evil.test", which is why the
 * check is on dot boundaries and not `includes()`.
 */
import { TARGETS } from './targets.mjs';

/** Registrable hosts of the tracked sites, `www.` stripped, lower-cased. */
export function trackedHosts() {
  const hosts = new Set();
  for (const pages of Object.values(TARGETS)) {
    for (const url of Object.values(pages)) {
      hosts.add(new URL(url).hostname.replace(/^www\./, '').toLowerCase());
    }
  }
  return [...hosts];
}

/**
 * One configured entry → a bare host name. People paste origins and URLs
 * into env vars; "https://staging.insureon.com/" should mean the host, not
 * silently match nothing.
 */
function toHost(entry) {
  const s = entry.trim().toLowerCase();
  if (!s) return null;
  try {
    return new URL(/^[a-z]+:\/\//.test(s) ? s : `http://${s}`).hostname || null;
  } catch {
    return null;
  }
}

/**
 * The tracked hosts plus whatever SCAN_ALLOWED_HOSTS names (comma-separated),
 * de-duplicated. `tracked` is a parameter so the hosted route can pass its
 * own site config, which also knows about staging origins.
 */
export function parseAllowedHosts(configured, tracked = trackedHosts()) {
  const extra = (configured ?? '')
    .split(',')
    .map(toHost)
    .filter(Boolean);
  return [...new Set([...tracked.map((h) => h.toLowerCase()), ...extra])];
}

/** Exact match, or a subdomain of an allowed host — dot boundary only. */
export function hostAllowed(hostname, allowed) {
  const host = hostname.toLowerCase();
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}
