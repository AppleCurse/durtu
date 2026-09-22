// DÜRTÜ — modal erişilebilirlik sözleşmesi.
// Tüm oyun ve deneyim modalları components/ui/Modal.jsx üzerinden render ediliyor;
// bu dosya o tek kaynağın ARIA sözleşmesini ve bileşenlerin ona bağlı
// kaldığını doğrular.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const COMPONENTS = path.join(import.meta.dirname, '..', 'components');
const MODAL_SRC = fs.readFileSync(path.join(COMPONENTS, 'ui', 'Modal.jsx'), 'utf8');

/** Modal kabuğunu kullanması beklenen bileşenler. */
const MODAL_COMPONENTS = [
  'WheelGame', 'LimboGame', 'HiloGame', 'MinesGame', 'PlinkoGame',
  'BlackjackGame', 'RouletteGame', 'SportBet', 'SlotGame',
  'VaultModal', 'ClubModal', 'LimitsModal', 'StatsModal', 'DailyCheckInModal', 'CrashGame', 'Gate',
  'Lounge360',
];

/* ───────────── Modal kabuğunun sözleşmesi ───────────── */

test('MODAL: dialog rolü ve aria-modal tanımlı', () => {
  assert.match(MODAL_SRC, /role="dialog"/);
  assert.match(MODAL_SRC, /aria-modal="true"/);
  assert.match(MODAL_SRC, /aria-labelledby=/);
});

test('MODAL: Escape tuşu kapatır', () => {
  assert.match(MODAL_SRC, /e\.key === 'Escape'/);
  assert.match(MODAL_SRC, /addEventListener\('keydown'/);
});

test('MODAL: Tab focus trap uygular', () => {
  assert.match(MODAL_SRC, /e\.key !== 'Tab'/);
  assert.match(MODAL_SRC, /shiftKey/);
  assert.match(MODAL_SRC, /preventDefault/);
});

test('MODAL: açılışta odaklanır, kapanışta odağı iade eder', () => {
  assert.match(MODAL_SRC, /document\.activeElement/);
  assert.match(MODAL_SRC, /restoreRef/);
  assert.match(MODAL_SRC, /\.focus\(/);
});

test('MODAL: arka plan scroll kilidi kurar ve geri alır', () => {
  assert.match(MODAL_SRC, /document\.body\.style\.overflow/);
  assert.match(MODAL_SRC, /openCount/, 'iç içe modalda kilit erken açılmamalı');
});

test('MODAL: kapatma butonunda erişilebilir etiket var', () => {
  assert.match(MODAL_SRC, /aria-label=\{closeLabel\}/);
});

test('MODAL: keydown dinleyicisi temizleniyor (sızıntı yok)', () => {
  assert.match(MODAL_SRC, /removeEventListener\('keydown'/);
});

/* ───────────── Bileşenlerin kabuğa bağlılığı ───────────── */

test('MODAL: tüm modal bileşenleri paylaşılan kabuğu kullanır', () => {
  for (const name of MODAL_COMPONENTS) {
    const src = fs.readFileSync(path.join(COMPONENTS, `${name}.jsx`), 'utf8');
    assert.match(src, /import Modal from '\.\/ui\/Modal'/, `${name} Modal import etmiyor`);
    assert.match(src, /<Modal\b/, `${name} <Modal> kullanmıyor`);
  }
});

test('MODAL: elle yazılmış ovl overlay kalıbı kalmadı', () => {
  // Regresyon: her bileşenin kendi overlay'ini yazması erişilebilirlik
  // düzeltmelerinin tek tek unutulmasına yol açıyordu.
  for (const name of MODAL_COMPONENTS) {
    const src = fs.readFileSync(path.join(COMPONENTS, `${name}.jsx`), 'utf8');
    assert.ok(
      !src.includes('className="ovl"'),
      `${name} hâlâ kendi overlay'ini render ediyor`
    );
  }
});

test('A11Y: başvuru formundaki her alan label ile eşleşir', () => {
  const src = fs.readFileSync(path.join(COMPONENTS, 'Gate.jsx'), 'utf8');
  const labels = [...src.matchAll(/<label htmlFor="([^"]+)"/g)].map(m => m[1]);
  assert.ok(labels.length >= 6, `yalnızca ${labels.length} bağlı label bulundu`);
  for (const id of labels) {
    assert.ok(
      new RegExp(`id="${id}"`).test(src),
      `"${id}" label'ı hiçbir girdiye bağlı değil`
    );
  }
  assert.ok(!/<label>(?!<)/.test(src), 'htmlFor içermeyen label kaldı');
});

test('MODAL: her modalın erişilebilir bir başlığı var', () => {
  for (const name of MODAL_COMPONENTS) {
    const src = fs.readFileSync(path.join(COMPONENTS, `${name}.jsx`), 'utf8');
    // Not: <Modal ...> içinde ok fonksiyonu (=>) bulunabildiği için basit
    // [^>]* kalıbı erken kesilir; etiketin tamamını almak yerine yakınlığa bakıyoruz.
    const tag = src.slice(src.indexOf('<Modal'), src.indexOf('<Modal') + 400);
    assert.ok(
      /title="/.test(tag) || /labelledBy=/.test(tag),
      `${name} başlıksız — ekran okuyucu diyaloğu adlandıramaz`
    );
  }
});

/* ───────────── Global erişilebilirlik stilleri ───────────── */

test('A11Y: sr-only ve focus-visible stilleri tanımlı', () => {
  const css = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'app', 'globals.css'), 'utf8'
  );
  assert.match(css, /\.sr-only\{/, 'ekran okuyucu yardımcı sınıfı yok');
  assert.match(css, /:focus-visible\{/, 'klavye odağı görünmüyor');
  assert.match(css, /prefers-reduced-motion/, 'hareket hassasiyeti desteklenmiyor');
});
