// DÜRTÜ — Şans Çarkı kural motoru (saf, React'ten bağımsız).
//
// BLOCKER #1 düzeltmesi: ham segmentlerin RTP'si %133 / %178 / %556 idi.
// Artık ham dizi yalnızca GÖRSEL DAĞILIMI tanımlar; ödeme değerleri
// hedef RTP'ye normalize edilir ve modül yüklenirken doğrulanır.

import { normalizeToRtp, uniformRtp, assertRtp } from './rtp.js';

export const WHEEL_TARGET_RTP = 0.985;

// Ham ağırlıklar — göreli dağılım/his. Mutlak ödeme DEĞİL.
const RAW_PRESETS = {
  low: [1.2, 1.5, 0, 1.2, 2.0, 0, 1.5, 3.0, 0, 1.2, 1.5, 0, 2.0, 1.2, 5.0, 0],
  med: [1.5, 0, 2.0, 0, 3.0, 1.5, 0, 5.0, 0, 2.0, 0, 1.5, 10.0, 0, 2.0, 0],
  high: [0, 2.0, 0, 0, 5.0, 0, 0, 10.0, 0, 0, 2.0, 0, 20.0, 0, 0, 50.0],
};

export const WHEEL_PRESETS = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_PRESETS).map(([k, v]) => [
      k,
      Object.freeze(normalizeToRtp(v, WHEEL_TARGET_RTP)),
    ])
  )
);

// Yükleme anında invariant denetimi — bozuk tablo asla prod'a gitmez.
for (const [risk, segs] of Object.entries(WHEEL_PRESETS)) {
  assertRtp(`wheel:${risk}`, uniformRtp(segs), WHEEL_TARGET_RTP, 0.01);
}

export const WHEEL_RISKS = Object.keys(WHEEL_PRESETS);

/** Kazanan segment indeksini seçer. */
export function spinWheelIndex(segments, rng = Math.random) {
  return Math.floor(rng() * segments.length);
}

/** Tur sonucunu hesaplar. */
export function settleWheel(bet, segments, index) {
  const mult = segments[index] ?? 0;
  return { mult, payout: Math.round(bet * mult) };
}
