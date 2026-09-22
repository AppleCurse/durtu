// DÜRTÜ — kulüp katmanı testleri (VIP kademe · kayıp iadesi · gece yakıtı).
//
// Bu katman PARA hareket ettirir; o yüzden kurallar test altında:
//   · iade NET kayıptan doğar (brüt bahisten değil),
//   · günlük tavan aşılamaz,
//   · yakıt günde bir kez ve yalnızca kasa sıfırken verilir,
//   · hiçbir tutar NaN/ondalık/negatif olamaz.
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

const listeners = new Map();
globalThis.localStorage = new MemStorage();
globalThis.window = {
  dispatchEvent() { return true; },
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  removeEventListener() {},
};
const fire = (type, ev = {}) => (listeners.get(type) || []).forEach(fn => fn(ev));

const { getTodayKey } = await import('../lib/calendar.js');
const {
  TIERS, CLUB_KEY, tierFor, nextTierFor, blankClub, normalizeClub, rollDay,
  netLossOf, claimableOf, accrue, rescueCheck,
  getClub, clubView, claimRebate, takeRescue, accrueRound, clubBadge,
  flushClub, resetClub,
} = await import('../lib/club.js');

// accrueRound() gerçek saati kullanır; test de aynı anahtarı kullanmalı.
const TODAY = getTodayKey();
const OTHER_DAY = '2099-01-01';

beforeEach(() => {
  globalThis.localStorage.clear();
  resetClub(TODAY);          // modül içi önbelleği de sıfırlar
});

/* ═══════════════════ KADEME EŞİKLERİ ═══════════════════ */

test('TIER: kademe eşikleri sınır değerlerinde doğru seçilir', () => {
  assert.equal(tierFor(0).id, 'misafir');
  assert.equal(tierFor(9999).id, 'misafir');
  assert.equal(tierFor(10000).id, 'uye');
  assert.equal(tierFor(49999).id, 'uye');
  assert.equal(tierFor(50000).id, 'gumus');
  assert.equal(tierFor(150000).id, 'altin');
  assert.equal(tierFor(500000).id, 'bogaz');
  assert.equal(tierFor(9e9).id, 'bogaz');
});

test('TIER: bozuk/negatif çevrim en alt kademeye düşer', () => {
  for (const v of [NaN, undefined, null, -500, 'abc', {}, Infinity]) {
    assert.equal(tierFor(v).id, 'misafir', `${String(v)} yanlış kademe verdi`);
  }
});

test('TIER: eşik, iade oranı ve tavan kademeyle birlikte monoton artar', () => {
  for (let i = 1; i < TIERS.length; i++) {
    assert.ok(TIERS[i].min > TIERS[i - 1].min, 'eşik artmıyor');
    assert.ok(TIERS[i].rate > TIERS[i - 1].rate, 'oran artmıyor');
    assert.ok(TIERS[i].cap > TIERS[i - 1].cap, 'tavan artmıyor');
  }
});

test('TIER: nextTierFor en üst kademedeyse null döner', () => {
  assert.equal(nextTierFor(0).id, 'uye');
  assert.equal(nextTierFor(150000).id, 'bogaz');
  assert.equal(nextTierFor(999999), null);
});

/* ═══════════════════ NET KAYIP VE TAHAKKUK ═══════════════════ */

test('NET: iade net kayıptan doğar — kazançlı günde iade 0', () => {
  const s = accrue(blankClub(TODAY), 1000, 400, TODAY);
  assert.equal(netLossOf(s), 600);
  assert.equal(claimableOf(s, tierFor(0)), 60);      // Misafir %10
  const winning = accrue(blankClub(TODAY), 500, 5000, TODAY);
  assert.equal(netLossOf(winning), 0);
  assert.equal(claimableOf(winning, tierFor(0)), 0);
});

test('NET: bozuk tur verisi tahakkuka 0 olarak girer (NaN sızıntısı yok)', () => {
  let s = blankClub(TODAY);
  for (const [b, w] of [[NaN, 0], [undefined, undefined], ['abc', 'x'], [-100, -50], [Infinity, 0]]) {
    s = accrue(s, b, w, TODAY);
  }
  assert.ok(Number.isFinite(s.wagered) && Number.isFinite(s.won));
  assert.equal(s.wagered, 0);
  assert.equal(netLossOf(s), 0);
});

test('NET: ondalıklı bahis tam sayıya iner — kuruş sızıntısı yok', () => {
  const s = accrue(blankClub(TODAY), 100.99, 0.5, TODAY);
  assert.equal(s.wagered, 100);
  assert.equal(s.won, 0);
});

test('NET: claimable asla negatif olmaz (çekilen tavanı aşsa bile)', () => {
  const s = { ...blankClub(TODAY), wagered: 1000, won: 0, claimed: 5000 };
  assert.equal(claimableOf(s, tierFor(0)), 0);
});

/* ═══════════════════ GÜN DÖNÜŞÜ ═══════════════════ */

test('GÜN: aynı günde sayaçlar korunur, kayıt olduğu gibi döner', () => {
  const s = accrue(blankClub(TODAY), 500, 100, TODAY);
  assert.equal(rollDay(s, TODAY), s);               // aynı referans → gereksiz kopya yok
  assert.equal(s.wagered, 500);
});

test('GÜN: gün dönünce gün içi sayaçlar sıfırlanır, kademe ve toplamlar kalır', () => {
  const s = {
    ...accrue(blankClub(TODAY), 20000, 0, TODAY),
    claimed: 1000, rebateTotal: 1000, rescueDay: TODAY,
  };
  const next = rollDay(s, OTHER_DAY);
  assert.equal(next.wagered, 0);
  assert.equal(next.won, 0);
  assert.equal(next.claimed, 0);                     // günlük tavan sıfırlanır
  assert.equal(next.lifeWagered, 20000);             // kademe düşmez
  assert.equal(next.rebateTotal, 1000);
  assert.equal(next.rescueDay, TODAY);               // yakıt izi yeni günde tekrar açılır
});

/* ═══════════════════ KALICILIK + İADE AKIŞI ═══════════════════ */

test('İADE: tur tahakkuku clubView’a yansır ve oran doğru uygulanır', () => {
  accrueRound(1000, 200);
  flushClub();
  const v = clubView(TODAY);
  assert.equal(v.netLoss, 800);
  assert.equal(v.claimable, 80);                     // Misafir %10
  assert.equal(v.tier.id, 'misafir');
});

test('İADE: çekim tam tutarı verir, ikinci çekim boş döner', () => {
  accrueRound(1000, 0);
  const first = claimRebate(TODAY);
  assert.equal(first.ok, true);
  assert.equal(first.amount, 100);
  assert.equal(clubView(TODAY).state.claimed, 100);

  const second = claimRebate(TODAY);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'NOTHING_CLAIMABLE');
});

test('İADE: çekimden sonra yeni kayıp tekrar tahakkuk eder (anlık discount)', () => {
  accrueRound(1000, 0);
  assert.equal(claimRebate(TODAY).amount, 100);
  accrueRound(500, 0);
  assert.equal(clubView(TODAY).claimable, 50);
  assert.equal(claimRebate(TODAY).amount, 50);
});

test('İADE: kazançlı günde çekim reddedilir (NO_NET_LOSS)', () => {
  accrueRound(500, 900);
  const r = claimRebate(TODAY);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'NO_NET_LOSS');
});

test('NET: claimable kademe tavanıyla sınırlıdır (saf, kademeden bağımsız)', () => {
  const s = { ...blankClub(TODAY), wagered: 1000000, won: 0 };
  assert.equal(claimableOf(s, TIERS[0]), TIERS[0].cap);   // %10 = 100.000 → tavan 1.000
  assert.equal(claimableOf(s, TIERS[4]), TIERS[4].cap);
  assert.ok(claimableOf(s, TIERS[0]) < Math.floor(1000000 * TIERS[0].rate));
});

test('İADE: günlük tavan aşılamaz — dev kayıp bile kademe tavanında durur', () => {
  accrueRound(1000000, 0);
  const v = clubView(TODAY);
  assert.equal(v.tier.id, 'bogaz');                  // 1M çevrim en üst kademeye çıkarır
  assert.equal(v.netLoss, 1000000);
  const r = claimRebate(TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.amount, TIERS[4].cap);              // 40.000 — net kaybın %25’i (250.000) değil
  assert.ok(r.amount < Math.floor(v.netLoss * v.tier.rate));
  assert.equal(clubView(TODAY).claimable, 0);
});

test('İADE: kademe yükselince oran ve tavan da yükselir', () => {
  accrueRound(150000, 0);                            // → Altın Loca (%20, tavan 15.000)
  const v = clubView(TODAY);
  assert.equal(v.tier.id, 'altin');
  assert.equal(v.netLoss, 150000);
  assert.equal(v.claimable, 15000);                  // %20 = 30.000 → tavan 15.000
  assert.equal(claimRebate(TODAY).amount, 15000);
});

test('İADE: kayıt diske yazılır ve başka sekmeden okunabilir', () => {
  accrueRound(2000, 0);
  flushClub();
  const raw = JSON.parse(globalThis.localStorage.getItem(CLUB_KEY));
  assert.equal(raw.wagered, 2000);
  assert.equal(raw.lifeWagered, 2000);
  fire('storage', { key: CLUB_KEY });                // önbellek düşer → diskten okunur
  assert.equal(clubView(TODAY).netLoss, 2000);
});

test('İADE: bozuk kayıt çökmeden sıfırlanır', () => {
  globalThis.localStorage.setItem(CLUB_KEY, '{bozuk json');
  fire('storage', { key: CLUB_KEY });
  const v = clubView(TODAY);
  assert.equal(v.netLoss, 0);
  assert.equal(v.claimable, 0);
});

test('İADE: normalizeClub eski/eksik kaydı güvenle tamamlar', () => {
  const n = normalizeClub({ wagered: '300', won: null, claimed: 1.9, day: 42, lifeWagered: -5 }, TODAY);
  assert.equal(n.wagered, 300);
  assert.equal(n.won, 0);
  assert.equal(n.claimed, 1);
  assert.equal(n.day, TODAY);
  assert.equal(n.lifeWagered, 0);
  assert.deepEqual(normalizeClub(null, TODAY), blankClub(TODAY));
});

/* ═══════════════════ GECE YAKITI ═══════════════════ */

test('YAKIT: kasa doluyken verilmez', () => {
  accrueRound(5000, 0);
  const r = rescueCheck(getClub(TODAY), 250, TODAY);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'BALANCE_POSITIVE');
  assert.equal(takeRescue(250, TODAY).ok, false);
});

test('YAKIT: yeterli çevrim yoksa verilmez (sıfır oyunla bedava para yok)', () => {
  accrueRound(100, 100);
  const r = rescueCheck(getClub(TODAY), 0, TODAY);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'NOT_ENOUGH_PLAY');
});

test('YAKIT: kasa sıfırlanınca bir kez verilir, aynı gün ikincisi reddedilir', () => {
  accrueRound(5000, 0);
  const first = takeRescue(0, TODAY);
  assert.equal(first.ok, true);
  assert.equal(first.amount, TIERS[0].rescue);       // Misafir 100
  const second = takeRescue(0, TODAY);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'ALREADY_TODAY');
});

test('YAKIT: yeni günde tekrar açılır, kademe yükseldiyse tutar da büyür', () => {
  accrueRound(5000, 0);
  takeRescue(0, TODAY);
  assert.equal(rescueCheck(rollDay(getClub(TODAY), OTHER_DAY), 0, OTHER_DAY).ok, true);

  const rich = rollDay({ ...getClub(TODAY), lifeWagered: 200000 }, OTHER_DAY);
  assert.equal(rescueCheck(rich, 0, OTHER_DAY).amount, 400);   // Altın Loca
});

/* ═══════════════════ store.logRound ENTEGRASYONU ═══════════════════ */

test('ENTEGRASYON: her oyunun çağırdığı logRound iadeyi besler', async () => {
  const { logRound } = await import('../lib/store.js');
  logRound('Rulet Masası', 500, 0);
  logRound('Aviator', 500, 1200);
  flushClub();
  const v = clubView(TODAY);
  assert.equal(v.state.wagered, 1000);
  assert.equal(v.state.won, 1200);
  assert.equal(v.netLoss, 0);                        // gün kazançlı → iade yok
});

test('ENTEGRASYON: kayıplı tur serisi iadeyi büyütür', async () => {
  const { logRound } = await import('../lib/store.js');
  logRound('Mines Deluxe', 250, 0);
  logRound('Plinko', 250, 0);
  logRound('Hi-Lo', 250, 0);
  const v = clubView(TODAY);
  assert.equal(v.netLoss, 750);
  assert.equal(v.claimable, 75);
});

/* ═══════════════════ NAV ROZETİ ═══════════════════ */

test('ROZET: çekilebilir iade veya hazır yakıt varsa nav yanar', () => {
  assert.equal(clubBadge(1000, TODAY).claimable, 0);
  assert.equal(clubBadge(1000, TODAY).rescueReady, false);
  accrueRound(1000, 0);
  assert.equal(clubBadge(1000, TODAY).claimable, 100);
  assert.equal(clubBadge(0, TODAY).rescueReady, true);
  assert.equal(clubBadge(750, TODAY).rescueReady, false);
});
