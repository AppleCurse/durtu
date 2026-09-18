// DÜRTÜ — Plinko ödeme tabloları (saf).
//
// BLOCKER #3 düzeltmesi: 16 satır / low ve 16 satır / high tabloları 15 kova
// içeriyordu; n satırlı Plinko'da tam olarak n+1 kova olmalıdır. Üstelik
// (rows=16, risk='high') varsayılan açılış ayarıdır — her kullanıcı doğrudan
// bozuk konfigürasyona düşüyordu. Kova sayısı hatalı olunca binIndex clamp'i
// uçtaki topları son kovaya yığıyor ve 1000× çarpanın frekansı kontrolsüz kalıyordu.

import { binomialRtp, assertRtp } from './rtp.js';

export const PLINKO_TARGET_RTP = 0.99;

export const MULTIPLIERS = Object.freeze({
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    med: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  10: {
    low: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    med: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    high: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    med: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  14: {
    // low: eski tablo %99.65 veriyordu (hedeften %0.65 sapma) — düzeltildi.
    low: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
    med: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    high: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420],
  },
  16: {
    // 17 kova (16 + 1) — eskiden 15 idi.
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    med: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
});

export const PLINKO_ROWS = Object.keys(MULTIPLIERS).map(Number);
export const PLINKO_RISKS = ['low', 'med', 'high'];

// Yükleme anında invariant denetimi: kova sayısı VE RTP.
for (const [rowsKey, risks] of Object.entries(MULTIPLIERS)) {
  const n = Number(rowsKey);
  for (const [risk, arr] of Object.entries(risks)) {
    if (arr.length !== n + 1) {
      throw new Error(
        `PLINKO_TABLO_HATASI: ${n} satır / ${risk} → ${arr.length} kova, ${n + 1} olmalı`
      );
    }
    assertRtp(`plinko:${n}:${risk}`, binomialRtp(n, arr), PLINKO_TARGET_RTP, 0.01);
  }
}

export function getMultipliers(rows, risk) {
  return MULTIPLIERS[rows]?.[risk] ?? MULTIPLIERS[16].med;
}
