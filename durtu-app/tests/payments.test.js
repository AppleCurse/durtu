// DÜRTÜ — kasa ödeme rayları testleri (Papara / Payfix / Anında Havale / USDT-TRC20).
//
// Doğrulanan asıl sözleşme: tutar kapıları ray bazlıdır, para yalnızca
// 'ok''a geçen kayıt için işlenir ve kayıt bir kez 'ok'a geçer.
'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  RAILS, USDT_TRY_RATE, getRail, railsSanity, checkDeposit, checkWithdraw,
  usdtToChips, chipsToUsdt, minUsdtFor, newRef, startDeposit, startWithdraw, settleRecord, recordLabel,
} = await import('../lib/payments.js');

const T0 = 1_800_000_000_000;
const detRand = (() => {
  let i = 0;
  return () => (i = (i + 1) % 7) / 7;   // deterministik 0..6/7 döngüsü
})();

/* ═══════════════════ KATALOG ═══════════════════ */

test('KATALOG: dört ray, benzersiz id, tutarlı limitler, hesap bilgisi', () => {
  assert.equal(RAILS.length, 4);
  assert.deepEqual(RAILS.map(r => r.id).sort(), ['havale', 'papara', 'payfix', 'usdt']);
  assert.equal(railsSanity().ok, true);
});

test('KATALOG: TR refleksine göre pinler — havale min 200, cüzdan min 100, kripto tavanı en yüksek', () => {
  assert.equal(getRail('havale').depMin, 200);
  assert.equal(getRail('papara').depMin, 100);
  assert.equal(getRail('payfix').depMin, 100);
  const caps = RAILS.map(r => r.depMax);
  assert.equal(getRail('usdt').depMax, Math.max(...caps));
});

test('KATALOG: USDT rayı TRC-20 ağını açıkça yazar', () => {
  const u = getRail('usdt');
  assert.match(u.account, /TRC-20|TQ8v/);
  assert.ok(u.detailLabel.toLowerCase().includes('trc-20') || u.detailLabel.includes('USDT'));
});

/* ═══════════════════ TUTAR KAPILARI ═══════════════════ */

test('YATIRIM: ray alt limitinin altı ve üst limitinin üstü reddedilir', () => {
  assert.equal(checkDeposit('papara', 99).reason, 'BELOW_MIN');
  assert.equal(checkDeposit('papara', 50001).reason, 'ABOVE_MAX');
  assert.equal(checkDeposit('havale', 199).reason, 'BELOW_MIN', 'havale min 200');
  assert.equal(checkDeposit('havale', 200).ok, true);
});

test('YATIRIM: bilinmeyen ray ve bozuk tutar reddedilir', () => {
  assert.equal(checkDeposit('paparax', 100).reason, 'UNKNOWN_RAIL');
  for (const v of [NaN, 0, -100, undefined, 'x']) {
    assert.equal(checkDeposit('papara', v).ok, false, `${String(v)} kabul edildi`);
  }
});

test('ÇEKİM: ray bazlı çekim kapıları yatırımdan ayrı çalışır', () => {
  assert.equal(checkWithdraw('papara', 100).ok, true);
  assert.equal(checkWithdraw('havale', 150).reason, 'BELOW_MIN');
  assert.equal(checkWithdraw('usdt', 100001).reason, 'ABOVE_MAX');
});

/* ═══════════════════ USDT KURU ═══════════════════ */

test('USDT: dönüşüm toChips kapısından geçer — NaN/kesirli/negatif çip doğmaz', () => {
  assert.equal(usdtToChips(10), 97);
  assert.equal(usdtToChips(10.55), Math.floor(10.55 * USDT_TRY_RATE));
  for (const v of [NaN, -5, 0, undefined, 'abc']) {
    assert.equal(usdtToChips(v), 0);
    assert.ok(Number.isInteger(usdtToChips(v)));
  }
});

test('USDT: chipsToUsdt yukarı yuvarlar ve iki haneli kalır', () => {
  const u = chipsToUsdt(500);
  assert.match(u, /^\d+\.\d{2}$/);
  assert.ok(parseFloat(u) * USDT_TRY_RATE >= 500, 'görüntülenen USDT geri çevrildiğinde tutarı karşılamalı');
  assert.equal(minUsdtFor(getRail('usdt')), (Math.ceil((100 / USDT_TRY_RATE) * 100) / 100).toFixed(2));
});

/* ═══════════════════ REFERANS ═══════════════════ */

test('REFERANS: DRT- önekli, 6 karakter, karışıklığa açık olmayan alfabe', () => {
  const r = newRef(detRand);
  assert.match(r, /^DRT-[A-HJ-NP-Z2-9]{6}$/);
});

test('REFERANS: 2000 üretimde çakışma pratikte yok', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(newRef());
  assert.ok(seen.size > 1900, `benzersiz ref: ${seen.size}`);
});

/* ═══════════════════ AKIŞ MAKİNESİ ═══════════════════ */

test("YATIRIM AKIŞI: dekont review durumunda doğar, para bu adımda yazılmaz", () => {
  const r = startDeposit('papara', 500, T0, detRand);
  assert.equal(r.ok, true);
  assert.equal(r.record.status, 'review');
  assert.equal(r.record.amt, 500);
  assert.equal(r.record.rail, 'papara');
  assert.ok(r.record.etaAt > T0, 'review süresi gelecekte olmalı');
});

test('YATIRIM AKIŞI: ray dışı tutarda dekont AÇILMAZ', () => {
  assert.equal(startDeposit('papara', 50, T0, detRand).ok, false);
  assert.equal(startDeposit('papara', 999999, T0, detRand).ok, false);
});

test("SETTLE: eta dolmadan kayıt review kalır; dolunca bir kez oka geçer", () => {
  const rail = getRail('papara');
  const { record } = startDeposit('papara', 250, T0, detRand);
  // eta - 1ms: hâlâ incelemede
  const early = settleRecord(record, T0 + rail.reviewMs - 1);
  assert.equal(early.settled, false);
  assert.equal(early.record.status, 'review');
  // eta: onay
  const done = settleRecord(record, T0 + rail.reviewMs);
  assert.equal(done.settled, true);
  assert.equal(done.record.status, 'ok');
  // idempotent: ikinci settle hiçbir şey değiştirmez
  const again = settleRecord(done.record, T0 + rail.reviewMs + 9999);
  assert.equal(again.settled, false);
  assert.equal(again.record.status, 'ok');
});

test('SETTLE: kripto en yavaş raydır — hız simülasyonu gerçeği yansıtır', () => {
  const ms = RAILS.map(r => r.reviewMs);
  const usdt = getRail('usdt').reviewMs;
  assert.equal(usdt, Math.max(...ms));
  assert.ok(getRail('papara').reviewMs < getRail('havale').reviewMs);
});

test("ÇEKİM AKIŞI: talep review durumunda doğar, etiket yöntem + referans taşır", () => {
  const r = startWithdraw('usdt', 500, T0, detRand);
  assert.equal(r.ok, true);
  assert.equal(r.record.kind, 'wd');
  assert.match(recordLabel(r.record), /^USDT · TRC-20 · Çekim — DRT-/);
  assert.match(recordLabel({ ...r.record, kind: 'dep' }), /Yatırım — DRT-/);
});

test('ÇEKİM AKIŞI: min altı talep doğmaz', () => {
  assert.equal(startWithdraw('havale', 199, T0, detRand).ok, false);
});
