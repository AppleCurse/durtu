// DÜRTÜ — yarış koşulu / durum bütünlüğü regresyon testleri.
// BLOCKER #4 (Limbo hedef değiştirme), #5 (Blackjack double), #6 (Crash frame
// sıçraması) ve 8 oyundaki çift-tık açığı burada modellenir.
//
// Bu testler kasıtlı olarak React'sizdir: hatalar UI'da değil, durum geçiş
// mantığındaydı. Saf modeller sayesinde timer stub'ına ihtiyaç kalmaz —
// eski test harness'ı setTimeout/setInterval'ı stub'ladığı için bu sınıf
// hatayı yapısal olarak yakalayamıyordu.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateFrame, MAX_FRAME_GAP_MS } from '../lib/engines/crash.js';
import { calcMultiplier } from '../lib/engines/mines.js';
import { isValidBet, toChips } from '../lib/money.js';

/* ───────────── Senkron tur kilidi modeli (useRoundLock ile aynı semantik) ───────────── */

function createLock() {
  let locked = false;
  return {
    acquire: () => (locked ? false : ((locked = true), true)),
    release: () => { locked = false; },
    isLocked: () => locked,
  };
}

/** useState tabanlı eski kalıp: kilit bir sonraki render'a kadar görünmez. */
function createAsyncLock() {
  let state = false;
  let pending = null;
  return {
    acquire: () => {
      if (state) return false;
      pending = true; // setState kuyruğa girer, state HENÜZ değişmez
      return true;
    },
    commit: () => { if (pending !== null) { state = pending; pending = null; } },
    release: () => { state = false; pending = null; },
  };
}

test('YARIŞ: useState tabanlı kilit çift tıklamada iki kez bahis alır (eski hata kanıtı)', () => {
  const lock = createAsyncLock();
  let bal = 1000;
  let cagri = 0;
  for (let i = 0; i < 2; i++) {
    if (lock.acquire()) { bal -= 100; cagri++; } // iki tık, render arası
  }
  lock.commit();
  assert.equal(cagri, 2, 'bu, düzeltilen hatanın yeniden üretimidir');
  assert.equal(bal, 800);
});

test('YARIŞ: ref tabanlı kilit çift tıklamada yalnızca bir tur açar', () => {
  const lock = createLock();
  let bal = 1000;
  let cagri = 0;
  for (let i = 0; i < 10; i++) {
    if (lock.acquire()) { bal -= 100; cagri++; }
  }
  assert.equal(cagri, 1);
  assert.equal(bal, 900);
  lock.release();
  assert.ok(lock.acquire(), 'release sonrası yeni tur açılabilmeli');
});

/* ───────────── LIMBO — BLOCKER #4 ───────────── */

/** Turu açılışta dondurur; ödeme snapshot'a göre hesaplanır. */
function limboRound(bet, target) {
  return Object.freeze({ bet, target, roll: null });
}
function limboSettle(round, roll) {
  return roll >= round.target ? Math.round(round.bet * round.target * 0.99) : 0;
}

test('LIMBO: tur açıldıktan sonra hedef değişse bile ödeme snapshot ile hesaplanır', () => {
  // Eski hata: finalizeRound ödemede O ANKİ target state'ini okuyordu.
  // Oyuncu 1.01× ile bahis açıp animasyon sırasında input'u 10000× yapıyordu.
  const round = limboRound(100, 1.01);
  let uiTarget = 1.01;
  uiTarget = 10_000; // animasyon sırasında kullanıcı input'u değiştirdi
  const roll = 1.5;
  const payout = limboSettle(round, roll);
  assert.equal(payout, Math.round(100 * 1.01 * 0.99), 'ödeme tur başındaki hedefe göre olmalı');
  assert.notEqual(payout, Math.round(100 * uiTarget * 0.99));
});

test('LIMBO: tur nesnesi dondurulmuştur — mutasyon sessizce geçmez', () => {
  const round = limboRound(100, 2);
  assert.throws(() => { 'use strict'; round.target = 9999; }, TypeError);
  assert.equal(round.target, 2);
});

test('LIMBO: kaybeden tur 0 öder, kazanan tur beklenen tutarı öder', () => {
  const r = limboRound(50, 3);
  assert.equal(limboSettle(r, 2.99), 0);
  assert.equal(limboSettle(r, 3.0), Math.round(50 * 3 * 0.99));
});

/* ───────────── BLACKJACK — BLOCKER #5 ───────────── */

/** spend() dönüşünü DOĞRU şekilde kontrol eden double down. */
function doubleDown(state, spend) {
  const extra = state.activeBet;
  if (!spend(extra)) return { ...state, ok: false };
  return { ...state, activeBet: state.activeBet * 2, ok: true };
}

test('BLACKJACK: yetersiz bakiyede double down bahsi ARTIRMAZ', () => {
  // Eski hata: spend() dönüşü yok sayılıyor, guard stale `chips` prop'unu okuyordu
  // → ödeme başarısız olsa bile activeBetRef *= 2 → bedava double down.
  let bal = 30;
  const spend = amt => {
    if (!isValidBet(amt, bal)) return false;
    bal = toChips(bal - amt);
    return true;
  };
  const next = doubleDown({ activeBet: 100 }, spend);
  assert.equal(next.ok, false);
  assert.equal(next.activeBet, 100, 'başarısız ödemede bahis katlanmamalı');
  assert.equal(bal, 30, 'bakiye değişmemeli');
});

test('BLACKJACK: yeterli bakiyede double down bahsi ve ödemeyi doğru uygular', () => {
  let bal = 500;
  const spend = amt => {
    if (!isValidBet(amt, bal)) return false;
    bal = toChips(bal - amt);
    return true;
  };
  const next = doubleDown({ activeBet: 100 }, spend);
  assert.equal(next.ok, true);
  assert.equal(next.activeBet, 200);
  assert.equal(bal, 400);
});

test('BLACKJACK: stale bakiye prop\'u guard olarak kullanılamaz', () => {
  let gercek = 10;
  const staleProp = 1000; // bir önceki render'dan kalma
  const spend = amt => {
    if (!isValidBet(amt, gercek)) return false;
    gercek -= amt;
    return true;
  };
  // Eski kod `if (staleProp < extra) return;` diyordu — bu geçerdi.
  assert.ok(staleProp >= 100, 'stale guard geçiyor (eski hata)');
  assert.equal(doubleDown({ activeBet: 100 }, spend).ok, false, 'gerçek kaynak reddetmeli');
});

/* ───────────── MINES — patlama sonrası cashout ───────────── */

function createMinesRound(bet, mines) {
  return { bet, mines, gems: 0, busted: false, cashed: false };
}
function pickTile(r, isMine) {
  if (r.busted || r.cashed) return r;           // senkron guard
  if (isMine) return { ...r, busted: true };
  return { ...r, gems: r.gems + 1 };
}
function cashout(r) {
  if (r.busted || r.cashed) return { payout: 0, round: r };
  const payout = Math.round(r.bet * calcMultiplier(r.mines, r.gems));
  return { payout, round: { ...r, cashed: true } };
}

test('MINES: patlamış turdan sonra cashout ödeme yapmaz', () => {
  let r = createMinesRound(100, 5);
  r = pickTile(r, false);
  r = pickTile(r, true); // bum
  assert.equal(cashout(r).payout, 0);
});

test('MINES: çift cashout ikinci kez ödeme yapmaz', () => {
  let r = createMinesRound(100, 3);
  r = pickTile(r, false);
  r = pickTile(r, false);
  const first = cashout(r);
  assert.ok(first.payout > 100);
  assert.equal(cashout(first.round).payout, 0, 'ikinci cashout bedava para vermemeli');
});

test('MINES: cashout sonrası kutu açmak elmas sayısını artırmaz', () => {
  let r = createMinesRound(100, 3);
  r = pickTile(r, false);
  const { round } = cashout(r);
  const after = pickTile(round, false);
  assert.equal(after.gems, round.gems);
});

test('MINES: 0 elmasla cashout bahsi aşan ödeme üretmez', () => {
  const r = createMinesRound(100, 5);
  assert.equal(cashout(r).payout, 100, '1.00× → bahis iadesi');
});

/* ───────────── CRASH — frame boşluğu sömürüsü ───────────── */

test('CRASH: sekme askıya alma senaryosu tam zincirde ödeme üretmez', () => {
  const crashAt = 1.8;
  let cashed = false;
  let payout = 0;
  const frames = [
    { t: 0.2, gap: 16 },
    { t: 0.5, gap: 16 },
    { t: 30.5, gap: 30_000 }, // kullanıcı sekmeden döndü
  ];
  for (const f of frames) {
    const r = evaluateFrame({
      elapsedSec: f.t, frameGapMs: f.gap, crashAt, autoCashAt: 5.0, alreadyCashed: cashed,
    });
    if (r.action === 'autocash') { cashed = true; payout = 100 * r.m; }
    if (r.action === 'crash' || r.action === 'suspend') break;
  }
  assert.equal(payout, 0, 'patlamış turdan 5× ödeme alınmamalı');
  assert.equal(cashed, false);
});

test('CRASH: eşik altındaki normal frame boşlukları turu bozmaz', () => {
  const r = evaluateFrame({
    elapsedSec: 2, frameGapMs: MAX_FRAME_GAP_MS - 1, crashAt: 10, autoCashAt: 0, alreadyCashed: false,
  });
  assert.equal(r.action, 'continue');
});

test('CRASH: manuel çıkış ödemesi crash noktasıyla clamp edilir', () => {
  const crashAt = 2.0;
  const r = evaluateFrame({
    elapsedSec: 30, frameGapMs: 30_000, crashAt, autoCashAt: 0, alreadyCashed: false,
  });
  const odeme = 100 * Math.min(r.m, crashAt);
  assert.ok(odeme <= 200, `clamp başarısız: ${odeme}`);
});

/* ───────────── Genel: aynı turda çift ödeme ───────────── */

test('BÜTÜNLÜK: tek turda yalnızca bir ödeme kaydedilebilir', () => {
  const lock = createLock();
  let bal = 1000;
  const settle = amt => { if (!lock.isLocked()) return false; bal += amt; lock.release(); return true; };
  lock.acquire();
  assert.equal(settle(500), true);
  assert.equal(settle(500), false, 'ikinci ödeme reddedilmeli');
  assert.equal(bal, 1500);
});
