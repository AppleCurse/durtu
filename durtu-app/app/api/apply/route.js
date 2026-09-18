import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Başvuru kuyruğu.
 *
 * NOT: Kalıcı depo (Supabase `applications`) yapılandırılmamışsa süreç-içi kuyruğa
 * düşülür — ancak bu kuyruk artık SINIRLIDIR ve sınırın aşıldığı loglanır.
 * Eskiden sınırsız büyüyordu: rate limit olmadığı için bellek şişirme (DoS) vektörüydü
 * ve serverless'te her lambda kendi kuyruğunu tuttuğu için veriler kayboluyordu.
 */
const QUEUE_MAX = 500;
const queue = (globalThis.__durtuQueue = globalThis.__durtuQueue || []);

/* ---------------- rate limit (IP başına sızdıran kova) ---------------- */
const RL_LIMIT = 5;
const RL_WINDOW_MS = 60_000;
const RL_MAX_KEYS = 10_000;
const buckets = (globalThis.__durtuRl = globalThis.__durtuRl || new Map());

function rateLimited(ip) {
  const now = Date.now();
  if (buckets.size > RL_MAX_KEYS) buckets.clear(); // sınırsız büyümeyi engelle
  const hits = (buckets.get(ip) || []).filter(t => now - t < RL_WINDOW_MS);
  hits.push(now);
  buckets.set(ip, hits);
  return hits.length > RL_LIMIT;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'MALFORMED_JSON' }, { status: 400 });
  }

  const email = String(body?.email || '').trim().toLowerCase();
  const why = String(body?.why || '').trim();

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'INVALID_EMAIL' }, { status: 400 });
  }
  if (why.length < 12 || why.length > 2000) {
    return NextResponse.json({ ok: false, error: 'INVALID_WHY' }, { status: 400 });
  }

  // Mükerrer başvuru
  if (queue.some(a => a.email === email && a.status === 'pending')) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (queue.length >= QUEUE_MAX) {
    queue.shift(); // en eskiyi düşür
    console.warn('[DURTU:api.apply] kuyruk sınırı doldu — kalıcı depo yapılandırılmalı');
  }

  const id = 'A' + Date.now().toString(36).toUpperCase();
  queue.push({
    id,
    name: String(body.name || 'Misafir').slice(0, 80),
    email: email.slice(0, 254),
    contact: String(body.contact || '').slice(0, 80),
    why: why.slice(0, 2000),
    type: String(body.type || '').slice(0, 40),
    budget: String(body.budget || '').slice(0, 40),
    ts: Date.now(),
    status: 'pending',
  });

  return NextResponse.json({ ok: true, id });
}

// GET kaldırıldı: bekleyen başvuru sayısı iş metriğidir, anonim kullanıcıya sızdırılmaz.
export async function GET() {
  return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
}
