'use client';
// Ortak oyun kaydı + Selin'in gözlemcisi (React port)
//
// Düzeltmeler:
//  · BLOCKER #7 — chips artık Number.isFinite ile doğrulanır (typeof NaN === 'number' tuzağı)
//  · PERF — her turda 2 senkron localStorage yazımı yerine bellek önbelleği + debounce flush
//  · HATA YÖNETİMİ — QuotaExceededError sessizce yutulmaz, kullanıcı uyarılır
//  · DST — gün anahtarı takvim günü üzerinden hesaplanır (86400000 çıkarma DST'de kayıyordu)

import { toChips } from './money.js';
import { log } from './logger.js';
import { say } from './toast.js';

const STATS_KEY = 'durtu_react_stats';
const LEDGER_KEY = 'durtu_react_ledger';
const PROFILE_KEY = 'durtu_react_profile';
const HIST_MAX = 80;
const LEDGER_MAX = 60;

export function blank() {
  return { spins: 0, wagered: 0, won: 0, big: 0, hist: [] };
}

/* ---------------- kalıcılık: önbellek + gecikmeli yazım ---------------- */

let _statsCache = null;
let _flushHandle = 0;
let _quotaWarned = false;

function readStats() {
  if (_statsCache) return _statsCache;
  if (typeof window === 'undefined') return blank();
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
    _statsCache = s && Array.isArray(s.hist) ? s : blank();
  } catch (err) {
    log.warn('store.readStats', 'bozuk istatistik verisi sıfırlandı', { err: err?.message });
    _statsCache = blank();
  }
  return _statsCache;
}

function writeStatsNow() {
  if (typeof window === 'undefined' || !_statsCache) return false;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(_statsCache));
    return true;
  } catch (err) {
    log.critical('store.saveStats', err, { histLen: _statsCache?.hist?.length });
    if (err?.name === 'QuotaExceededError') {
      _statsCache.hist.length = Math.min(_statsCache.hist.length, 20);
      try {
        localStorage.setItem(STATS_KEY, JSON.stringify(_statsCache));
        return true;
      } catch {
        /* düşer */
      }
    }
    if (!_quotaWarned) {
      _quotaWarned = true;
      say('⚠️ <b>Kayıt yapılamıyor.</b> Tarayıcı depolaman dolu veya gizli moddasın — ilerlemen saklanmayacak.');
    }
    return false;
  }
}

function scheduleFlush() {
  if (_flushHandle || typeof window === 'undefined') return;
  const run = () => {
    _flushHandle = 0;
    writeStatsNow();
  };
  _flushHandle =
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(run, { timeout: 1000 })
      : setTimeout(run, 250);
}

if (typeof window !== 'undefined') {
  // Sekme kapanırken bekleyen yazımı kaybetme
  window.addEventListener('pagehide', () => {
    if (_flushHandle) writeStatsNow();
  });
}

export function stats() {
  return readStats();
}

export function saveStats(s) {
  _statsCache = s;
  return writeStatsNow();
}

/* ---------------- tur kaydı ---------------- */

let _selinT = 0;

export function logRound(game, bet, win, mul) {
  if (typeof window === 'undefined') return;
  const safeBet = Number.isFinite(Number(bet)) ? Number(bet) : 0;
  const safeWin = Number.isFinite(Number(win)) ? Number(win) : 0;

  const s = readStats();
  s.hist.unshift({ ts: Date.now(), game, bet: safeBet, win: safeWin, mul: mul ?? null });
  if (s.hist.length > HIST_MAX) s.hist.length = HIST_MAX;
  s.spins++;
  s.wagered += safeBet;
  s.won += safeWin;
  s.big = Math.max(s.big, Math.max(0, safeWin - safeBet));
  scheduleFlush();

  if (safeWin > 0) {
    window.dispatchEvent(
      new CustomEvent('durtu:tick', { detail: { who: 'Sen', game, amt: safeWin, mul } })
    );
  }

  // Selin'in proaktif sesi: 4 ve 7 ardışık kayıpta ilgilenir (2 dk sükûnet)
  let streak = 0;
  for (const h of s.hist) {
    if (h.win > 0) break;
    streak++;
  }
  const now = Date.now();
  if ((streak === 4 || streak === 7) && now - _selinT > 120000) {
    _selinT = now;
    const msg =
      streak >= 7
        ? '💬 Selin: yedi turdur kazanın yok. Ara vermek zayıflık değil, disiplindir — rapora bakmak ister misin?'
        : '💬 Selin: "' + game + '" tarafında 4 eldir şansın yok. İstersen cazı açıp başka masaya geçelim?';
    window.dispatchEvent(new CustomEvent('durtu:selin', { detail: msg }));
  }
}

/* ---------------- defter ---------------- */

export function ledger() {
  if (typeof window === 'undefined') return [];
  try {
    const l = JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch (err) {
    log.warn('store.ledger', 'bozuk defter verisi sıfırlandı', { err: err?.message });
    return [];
  }
}

export function addLedger(type, label, amt, status) {
  if (typeof window === 'undefined') return null;
  const l = ledger();
  const entry = {
    id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    type,
    label,
    amt,
    status: status || 'ok',
  };
  l.unshift(entry);
  if (l.length > LEDGER_MAX) l.length = LEDGER_MAX;
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(l));
  } catch (err) {
    log.critical('store.addLedger', err, { type, amt });
  }
  return entry.id;
}

/** Bekleyen defter kaydını tamamlar (çekim onayı vb.). */
export function updateLedgerStatus(id, status) {
  if (typeof window === 'undefined' || !id) return;
  const l = ledger();
  const row = l.find(e => e.id === id);
  if (!row) return;
  row.status = status;
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(l));
  } catch (err) {
    log.critical('store.updateLedgerStatus', err, { id, status });
  }
}

/* ================= GÜNLÜK GİRİŞ / CHECK-IN VE PROFİL ================= */

export const DAILY_REWARDS = [
  { day: 1, bonus: 100, label: '1. Gün', icon: '☀️' },
  { day: 2, bonus: 125, label: '2. Gün', icon: '✨' },
  { day: 3, bonus: 150, label: '3. Gün', icon: '🔥' },
  { day: 4, bonus: 175, label: '4. Gün', icon: '⚡' },
  { day: 5, bonus: 200, label: '5. Gün', icon: '💎' },
  { day: 6, bonus: 225, label: '6. Gün', icon: '🌟' },
  { day: 7, bonus: 250, label: '7. Gün VIP', icon: '👑' },
];

export function getBonusForStreak(streak) {
  const s = Math.max(1, Number(streak) || 1);
  if (s >= 7) return 250;
  return DAILY_REWARDS[s - 1]?.bonus || 100 + (s - 1) * 25;
}

export function getTodayKey(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Dünün anahtarı — takvim günü üzerinden hesaplanır.
 * (Date.now() - 86400000 yaklaşımı DST geçişlerinde aynı güne veya iki gün öncesine düşüyordu.)
 */
export function getYesterdayKey(d = new Date()) {
  const y = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  y.setDate(y.getDate() - 1);
  return getTodayKey(y);
}

function defaultProfile() {
  return {
    name: 'Misafir',
    chips: 1000,
    streakDays: 0,
    lastCheckInDate: null,
    lastCheckInTime: null,
    lastCheckInBonus: 0,
  };
}

export function getProfile() {
  if (typeof window === 'undefined') return defaultProfile();
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        // NaN/Infinity/negatif/string tümü burada normalize edilir
        p.chips = toChips(p.chips, 1000);
        if (typeof p.name !== 'string' || !p.name) p.name = 'Misafir';
        if (!Number.isFinite(Number(p.streakDays))) p.streakDays = 0;
        return p;
      }
    }
  } catch (err) {
    log.warn('store.getProfile', 'bozuk profil verisi sıfırlandı', { err: err?.message });
  }
  return defaultProfile();
}

export function saveProfile(p) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch (err) {
    log.critical('store.saveProfile', err);
    if (!_quotaWarned) {
      _quotaWarned = true;
      say('⚠️ <b>Kayıt yapılamıyor.</b> Bakiyen bu oturumdan sonra saklanmayabilir.');
    }
  }
}

export function saveChips(amt) {
  if (typeof window === 'undefined') return;
  const p = getProfile();
  p.chips = toChips(amt, p.chips);
  saveProfile(p);
}

/**
 * İlk günlük giriş kontrolü ve bonus tahsisi.
 * @returns {object} { isNewCheckIn, bonus, streak, chips, alreadyCheckedIn, nextBonus }
 */
export function checkDailyLogin(userName, forceCheckIn = false) {
  if (typeof window === 'undefined') {
    return {
      isNewCheckIn: false, bonus: 0, streak: 1, chips: 1000,
      alreadyCheckedIn: false, nextBonus: 125,
    };
  }
  const today = getTodayKey();
  const yesterday = getYesterdayKey();
  const p = getProfile();

  if (userName && String(userName).trim()) {
    p.name = String(userName).trim().slice(0, 40);
  }

  const alreadyCheckedIn = p.lastCheckInDate === today;

  if (alreadyCheckedIn && !forceCheckIn) {
    return {
      isNewCheckIn: false,
      bonus: 0,
      streak: p.streakDays || 1,
      chips: toChips(p.chips, 1000),
      alreadyCheckedIn: true,
      lastCheckInBonus: p.lastCheckInBonus || 100,
      nextBonus: getBonusForStreak((p.streakDays || 1) + 1),
    };
  }

  const newStreak = p.lastCheckInDate === yesterday ? (p.streakDays || 0) + 1 : 1;
  const bonus = getBonusForStreak(newStreak);

  p.chips = toChips(toChips(p.chips, 1000) + bonus, 1000);
  p.streakDays = newStreak;
  p.lastCheckInDate = today;
  p.lastCheckInTime = Date.now();
  p.lastCheckInBonus = bonus;

  saveProfile(p);
  addLedger('deposit', `☀️ Günlük Giriş Bonusu (${newStreak}. Gün Serisi)`, bonus, 'ok');

  window.dispatchEvent(
    new CustomEvent('durtu:tick', {
      detail: { who: p.name || 'Sen', game: '☀️ Günlük Ritüel', amt: bonus },
    })
  );

  return {
    isNewCheckIn: true,
    bonus,
    streak: newStreak,
    chips: p.chips,
    alreadyCheckedIn: true,
    lastCheckInBonus: bonus,
    nextBonus: getBonusForStreak(newStreak + 1),
  };
}

export function getCheckInStatus() {
  if (typeof window === 'undefined') {
    return {
      checkedInToday: false, streak: 0, currentBonus: 100,
      nextBonus: 125, rewards: DAILY_REWARDS,
    };
  }
  const p = getProfile();
  const today = getTodayKey();
  const checkedInToday = p.lastCheckInDate === today;
  const streak = p.streakDays || 0;
  const currentBonus = getBonusForStreak(
    checkedInToday ? streak : streak === 0 ? 1 : streak + 1
  );
  const nextBonus = getBonusForStreak((streak || 0) + 1);

  return {
    checkedInToday,
    streak,
    currentBonus,
    nextBonus,
    lastCheckInBonus: p.lastCheckInBonus || 100,
    lastCheckInTime: p.lastCheckInTime,
    rewards: DAILY_REWARDS,
  };
}
