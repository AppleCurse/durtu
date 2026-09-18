// DÜRTÜ — Provably Fair (kriptografik adillik) motoru (saf, bağımlılıksız).
//
// Sözleşme: tur BAŞLAMADAN kasa anahtarı (server seed) SHA-256 ile kilitlenir
// ve oyuncuya gösterilir; tur bittiğinde anahtar açığa çıkar. Oyuncu,
// (serverSeed, clientSeed, nonce) üçlüsünden sonucu BAĞIMSIZ yeniden
// hesaplayabilir → kasa sonuca sonradan müdahale edemez.
//
// Node ve tarayıcıda aynı çalışır: SHA-256 saf JS, rng zinciri sayaç modunda.
'use strict';

/* ═══════════ SHA-256 (saf JS, senkron) ═══════════ */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/** UTF-8 güvenli bayt dizisi. */
function toBytes(str) {
  const out = [];
  for (const ch of String(str)) {
    let cp = ch.codePointAt(0);
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

/** SHA-256 → hex string. */
export function sha256Hex(message) {
  const bytes = toBytes(message);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 64-bit uzunluk (big-endian) — 32-bit'te yeterlidir (mesajlar << 512MB)
  bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array(64);

  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(x => (x >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

/* ═══════════ Tohum → deterministik rng ═══════════ */

/**
 * Sayaç modunda SHA-256 zinciri: her 32 bayt bloğu 8 adet 32-bit söz üretir,
 * [0,1) aralığına normalize edilir. Aynı üçlü → aynı sonsuz akış.
 */
export function seededRng(serverSeed, clientSeed, nonce) {
  let counter = 0;
  let pool = [];
  let pos = 0;
  return function rng() {
    if (pos >= pool.length) {
      const hex = sha256Hex(`${serverSeed}:${clientSeed}:${nonce}#${counter++}`);
      pool = [];
      for (let i = 0; i + 8 <= hex.length; i += 8) {
        pool.push(parseInt(hex.slice(i, i + 8), 16) / 0x100000000);
      }
      pos = 0;
    }
    return pool[pos++];
  };
}

/* ═══════════ Commit / reveal sözleşmesi ═══════════ */

/** Tur öncesi kilit: kasa anahtarının SHA-256 özeti. */
export const commitHash = serverSeed => sha256Hex(serverSeed);

/** Kriptografik kasa anahtarı üretir (32 bayt hex). */
export function randomSeed() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const b = new Uint8Array(32);
    c.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }
  // crypto yoksa (eski ortam) — demo için kabul edilebilir yedek
  let s = '';
  for (let i = 0; i < 64; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/** Üçlünün tur kimliği: "serverSeed:clientSeed:nonce". */
export const roundKey = (serverSeed, clientSeed, nonce) => `${serverSeed}:${clientSeed}:${nonce}`;

/**
 * Bağımsız doğrulama: verilen üçlüden oyun sonucunu yeniden üretir.
 * @param {'crash'|'mines'} game
 * @returns {number|boolean[]} crash çarpanı veya 25'lik mayın grid'i
 */
export function replayRound(game, serverSeed, clientSeed, nonce, minesCount = 3) {
  const rng = seededRng(serverSeed, clientSeed, nonce);
  if (game === 'crash') {
    // crash.js ile BİREBİR aynı formül (import döngüsü yerine kopya sabitler)
    const p = 0.97 / (1 - rng());
    return Math.min(60, Math.max(1, Math.floor(p * 100) / 100));
  }
  if (game === 'mines') {
    const grid = Array(25).fill(false);
    let placed = 0, guard = 0;
    while (placed < minesCount && guard++ < 2500) {
      const idx = Math.floor(rng() * 25);
      if (!grid[idx]) { grid[idx] = true; placed++; }
    }
    return grid;
  }
  throw new RangeError(`FAIR_UNKNOWN_GAME: ${game}`);
}

/**
 * Tam doğrulama paketi: hash tutarlılığı + sonuç yeniden üretimi.
 * Paneldeki "KENDİN HESAPLA" aracının ve testlerin ortak kapısı.
 */
export function verifyRound({ game, serverSeed, clientSeed, nonce, minesCount, expectedHash, expectedResult }) {
  const hash = commitHash(serverSeed);
  const hashOk = expectedHash == null || expectedHash === hash;
  const replayed = replayRound(game, serverSeed, clientSeed, nonce, minesCount);
  let resultOk = true;
  if (expectedResult != null) {
    resultOk = Array.isArray(replayed)
      ? replayed.every((v, i) => v === expectedResult[i])
      : replayed === expectedResult;
  }
  return { hash, hashOk, replayed, resultOk, ok: hashOk && resultOk };
}
