'use client';
import { useState } from 'react';
import { stats } from '../lib/store';
import { fmt } from '../lib/toast';
import Modal from './ui/Modal';

export default function StatsModal({ name, chips, onClose }) {
  // stats() senkron localStorage okur. Effect'te setState yapmak yerine lazy
  // initializer: fazladan render turu yok, "if (!s) return null" boş karesi yok.
  const [s] = useState(() => stats());
  const net = s.won - s.wagered;
  let verdict;
  if (s.spins === 0) verdict = '“Henüz perde açılmadı. İlk dönüşünü bekliyoruz.”';
  else if (net >= s.wagered * .3 && s.wagered > 0) verdict = '“Hesabını bilen kazanır. Bu hafta yeşildesin, ' + name + '.”';
  else if (net >= 0) verdict = '“Artıdasın. Dürtü sabırlı olanı sever.”';
  else if (Math.abs(net) < s.wagered * .3) verdict = '“Ufak bir eksi var; ritmini bozma, ara verdiğinde geçer.”';
  else verdict = '“Bu hafta kırmızıdasın. Dürtü söylemeden duramasın — limitin var.”';

  return (
    <Modal onClose={onClose} title="İstatistikler" className="pnl" style={{ width: 'min(460px,100%)' }}>
        <span className="tag">◈ Dürtü Raporu</span>
        <h3>Haftalık özetin{', ' + name}</h3>
        <p className="noteline">Dürtü hesabını tutar; senden saklamaz.</p>
        <div className="stat-rows">
          <div className="stat-row"><span>Tur sayısı (toplam)</span><b>{fmt(s.spins)}</b></div>
          <div className="stat-row"><span>Bahis hacmi</span><b>◈ {fmt(s.wagered)}</b></div>
          <div className="stat-row"><span>Toplam kazanç</span><b>◈ {fmt(s.won)}</b></div>
          <div className="stat-row"><span>Net</span><b className={net < 0 ? 'red' : ''}>{net >= 0 ? '+' : '−'} ◈ {fmt(Math.abs(net))}</b></div>
          <div className="stat-row"><span>En büyük tek kazanç</span><b>◈ {fmt(s.big)}</b></div>
          <div className="stat-row"><span>Şu anki bakiye</span><b>◈ {fmt(chips)}</b></div>
        </div>
        <div className="hist-head">Son turlar</div>
        <div className="hist-list">
          {s.hist.length === 0 && <div className="hrow"><span>Henüz kayıtlı tur yok.</span></div>}
          {s.hist.slice(0, 25).map((h, i) => {
            const d = new Date(h.ts);
            const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            const net2 = (h.win || 0) - (h.bet || 0);
            return (
              <div className="hrow" key={i}>
                <span><span className="hx">{hh}</span>  {h.game} · bahis ◈ {fmt(h.bet || 0)}</span>
                <b className={net2 >= 0 ? 'hw' : 'hl'}>
                  {h.win > 0 ? '+' + fmt(h.win) : (h.win !== 0 ? '' : (net2 < 0 ? '−' + fmt(h.bet || 0) : 'iade'))}
                  {h.win > 0 && h.mul ? <span className="hx"> ×{h.mul}</span> : null}
                </b>
              </div>
            );
          })}
        </div>
        <p className="serif" style={{ fontStyle: 'italic', color: 'var(--muted)', marginTop: '1rem', textAlign: 'center', lineHeight: 1.7 }}>{verdict}</p>
        <button className="btn solid" style={{ width: '100%' }} onClick={onClose}>Anlaşıldı</button>
      </Modal>
  );
}
