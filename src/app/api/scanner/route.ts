import { NextResponse } from 'next/server';

import {
  publishSecret,
  readPublished,
  storeKind,
  storeWarning,
  validatePublish,
  writePublished,
} from '@/lib/scannerEndpoint';

/**
 * Where the in-network scanner currently is.
 *
 *   GET  → { address, token, publishedAt, note } or { published: null }
 *   POST → publishes it; requires the publish secret
 *
 * Reading is open, by decision: this dashboard is used by QA and SEO, and the
 * scanner behind the address can only reach our own sites. Writing is not —
 * whoever can write chooses where every reader's browser sends its scans.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const published = await readPublished();
  if (!published) {
    return NextResponse.json(
      { published: null, store: storeKind(), ...(storeWarning() ? { warning: storeWarning() } : {}) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(
    { published, store: storeKind(), ...(storeWarning() ? { warning: storeWarning() } : {}) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const secret = publishSecret();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'Publishing is switched off: SCAN_PUBLISH_SECRET is not set on this deployment.',
      },
      { status: 503 }
    );
  }

  const offered = request.headers.get('x-scan-publish-secret') ?? '';
  /**
   * Length first, then value: `!==` on two strings of different length is the
   * cheap case anyway, and this keeps the comparison uniform for equal-length
   * inputs. The secret is a deploy-time value, not a user password, so the
   * threat here is a script guessing, which the 401 and the tiny keyspace of
   * attempts make impractical.
   */
  if (offered.length !== secret.length || offered !== secret) {
    return NextResponse.json({ error: 'Wrong or missing publish secret.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const parsed = validatePublish(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const ok = await writePublished(parsed);
  if (!ok) {
    return NextResponse.json({ error: 'Could not write to the store.' }, { status: 502 });
  }

  return NextResponse.json({
    published: parsed,
    store: storeKind(),
    ...(storeWarning() ? { warning: storeWarning() } : {}),
  });
}
