'use client';
// DÜRTÜ — toast event-bus + GÜVENLİ HTML üretimi.
//
// BLOCKER #8 düzeltmesi: toast içerikleri dangerouslySetInnerHTML ile basılıyor ve
// kullanıcı adı (Gate formundan gelen serbest girdi) escape edilmeden şablona
// enterpole ediliyordu → kalıcı XSS. Legacy durtu/index.html bir esc() yardımcısı
// içeriyordu ama React portuna taşınmamıştı (regresyon).

import { log } from './logger.js';

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML özel karakterlerini kaçırır. */
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPE_MAP[c]);

/**
 * Güvenli tagged template. Literal kısımlar HTML olarak geçer,
 * ${...} ile gelen TÜM değerler otomatik escape edilir.
 *
 *   say(html`<b>Hoş geldin, ${userName}.</b>`)
 */
export const html = (strings, ...values) =>
  strings.reduce(
    (out, s, i) => out + s + (i < values.length ? escapeHtml(values[i]) : ''),
    ''
  );

export const say = markup => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('durtu:toast', { detail: markup }));
  }
};

/** Sayı biçimleme — NaN/Infinity güvenli. */
export const fmt = n => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return Math.round(v).toLocaleString('tr-TR');
};

export const buzz = p => {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p);
  } catch (err) {
    log.ignorable('toast.buzz', err);
  }
};
