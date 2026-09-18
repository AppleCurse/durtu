// DÜRTÜ — sürümden bağımsız test koşucusu.
//
// `node --test` argüman yorumu sürümler arasında değişir:
//   • Node 20: dizin arar, GLOB desteklemez ("Could not find 'tests/**/*.test.js'")
//   • Node 22: glob'u destekler, düz dizin argümanını modül gibi çalıştırır
// Kabuk glob'una (tests/*.test.js) bel bağlamak Windows cmd'de de kırılır.
// Dosya listesini burada üretip programatik koşucuya veriyoruz: her yerde aynı.
'use strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';

const here = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.join(here, '..', 'tests');

const files = readdirSync(testsDir, { withFileTypes: true })
  .filter(e => e.isFile() && e.name.endsWith('.test.js'))
  .map(e => path.join(testsDir, e.name))
  .sort();

if (files.length === 0) {
  console.error('❌ tests/ altında hiç *.test.js bulunamadı');
  process.exit(1);
}

const runner = run({ files });
runner.on('test:fail', () => { process.exitCode = 1; });
runner.compose(spec).pipe(process.stdout);
