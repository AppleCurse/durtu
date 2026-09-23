// DÜRTÜ — giriş kartı: /api/entry mantığının tek doğruluk kaynağı.
//
// Mantık lib/ içinde (route içinde değil) ki test edilebilir kalsın:
// bu modülde sıfır framework bağımlılığı var, node --test ile koşar.
// Route (app/api/entry/route.js) sadece NextResponse sarmalayıcısıdır.
//
// İletim: RESEND_API_KEY + ENTRY_MAIL_TO tanımlıysa kart tek fetch'le Resend
// üzerinden mail'e düşer (gönderici: onboarding@resend.dev — domain
// doğrulaması istemez; reply_to başvuranın adresi). Tanımlı değilse — ya da
// Resend erişilemezse — kart sunucu log'una TEK SATIRLI yapılandırılmış JSON
// olarak düşer. Form her iki durumda da çalışır; yeni bağımlılık yok.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MAX_NAME = 60;
export const MAX_EMAIL = 254;
export const MAX_CONTACT = 80;

const RL_LIMIT = 5;
const RL_WINDOW_MS = 60_000;
const RL_MAX_KEYS = 10_000;
const buckets = (globalThis.__durtuEntryRl = globalThis.__durtuEntryRl || new Map());

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML özel karakterlerini kaçırır (mail gövdesinin güvenlik sınırı). */
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

/**
 * Sızdıran kova rate limit: IP başına dakikada en fazla RL_LIMIT istek.
 * @param {string} ip
 * @param {number} [now] — testler için enjekte edilebilir
 * @returns {boolean} true = istek engellendi
 */
export function rateLimited(ip, now = Date.now()) {
  if (buckets.size > RL_MAX_KEYS) buckets.clear(); // sınırsız büyümeyi engelle
  const hits = (buckets.get(ip) || []).filter(t => now - t < RL_WINDOW_MS);
  hits.push(now);
  buckets.set(ip, hits);
  return hits.length > RL_LIMIT;
}

/** Test izolasyonu: kovaları boşalt. */
export function _resetRateLimit() {
  buckets.clear();
}

/**
 * Giriş kartını doğrular.
 * @returns {{ok: true, entry: object} | {ok: false, error: string}}
 */
export function validateEntry(body, now = Date.now()) {
  const entry = {
    name: String(body?.name ?? '').trim().slice(0, MAX_NAME),
    email: String(body?.email ?? '').trim().toLowerCase().slice(0, MAX_EMAIL),
    contact: String(body?.contact ?? '').trim().slice(0, MAX_CONTACT),
    ts: now,
  };
  if (!entry.name) return { ok: false, error: 'INVALID_NAME' };
  if (!entry.email || !EMAIL_RE.test(entry.email)) return { ok: false, error: 'INVALID_EMAIL' };
  return { ok: true, entry };
}

/**
 * Mail zarfını kurar.
 * Gövdedeki HER ALAN kaçışlı — başvuranın girdisi asla HTML olarak geçmez.
 */
export function buildMail(entry) {
  const row = (label, value) =>
    `<tr><td style="padding:9px 14px 9px 0;font-size:13px;color:#8d8d8d;white-space:nowrap;border-bottom:1px solid #2b2b2b">${label}</td>` +
    `<td style="padding:9px 0;font-size:14px;color:#f2ecd9;border-bottom:1px solid #2b2b2b">${value}</td></tr>`;
  return {
    subject: `DÜRTÜ — Yeni giriş kartı: ${entry.name}`,
    html: [
      '<!doctype html><html><body style="margin:0;background:#0a0a0a;padding:24px;font-family:Arial,Helvetica,sans-serif">',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#141210;border:1px solid #3a2f14;border-radius:12px">',
      '<tr><td style="padding:28px 24px">',
      '<p style="font-family:Georgia,serif;font-size:20px;color:#d4af37;letter-spacing:4px;margin:0 0 6px">DÜRTÜ</p>',
      '<p style="font-size:13px;color:#9a9a9a;margin:0 0 20px">Bir giriş kartı dolduruldu.</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">',
      row('Ad Soyad', escapeHtml(entry.name)),
      row('E-posta', escapeHtml(entry.email)),
      row('Telegram / Telefon', escapeHtml(entry.contact || '—')),
      '</table>',
      `<p style="font-size:11px;color:#666;margin:24px 0 0">Alındı: ${new Date(entry.ts).toUTCString()} · giriş kartı</p>`,
      '</td></tr></table></body></html>',
    ].join(''),
  };
}

/**
 * Kartı iletir: env varsa Resend, yoksa (veya Resend düşerse) yapılandırılmış log.
 * @returns {Promise<'resend'|'log'>} — fiilen kullanılan kanal
 */
export async function deliverEntry(entry, {
  fetch: fetchImpl = fetch,
  env = process.env,
  logFn = console.log,
  errFn = console.error,
} = {}) {
  const apiKey = env.RESEND_API_KEY;
  const to = env.ENTRY_MAIL_TO;
  if (apiKey && to) {
    const { subject, html } = buildMail(entry);
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: [to],
          reply_to: entry.email,
          subject,
          html,
        }),
      });
      if (res.ok) return 'resend';
      errFn(`[DURTU:entry] Resend HTTP ${res.status} döndü — kart log'a da düşürüldü`);
    } catch (err) {
      errFn("[DURTU:entry] Resend'a ulaşılamadı — kart log'a düşürüldü", err?.message || err);
    }
  }
  // Yapılandırılmış tek satır: grep'lenebilir, name ilk anahtar.
  logFn(JSON.stringify({ name: entry.name, email: entry.email, contact: entry.contact, ts: entry.ts }));
  return 'log';
}

/**
 * Ucu tek giriş noktası: rate limit → bal küpü → doğrulama → iletim.
 * Route sonucu NextResponse ile sarmalar.
 * @returns {Promise<{status: number, body: object}>}
 */
export async function handleEntry(body, {
  ip = 'unknown',
  now = Date.now(),
  fetch: fetchImpl = fetch,
  env = process.env,
  logFn = console.log,
  errFn = console.error,
} = {}) {
  if (rateLimited(ip, now)) {
    return { status: 429, body: { ok: false, error: 'RATE_LIMITED' } };
  }
  // Bal küpü: insana görünmez, bot doldurur. Sessiz "başarı" —
  // bot, tuzağa düştüğünü anlamasın.
  if (String(body?.website ?? '').trim()) {
    return { status: 200, body: { ok: true } };
  }
  const v = validateEntry(body, now);
  if (!v.ok) return { status: 400, body: { ok: false, error: v.error } };
  const via = await deliverEntry(v.entry, { fetch: fetchImpl, env, logFn, errFn });
  return { status: 200, body: { ok: true, via } };
}
