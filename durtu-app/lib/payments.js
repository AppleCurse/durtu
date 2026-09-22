'use client';
// DÜRTÜ — Kasa ödeme rayları (Papara / Payfix / Anında Havale / USDT-TRC20).
//
// TR oyuncusunun kasa refleksi yönteme göredir: "Papara ile minimum kaçla
// girilir, çekim kaç dakikada yatar?" Bu modül o sorunun tek doğruluk kaynağı.
// Tutarlar lib/money.js kapısından geçer; akış SAF durum makinesidir
// (pending → review → ok) ve zaman damgası testlerde enjekte edilir.
//
// GERÇEKLİK NOTU: onaylayıcı bu demoda tarayıcının kendisidir (setTimeout).
// Gerçek para akışı yoktur ve bu kasıtlıdır — dekont metinleri buna göre
// "simüle" diye işaretlenir.

import { toChips } from './money.js';
import { log } from './logger.js';

/** Sabit demo kuru: 1 USDT = ◈ 9.7 dürTL. */
export const USDT_TRY_RATE = 9.7;

export const RAILS = [
  {
    id: 'papara',
    label: 'Papara',
    icon: '🅿️',
    kind: 'cüzdan',
    depMin: 100, depMax: 50000,
    wdMin: 100, wdMax: 25000,
    account: 'PAPARA · 4471 8832 09',
    detailLabel: 'Papara numaran',
    reviewMs: 5000,
  },
  {
    id: 'payfix',
    label: 'Payfix',
    icon: '💠',
    kind: 'cüzdan',
    depMin: 100, depMax: 50000,
    wdMin: 100, wdMax: 25000,
    account: 'PAYFIX · 9931 204',
    detailLabel: 'Payfix numaran',
    reviewMs: 6500,
  },
  {
    id: 'havale',
    label: 'Anında Havale',
    icon: '🏦',
    kind: 'banka',
    depMin: 200, depMax: 100000,
    wdMin: 200, wdMax: 50000,
    account: 'DÜRTÜ KULÜP HİZMETLERİ A.Ş.\nTR44 0006 2000 0000 0004 4718 8320',
    detailLabel: 'IBAN (TR…)',
    reviewMs: 8000,
  },
  {
    id: 'usdt',
    label: 'USDT · TRC-20',
    icon: '₮',
    kind: 'kripto',
    depMin: 100, depMax: 200000,
    wdMin: 200, wdMax: 100000,
    account: 'TQ8vDURtu7Xk2PpLm4Rn9Yc3Sj6Wb1Za5',
    detailLabel: 'USDT (TRC-20) adresin',
    reviewMs: 12000,
  },
];

export function getRail(id) {
  return RAILS.find(r => r.id === id) || null;
}

/** Ray kataloğunun yapısal bütünlüğü (testler de bu sözleşmeyi pins ediyor). */
export function railsSanity() {
  const seen = new Set();
  for (const r of RAILS) {
    if (seen.has(r.id)) return { ok: false, reason: 'DUPLICATE_ID', rail: r.id };
    seen.add(r.id);
    if (!(r.depMin > 0) || r.depMax < r.depMin) return { ok: false, reason: 'DEP_LIMITS', rail: r.id };
    if (!(r.wdMin > 0) || r.wdMax < r.wdMin) return { ok: false, reason: 'WD_LIMITS', rail: r.id };
    if (!r.account || !r.detailLabel) return { ok: false, reason: 'ACCOUNT', rail: r.id };
    if (!(r.reviewMs > 0)) return { ok: false, reason: 'ETA', rail: r.id };
  }
  return { ok: true };
}

/* ════════════════════ USDT KURU ════════════════════ */

/** USDT → dürTL (aşağı yuvarlar; oyuncuya lehte kesirli çip doğmaz). */
export function usdtToChips(usdt) {
  const n = Number(usdt);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return toChips(Math.floor(n * USDT_TRY_RATE), 0);
}

/** dürTL → görüntülenecek USDT (iki hane, yukarı yuvarlanır — oyuncu lehine şeffaf). */
export function chipsToUsdt(chips) {
  const c = toChips(chips, 0);
  return (Math.ceil((c / USDT_TRY_RATE) * 100) / 100).toFixed(2);
}

/** Bir ray için minimum yatırım karşılığı USDT (tavanlı). */
export function minUsdtFor(rail) {
  return (Math.ceil((rail.depMin / USDT_TRY_RATE) * 100) / 100).toFixed(2);
}

/* ════════════════════ TUTAR KAPILARI ════════════════════ */

function checkAmount(rail, amt, minKey, maxKey) {
  const v = Number(amt);
  if (!Number.isFinite(v) || v <= 0) return { ok: false, reason: 'BAD_AMOUNT' };
  const c = toChips(Math.trunc(v), 0);
  if (c < rail[minKey]) return { ok: false, reason: 'BELOW_MIN', min: rail[minKey], amt: c };
  if (c > rail[maxKey]) return { ok: false, reason: 'ABOVE_MAX', max: rail[maxKey], amt: c };
  return { ok: true, amt: c };
}

export const checkDeposit = (railId, amt) => {
  const rail = getRail(railId);
  return rail ? checkAmount(rail, amt, 'depMin', 'depMax') : { ok: false, reason: 'UNKNOWN_RAIL' };
};

export const checkWithdraw = (railId, amt) => {
  const rail = getRail(railId);
  return rail ? checkAmount(rail, amt, 'wdMin', 'wdMax') : { ok: false, reason: 'UNKNOWN_RAIL' };
};

/* ════════════════════ DEKONT REFERANSI ════════════════════ */

/** DRT-XXXXXX referans üretir. rng enjekte edilebilir (deterministik test). */
export function newRef(rand = Math.random) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[Math.floor(rand() * abc.length) % abc.length];
  return 'DRT-' + s;
}

/* ════════════════════ AKIŞ MAKİNESİ (saf) ════════════════════ */

/**
 * Yatırım dekontu açar: durum 'review' (alındı, eşleştiriliyor).
 * Para bu adımda YAZILMAZ — yalnızca settleDeposit 'ok''a geçirir.
 */
export function startDeposit(railId, amt, now = Date.now(), rand = Math.random) {
  const check = checkDeposit(railId, amt);
  if (!check.ok) return { ok: false, reason: check.reason, ...check };
  const rail = getRail(railId);
  return {
    ok: true,
    record: {
      id: 'P' + now.toString(36) + Math.floor(rand() * 1e6).toString(36),
      kind: 'dep',
      rail: railId,
      amt: check.amt,
      ref: newRef(rand),
      status: 'review',
      ts: now,
      etaAt: now + rail.reviewMs,
    },
  };
}

/** Kaydı ilerletir: eta dolmadan 'review' kalır, dolunca bir kez 'ok'a geçer. */
export function settleRecord(record, now = Date.now()) {
  if (!record || record.status !== 'review') return { record, settled: false };
  if (now < record.etaAt) return { record, settled: false };
  return { record: { ...record, status: 'ok' }, settled: true };
}

/**
 * Çekim talebi: tutar ÇAĞIRAN TARAFÇA daha önce spend() ile teminat altına
 * alınır (hold), kayıt 'review' durumunda kuyruğa girer.
 */
export function startWithdraw(railId, amt, now = Date.now(), rand = Math.random) {
  const check = checkWithdraw(railId, amt);
  if (!check.ok) return { ok: false, reason: check.reason, ...check };
  const rail = getRail(railId);
  return {
    ok: true,
    record: {
      id: 'W' + now.toString(36) + Math.floor(rand() * 1e6).toString(36),
      kind: 'wd',
      rail: railId,
      amt: check.amt,
      ref: newRef(rand),
      status: 'review',
      ts: now,
      etaAt: now + rail.reviewMs,
    },
  };
}

/** Defter etiketi: "Papara · Yatırım — DRT-XXXXXX". */
export function recordLabel(record) {
  const rail = getRail(record?.rail);
  const side = record?.kind === 'dep' ? 'Yatırım' : 'Çekim';
  return `${rail ? rail.label : record?.rail} · ${side} — ${record?.ref ?? '?'}`;
}

/** Uygulama katmanı sarmalayıcıları — component bunları kullanır. */
export function openDepositLive(railId, amt) {
  try {
    return startDeposit(railId, amt);
  } catch (err) {
    log.critical('payments.startDeposit', err, { railId, amt: String(amt) });
    return { ok: false, reason: 'CRASH' };
  }
}
