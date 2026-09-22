// DÜRTÜ — sorumlu oyun katmanı testleri (kayıp limiti · gerçeklik molası · mola).
//
// Bu katman oyuncunun koyduğu sınırın SİSTEM TARAFINDAN AŞILAMAMASINI garanti eder.
// Test edilen asıl şey budur: para katmanından ÖNCE çalışan tek kapı.
'use strict';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, opts = {}) { super(type, opts); this.detail = opts.detail; }
  };
}

globalThis.localStorage = new MemStorage();
globalThis.window = {
  dispatchEvent() { return true; },
  addEventListener() {},
  removeEventListener() {},
};

const {
  LOOSEN_DELAY_MS, COOL_OFF_CHOICES, blankLimits, normalizeLimits, applyPending,
  setLimit, sessionNetLossOf, isCoolingOff, checkBet, noteRound, coolOff, resetSession,
  getLimits, gateBet, noteRoundLive, setLimitLive, coolOffLive, resetLimits,
} = await import('../lib/limits.js');

const T0 = 1_800_000_000_000;   // sabit saat — testler duvar saatine bağlı değil

beforeEach(() => {
  globalThis.localStorage.clear();
  resetLimits(T0);
});

/* ═══════════════════ SIKILAŞTIRMA / GEVŞETME ASİMETRİSİ ═══════════════════ */

test('LİMİT: sıkılaştırma ANINDA yürürlüğe girer', () => {
  const r = setLimit(blankLimits(T0), 'sessionLossLimit', 500, T0);
  assert.equal(r.immediate, true);
  assert.equal(r.state.sessionLossLimit, 500);
  assert.equal(r.state.pending, null);
});

test('LİMİT: gevşetme 24 saat sonraya ertelenir, o zamana kadar eski sınır geçerli', () => {
  let r = setLimit(blankLimits(T0), 'sessionLossLimit', 500, T0);
  r = setLimit(r.state, 'sessionLossLimit', 5000, T0 + 1000);
  assert.equal(r.immediate, false);
  assert.equal(r.reason, 'DEFERRED');
  assert.equal(r.state.sessionLossLimit, 500, 'gevşetme hemen uygulanmamalı');
  assert.equal(r.state.pending.value, 5000);
  assert.equal(r.state.pending.at, T0 + 1000 + LOOSEN_DELAY_MS);
  // 24 saat dolmadan hâlâ sıkı sınır
  assert.equal(applyPending(r.state, T0 + LOOSEN_DELAY_MS).sessionLossLimit, 500);
  // süre dolunca gevşer
  assert.equal(applyPending(r.state, T0 + 1000 + LOOSEN_DELAY_MS).sessionLossLimit, 5000);
});

test('LİMİT: kapatmak (0) da gevşetmedir — anında kapanmaz', () => {
  const a = setLimit(blankLimits(T0), 'sessionLossLimit', 500, T0);
  const b = setLimit(a.state, 'sessionLossLimit', 0, T0 + 1);
  assert.equal(b.immediate, false);
  assert.equal(b.state.sessionLossLimit, 500, 'limit kızgınlık anında kapatılamaz');
});

test('LİMİT: bilinmeyen anahtar reddedilir, durum değişmez', () => {
  const s = blankLimits(T0);
  const r = setLimit(s, 'chips', 999999, T0);
  assert.equal(r.reason, 'UNKNOWN_KEY');
  assert.equal(r.state, s);
});

test('LİMİT: bozuk değer NaN olarak sızmaz', () => {
  for (const v of [NaN, undefined, null, 'abc', -500, Infinity]) {
    const r = setLimit(blankLimits(T0), 'sessionLossLimit', v, T0);
    assert.ok(Number.isFinite(r.state.sessionLossLimit), `${String(v)} → ${r.state.sessionLossLimit}`);
  }
});

/* ═══════════════════ BAHİS KAPISI ═══════════════════ */

test('KAPI: limit yokken bahis geçer', () => {
  assert.equal(checkBet(blankLimits(T0), 100, T0).ok, true);
});

test('KAPI: oturum net kaybı limite ulaşınca bahis durur', () => {
  let s = setLimit(blankLimits(T0), 'sessionLossLimit', 500, T0).state;
  s = noteRound(s, 1000, 400, T0).state;               // net kayıp 600
  const r = checkBet(s, 10, T0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'LOSS_LIMIT');
  assert.equal(r.netLoss, 600);
});

test('KAPI: kayıp limiti NET kayıp üzerinden çalışır (brüt bahis değil)', () => {
  let s = setLimit(blankLimits(T0), 'sessionLossLimit', 500, T0).state;
  s = noteRound(s, 1000, 700, T0).state;   // 1000 çevrim, ama net kayıp 300 → sınır aşmadı
  assert.equal(sessionNetLossOf(s), 300);
  assert.equal(checkBet(s, 10, T0).ok, true);
  s = noteRound(s, 500, 0, T0).state;      // net kayıp 800 → kapı kapandı
  assert.equal(checkBet(s, 10, T0).ok, false);
});

test('KAPI: geçersiz bahis reddedilir', () => {
  for (const b of [NaN, 0, -10, undefined, 'abc']) {
    assert.equal(checkBet(blankLimits(T0), b, T0).ok, false, `${String(b)} kabul edildi`);
  }
});

test('MOLA: cool-off aktifken HİÇBİR bahis kabul edilmez', () => {
  const s = coolOff(blankLimits(T0), 60, T0).state;
  assert.equal(isCoolingOff(s, T0 + 1000), true);
  const r = checkBet(s, 1, T0 + 1000);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'COOL_OFF');
});

test('MOLA: süre dolunca bahis tekrar açılır', () => {
  const s = coolOff(blankLimits(T0), 60, T0).state;
  assert.equal(isCoolingOff(s, T0 + 61 * 60000), false);
  assert.equal(checkBet(s, 100, T0 + 61 * 60000).ok, true);
});

test('MOLA: erken çıkış YOK — süre dolmadan açılamaz', () => {
  const s = coolOff(blankLimits(T0), 60, T0).state;
  const r = coolOff(s, 0, T0 + 1000);
  assert.equal(r.reason, 'EARLY_EXIT_BLOCKED');
  assert.equal(r.state.coolOffUntil, s.coolOffUntil);
});

test('MOLA: seçenekler pozitif ve artan', () => {
  let prev = 0;
  for (const c of COOL_OFF_CHOICES) {
    assert.ok(c.min > prev, 'mola seçenekleri artan olmalı');
    assert.ok(Number.isFinite(c.min) && c.min > 0);
    prev = c.min;
  }
});

test('MOLA: 1 yıldan uzun mola 1 yılda kırpılır', () => {
  const r = coolOff(blankLimits(T0), 99999999, T0);
  assert.ok(r.until - T0 <= 365 * 24 * 60 * 60000);
});

/* ═══════════════════ GERÇEKLİK MOLASI ═══════════════════ */

test('GERÇEKLİK: aralık dolmadan uyarmaz, dolunca bir kez uyarır', () => {
  let s = setLimit(blankLimits(T0), 'realityCheckMin', 15, T0).state;
  assert.equal(noteRound(s, 100, 0, T0 + 5 * 60000).realityCheck, false);
  const hit = noteRound(s, 100, 0, T0 + 16 * 60000);
  assert.equal(hit.realityCheck, true);
  assert.equal(hit.state.realityChecks, 1);
  // aynı turda ikinci kez uyarmaz
  assert.equal(noteRound(hit.state, 100, 0, T0 + 16 * 60000 + 1000).realityCheck, false);
});

test('GERÇEKLİK: kapalıyken (0) hiç uyarı üretmez', () => {
  const r = noteRound(blankLimits(T0), 100, 0, T0 + 99 * 3600000);
  assert.equal(r.realityCheck, false);
  assert.equal(r.state.realityChecks, 0);
});

/* ═══════════════════ OTURUM + KALICILIK ═══════════════════ */

test('OTURUM: sayaç sıfırlama limiti ve molayı KORUR', () => {
  let s = setLimit(blankLimits(T0), 'sessionLossLimit', 500, T0).state;
  s = coolOff(s, 60, T0).state;
  s = noteRound(s, 1000, 0, T0).state;
  const r = resetSession(s, T0 + 1000);
  assert.equal(r.sessionWagered, 0);
  assert.equal(r.sessionWon, 0);
  assert.equal(r.sessionLossLimit, 500, 'limit sıfırlanamaz');
  assert.equal(r.coolOffUntil, s.coolOffUntil, 'mola sıfırlanamaz');
});

test('KALICILIK: normalizeLimits bozuk kaydı güvenle tamamlar', () => {
  const n = normalizeLimits({ sessionLossLimit: '250', realityCheckMin: -5, coolOffUntil: 'x', pending: 3 }, T0);
  assert.equal(n.sessionLossLimit, 250);
  assert.equal(n.realityCheckMin, 0);
  assert.equal(n.coolOffUntil, 0);
  assert.equal(n.pending, null);
  assert.deepEqual(normalizeLimits(null, T0), blankLimits(T0));
});

/* ═══════════════════ store.logRound ENTEGRASYONU ═══════════════════ */

test('ENTEGRASYON: her oyunun çağırdığı logRound oturumu besler', async () => {
  setLimitLive('sessionLossLimit', 1000, T0);
  const { logRound } = await import('../lib/store.js');
  logRound('Rulet Masası', 400, 0);
  logRound('Plinko', 400, 100);
  const s = getLimits();
  assert.equal(s.sessionWagered, 800);
  assert.equal(s.sessionWon, 100);
  assert.equal(sessionNetLossOf(s), 700);
});

test('CANLI: noteRoundLive limit bayrağını döndürür ve diske yazar', () => {
  const t = Date.now();
  setLimitLive('sessionLossLimit', 100, t);
  const r = noteRoundLive(500, 0);
  assert.equal(r.limitHit, true);
  assert.equal(r.realityCheck, false);
  assert.equal(getLimits().sessionWagered, 500);
  assert.equal(JSON.parse(globalThis.localStorage.getItem('durtu_react_limits')).sessionWagered, 500);
});

test('ENTEGRASYON: mola sırasında gateBet bahsi reddeder ve sayaç işler', async () => {
  coolOffLive(60, Date.now());
  const r = gateBet(100);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'COOL_OFF');
  assert.equal(getLimits().betsBlocked, 1);
});

test('ENTEGRASYON: mola sırasında gece yakıtı verilmez (elde tutma kancası kapalı)', async () => {
  const { accrueRound, takeRescue, resetClub } = await import('../lib/club.js');

  resetClub();
  resetLimits();
  accrueRound(5000, 0);
  assert.equal(takeRescue(0).ok, true, 'mola yokken yakıt verilmeli');

  resetClub();
  resetLimits();
  accrueRound(5000, 0);
  coolOffLive(60, Date.now());
  const r = takeRescue(0);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'COOL_OFF');
});
