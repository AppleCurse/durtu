// DÜRTÜ — legacy (durtu/index.html) ile React motorları arasında matematik paritesi.
//
// İki istemci aynı oyunu oynuyor; farklı dağılım kullanmaları kabul edilemez.
// Legacy'deki `intVal % 33 === 0 → 1.00` kuralı RTP'yi %94.06'ya düşürüyordu
// (ilan edilen %97). Bu dosya kuralın geri gelmesini ve mnMul'un Infinity
// dönmesini engeller.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { CRASH_RTP, CRASH_MAX } from '../lib/engines/crash.js';
import { calcMultiplier, GRID_SIZE } from '../lib/engines/mines.js';

const HTML = fs.readFileSync(
  path.join(import.meta.dirname, '..', '..', 'durtu', 'index.html'),
  'utf8'
);

/** index.html içinden tek bir fonksiyonun kaynağını söküp değerlendirir. */
function extractFn(name) {
  const start = HTML.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} bulunamadı`);

  // Dengeli süslü parantez taraması
  const open = HTML.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  assert.notEqual(end, -1, `${name} gövdesi kapanmadı`);
  return HTML.slice(start, end);
}

/* ───────────── CRASH paritesi ───────────── */

test('LEGACY: getProvableCrash içinde "% 33 → 1.00" kuralı YOKTUR', () => {
  const src = extractFn('getProvableCrash');
  assert.ok(
    !/%\s*33\s*===?\s*0/.test(src),
    'RTP\'yi %94\'e düşüren anlık patlama kuralı geri gelmiş'
  );
});

test('LEGACY: crash tabanı React motoruyla aynı sabitleri kullanır', () => {
  const src = extractFn('getProvableCrash');
  assert.ok(src.includes('CRASH_RTP'), 'RTP sabiti isimlendirilmeli');
  assert.ok(src.includes('CRASH_MAX'), 'tavan sabiti isimlendirilmeli');

  const ctx = { CRASH_RTP, CRASH_MAX, Math, Number, parseInt, sha256Sync: null };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  // sha256Sync'i deterministik sahte hash ile değiştirip dağılımı ölçüyoruz.
  const MAXV = 4503599627370496;
  ctx.sha256Sync = () => {
    const v = Math.floor(Math.random() * MAXV);
    return v.toString(16).padStart(13, '0').slice(0, 13);
  };

  const N = 300_000;
  for (const target of [1.5, 2, 5]) {
    let wins = 0;
    for (let i = 0; i < N; i++) {
      if (ctx.getProvableCrash('s', 'c', i) >= target) wins++;
    }
    const rtp = (target * wins) / N;
    assert.ok(
      Math.abs(rtp - CRASH_RTP) < 0.02,
      `legacy ${target}× → RTP %${(rtp * 100).toFixed(2)}, hedef %${(CRASH_RTP * 100).toFixed(0)}`
    );
  }
});

test('LEGACY: crash çarpanı her zaman geçerli aralıkta', () => {
  const ctx = { CRASH_RTP, CRASH_MAX, Math, Number, parseInt };
  vm.createContext(ctx);
  vm.runInContext(extractFn('getProvableCrash'), ctx);
  const MAXV = 4503599627370496;
  ctx.sha256Sync = () =>
    Math.floor(Math.random() * MAXV).toString(16).padStart(13, '0').slice(0, 13);

  for (let i = 0; i < 20_000; i++) {
    const c = ctx.getProvableCrash('s', 'c', i);
    assert.ok(Number.isFinite(c) && c >= 1 && c <= CRASH_MAX, `geçersiz: ${c}`);
  }
});

/* ───────────── MINES paritesi ───────────── */

test('LEGACY: mnMul hiçbir girdide Infinity/NaN döndürmez', () => {
  const ctx = { Math, Number };
  vm.createContext(ctx);
  vm.runInContext(extractFn('mnMul'), ctx);

  for (let m = 1; m <= 24; m++) {
    for (let k = 0; k <= GRID_SIZE + 3; k++) {
      const v = ctx.mnMul(m, k);
      assert.ok(Number.isFinite(v) && v >= 1, `mayın=${m} k=${k} → ${v}`);
    }
  }
  // Bozuk girdiler de çökertmemeli
  for (const bad of [0, 25, -1, NaN, Infinity, undefined]) {
    assert.ok(Number.isFinite(ctx.mnMul(bad, 3)), `mayın=${String(bad)}`);
  }
});

test('LEGACY: mnMul React calcMultiplier ile sayısal olarak uyumlu', () => {
  const ctx = { Math, Number };
  vm.createContext(ctx);
  vm.runInContext(extractFn('mnMul'), ctx);

  for (let m = 1; m <= 24; m++) {
    for (let k = 1; k <= GRID_SIZE - m; k++) {
      const legacy = ctx.mnMul(m, k);
      const react = calcMultiplier(m, k);
      const rel = Math.abs(legacy - react) / Math.max(react, 1);
      assert.ok(rel < 0.02, `mayın=${m} k=${k}: legacy ${legacy} vs react ${react}`);
    }
  }
});
