'use client';
// DÜRTÜ — sorumlu oyun katmanı: kayıp limiti · gerçeklik molası · kendini men.
//
// Neden var: kulüp katmanı (kayıp iadesi + gece yakıtı) bir ELDE TUTMA
// mekaniğidir. "18+ · sorumlu oyun" yazısı tek başına bir karşı ağırlık
// değildir; gerçek düzenleyici karşı ağırlık oyuncunun kendi koyduğu ve
// sistemin AŞAMADIĞI sınırlardır. Bu modül o sınırların tek kapısıdır.
//
// Kurallar (hepsi test altında, bkz. tests/limits.test.js):
//   1. Limit SIKILAŞTIRMA anında yürürlüğe girer.
//   2. Limit GEVŞETME 24 saat sonra yürürlüğe girer — o zamana kadar eski,
//      daha sıkı değer geçerlidir (kızgınlık anında limiti açma refleksi kırılır).
//   3. Cool-off (kendini men) aktifken HİÇBİR bahis kabul edilmez.
//   4. Cool-off aktifken gece yakıtı VERİLMEZ — elde tutma kancası devre dışı.
//   5. Oturum net kaybı (bahis − kazanç) limite ulaşınca bahis durur;
//      kazanıp sonra kaybetmek limiti sıfırlamaz.
//   6. Gerçeklik molası aralık başına en fazla bir kez uyarır.

import { toChips } from './money.js';
import { log } from './logger.js';

export const LIMITS_KEY = 'durtu_react_limits';
export const LOOSEN_DELAY_MS = 24 * 60 * 60 * 1000;   // gevşetme bekleme süresi
export const MAX_LIMIT = 1e9;

/** Cool-off seçenekleri (dakika). 0 = mola yok. */
export const COOL_OFF_CHOICES = [
  { min: 60, label: '1 saat' },
  { min: 24 * 60, label: '24 saat' },
  { min: 7 * 24 * 60, label: '7 gün' },
  { min: 30 * 24 * 60, label: '30 gün' },
];

/** Limiti sıkılaştıran yön: değer küçüldükçe daha koruyucu. */
const TIGHTER = (next, prev) => next > 0 && (prev === 0 || next < prev);

/**
 * Zaman damgası / sayaç normalizasyonu.
 *
 * DİKKAT: burada bilerek `toChips` KULLANILMIYOR. `toChips` bir PARA kapısıdır ve
 * `MAX_BALANCE = 1e12` ile kırpılır; gerçek epoch milisaniyesi (~1.79e12) o
 * sınırın ÜSTÜNDEDİR. Zaman damgasını toChips'ten geçirmek cool-off'u her
 * okumada 1e12'ye kırpar, yani mola anında "bitmiş" görünür. (Bu hata test
 * tarafından yakalandı — bkz. tests/limits.test.js MOLA bloğu.)
 */
const int = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(n)) : fb;
};

/* ════════════════════ SAF ÇEKİRDEK ════════════════════ */

export function blankLimits(now = Date.now()) {
  return {
    sessionLossLimit: 0,     // 0 = kapalı
    realityCheckMin: 0,      // 0 = kapalı
    coolOffUntil: 0,         // 0 = mola yok
    pending: null,           // { key, value, at } — 24 saat sonra yürürlüğe girer
    sessionStartedAt: now,
    sessionWagered: 0,
    sessionWon: 0,
    lastRealityCheckAt: now,
    realityChecks: 0,
    betsBlocked: 0,
  };
}

export function normalizeLimits(raw, now = Date.now()) {
  const b = blankLimits(now);
  if (!raw || typeof raw !== 'object') return b;
  const num = (v, fb, max = MAX_LIMIT) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return fb;
    return Math.min(max, Math.trunc(n));
  };
  const pending =
    raw.pending && typeof raw.pending === 'object' && Number.isFinite(Number(raw.pending.value))
      ? { key: String(raw.pending.key), value: num(raw.pending.value, 0), at: num(raw.pending.at, now) }
      : null;
  return {
    sessionLossLimit: num(raw.sessionLossLimit, 0),
    realityCheckMin: num(raw.realityCheckMin, 0, 24 * 60),
    coolOffUntil: num(raw.coolOffUntil, 0, Number.MAX_SAFE_INTEGER),
    pending,
    sessionStartedAt: num(raw.sessionStartedAt, now, Number.MAX_SAFE_INTEGER),
    sessionWon: num(raw.sessionWon, 0),
    sessionWagered: num(raw.sessionWagered, 0),
    lastRealityCheckAt: num(raw.lastRealityCheckAt, now, Number.MAX_SAFE_INTEGER),
    realityChecks: num(raw.realityChecks, 0, 1e9),
    betsBlocked: num(raw.betsBlocked, 0, 1e9),
  };
}

/** Bekleyen gevşetme süresi dolduysa uygular (saf). */
export function applyPending(s, now = Date.now()) {
  const p = s.pending;
  if (!p || now < p.at) return s;
  const next = { ...s, pending: null };
  if (p.key === 'sessionLossLimit' || p.key === 'realityCheckMin') next[p.key] = p.value;
  return next;
}

/**
 * Limit değişikliği (saf). Sıkılaştırma anında, gevşetme 24 saat sonra.
 * @returns {{state:object, immediate:boolean, reason?:string}}
 */
export function setLimit(s, key, value, now = Date.now()) {
  if (key !== 'sessionLossLimit' && key !== 'realityCheckMin') {
    return { state: s, immediate: false, reason: 'UNKNOWN_KEY' };
  }
  const cur = applyPending(s, now);
  const v = Number.isFinite(Number(value)) ? Math.max(0, Math.min(MAX_LIMIT, Math.trunc(Number(value)))) : 0;
  if (v === cur[key]) return { state: cur, immediate: true, reason: 'NO_CHANGE' };
  if (TIGHTER(v, cur[key])) {
    return { state: { ...cur, [key]: v, pending: null }, immediate: true };
  }
  // Gevşetme: hemen değil, bekleme sonunda.
  return {
    state: { ...cur, pending: { key, value: v, at: now + LOOSEN_DELAY_MS } },
    immediate: false,
    reason: 'DEFERRED',
  };
}

/** Oturum net kaybı. */
export function sessionNetLossOf(s) {
  return Math.max(0, toChips(s?.sessionWagered, 0) - toChips(s?.sessionWon, 0));
}

/** Cool-off şu an aktif mi? */
export function isCoolingOff(s, now = Date.now()) {
  return int(s?.coolOffUntil, 0) > now;
}

/**
 * Bahis kabul edilebilir mi? Tüm oyunlar tek kapıdan geçer (page.spend).
 * @returns {{ok:boolean, reason?:string, netLoss?:number}}
 */
export function checkBet(s, bet, now = Date.now()) {
  if (isCoolingOff(s, now)) return { ok: false, reason: 'COOL_OFF' };
  const limit = toChips(s?.sessionLossLimit, 0);
  const netLoss = sessionNetLossOf(s);
  if (limit > 0 && netLoss >= limit) return { ok: false, reason: 'LOSS_LIMIT', netLoss };
  if (!Number.isFinite(Number(bet)) || Number(bet) <= 0) return { ok: false, reason: 'BAD_BET' };
  return { ok: true, netLoss };
}

/** Bir turu oturuma işler; gerçeklik molası gerekiyorsa işaretler (saf). */
export function noteRound(s, bet, win, now = Date.now()) {
  const cur = applyPending(s, now);
  const b = toChips(bet, 0);
  const w = toChips(win, 0);
  const next = {
    ...cur,
    sessionWagered: toChips(cur.sessionWagered + b, 0),
    sessionWon: toChips(cur.sessionWon + w, 0),
  };
  let realityCheck = false;
  const every = int(cur.realityCheckMin, 0) * 60000;
  if (every > 0 && now - int(cur.lastRealityCheckAt, now) >= every) {
    next.lastRealityCheckAt = now;
    next.realityChecks = int(cur.realityChecks, 0) + 1;
    realityCheck = true;
  }
  return { state: next, realityCheck, limitHit: !checkBet(next, 1, now).ok };
}

/** Kendini men. `minutes` 0 ise molayı kaldırır (kaldırma ANINDA olmaz). */
export function coolOff(s, minutes, now = Date.now()) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) {
    // Molayı erken bitirmek yok: süre dolmadan açılmaz.
    return { state: s, reason: 'EARLY_EXIT_BLOCKED' };
  }
  const until = now + Math.min(365 * 24 * 60, Math.trunc(m)) * 60000;
  return { state: { ...s, coolOffUntil: until }, reason: 'OK', until };
}

/** Yeni oturum: sayaçlar sıfırlanır, cool-off KALIR. */
export function resetSession(s, now = Date.now()) {
  return {
    ...s,
    sessionStartedAt: now,
    sessionWagered: 0,
    sessionWon: 0,
    lastRealityCheckAt: now,
  };
}

/* ════════════════════ KALICILIK ════════════════════ */

let _cache = null;

function notify(detail) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('durtu:limits', { detail }));
  } catch (err) {
    log.ignorable('limits.notify', err);
  }
}

function readLimits(now) {
  if (typeof window === 'undefined') return blankLimits(now);
  try {
    return normalizeLimits(JSON.parse(localStorage.getItem(LIMITS_KEY) || 'null'), now);
  } catch (err) {
    log.warn('limits.read', 'bozuk limit verisi sıfırlandı', { err: err?.message });
    return blankLimits(now);
  }
}

function writeNow(s) {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(LIMITS_KEY, JSON.stringify(s));
    return true;
  } catch (err) {
    log.critical('limits.write', err);
    return false;
  }
}

/** Güncel limitler (bekleyen gevşetme süresi dolduysa uygulanmış haliyle). */
export function getLimits(now = Date.now()) {
  const s = applyPending(_cache || readLimits(now), now);
  if (typeof window !== 'undefined') _cache = s;
  return s;
}

function commit(next, detail) {
  _cache = next;
  writeNow(next);
  notify(detail);
  return next;
}

export function resetLimits(now = Date.now()) {
  const s = blankLimits(now);
  _cache = s;
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(LIMITS_KEY); } catch (err) { log.ignorable('limits.reset', err); }
  }
  notify({ kind: 'reset' });
  return s;
}

/* ════════════════════ DIŞA AÇIKAN EYLEMLER ════════════════════ */

/** Bahis kapısı — page.spend() bunu her bahiste çağırır. */
export function gateBet(bet, now = Date.now()) {
  const s = getLimits(now);
  const r = checkBet(s, bet, now);
  if (!r.ok) {
    commit({ ...s, betsBlocked: int(s.betsBlocked, 0) + 1 }, { kind: 'blocked', reason: r.reason });
  }
  return r;
}

/** Her turda çağrılır (store.logRound üzerinden). Asla fırlatmaz. */
export function noteRoundLive(bet, win, now = Date.now()) {
  if (typeof window === 'undefined') return null;
  try {
    const { state, realityCheck, limitHit } = noteRound(getLimits(now), bet, win, now);
    commit(state, { kind: 'round', realityCheck, limitHit });
    return { state, realityCheck, limitHit };
  } catch (err) {
    log.critical('limits.noteRound', err, { bet: String(bet), win: String(win) });
    return null;
  }
}

export function setLimitLive(key, value, now = Date.now()) {
  const r = setLimit(getLimits(now), key, value, now);
  if (r.reason === 'UNKNOWN_KEY') return r;
  commit(r.state, { kind: 'set', key, immediate: r.immediate });
  return r;
}

export function coolOffLive(minutes, now = Date.now()) {
  const r = coolOff(getLimits(now), minutes, now);
  if (r.reason === 'OK') commit(r.state, { kind: 'cooloff', until: r.until });
  return r;
}

export function resetSessionLive(now = Date.now()) {
  return commit(resetSession(getLimits(now), now), { kind: 'session' });
}
