// DÜRTÜ — giriş kartı ucu testleri (lib/entry.js).
// Kapsam: doğrulama, rate limit, bal küpü, mail kurulumu (kaçışlı gövde),
// Resend iletimi + anahtarsız log fallback.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  validateEntry,
  buildMail,
  deliverEntry,
  handleEntry,
  rateLimited,
  _resetRateLimit,
} from '../lib/entry.js';

const T0 = 1_750_000_000_000;

test('validateEntry: geçerli kart → ok; isim trim, e-posta küçük harf, contact korunur', () => {
  const v = validateEntry(
    { name: '  Ada Yılmaz  ', email: ' Ada@Mail.COM ', contact: '@ada' },
    T0
  );
  assert.ok(v.ok);
  assert.deepEqual(v.entry, { name: 'Ada Yılmaz', email: 'ada@mail.com', contact: '@ada', ts: T0 });
});

test('validateEntry: isim yok (eksik / boşluk) → INVALID_NAME', () => {
  assert.equal(validateEntry({ email: 'a@b.com' }).error, 'INVALID_NAME');
  assert.equal(validateEntry({ name: '   ', email: 'a@b.com' }).error, 'INVALID_NAME');
});

test('validateEntry: e-posta eksik ya da biçimsiz → INVALID_EMAIL', () => {
  assert.equal(validateEntry({ name: 'Ada' }).error, 'INVALID_EMAIL');
  for (const bad of ['a', 'a@b', 'a b@c.com', 'a@b.c']) {
    assert.equal(validateEntry({ name: 'Ada', email: bad }).error, 'INVALID_EMAIL', bad);
  }
});

test('validateEntry: aşırı uzun alanlar kırpılır, reddedilmez', () => {
  const v = validateEntry({
    name: 'A'.repeat(61),
    // 255 karakter → 254\'e kırpınca bile geçerli biçimde kalmalı
    email: 'a@' + 'b'.repeat(249) + '.com',
    contact: 'X'.repeat(81),
  });
  assert.ok(v.ok, JSON.stringify(v));
  assert.equal(v.entry.name.length, 60);
  assert.equal(v.entry.email.length, 254);
  assert.equal(v.entry.contact.length, 80);
});

test('escapeHtml: beş özel karakter + XSS payload\'ında yürütülebilir etiket kalmaz', () => {
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  const out = escapeHtml('<script>alert(1)</script><img src=x onerror=alert(1)>');
  assert.ok(!out.includes('<') && !out.includes('>'), out);
});

test('rateLimited: ilk 5 istek geçer, aynı dakikadaki 6. engellenir', () => {
  _resetRateLimit();
  for (let i = 1; i <= 5; i++) {
    assert.equal(rateLimited('1.1.1.1', T0 + i), false, `${i}. istek`);
  }
  assert.equal(rateLimited('1.1.1.1', T0 + 6), true);
});

test('rateLimited: başka IP etkilenmez; aynı IP 60 sn sonra pencere açılır', () => {
  _resetRateLimit();
  for (let i = 1; i <= 6; i++) rateLimited('2.2.2.2', T0 + i);
  assert.equal(rateLimited('3.3.3.3', T0 + 1), false, 'farklı IP bağımsız kalmalı');
  assert.equal(rateLimited('2.2.2.2', T0 + 61_001), false, '60 sn sonra pencere açılmalı');
});

test('buildMail: gövdedeki her alan kaçışlı — isim/contact XSS payload\'u ölür', () => {
  const m = buildMail({
    name: '<script>x</script>',
    email: 'ada@mail.com',
    contact: '<img src=x onerror=alert(1)>',
    ts: T0,
  });
  assert.ok(!m.html.includes('<script>'), 'ham script etiketi gövdede');
  assert.ok(!m.html.includes('<img'), 'ham img etiketi gövdede');
  assert.ok(m.html.includes('&lt;script&gt;'));
  assert.ok(m.html.includes('&lt;img'));
  assert.ok(m.subject.includes('<script>x</script>'), 'konu düz metin — ham isim durmalı');
});

test('deliverEntry: anahtar yoksa kart log\'a yapılandırılmış tek satır JSON düşer (name ilk)', async () => {
  const lines = [];
  const via = await deliverEntry(
    { name: 'Ada Yılmaz', email: 'ada@mail.com', contact: '@ada', ts: T0 },
    { env: {}, logFn: l => lines.push(l) }
  );
  assert.equal(via, 'log');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(parsed), ['name', 'email', 'contact', 'ts']);
  assert.equal(parsed.name, 'Ada Yılmaz');
});

test('handleEntry: env tanımlı → tek Resend fetch, zarf doğru; erişilemezse log\'a da düşer', async () => {
  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  };
  const lines = [];
  const r = await handleEntry(
    { name: 'Ada', email: 'ada@mail.com' },
    {
      ip: '9.9.9.9', now: T0, fetch: okFetch,
      env: { RESEND_API_KEY: 'k', ENTRY_MAIL_TO: 'me@mail.com' },
      logFn: l => lines.push(l),
    }
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.via, 'resend');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.match(calls[0].init.headers.Authorization, /^Bearer k$/);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.from, 'onboarding@resend.dev');
  assert.deepEqual(sent.to, ['me@mail.com']);
  assert.equal(sent.reply_to, 'ada@mail.com');
  assert.ok(sent.html.includes('ada@mail.com'));
  assert.equal(lines.length, 0, 'Resend başarılıysa log yazılmamalı');

  // Resend erişilemez → kart yine de log\'a düşer (kayıp yok, çöküş yok).
  const lines2 = [];
  const r2 = await handleEntry(
    { name: 'Ada', email: 'ada2@mail.com' },
    {
      ip: '9.9.9.8', now: T0,
      fetch: () => { throw new Error('ECONNREFUSED'); },
      env: { RESEND_API_KEY: 'k', ENTRY_MAIL_TO: 'me@mail.com' },
      logFn: l => lines2.push(l),
      errFn: () => {},
    }
  );
  assert.equal(r2.status, 200);
  assert.equal(r2.body.via, 'log');
  assert.equal(lines2.length, 1);
  assert.equal(JSON.parse(lines2[0]).email, 'ada2@mail.com');
});

test('handleEntry: bal küpü dolu → sessiz ok (fetch/log yok); rate limit → 429; bozuk kart → 400', async () => {
  _resetRateLimit();
  const calls = [];
  const lines = [];
  const env = { RESEND_API_KEY: 'k', ENTRY_MAIL_TO: 'me@mail.com' };

  const hp = await handleEntry(
    { name: 'Bot', email: 'bot@spam.io', website: 'https://spam.io' },
    {
      ip: '8.8.8.8', now: T0,
      fetch: async () => { calls.push(1); return { ok: true }; },
      env, logFn: l => lines.push(l),
    }
  );
  assert.equal(hp.status, 200);
  assert.deepEqual(hp.body, { ok: true });
  assert.equal(calls.length, 0, 'botun kartı iletilemez');
  assert.equal(lines.length, 0, 'botun kartı loglanmaz');

  for (let i = 0; i < 5; i++) {
    const r = await handleEntry({ name: 'A', email: 'a@b.com' }, { ip: '7.7.7.7', now: T0 + i, env: {}, logFn: l => lines.push(l) });
    assert.equal(r.status, 200, `${i + 1}. istek`);
  }
  const blocked = await handleEntry({ name: 'A', email: 'a@b.com' }, { ip: '7.7.7.7', now: T0 + 5, env: {}, logFn: l => lines.push(l) });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, 'RATE_LIMITED');

  const bad = await handleEntry({ name: '', email: 'x' }, { ip: '6.6.6.6', now: T0, env: {}, logFn: l => lines.push(l) });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'INVALID_NAME');
});
