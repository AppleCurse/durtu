// DÜRTÜ — Provably Fair motoru testleri.
// Commit/reveal sözleşmesinin garantileri: determinizm, tutarlılık, dağılım.
'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sha256Hex, seededRng, commitHash, replayRound, verifyRound, roundKey,
} from '../lib/engines/provablyFair.js';

/* ═══════════ SHA-256 bilinen vektörler ═══════════ */

test('SHA256: boş girdi bilinen özet', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('SHA256: "abc" bilinen özet', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('SHA256: UTF-8 (Türkçe) girdi deterministik ve 64 hex', () => {
  const a = sha256Hex('dürTL-şölen-🎲');
  const b = sha256Hex('dürTL-şölen-🎲');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, sha256Hex('dürTL-şölen-🎳'));
});

/* ═══════════ Commit sözleşmesi ═══════════ */

test('COMMIT: hash kasa anahtarına bağlı ve tek yönlü tutarlı', () => {
  const seed = 'a1'.repeat(32);
  assert.equal(commitHash(seed), sha256Hex(seed));
  assert.notEqual(commitHash(seed), commitHash(seed.slice(0, -1) + 'a2'));
});

test('RNG: aynı üçlü aynı akışı, farklı nonce farklı akışı üretir', () => {
  const a = seededRng('s', 'c', 7);
  const b = seededRng('s', 'c', 7);
  const c = seededRng('s', 'c', 8);
  const seqA = Array.from({ length: 40 }, a);
  const seqB = Array.from({ length: 40 }, b);
  const seqC = Array.from({ length: 40 }, c);
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('RNG: sayaç modu 8 sözden sonra da akışı sürdürür (havuz yenilenir)', () => {
  const a = seededRng('s', 'c', 1);
  const vals = Array.from({ length: 100 }, a); // 8'lik 13 blok
  assert.equal(new Set(vals).size, 100); // çakışma yok denecek kadar az
});

/* ═══════════ Replay / verify ═══════════ */

test('CRASH: replay deterministik ve sınır içinde (1..60)', () => {
  const r1 = replayRound('crash', 's1', 'c1', 3);
  const r2 = replayRound('crash', 's1', 'c1', 3);
  assert.equal(r1, r2);
  assert.ok(r1 >= 1 && r1 <= 60);
});

test('CRASH: tohumlu dağılım hedef RTP bandında (100k tur, çoklu hedef)', () => {
  // Crash RTP'si hedef çarpanı üzerinden ölçülür: RTP(t) = t · P(crash >= t).
  // (1/crash ortalaması RTP DEĞİLDİR — E[1/X] yanıltır.)
  const N = 100000;
  for (const target of [1.5, 2, 5, 10]) {
    let wins = 0;
    for (let i = 0; i < N; i++) {
      if (replayRound('crash', 'srv' + i, 'cli', i % 97) >= target) wins++;
    }
    const rtp = target * (wins / N);
    assert.ok(rtp > 0.94 && rtp < 1.0, `hedef ${target}×: RTP ${(rtp * 100).toFixed(2)} band dışında`);
  }
});

test('MINES: replay tam istenen sayıda ve benzersiz mayın üretir', () => {
  for (const mc of [1, 3, 10, 24]) {
    const grid = replayRound('mines', 's', 'c', mc, mc);
    assert.equal(grid.length, 25);
    assert.equal(grid.filter(Boolean).length, mc);
  }
});

test('VERIFY: hash + sonuç tutarlılığı pozitif ve negatif durumda', () => {
  const server = 'ff'.repeat(32);
  const hash = commitHash(server);
  const result = replayRound('crash', server, 'client', 5);

  const ok = verifyRound({ game: 'crash', serverSeed: server, clientSeed: 'client', nonce: 5, expectedHash: hash, expectedResult: result });
  assert.equal(ok.ok, true);

  const bad = verifyRound({ game: 'crash', serverSeed: server, clientSeed: 'client', nonce: 6, expectedHash: hash, expectedResult: result });
  assert.equal(bad.resultOk, false);
  assert.equal(bad.ok, false);
});

test('VERIFY: bilinmeyen oyun RangeError fırlatır', () => {
  assert.throws(() => replayRound('rulet', 's', 'c', 1), RangeError);
});

test('ROUNDKEY: üçlü kimlik biçimi stabil', () => {
  assert.equal(roundKey('s', 'c', 4), 's:c:4');
});
