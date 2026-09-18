// DÜRTÜ — para katmanı: tek doğruluk kaynağı.
// Kural: bakiye ve bahis ASLA NaN/Infinity/negatif/ondalıklı olamaz.
// Bu modül bozuk değerin sisteme girmesini engelleyen tek kapıdır.

export const MIN_BALANCE = 0;
export const MAX_BALANCE = 1e12;
export const MIN_BET = 1;

/**
 * Her türlü girdiyi geçerli, sonlu, negatif olmayan tam sayı bakiyeye indirger.
 * @param {unknown} value
 * @param {number} fallback - value kurtarılamazsa dönecek güvenli değer
 * @returns {number}
 */
export function toChips(value, fallback = 1000) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return Number.isFinite(fallback) ? clampBalance(fallback) : 0;
  }
  return clampBalance(n);
}

function clampBalance(n) {
  return Math.min(MAX_BALANCE, Math.max(MIN_BALANCE, Math.trunc(n)));
}

/**
 * Bahis doğrulaması. 0, negatif, NaN, Infinity, ondalıklı ve bakiyeyi aşan reddedilir.
 * @param {unknown} bet
 * @param {unknown} balance
 * @returns {boolean}
 */
export function isValidBet(bet, balance) {
  const b = Number(bet);
  const bal = Number(balance);
  if (!Number.isFinite(b) || !Number.isFinite(bal)) return false;
  if (!Number.isInteger(b)) return false;
  if (b < MIN_BET) return false;
  return b <= bal;
}

/**
 * Ödeme tutarı doğrulaması — motorlardan gelen kazancın sisteme girmeden önceki filtresi.
 * @param {unknown} amount
 * @returns {boolean}
 */
export function isValidPayout(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n >= 0 && n <= MAX_BALANCE;
}

/**
 * Bahis girdisi normalizasyonu (UI input'ları için).
 * @param {unknown} raw
 * @param {number} fallback
 */
export function normalizeBet(raw, fallback = MIN_BET) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_BET, Math.trunc(n));
}
