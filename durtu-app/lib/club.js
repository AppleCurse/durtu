'use client';
// DÜRTÜ — kulüp katmanı: VIP kademe · kayıp iadesi (discount) · gece yakıtı.
//
// Sahadaki gerçek: Türk oyuncusunun site sadakati felsefeye değil
// "kaybettiğimde bana ne veriyorsun?" sorusuna bağlıdır. Bu modül o sorunun
// tek doğruluk kaynağıdır.
//
// Kurallar (hepsi test altında, bkz. tests/club.test.js):
//   1. Kademe ÖMÜR BOYU çevrime göre yükselir, gün sonunda düşmez.
//   2. İade NET kayıptan tahakkuk eder (bahis − kazanç). Brüt bahisten
//      iade vermek, "yüksek bahis oyna → küçük kazan → iadeyi topla"
//      döngüsünü açardı. Kazançlı günde iade 0'dır.
//   3. Günlük iade tavanı kademeyle sınırlıdır; aynı gün üst üste alınabilir
//      ama tavanı aşamaz.
//   4. Gece yakıtı yalnızca bakiye 0 iken, yeterince oynanmışsa ve günde
//      BİR kez verilir. Sıfır çevrimle bedava para yoktur.
//   5. Her tutar lib/money.js kapısından geçer: NaN/ondalık/negatif çıkmaz.

import { toChips } from './money.js';
import { getTodayKey } from './calendar.js';
import { log } from './logger.js';
import { isCoolingOff, getLimits } from './limits.js';

export const CLUB_KEY = 'durtu_react_club';

/**
 * VIP kademeleri. `min` = ömür boyu çevrim eşiği, `rate` = net kayıp iade oranı,
 * `cap` = günlük iade tavanı, `rescue` = gece yakıtı tutarı,
 * `rescueMin` = yakıt için gereken asgari ömür boyu çevrim.
 */
export const TIERS = [
  { id: 'misafir', name: 'Misafir',     icon: '🚪', min: 0,      rate: 0.10, cap: 1000,  rescue: 100, rescueMin: 500 },
  { id: 'uye',     name: 'Kulüp Üyesi', icon: '🎩', min: 10000,  rate: 0.12, cap: 2500,  rescue: 150, rescueMin: 1000 },
  { id: 'gumus',   name: 'Gümüş Loca',  icon: '🥈', min: 50000,  rate: 0.15, cap: 6000,  rescue: 250, rescueMin: 2500 },
  { id: 'altin',   name: 'Altın Loca',  icon: '👑', min: 150000, rate: 0.20, cap: 15000, rescue: 400, rescueMin: 5000 },
  { id: 'bogaz',   name: 'Boğaz Özel',  icon: '🌊', min: 500000, rate: 0.25, cap: 40000, rescue: 750, rescueMin: 10000 },
];

/* ════════════════════ SAF ÇEKİRDEK (localStorage yok → test edilebilir) ════════════════════ */

/** Ömür boyu çevrime karşılık gelen kademe. Sıra bozulsa bile son eşleşen kazanır. */
export function tierFor(lifeWagered) {
  const w = toChips(lifeWagered, 0);
  let best = TIERS[0];
  for (const t of TIERS) if (w >= t.min) best = t;
  return best;
}

/** Bir sonraki kademe (en üstteyse null). */
export function nextTierFor(lifeWagered) {
  const i = TIERS.findIndex(t => t.id === tierFor(lifeWagered).id);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

export function blankClub(today = getTodayKey()) {
  return {
    day: today,
    wagered: 0,        // bugünkü çevrim
    won: 0,            // bugünkü kazanç
    claimed: 0,        // bugün çekilen iade toplamı (günlük tavan sayacı)
    rescueDay: null,   // gece yakıtının verildiği gün
    lifeWagered: 0,    // kademe sayacı — asla sıfırlanmaz
    rebateTotal: 0,    // ömür boyu ödenen iade
    rescueTotal: 0,    // ömür boyu ödenen yakıt
  };
}

/** Bozuk/eksik alanı normalize eder. Eski sürümden gelen kayıt da buradan geçer. */
export function normalizeClub(raw, today = getTodayKey()) {
  const b = blankClub(today);
  if (!raw || typeof raw !== 'object') return b;
  const int = (v, fb) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : fb);
  return {
    day: typeof raw.day === 'string' && raw.day ? raw.day : b.day,
    wagered: int(raw.wagered, 0),
    won: int(raw.won, 0),
    claimed: int(raw.claimed, 0),
    rescueDay: typeof raw.rescueDay === 'string' && raw.rescueDay ? raw.rescueDay : null,
    lifeWagered: int(raw.lifeWagered, 0),
    rebateTotal: int(raw.rebateTotal, 0),
    rescueTotal: int(raw.rescueTotal, 0),
  };
}

/** Gün döndüyse gün içi sayaçları sıfırlar; kademe ve ömür boyu toplamlar kalır. */
export function rollDay(s, today = getTodayKey()) {
  if (s.day === today) return s;
  return { ...s, day: today, wagered: 0, won: 0, claimed: 0 };
}

/** Bugünün NET kaybı. Kazançlı günde 0 — asla negatif sızmaz. */
export function netLossOf(s) {
  return Math.max(0, toChips(s?.wagered, 0) - toChips(s?.won, 0));
}

/**
 * Şu an çekilebilir iade.
 * = min(net kayıp × kademe oranı, günlük tavan) − bugün zaten çekilen
 */
export function claimableOf(s, tier = tierFor(s?.lifeWagered)) {
  const gross = Math.floor(netLossOf(s) * tier.rate);
  const capped = Math.min(toChips(gross, 0), toChips(tier.cap, 0));
  return Math.max(0, capped - toChips(s?.claimed, 0));
}

/** Bir turu tahakkuka işler (saf; kalıcılık çağıranın işi). */
export function accrue(s, bet, win, today = getTodayKey()) {
  const r = rollDay(s, today);
  const b = toChips(bet, 0);
  const w = toChips(win, 0);
  return {
    ...r,
    wagered: toChips(r.wagered + b, 0),
    won: toChips(r.won + w, 0),
    lifeWagered: toChips(r.lifeWagered + b, 0),
  };
}

/**
 * Gece yakıtı uygunluk denetimi (saf).
 * @returns {{ok:boolean, amount?:number, reason?:string, tier:object}}
 */
export function rescueCheck(s, balance, today = getTodayKey()) {
  const tier = tierFor(s?.lifeWagered);
  if (toChips(balance, 0) > 0) return { ok: false, reason: 'BALANCE_POSITIVE', tier };
  if (toChips(s?.lifeWagered, 0) < tier.rescueMin) return { ok: false, reason: 'NOT_ENOUGH_PLAY', tier };
  if (s?.rescueDay === today) return { ok: false, reason: 'ALREADY_TODAY', tier };
  return { ok: true, amount: toChips(tier.rescue, 0), tier };
}

/* ════════════════════ KALICILIK: önbellek + gecikmeli yazım ════════════════════
 * logRound() her turda buraya dokunur. store.js ile aynı desen: tur başına
 * senkron localStorage yazımı yok; para hareketi (iade/yakıt) anında yazılır.
 */

let _cache = null;
let _flushHandle = 0;

function notify() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('durtu:club'));
  } catch (err) {
    log.ignorable('club.notify', err);
  }
}

function writeNow() {
  if (typeof window === 'undefined' || !_cache) return false;
  try {
    localStorage.setItem(CLUB_KEY, JSON.stringify(_cache));
    return true;
  } catch (err) {
    log.critical('club.write', err, { lifeWagered: _cache?.lifeWagered });
    return false;
  }
}

function scheduleFlush() {
  if (_flushHandle || typeof window === 'undefined') return;
  const run = () => { _flushHandle = 0; writeNow(); };
  _flushHandle =
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(run, { timeout: 1000 })
      : setTimeout(run, 250);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flushClub(); });
  // Çoklu sekme: başka sekmede alınan iade/yakıt bu sekmenin önbelleğini
  // bayatlatır. Önbelleği düşürüyoruz; bir sonraki okuma localStorage'tan gelir.
  window.addEventListener('storage', e => {
    if (e?.key === CLUB_KEY) {
      _cache = null;
      notify();
    }
  });
}

/** Bekleyen yazımı diske bastırır (sekme kapanışı / testler). */
export function flushClub() {
  if (_flushHandle) {
    if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(_flushHandle);
    } else {
      clearTimeout(_flushHandle);
    }
    _flushHandle = 0;
  }
  return writeNow();
}

/** Güncel kulüp kaydı (gün döndüyse sıfırlanmış haliyle). */
export function getClub(today = getTodayKey()) {
  const rolled = rollDay(_cache || readClub(today), today);
  // Sunucuda modül önbelleği tutulmaz: istekler arası sızmaması için.
  if (typeof window !== 'undefined') _cache = rolled;
  return rolled;
}

function readClub(today) {
  if (typeof window === 'undefined') return blankClub(today);
  try {
    return normalizeClub(JSON.parse(localStorage.getItem(CLUB_KEY) || 'null'), today);
  } catch (err) {
    log.warn('club.read', 'bozuk kulüp verisi sıfırlandı', { err: err?.message });
    return blankClub(today);
  }
}

function commit(next, { immediate = false } = {}) {
  _cache = next;
  if (immediate) writeNow(); else scheduleFlush();
  notify();
  return next;
}

/** Kulüp verisini tamamen sıfırlar (kullanıcı eylemi + testler). */
export function resetClub(today = getTodayKey()) {
  _cache = blankClub(today);
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(CLUB_KEY); } catch (err) { log.ignorable('club.reset', err); }
  }
  notify();
  return _cache;
}

/* ════════════════════ DIŞA AÇIKAN EYLEMLER ════════════════════ */

/**
 * Her turda çağrılır (store.logRound üzerinden). Asla fırlatmaz:
 * kulüp katmanındaki bir hata oyun turunu düşürmemeli.
 */
export function accrueRound(bet, win) {
  if (typeof window === 'undefined') return null;
  try {
    return commit(accrue(getClub(), bet, win));
  } catch (err) {
    log.critical('club.accrueRound', err, { bet: String(bet), win: String(win) });
    return null;
  }
}

/** Panelin okuduğu görünüm. */
export function clubView(today = getTodayKey()) {
  const s = getClub(today);
  const tier = tierFor(s.lifeWagered);
  const next = nextTierFor(s.lifeWagered);
  return {
    state: s,
    tier,
    next,
    toNext: next ? Math.max(0, next.min - s.lifeWagered) : 0,
    netLoss: netLossOf(s),
    claimable: claimableOf(s, tier),
    rescue: rescueCheck(s, 0, today), // bakiye panelde ayrıca denetlenir
  };
}

/**
 * Kayıp iadesini kasaya işler.
 * @returns {{ok:boolean, amount?:number, tier?:object, reason?:string}}
 */
export function claimRebate(today = getTodayKey()) {
  const s = getClub(today);
  const tier = tierFor(s.lifeWagered);
  const amount = claimableOf(s, tier);
  if (amount <= 0) {
    return { ok: false, reason: netLossOf(s) <= 0 ? 'NO_NET_LOSS' : 'NOTHING_CLAIMABLE', tier };
  }
  commit({
    ...s,
    claimed: toChips(s.claimed + amount, 0),
    rebateTotal: toChips(s.rebateTotal + amount, 0),
  }, { immediate: true });
  return { ok: true, amount, tier };
}

/**
 * Gece yakıtı: bakiye sıfırlandığında bir kez verilen telafi.
 * @param {number} balance — çağıranın güncel bakiyesi (tek doğruluk kaynağı)
 */
export function takeRescue(balance, today = getTodayKey()) {
  const s = getClub(today);
  const check = rescueCheck(s, balance, today);
  if (!check.ok) return { ok: false, reason: check.reason, tier: check.tier };
  // Oyuncu kendini men etmişken elde tutma kancası devre dışı: yakıt verilmez.
  if (isCoolingOff(getLimits())) return { ok: false, reason: 'COOL_OFF', tier: check.tier };
  commit({
    ...s,
    rescueDay: today,
    rescueTotal: toChips(s.rescueTotal + check.amount, 0),
  }, { immediate: true });
  return { ok: true, amount: check.amount, tier: check.tier };
}

/** Nav rozeti: oyuncunun yapabileceği bir kulüp eylemi var mı? */
export function clubBadge(balance, today = getTodayKey()) {
  const v = clubView(today);
  return {
    claimable: v.claimable,
    rescueReady: rescueCheck(v.state, balance, today).ok,
    tier: v.tier,
  };
}
