// DÜRTÜ — RTP yardımcıları ve invariant doğrulayıcıları.
// Ödeme tabloları veri değil, SÖZLEŞMEDİR. Bozuk tablo modül yüklenirken patlar.

/** Binom katsayısı C(n,k). */
export function binom(n, k) {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Simetrik binom dağılımlı (Plinko) tablo için beklenen RTP. */
export function binomialRtp(rows, multipliers) {
  return multipliers.reduce(
    (acc, v, i) => acc + (binom(rows, i) / 2 ** rows) * v,
    0
  );
}

/** Düzgün dağılımlı (çark) tablo için beklenen RTP. */
export function uniformRtp(segments) {
  if (!segments.length) return 0;
  return segments.reduce((a, b) => a + b, 0) / segments.length;
}

/**
 * Segment dizisini hedef RTP'ye ölçekler. 0'lar 0 kalır (kaybeden dilim).
 */
export function normalizeToRtp(segments, targetRtp) {
  const raw = uniformRtp(segments);
  if (!(raw > 0)) {
    throw new Error('RTP_NORMALIZE_INVALID: beklenen değer sıfır veya negatif');
  }
  const k = targetRtp / raw;
  return segments.map(v => (v === 0 ? 0 : Math.round(v * k * 100) / 100));
}

/** Sapma denetimi — ihlalde fırlatır. */
export function assertRtp(label, actual, target, tolerance = 0.01) {
  if (!Number.isFinite(actual) || Math.abs(actual - target) > tolerance) {
    throw new Error(
      `RTP_SAPMASI [${label}]: %${(actual * 100).toFixed(2)} — hedef %${(target * 100).toFixed(2)} (±%${(tolerance * 100).toFixed(0)})`
    );
  }
}
