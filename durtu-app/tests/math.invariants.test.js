// DÜRTÜ — matematik invariant testleri.
// Canlıya çıkmış 5 RTP/olasılık blocker'ının nöbetçisi.
// Çalıştırma: npm test   (node --test tests/)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { binomialRtp, uniformRtp, seededRng } from './helpers/probability.js';
import { WHEEL_PRESETS, WHEEL_TARGET_RTP, settleWheel, spinWheelIndex } from '../lib/engines/wheel.js';
import { MULTIPLIERS, getMultipliers } from '../lib/engines/plinko.js';
import { calcMultiplier, placeMines, GRID_SIZE } from '../lib/engines/mines.js';
import { hiloOdds, evaluateGuess, randomCard, HILO_RTP } from '../lib/engines/hilo.js';
import { crashPoint, evaluateFrame, multiplierAt, CRASH_MAX } from '../lib/engines/crash.js';

/* ═══════════════ ÇARK — BLOCKER #1 ═══════════════ */

test('ÇARK: her risk seviyesi hedef RTP içinde (±%1)', () => {
  for (const [risk, segs] of Object.entries(WHEEL_PRESETS)) {
    const rtp = uniformRtp(segs);
    assert.ok(
      Math.abs(rtp - WHEEL_TARGET_RTP) < 0.01,
      `${risk}: %${(rtp * 100).toFixed(2)} — hedef %${(WHEEL_TARGET_RTP * 100).toFixed(1)}`
    );
  }
});

test('ÇARK: hiçbir risk seviyesinde negatif house edge yok', () => {
  // Regresyon: eski tablolar low %133.1 / med %178.1 / high %556.3 RTP veriyordu.
  for (const [risk, segs] of Object.entries(WHEEL_PRESETS)) {
    assert.ok(uniformRtp(segs) < 1.0, `${risk} kasaya zarar ettiriyor`);
  }
});

test('ÇARK: 16 dilim, negatif çarpan yok, en az bir kaybeden dilim var', () => {
  for (const [risk, segs] of Object.entries(WHEEL_PRESETS)) {
    assert.equal(segs.length, 16, `${risk} dilim sayısı`);
    assert.ok(segs.every(v => Number.isFinite(v) && v >= 0), `${risk}: geçersiz çarpan`);
    assert.ok(segs.some(v => v === 0), `${risk}: hiç kaybeden dilim yok`);
  }
});

test('ÇARK: settleWheel ödemesi = round(bahis × çarpan), sınır dışı indeks 0 öder', () => {
  const segs = WHEEL_PRESETS.med;
  const i = segs.findIndex(v => v > 0);
  const { payout, mult } = settleWheel(100, segs, i);
  assert.equal(payout, Math.round(100 * mult));
  assert.equal(settleWheel(100, segs, 999).payout, 0);
});

test('ÇARK: spinWheelIndex her zaman geçerli indeks döner', () => {
  const rng = seededRng(42);
  for (let i = 0; i < 5000; i++) {
    const idx = spinWheelIndex(WHEEL_PRESETS.high, rng);
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < 16);
  }
});

/* ═══════════════ PLINKO — BLOCKER #3 ═══════════════ */

test('PLINKO: kova sayısı her zaman satır + 1', () => {
  // Regresyon: 16 satır low/high tablolarında 17 yerine 15 kova vardı →
  // kenar kovalar undefined çarpan döndürüyordu.
  for (const [rowsKey, risks] of Object.entries(MULTIPLIERS)) {
    const rows = Number(rowsKey);
    for (const [risk, arr] of Object.entries(risks)) {
      assert.equal(arr.length, rows + 1, `${rows} satır / ${risk}`);
    }
  }
});

test('PLINKO: binom ağırlıklı RTP %99 (±%1)', () => {
  for (const [rowsKey, risks] of Object.entries(MULTIPLIERS)) {
    const rows = Number(rowsKey);
    for (const [risk, arr] of Object.entries(risks)) {
      const rtp = binomialRtp(rows, arr);
      assert.ok(Math.abs(rtp - 0.99) < 0.01, `${rows}/${risk}: %${(rtp * 100).toFixed(2)}`);
    }
  }
});

test('PLINKO: tüm tablolar simetrik ve pozitif', () => {
  for (const risks of Object.values(MULTIPLIERS)) {
    for (const [risk, arr] of Object.entries(risks)) {
      assert.deepEqual(arr, [...arr].reverse(), `${risk} simetrik değil`);
      assert.ok(arr.every(v => Number.isFinite(v) && v >= 0), `${risk} geçersiz değer`);
    }
  }
});

test('PLINKO: varsayılan açılış yapılandırması (16 satır / high) geçerli', () => {
  const m = getMultipliers(16, 'high');
  assert.equal(m.length, 17);
  assert.ok(m.every(Number.isFinite));
});

test('PLINKO: getMultipliers bilinmeyen girdide güvenli varsayılana düşer', () => {
  assert.ok(Array.isArray(getMultipliers(99, 'bilinmeyen')));
  assert.ok(getMultipliers(99, 'bilinmeyen').every(Number.isFinite));
});

/* ═══════════════ MAYINLAR — BLOCKER #9 ═══════════════ */

test('MAYIN: hiçbir (mayın, elmas) kombinasyonu Infinity/NaN üretmez', () => {
  // Regresyon: gems > 25 - mines iken payda 0'a gidiyordu → Infinity çarpan.
  for (let m = 1; m <= 24; m++) {
    for (let g = 0; g <= GRID_SIZE; g++) {
      const v = calcMultiplier(m, g);
      assert.ok(Number.isFinite(v) && v >= 1, `mayın=${m} elmas=${g} → ${v}`);
    }
  }
});

test('MAYIN: çarpan elmas sayısıyla kesin monoton artar', () => {
  for (let m = 1; m <= 24; m++) {
    let prev = 0;
    for (let g = 1; g <= GRID_SIZE - m; g++) {
      const v = calcMultiplier(m, g);
      assert.ok(v > prev, `mayın=${m} elmas=${g}: ${v} <= ${prev}`);
      prev = v;
    }
  }
});

test('MAYIN: placeMines tam olarak N benzersiz mayın yerleştirir', () => {
  for (let m = 1; m <= 24; m++) {
    const grid = placeMines(m);
    assert.equal(grid.length, GRID_SIZE);
    assert.equal(grid.filter(Boolean).length, m, `mayın=${m}`);
  }
});

test('MAYIN: placeMines dağılımı düzgün (10k tur, sapma < %20)', () => {
  const counts = new Array(GRID_SIZE).fill(0);
  const N = 10_000;
  for (let i = 0; i < N; i++) placeMines(5).forEach((v, j) => { if (v) counts[j]++; });
  const expected = (N * 5) / GRID_SIZE;
  for (const c of counts) {
    assert.ok(Math.abs(c - expected) / expected < 0.2, `dağılım yanlı: ${c} vs ${expected}`);
  }
});

/* ═══════════════ HI-LO — BLOCKER #2 ═══════════════ */

test('HI-LO: hiçbir kart/yön kombinasyonu risksiz kazanç vermez', () => {
  // Regresyon: eşitlik iki yönde de kazandırıyordu → As'ta "yüksek" EV %105.
  for (let v = 1; v <= 13; v++) {
    const o = hiloOdds(v);
    assert.ok(o.pHigher < 1, `v=${v}: YÜKSEK garanti kazanıyor`);
    assert.ok(o.pLower < 1, `v=${v}: DÜŞÜK garanti kazanıyor`);
  }
});

test('HI-LO: olasılıklar toplamı tam olarak 1', () => {
  // Regresyon: eski model hiProb + loProb = 1.08 veriyordu.
  for (let v = 1; v <= 13; v++) {
    const { pHigher, pLower, pTie } = hiloOdds(v);
    assert.ok(Math.abs(pHigher + pLower + pTie - 1) < 1e-9, `v=${v}`);
  }
});

test('HI-LO: her kabul edilebilir bahsin EV değeri hedef RTP (±%1)', () => {
  for (let v = 1; v <= 13; v++) {
    const { pHigher, pLower, higherMult, lowerMult } = hiloOdds(v);
    if (higherMult != null) {
      const ev = pHigher * higherMult;
      assert.ok(Math.abs(ev - HILO_RTP) < 0.01, `v=${v} YÜKSEK EV %${(ev * 100).toFixed(1)}`);
    }
    if (lowerMult != null) {
      const ev = pLower * lowerMult;
      assert.ok(Math.abs(ev - HILO_RTP) < 0.01, `v=${v} DÜŞÜK EV %${(ev * 100).toFixed(1)}`);
    }
  }
});

test('HI-LO: imkânsız yönlerde çarpan null (bahis kabul edilmez)', () => {
  assert.equal(hiloOdds(1).lowerMult, null, 'As altında kart yok');
  assert.equal(hiloOdds(13).higherMult, null, 'Papaz üstünde kart yok');
  assert.ok(hiloOdds(1).higherMult > 1);
  assert.ok(hiloOdds(13).lowerMult > 1);
});

test('HI-LO: EŞİTLİK her iki yönde de kaybeder', () => {
  assert.equal(evaluateGuess('hi', { v: 7 }, { v: 7 }), false);
  assert.equal(evaluateGuess('lo', { v: 7 }, { v: 7 }), false);
  assert.equal(evaluateGuess('hi', { v: 7 }, { v: 8 }), true);
  assert.equal(evaluateGuess('lo', { v: 7 }, { v: 6 }), true);
});

test('HI-LO: geçersiz yön kaybeder (sessiz kazanç yok)', () => {
  assert.equal(evaluateGuess(undefined, { v: 7 }, { v: 13 }), false);
  assert.equal(evaluateGuess('', { v: 7 }, { v: 1 }), false);
});

test('HI-LO: randomCard her zaman geçerli kart döner', () => {
  const rng = seededRng(7);
  for (let i = 0; i < 2000; i++) {
    const c = randomCard(rng);
    assert.ok(c.v >= 1 && c.v <= 13 && typeof c.r === 'string' && typeof c.suit === 'string');
  }
});

/* ═══════════════ CRASH — BLOCKER #6 ═══════════════ */

test('CRASH: Monte Carlo RTP hedefe yakın (200k tur, ±%1.5)', () => {
  const N = 200_000;
  for (const target of [1.5, 2, 5]) {
    let wins = 0;
    for (let i = 0; i < N; i++) if (crashPoint() >= target) wins++;
    const rtp = (target * wins) / N;
    assert.ok(Math.abs(rtp - 0.97) < 0.015, `hedef ${target}× → RTP %${(rtp * 100).toFixed(2)}`);
  }
});

test('CRASH: çarpan her zaman 1.00 ile üst sınır arasında', () => {
  for (let i = 0; i < 50_000; i++) {
    const c = crashPoint();
    assert.ok(Number.isFinite(c) && c >= 1 && c <= CRASH_MAX, `geçersiz: ${c}`);
  }
});

test('CRASH: patlama kontrolü oto-çıkıştan ÖNCE değerlendirilir', () => {
  // Regresyon senaryosu: sekme 30 sn askıya alındı, ham çarpan ≈ 66.
  // Eski kod crash=1.8 olmasına rağmen 5× oto-çıkış ödüyordu.
  const r = evaluateFrame({
    elapsedSec: 30, frameGapMs: 30_000, crashAt: 1.8, autoCashAt: 5.0, alreadyCashed: false,
  });
  assert.equal(r.action, 'crash', 'patlamış turdan ödeme yapılmamalı');
  assert.equal(r.m, 1.8, 'çarpan crash noktasıyla clamp edilmeli');
});

test('CRASH: uzun frame boşluğu turu askıya alır, ödeme yapmaz', () => {
  const r = evaluateFrame({
    elapsedSec: 1, frameGapMs: 5_000, crashAt: 50, autoCashAt: 1.05, alreadyCashed: false,
  });
  assert.equal(r.action, 'suspend');
});

test('CRASH: normal akışta oto-çıkış tetiklenir', () => {
  const r = evaluateFrame({
    elapsedSec: 5, frameGapMs: 16, crashAt: 50, autoCashAt: 2.0, alreadyCashed: false,
  });
  assert.equal(r.action, 'autocash');
  assert.ok(r.m >= 2.0);
});

test('CRASH: zaten çıkılmış turda ikinci oto-çıkış olmaz', () => {
  const r = evaluateFrame({
    elapsedSec: 5, frameGapMs: 16, crashAt: 50, autoCashAt: 2.0, alreadyCashed: true,
  });
  assert.equal(r.action, 'continue');
});

test('CRASH: fuzz — çarpan hiçbir frame\'de crash noktasını aşmaz', () => {
  const rng = seededRng(1337);
  for (let i = 0; i < 5000; i++) {
    const crashAt = 1 + rng() * 20;
    const r = evaluateFrame({
      elapsedSec: rng() * 40, frameGapMs: 16, crashAt, autoCashAt: 0, alreadyCashed: false,
    });
    assert.ok(r.m <= crashAt + 1e-9, `m=${r.m} > crash=${crashAt}`);
  }
});

test('CRASH: multiplierAt monoton artar ve t=0\'da 1.00', () => {
  assert.equal(multiplierAt(0), 1);
  let prev = 0;
  for (let t = 0; t <= 30; t += 0.25) {
    const m = multiplierAt(t);
    assert.ok(m >= prev);
    prev = m;
  }
});
