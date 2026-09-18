// DÜRTÜ — store regresyon testleri (check-in ritüeli + favoriler).
// Legacy monolitin (eski tests/engine.test.js) check-in/favori kapsamasının portu.
// Saf Node: tarayıcı API'leri minimale indirgenmiş stub'larla sağlanır.
'use strict';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ---------- Minimal tarayıcı stub'ları ---------- */
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
  checkDailyLogin,
  getCheckInStatus,
  getProfile,
  saveProfile,
  getTodayKey,
  getYesterdayKey,
  getFavs,
  toggleFav,
} = await import('../lib/store.js');

beforeEach(() => { globalThis.localStorage.clear(); });

/* ═══════════ GÜNLÜK GİRİŞ / CHECK-IN (legacy port) ═══════════ */

test('CHECK-IN: günün ilk girişinde +100 dürTL günlük ritüel bonusu eklenir', () => {
  const res = checkDailyLogin('Emre');
  assert.equal(res.isNewCheckIn, true);
  assert.equal(res.bonus, 100);
  assert.equal(res.chips, 1100);
});

test('CHECK-IN: ilk gün girişinde seri 1 olarak başlar', () => {
  const res = checkDailyLogin('Emre');
  assert.equal(res.streak, 1);
  assert.equal(getCheckInStatus().checkedInToday, true);
});

test('CHECK-IN: aynı gün ikinci girişte mükerrer bonus verilmez', () => {
  checkDailyLogin('Emre');
  const again = checkDailyLogin('Emre');
  assert.equal(again.isNewCheckIn, false);
  assert.equal(again.bonus, 0);
  assert.equal(again.chips, 1100); // 1200 DEĞİL
});

test('CHECK-IN: dün giriş yapılmışsa seri 1 artar (1 -> 2) ve bonus büyür', () => {
  checkDailyLogin('Emre'); // gün 1
  // Saati geri alamayız; profilin son giriş tarihini "dün" yaparız.
  const p = getProfile();
  p.lastCheckInDate = getYesterdayKey();
  p.streakDays = 1;
  saveProfile(p);

  const res = checkDailyLogin('Emre');
  assert.equal(res.isNewCheckIn, true);
  assert.equal(res.streak, 2);
  assert.equal(res.bonus, 125); // 2. gün bonusu
});

test('CHECK-IN: seri kopuksa (2 gün önce) yeniden 1\'e döner', () => {
  const p = getProfile();
  p.lastCheckInDate = '2000-01-01';
  p.streakDays = 5;
  saveProfile(p);

  const res = checkDailyLogin('Emre');
  assert.equal(res.streak, 1);
  assert.equal(res.bonus, 100);
});

test('CHECK-IN: bugünün anahtarı YYYY-AA-GG biçiminde', () => {
  assert.match(getTodayKey(), /^\d{4}-\d{2}-\d{2}$/);
});

/* ═══════════ FAVORİLER (legacy port) ═══════════ */

test('FAV: boş durumda getFavs boş dizi döner', () => {
  assert.deepEqual(getFavs(), []);
});

test('FAV: toggleFav ekler, ikinci çağrıda çıkarır', () => {
  toggleFav('gates');
  assert.deepEqual(getFavs(), ['gates']);
  toggleFav('gates');
  assert.deepEqual(getFavs(), []);
});

test('FAV: bozuk localStorage verisi boş diziye düşer (çökmez)', () => {
  globalThis.localStorage.setItem('durtu_react_favs', '{bozuk');
  assert.deepEqual(getFavs(), []);
  globalThis.localStorage.setItem('durtu_react_favs', '[1,2,null]');
  assert.deepEqual(getFavs(), []); // yalnızca string kimlikler geçer
});
