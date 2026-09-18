'use client';
import { useEffect, useRef, useState } from 'react';
import { fmt, say } from '../lib/toast';
import { ledger, addLedger, updateLedgerStatus, stats } from '../lib/store';
import Modal from './ui/Modal';
import { useEventCallback } from '../lib/useEventCallback';

const AMTS = [100, 250, 500, 1000];

export default function VaultModal({ chips, spend, win, onClose }) {
  const [tab, setTab] = useState('dep');   // dep | cek | defter
  // localStorage senkron okunur; effect'te setState yapmak yerine lazy
  // initializer kullanmak cascading render'ı önler.
  const [l, setL] = useState(() => ledger());
  const [wagered, setWagered] = useState(() => stats().wagered);
  const [busy, setBusy] = useState(false);
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

  function fresh() { setL(ledger()); setWagered(stats().wagered); }

  const deposit = useEventCallback((amt) => {
    if (busy) return;
    setBusy(true);
    say('🏦 <b>Havale gönderildi:</b> ◈ ' + fmt(amt) + ' dürTL incelemede…');
    later(() => {
      win(amt);
      addLedger('deposit', 'Kulüp Kasası — Yatırım', amt, 'ok');
      fresh(); setBusy(false);
      say('✅ <b>Onaylandı:</b> ◈ ' + fmt(amt) + ' dürTL kasana işlendi.');
    }, 2200 + Math.random() * 1000);
  });
  function withdraw(amt) {
    if (busy) return;
    // Tek doğruluk kaynağı spend(); stale `chips` prop'una göre karar verilmez.
    if (!spend(amt)) {
      say('Yetersiz bakiye — çekilebilir: ◈ ' + fmt(chips) + ' dürTL');
      return;
    }
    setBusy(true);
    const entryId = addLedger('withdraw', 'Kulüp Kasası — Çekim talebi', amt, 'pending');
    fresh();
    say('📤 <b>Çekim talebin alındı:</b> ◈ ' + fmt(amt) + ' dürTL inceleme kuyruğunda.');
    later(() => {
      updateLedgerStatus(entryId, 'ok');      // defterde sonsuz "bekliyor" kalmaz
      fresh(); setBusy(false);
      say('✅ Çekim onaylandı — IBAN\'a teslim edildi.');
    }, 2600);
  }
  const goal = 2500, prog = Math.min(1, (wagered % goal) / goal);

  return (
    <Modal onClose={onClose} title="Kasa" className="pnl" style={{ width: 'min(520px,100%)' }}>
        <span className="tag">✦ Kulüp Kasası</span>
        <h3>DÜRTÜ Finans Kasası</h3>
        <p className="noteline">Yatırım ve çekim talebin <b>demo</b> olarak işlenir — gerçek para kullanılmaz.</p>

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
            <div className="chiprow" style={{ flexWrap: 'wrap' }}>
              {AMTS.map(a => (
                <button key={a} className={'chipB' + (busy ? ' on' : '')} disabled={busy} style={{ width: 60, height: 40, borderRadius: 8 }}
                  onClick={() => tab === 'dep' ? deposit(a) : withdraw(a)}>
                  {a}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: '.66rem', textAlign: 'center' }}>
              {tab === 'dep'
                ? '◈ Alıcı: DÜRTÜ KULÜP HİZMETLERİ A.Ş. · Min ◈ 100, Max ◈ 100.000'
                : '↗ Min çekim ◈ 100 · Talepler inceleme sonrası işleme alınır'}
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
