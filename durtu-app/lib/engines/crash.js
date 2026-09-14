// DÜRTÜ — Aviator (crash) kural motoru (saf).
//
// BLOCKER #6 düzeltmesi: eski loop'ta oto-çıkış kontrolü PATLAMA kontrolünden
// ÖNCE geliyordu. requestAnimationFrame arka plan sekmelerinde durduğu için
// kullanıcı 30 sn başka sekmeye geçip dönünce tek frame'de t 0.5 → 30 sıçrıyor,
// m = e^(0.14*30) ≈ 66 oluyordu. crash=1.8 / oto=5.0 ise oyuncu 5× ödeme alıyordu —
// oysa uçak 28 saniye önce patlamıştı. Manuel çıkışta da aynı sıçrama sömürülebiliyordu.
//
// Çözüm: (1) patlama her zaman önce değerlendirilir, (2) çarpan crash noktasıyla
// clamp edilir, (3) frame boşluğu eşiği aşılırsa tur askıya alınmış sayılır.

export const CRASH_RTP = 0.97;
export const CRASH_MAX = 60;
export const GROWTH_RATE = 0.14;
/** Bu süreden uzun frame boşluğu = sekme askıya alınmış. */
export const MAX_FRAME_GAP_MS = 400;

/** Çarpan üretimi — ölçülen RTP %97.0 (400k tur Monte Carlo). */
export function crashPoint(rng = Math.random) {
  const p = CRASH_RTP / (1 - rng());
  return Math.min(CRASH_MAX, Math.max(1, Math.floor(p * 100) / 100));
}

/** t saniyedeki ham çarpan. */
export function multiplierAt(t) {
  return Math.exp(GROWTH_RATE * t);
}

/**
 * Tek frame'in saf değerlendirmesi. UI'dan bağımsız olduğu için test edilebilir.
 * @returns {{action:'crash'|'suspend'|'autocash'|'continue', m:number}}
 */
export function evaluateFrame({ elapsedSec, frameGapMs, crashAt, autoCashAt, alreadyCashed }) {
  const raw = multiplierAt(elapsedSec);

  // 1) Patlama her şeyden önce gelir — çarpan crash noktasını asla aşmaz.
  if (raw >= crashAt) {
    return { action: 'crash', m: crashAt };
  }

  // 2) Frame kaybı varsa oto-çıkışı geriye dönük uygulama.
  if (frameGapMs > MAX_FRAME_GAP_MS) {
    return { action: 'suspend', m: Math.min(raw, crashAt) };
  }

  // 3) Sonra oto-çıkış.
  if (!alreadyCashed && autoCashAt > 1 && raw >= autoCashAt) {
    return { action: 'autocash', m: raw };
  }

  return { action: 'continue', m: raw };
}
