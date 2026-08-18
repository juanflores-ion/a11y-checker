/**
 * The published scanner: where a scanner inside the network currently is, and
 * the token it wants.
 *
 * Staging is only reachable from a machine on the VPN, so a before/after
 * against it runs through a scanner someone is hosting plus a tunnel. Quick
 * tunnels take a new random hostname every restart, which made the whole
 * arrangement a hand-off: whoever ran the scanner had to send QA a fresh URL
 * and token every time. This module is the other half of the fix — the
 * scanner publishes where it is, and the Scan page reads it.
 *
 * The value is deliberately readable by anyone who can open the dashboard.
 * That is a decision, not an oversight: this tool is used by QA and SEO, the
 * scanner it points at can only reach our own sites (see `allowlist.mjs`), and
 * the token was already sitting in every QA browser's localStorage. What is
 * NOT open is *writing* — see `publishSecret`. Anyone who could write here
 * could point every reader's browser at a host of their choosing, which is the
 * one thing that would turn a convenience into an incident.
 */

/** What the scanner publishes, and the Scan page reads. */
export interface PublishedScanner {
  /** Origin of the scanner, e.g. https://x-y-z.trycloudflare.com */
  address: string;
  /** Token the scanner expects, or '' when it is running in local mode. */
  token: string;
  /** ISO timestamp of the publish, shown so a stale entry is obvious. */
  publishedAt: string;
  /** Free text from whoever published — "Juan's laptop", say. */
  note?: string;
}

/**
 * Hostnames a published address may use.
 *
 * A published address is loaded by other people's browsers, which then send
 * them our page URLs and this token — so it cannot be an arbitrary host. Quick
 * tunnels and named tunnels on our own domain cover every way we actually run
 * this; anything else is rejected rather than trusted.
 */
const ALLOWED_SUFFIXES = ['.trycloudflare.com', '.forsureon.com', '.insureon.com', '.techinsurance.com'];

/** Loopback is allowed too, for a QA who runs the scanner on their own box. */
function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function validateAddress(raw: unknown): { address: string } | { error: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'address is required.' };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: `Not a valid URL: “${raw}”` };
  }
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    return { error: 'A published address must be https (except on localhost).' };
  }
  const host = url.hostname.toLowerCase();
  const ok = isLoopback(host) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
  if (!ok) {
    return {
      error:
        `${host} is not a publishable scanner host. Use a Cloudflare tunnel ` +
        `(*.trycloudflare.com) or one of our own domains.`,
    };
  }
  // Origin only: a path here would be silently dropped by the callers anyway.
  return { address: url.origin };
}

export function validatePublish(body: unknown): PublishedScanner | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>;
  const address = validateAddress(input.address);
  if ('error' in address) return address;
  if (input.token !== undefined && typeof input.token !== 'string') {
    return { error: 'token must be a string.' };
  }
  if (input.note !== undefined && typeof input.note !== 'string') {
    return { error: 'note must be a string.' };
  }
  return {
    address: address.address,
    token: typeof input.token === 'string' ? input.token : '',
    publishedAt: new Date().toISOString(),
    ...(input.note ? { note: String(input.note).slice(0, 80) } : {}),
  };
}

/**
 * The secret a publisher must present. Absent means publishing is switched
 * off entirely — which is the right default for a fresh deploy, and why the
 * route answers 503 rather than accepting anonymous writes.
 */
export function publishSecret(): string | null {
  const s = process.env.SCAN_PUBLISH_SECRET;
  return s && s.trim() ? s.trim() : null;
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

/**
 * Where the published value lives.
 *
 * Vercel's filesystem is read-only and its functions are stateless, so a
 * shared value needs a store. Upstash/Vercel KV is used when its environment
 * variables are present; without them the value is kept in module memory,
 * which is enough for `npm run dev` and for a single-instance self-host, and
 * honest about its limits — a serverless deploy with no KV will simply forget
 * between invocations, and the Scan page falls back to "nothing published".
 */
const KV_URL = () => process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'agent-readiness:published-scanner';

export function storeKind(): 'kv' | 'memory' {
  return KV_URL() && KV_TOKEN() ? 'kv' : 'memory';
}

/**
 * The memory store on a serverless host is a trap, not a fallback: each
 * invocation may be a different instance, so a value written by one is
 * invisible to the next and the publish appears to work then quietly doesn't.
 * Callers surface this rather than papering over it.
 */
export function storeWarning(): string | null {
  if (storeKind() === 'kv') return null;
  if (!process.env.VERCEL) return null;
  return (
    'No KV store is connected, so a published scanner will not survive between ' +
    'requests on this deployment. Connect one (Vercel → Storage) and redeploy.'
  );
}

let inMemory: PublishedScanner | null = null;

export async function readPublished(): Promise<PublishedScanner | null> {
  if (storeKind() === 'memory') return inMemory;
  try {
    const res = await fetch(`${KV_URL()}/get/${encodeURIComponent(KEY)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN()}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string | null };
    if (!body.result) return null;
    return JSON.parse(body.result) as PublishedScanner;
  } catch {
    // A store that cannot be reached is "nothing published" — never an error
    // the reader has to handle, because the page works without it.
    return null;
  }
}

export async function writePublished(value: PublishedScanner): Promise<boolean> {
  if (storeKind() === 'memory') {
    inMemory = value;
    return true;
  }
  try {
    const res = await fetch(`${KV_URL()}/set/${encodeURIComponent(KEY)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Only used by tests, to keep the module-memory store from leaking between them. */
export function __resetMemory() {
  inMemory = null;
}
