'use client';
// DÜRTÜ — Kasa: yöntem seçici + simüle dekont akışı.
// Raylar, limitler ve akış makinesi lib/payments.js'tedir (test altındadır).
// Gerçek para YOKTUR: onaylayıcı bu demoda setTimeout'tur ve metinler bunu gizlemez.

import { useEffect, useRef, useState } from 'react';
import { fmt, say } from '../lib/toast';
import { ledger, addLedger, updateLedgerStatus, stats } from '../lib/store';
import {
  RAILS, getRail, checkDeposit, checkWithdraw,
  openDepositLive, startWithdraw, settleRecord, recordLabel,
  chipsToUsdt, minUsdtFor,
} from '../lib/payments';
import Modal from './ui/Modal';
import { useEventCallback } from '../lib/useEventCallback';

export default function VaultModal({ chips, spend, win, onClose }) {
  const [tab, setTab] = useState('dep');          // dep | cek | defter
  const [railId, setRailId] = useState('papara');
  const [dest, setDest] = useState('');           // çekim hedef alanı
  // localStorage senkron okunur; effect'te setState yapmak yerine lazy
  // initializer kullanmak cascading render'ı önler.
  const [l, setL] = useState(() => ledger());
  const [wagered, setWagered] = useState(() => stats().wagered);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');         // "Dekont alındı…" gibi canlı durum
  const timersRef = useRef([]);
  const aliveRef = useRef(true);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      aliveRef.current = false;
      timers.forEach(clearTimeout);   // modal kapanınca setState sızmasın
    };
  }, []);

  const later = (fn, ms) => { timersRef.current.push(setTimeout(() => { if (aliveRef.current) fn(); }, ms)); };
  const fresh = () => { setL(ledger()); setWagered(stats().wagered); };

  const rail = getRail(railId);
  const isUsdt = railId === 'usdt';

  /* ─────────── YATIRIM: dekont gönder → eşleştir → kasaya işle ─────────── */
  const deposit = useEventCallback((amt) => {
    if (busy || !rail) return;
    const check = checkDeposit(railId, amt);
    if (!check.ok) {
      say(check.reason === 'BELOW_MIN'
        ? `⬇️ <b>${rail.label} alt limiti ◈ ${fmt(check.min)}</b> dürTL.`
        : `⬆️ <b>${rail.label} üst limiti ◈ ${fmt(check.max)}</b> dürTL.`);
      return;
    }
    setBusy(true);
    const r = openDepositLive(railId, check.amt);
    if (!r.ok) { setBusy(false); say('⚠️ Dekont açılamadı — tekrar dene.'); return; }
    const rec = r.record;
    const entryId = addLedger('deposit', recordLabel(rec), rec.amt, 'pending');
    fresh();
    setStage(`⏳ Dekont alındı — referans ${rec.ref}`);
    say(`🧾 <b>${rail.label} dekontu gönderildi:</b> ◈ ${fmt(rec.amt)} dürTL · ${rec.ref} — eşleştiriliyor…`);
    later(() => setStage(`🔎 ${rec.ref} — hareket taranıyor…`), Math.round(rail.reviewMs * 0.45));
    later(() => {
      const { record, settled } = settleRecord(rec, Date.now());
      if (!settled) return;
      if (entryId) updateLedgerStatus(entryId, 'ok');
      win(record.amt);
      fresh(); setBusy(false); setStage('');
      say(`✅ <b>${rail.label} onaylandı:</b> ◈ ${fmt(record.amt)} dürTL kasanda. (${record.ref})`);
    }, rail.reviewMs);
  });

  /* ─────────── ÇEKİM: teminat (spend) → kuyruk → teslim ─────────── */
  const withdraw = useEventCallback((amt) => {
    if (busy || !rail) return;
    const check = checkWithdraw(railId, amt);
    if (!check.ok) {
      say(check.reason === 'BELOW_MIN'
        ? `⬇️ <b>${rail.label} çekim alt limiti ◈ ${fmt(check.min)}</b> dürTL.`
        : `⬆️ <b>${rail.label} çekim üst limiti ◈ ${fmt(check.max)}</b> dürTL.`);
      return;
    }
    if (dest.trim().length < 6) {
      say(`📍 <b>${rail.detailLabel}</b> eksik — ödeme yapılacak alanı gir.`);
      return;
    }
    // Tek doğruluk kaynağı spend(): tutar talep ANINDA teminat altına alınır.
    if (!spend(check.amt)) {
      say('Yetersiz bakiye — çekilebilir: ◈ ' + fmt(chips) + ' dürTL');
      return;
    }
    setBusy(true);
    const r = startWithdraw(railId, check.amt);
    if (!r.ok) { setBusy(false); say('⚠️ Talep açılamadı — bakiye iade edilmediyse kasayı kontrol et.'); return; }
    const rec = r.record;
    const entryId = addLedger('withdraw', recordLabel(rec), rec.amt, 'pending');
    fresh();
    setStage(`⏳ ${rec.ref} — ödeme kuyruğunda`);
    say(`📤 <b>${rail.label} çekim talebi alındı:</b> ◈ ${fmt(rec.amt)} dürTL · ${rec.ref}`);
    later(() => setStage(`🏦 ${rec.detailLabel || rail.detailLabel} hedefine işleniyor…`), Math.round(rail.reviewMs * 0.5));
    later(() => {
      const { record, settled } = settleRecord(rec, Date.now());
      if (!settled) return;
      if (entryId) updateLedgerStatus(entryId, 'ok');
      fresh(); setBusy(false); setStage('');
      say(`✅ Çekim onaylandı — <b>${dest.trim()}</b> hedefine teslim edildi. (${record.ref})`);
      setDest('');
    }, rail.reviewMs);
  });

  const goal = 2500, prog = Math.min(1, (wagered % goal) / goal);
  const depChips = [rail.depMin, 250, 500, 1000].filter((v, i, a) => v >= rail.depMin && a.indexOf(v) === i);
  const wdChips = [rail.wdMin, 500, 1000, 2500].filter((v, i, a) => v >= rail.wdMin && a.indexOf(v) === i);

  return (
    <Modal onClose={onClose} title="Kasa" className="pnl" style={{ width: 'min(520px,100%)' }}>
      <span className="tag">✦ Kulüp Kasası</span>
      <h3>DÜRTÜ Finans Kasası</h3>
      <p className="noteline">Yatırım ve çekim talebin <b>simüle</b> olarak işlenir — gerçek para kullanılmaz.</p>

      <div className="stat-row" style={{ fontSize: '.8rem', marginBottom: '.3rem' }}><span>Bakiye</span><b>◈ {fmt(chips)} dürTL</b></div>
      <div style={{ margin: '.8rem 0 1rem' }}>
        <div className="stat-row"><span>Kulüp Çevrim İlerlemesi (haftalık ◈ {fmt(goal)})</span><b>%{Math.round(prog * 100)}</b></div>
        <div style={{ height: 6, background: '#1a1710', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(212,175,55,.2)' }}>
          <div style={{ width: (prog * 100) + '%', height: '100%', background: 'linear-gradient(90deg,#8a6a20,#f6e27a)', transition: 'width .6s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.8rem' }}>
        {[['dep', '◈ Yatırım'], ['cek', '↗ Çekim'], ['defter', '📜 Defter']].map(([k, lbl]) => (
          <button key={k} className={'btn' + (tab === k ? ' solid' : '')} style={{ flex: 1 }} onClick={() => setTab(k)}>{lbl}</button>
        ))}
      </div>

      {tab !== 'defter' && (
        <>
          {/* ── Yöntem seçici ── */}
          <p className="muted" style={{ fontSize: '.68rem', margin: '0 0 .4rem' }}>YÖNTEM</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', marginBottom: '.7rem' }}>
            {RAILS.map(r => (
              <button
                key={r.id}
                type="button"
                className={'chipB' + (railId === r.id ? ' on' : '')}
                disabled={busy}
                style={{ textAlign: 'left', padding: '.5rem .6rem', borderRadius: 8, cursor: busy ? 'wait' : 'pointer' }}
                onClick={() => setRailId(r.id)}
                title={`${r.depMin}–${fmt(r.depMax)} dürTL yatırım`}
              >
                <span style={{ fontSize: '.78rem' }}>{r.icon} <b>{r.label}</b></span>
                <span style={{ display: 'block', fontSize: '.6rem', opacity: .75, marginTop: 2 }}>
                  min ◈ {fmt(r.depMin)} · max ◈ {fmt(r.depMax)} · {r.kind}
                </span>
              </button>
            ))}
          </div>

          {/* ── Hesap bilgisi ── */}
          <div style={{ background: 'var(--card2, #16130d)', border: '1px solid var(--line, rgba(212,175,55,.25))', borderRadius: 8, padding: '.55rem .7rem', marginBottom: '.7rem' }}>
            <p className="muted" style={{ fontSize: '.6rem', margin: '0 0 .25rem', letterSpacing: '.12em' }}>
              {tab === 'dep' ? 'GÖNDERİLECEK HESAP' : 'ÖDEME ALICISI DOĞRULAMASI'}
            </p>
            <p style={{ margin: 0, fontSize: '.72rem', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{rail.account}</p>
            {isUsdt && <p className="muted" style={{ fontSize: '.6rem', margin: '.3rem 0 0' }}>Ağ: TRC-20 (Tron) · Başka ağa gönderim kurtarılamaz.</p>}
          </div>

          {/* ── Tutar ── */}
          <div className="chiprow" style={{ flexWrap: 'wrap' }}>
            {(tab === 'dep' ? depChips : wdChips).map(a => (
              <button key={a} className={'chipB' + (busy ? ' on' : '')} disabled={busy} style={{ width: 60, height: 40, borderRadius: 8 }}
                title={isUsdt ? `◈ ${a} ≈ ${chipsToUsdt(a)} USDT` : undefined}
                onClick={() => tab === 'dep' ? deposit(a) : withdraw(a)}>
                {a}
              </button>
            ))}
          </div>
          {isUsdt && (
            <p className="muted" style={{ fontSize: '.64rem', margin: '.45rem 0 0' }}>
              Kur: 1 USDT = ◈ 9.7 dürTL · min ≈ {minUsdtFor(rail)} USDT
              {tab === 'cek' && ' · tutar seçince USDT karşılığı aşağıda görünür'}
            </p>
          )}

          {tab === 'cek' && (
            <input
              value={dest}
              onChange={e => setDest(e.target.value)}
              placeholder={rail.detailLabel}
              disabled={busy}
              aria-label={rail.detailLabel}
              style={{ width: '100%', margin: '.6rem 0 0', padding: '.5rem .6rem', fontSize: '.72rem', background: 'var(--card2, #16130d)', border: '1px solid var(--line, rgba(212,175,55,.25))', borderRadius: 6, color: 'var(--cream, #efe6cf)' }}
            />
          )}

          {stage && (
            <p className="muted" style={{ fontSize: '.68rem', margin: '.6rem 0 0', color: 'var(--gold2, #d4af37)' }}>{stage}</p>
          )}

          <p className="muted" style={{ fontSize: '.64rem', textAlign: 'center', marginTop: '.55rem' }}>
            {tab === 'dep'
              ? `${rail.label} · min ◈ ${fmt(rail.depMin)} · max ◈ ${fmt(rail.depMax)} · demo akış ~${Math.round(rail.reviewMs / 1000)} sn`
              : `${rail.label} · min ◈ ${fmt(rail.wdMin)} · max ◈ ${fmt(rail.wdMax)} · tutar talep anında teminata alınır`}
          </p>
        </>
      )}

      {tab === 'defter' && (
        <div className="hist-list" style={{ maxHeight: 220 }}>
          {l.length === 0 && <div className="hrow"><span>Henüz hareket yok.</span></div>}
          {l.map((e, i) => {
            const d = new Date(e.ts);
            const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            return (
              <div className="hrow" key={i}>
                <span><span className="hx">{hh}</span>  {e.label}</span>
                <b className={e.type === 'deposit' || e.status === 'ok' && e.amt >= 0 ? 'hw' : 'hl'}>
                  {e.type === 'deposit' ? '+' : '−'} ◈ {fmt(e.amt)} {e.status === 'pending' ? <span className="hx">· bekliyor</span> : null}
                </b>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
