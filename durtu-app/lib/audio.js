'use client';
// DÜRTÜ — tek paylaşılan AudioContext.
// Önceden 10 bileşen kendi context'ini açıyordu; Chrome'un sekme başına ~6 limiti
// aşılınca tüm sesler sessizce ölüyordu. Burada tek context ref-count ile yönetilir.

import { log } from './logger.js';

let ctx = null;
let refCount = 0;

/** Bileşen mount olurken çağrılır. Context'i açar/devam ettirir. */
export function acquireAudio() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      log.ignorable('audio.acquire', new Error('AudioContext desteklenmiyor'));
      return null;
    }
    try {
      ctx = new Ctor();
    } catch (err) {
      log.warn('audio.acquire', 'AudioContext açılamadı — ses devre dışı', {
        name: err?.name,
      });
      return null;
    }
  }
  refCount++;
  if (ctx.state === 'suspended') ctx.resume().catch(err => log.ignorable('audio.resume', err));
  return ctx;
}

/** Bileşen unmount olurken çağrılır. Son kullanıcı çıkınca context askıya alınır. */
export function releaseAudio() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && ctx && ctx.state === 'running') {
    ctx.suspend().catch(err => log.ignorable('audio.suspend', err));
  }
}

/** Aktif context (yoksa null). */
export function getAudio() {
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(err => log.ignorable('audio.resume', err));
  }
  return ctx;
}

/**
 * Tek ton. Node'lar bittiğinde disconnect edilir (sızıntı önleme).
 */
export function tone(freq, { delay = 0, dur = 0.08, type = 'sine', gain = 0.1 } = {}) {
  const a = ctx;
  if (!a || a.state === 'closed') return;
  try {
    const t = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      try { osc.disconnect(); g.disconnect(); } catch (err) { log.ignorable('audio.disconnect', err); }
    };
  } catch (err) {
    log.ignorable('audio.tone', err);
  }
}

/** Yükselen kazanç fanfarı — 4 bileşende kopyalanan kod buraya taşındı. */
export function fanfare(notes = [523, 659, 784, 1046], { gain = 0.12, step = 0.08 } = {}) {
  notes.forEach((f, i) => tone(f, { delay: i * step, dur: 0.2, type: 'sine', gain }));
}

/** Gürültü patlaması (crash / bomba). */
export function noiseBurst({ dur = 0.35, gain = 0.28, decay = 2.2 } = {}) {
  const a = ctx;
  if (!a || a.state === 'closed') return;
  try {
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    const src = a.createBufferSource();
    const g = a.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g);
    g.connect(a.destination);
    src.start();
    src.onended = () => {
      try { src.disconnect(); g.disconnect(); } catch (err) { log.ignorable('audio.disconnect', err); }
    };
  } catch (err) {
    log.ignorable('audio.noise', err);
  }
}

/**
 * Kalp atışı — lub-dub. Tek vuruş üretir; TEMPO çağırandadır.
 * Crash'te çarpan yükseldikçe çağırma aralığı kısaltılır, böylece ritim
 * oyuncunun nabzıyla birlikte hızlanır (tek zamanlayıcı kuralı korunur:
 * burada setInterval yok, sızan bir zamanlayıcı da yok).
 */
export function heartbeat({ gain = 0.14, low = 58, high = 44, gap = 0.13 } = {}) {
  tone(low, { dur: 0.09, type: 'sine', gain });
  tone(high, { delay: gap, dur: 0.11, type: 'sine', gain: gain * 0.8 });
}

/**
 * Altın dökülmesi — büyük kazanç, kayıp iadesi ve gece yakıtında kullanılan
 * tiz/dağınık vuruş bulutu. Notalar rastgele seçilir ki aynı sesi iki kez
 * üst üste duyunca makine hissi vermesin.
 */
export function coinRain({ count = 14, gain = 0.075, spread = 1.1 } = {}) {
  const scale = [1046, 1174, 1318, 1396, 1568, 1760, 2093];
  const n = Math.max(1, Math.min(40, Math.trunc(count) || 14));
  const step = spread / n;
  for (let i = 0; i < n; i++) {
    const base = scale[Math.floor(Math.random() * scale.length)];
    tone(base * (1 + (Math.random() - 0.5) * 0.04), {
      delay: i * step + Math.random() * 0.03,
      dur: 0.12,
      type: 'triangle',
      gain: gain * (0.7 + Math.random() * 0.6),
    });
  }
}
