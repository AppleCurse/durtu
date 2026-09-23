import { NextResponse } from 'next/server';
import { handleEntry } from '../../../lib/entry.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Giriş kartı ucu.
 *
 * Mantık lib/entry.js'tedir (test altındadır): rate limit → bal küpü →
 * doğrulama → iletim (Resend mail veya yapılandırılmış log).
 */
export async function POST(req) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'MALFORMED_JSON' }, { status: 400 });
  }

  const { status, body: out } = await handleEntry(body, { ip });
  return NextResponse.json(out, { status });
}
