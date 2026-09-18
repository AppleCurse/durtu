// DÜRTÜ — Hi-Lo kural motoru (saf).
//
// BLOCKER #2 düzeltmesi: eskiden hem "yüksek" hem "düşük" tahmininde EŞİTLİK
// oyuncu lehineydi (nextCard.v >= activeCard.v). Bu, As'ta "yüksek" ve Papaz'da
// "düşük" bahislerini %100 kazançlı yapıyordu (EV %105 → risksiz para basma).
// Ayrıca hiProb + loProb = 1.08 ile olasılık modeli tutarsızdı.
//
// Yeni kural (gerçek Hi-Lo standardı): EŞİTLİK KAYBEDER. Bu, house edge'in
// kaynağıdır ve olasılıkların toplamını 1'in altında tutar.

export const HILO_RTP = 0.98;
export const DECK_RANKS = 13;

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = [
  { r: 'A', v: 1 }, { r: '2', v: 2 }, { r: '3', v: 3 }, { r: '4', v: 4 },
  { r: '5', v: 5 }, { r: '6', v: 6 }, { r: '7', v: 7 }, { r: '8', v: 8 },
  { r: '9', v: 9 }, { r: '10', v: 10 }, { r: 'J', v: 11 }, { r: 'Q', v: 12 },
  { r: 'K', v: 13 },
];

export function randomCard(rng = Math.random) {
  const rank = RANKS[Math.floor(rng() * RANKS.length)];
  const suit = SUITS[Math.floor(rng() * SUITS.length)];
  return { ...rank, suit };
}

/**
 * Verilen kart için kesin olasılıklar ve adil çarpanlar.
 * p = 0 olan yön için çarpan null döner → o bahis KABUL EDİLMEZ (buton kilitli).
 */
export function hiloOdds(cardValue) {
  const higherCount = DECK_RANKS - cardValue; // kesin büyük
  const lowerCount = cardValue - 1;           // kesin küçük

  const pHigher = higherCount / DECK_RANKS;
  const pLower = lowerCount / DECK_RANKS;

  return {
    pHigher,
    pLower,
    pTie: 1 / DECK_RANKS,
    higherMult: pHigher > 0 ? Number((HILO_RTP / pHigher).toFixed(2)) : null,
    lowerMult: pLower > 0 ? Number((HILO_RTP / pLower).toFixed(2)) : null,
  };
}

/** Tahmin değerlendirmesi — eşitlik kayıptır. */
export function evaluateGuess(direction, activeCard, nextCard) {
  if (direction === 'hi') return nextCard.v > activeCard.v;
  if (direction === 'lo') return nextCard.v < activeCard.v;
  return false;
}
