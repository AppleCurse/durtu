// DÜRTÜ — ekonomi / para katmanı testleri (BLOCKER #7).
// Bakiyenin kalıcı olarak NaN'a dönüşmesi ve spend() guard'ının atlanması
// bu projedeki en yıkıcı hataydı; bu dosya onun nöbetçisidir.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toChips, isValidBet, isValidPayout, normalizeBet,
  MIN_BET, MAX_BALANCE,
} from '../lib/money.js';

/* ═══════════════ toChips ═══════════════ */

test('toChips: NaN üreten her girdi güvenli değere düşer', () => {
  // Regresyon: typeof NaN === 'number' olduğu için eski guard NaN'ı geçiriyordu.
  const zehirli = [NaN, Infinity, -Infinity, undefined, null, '', 'abc', {}, [], 'ﬀ', '12abc'];
  for (const v of zehirli) {
    const r = toChips(v, 1000);
    assert.ok(Number.isFinite(r), `${String(v)} → ${r}`);
    assert.ok(Number.isInteger(r) && r >= 0);
  }
});

test('toChips: negatif bakiye sıfıra kırpılır', () => {
  assert.equal(toChips(-500), 0);
  assert.equal(toChips(-0.001), 0);
});

test('toChips: ondalık bakiye tam sayıya indirilir (kuruş sızıntısı yok)', () => {
  assert.equal(toChips(100.99), 100);
  assert.equal(toChips('250.7'), 250);
});

test('toChips: üst sınır uygulanır (taşma yok)', () => {
  assert.equal(toChips(Number.MAX_SAFE_INTEGER), MAX_BALANCE);
  assert.equal(toChips(1e30), MAX_BALANCE);
});

test('toChips: bozuk fallback bile NaN döndürmez', () => {
  assert.equal(toChips('abc', NaN), 0);
  assert.ok(Number.isFinite(toChips(undefined, undefined)));
});

test('toChips: geçerli sayısal string kabul edilir', () => {
  assert.equal(toChips('1500'), 1500);
  assert.equal(toChips(1500), 1500);
});

/* ═══════════════ isValidBet ═══════════════ */

test('isValidBet: NaN/Infinity bahis reddedilir', () => {
  // Regresyon: NaN < balance === false olduğu için spend() her zaman true dönüyordu.
  for (const v of [NaN, Infinity, -Infinity, undefined, null, 'abc', {}, []]) {
    assert.equal(isValidBet(v, 1000), false, `${String(v)} kabul edildi`);
  }
});

test('isValidBet: sıfır ve negatif bahis reddedilir', () => {
  // Negatif bahis kabul edilseydi spend(-100) bakiyeyi ARTIRIRDI.
  assert.equal(isValidBet(0, 1000), false);
  assert.equal(isValidBet(-100, 1000), false);
  assert.equal(isValidBet(-0.5, 1000), false);
});

test('isValidBet: ondalık bahis reddedilir', () => {
  assert.equal(isValidBet(10.5, 1000), false);
  assert.equal(isValidBet(0.1, 1000), false);
});

test('isValidBet: bakiyeyi aşan bahis reddedilir, tam bakiye kabul edilir', () => {
  assert.equal(isValidBet(1001, 1000), false);
  assert.equal(isValidBet(1000, 1000), true);
});

test('isValidBet: bakiye bozuksa hiçbir bahis kabul edilmez', () => {
  assert.equal(isValidBet(10, NaN), false);
  assert.equal(isValidBet(10, undefined), false);
  assert.equal(isValidBet(10, 'çok'), false);
});

test('isValidBet: minimum bahis sınırı uygulanır', () => {
  assert.equal(isValidBet(MIN_BET, 1000), true);
  assert.equal(isValidBet(MIN_BET - 1, 1000), false);
});

/* ═══════════════ isValidPayout ═══════════════ */

test('isValidPayout: Infinity ödeme reddedilir', () => {
  // Regresyon: Mines'ta gems > 25 - mines iken çarpan Infinity oluyordu.
  assert.equal(isValidPayout(Infinity), false);
  assert.equal(isValidPayout(NaN), false);
  assert.equal(isValidPayout(-1), false);
  assert.equal(isValidPayout(MAX_BALANCE + 1), false);
});

test('isValidPayout: sıfır ödeme geçerlidir (kaybedilen tur)', () => {
  assert.equal(isValidPayout(0), true);
  assert.equal(isValidPayout(12345), true);
});

/* ═══════════════ normalizeBet ═══════════════ */

test('normalizeBet: boş input minimuma düşer, kullanıcı NaN göremez', () => {
  for (const v of ['', null, undefined, 'abc', NaN]) {
    const r = normalizeBet(v, MIN_BET);
    assert.ok(Number.isFinite(r) && r >= MIN_BET, `${String(v)} → ${r}`);
  }
});

test('normalizeBet: negatif girdi minimuma kırpılır', () => {
  assert.equal(normalizeBet(-50), MIN_BET);
});

/* ═══════════════ Bütünsel ekonomi simülasyonu ═══════════════ */

test('EKONOMİ: 10.000 rastgele işlemden sonra bakiye hâlâ geçerli tam sayı', () => {
  let bal = toChips(1000);
  const kotu = [NaN, Infinity, -Infinity, undefined, null, 'abc', -50, 0.5, {}];
  for (let i = 0; i < 10_000; i++) {
    const bet = Math.random() < 0.3 ? kotu[i % kotu.length] : Math.ceil(Math.random() * 100);
    if (isValidBet(bet, bal)) bal = toChips(bal - Number(bet));
    const win = Math.random() < 0.3 ? kotu[(i + 3) % kotu.length] : Math.floor(Math.random() * 200);
    if (isValidPayout(win)) bal = toChips(bal + Number(win));
    assert.ok(Number.isInteger(bal) && bal >= 0 && bal <= MAX_BALANCE, `adım ${i}: ${bal}`);
  }
});

test('EKONOMİ: bakiye asla sıfırın altına inmez', () => {
  let bal = toChips(100);
  for (let i = 0; i < 500; i++) {
    const bet = 30;
    if (isValidBet(bet, bal)) bal = toChips(bal - bet);
    assert.ok(bal >= 0, `negatif bakiye: ${bal}`);
  }
  assert.equal(bal, 10, 'yetersiz bakiyede bahis alınmamalı');
});
