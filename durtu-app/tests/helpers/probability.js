// Test yardımcıları — olasılık ağırlıklı RTP hesapları.

export function binom(n, k) {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Plinko: kova olasılıkları binom(n, i) / 2^n. */
export function binomialRtp(rows, mults) {
  return mults.reduce((acc, v, i) => acc + (binom(rows, i) / 2 ** rows) * v, 0);
}

/** Çark: tüm dilimler eşit olasılıklı. */
export function uniformRtp(segments) {
  if (!segments.length) return 0;
  return segments.reduce((a, b) => a + b, 0) / segments.length;
}

/** Deterministik RNG — tohumlanabilir (xorshift32). */
export function seededRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
