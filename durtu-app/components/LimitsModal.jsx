'use client';
// DÜRTÜ — Sorumlu oyun paneli: kayıp limiti · gerçeklik molası · kendini men.
//
// Kural: oyuncunun koyduğu sınır, oyun kodunun hiçbir yolundan dolanılamaz.
// Bahis kapısı page.spend() içinde `gateBet()` ile bakiyeden ÖNCE denetlenir;
// gece yakıtı da mola sırasında verilmez (lib/club.js).

import { useEffect, useState } from 'react';
import { fmt, say, html } from '../lib/toast';
import {
  getLimits, setLimitLive, coolOffLive, resetSessionLive, isCoolingOff,
  sessionNetLossOf, COOL_OFF_CHOICES, LOOSEN_DELAY_MS,
} from '../lib/limits';
import Modal from './ui/Modal';
import { useEventCallback } from '../lib/useEventCallback';

const LOSS_STEPS = [0, 250, 500, 1000, 2500, 5000];
const CHECK_STEPS = [0, 15, 30, 60, 120];

const remaining = until => {
  const ms = Math.max(0, until - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
};

export default function LimitsModal({ onClose }) {
  const [s, setS] = useState(() => getLimits());
  const [now, setNow] = useState(() => Date.now());

  // Mola geri sayımı + dışarıdan gelen limit değişimleri.
  useEffect(() => {
    const refresh = () => { setS(getLimits()); setNow(Date.now()); };
    const iv = setInterval(refresh, 1000);
    window.addEventListener('durtu:limits', refresh);
    return () => { clearInterval(iv); window.removeEventListener('durtu:limits', refresh); };
  }, []);

  const netLoss = sessionNetLossOf(s);
  const cooling = isCoolingOff(s, now);
  const sessionMin = Math.max(0, Math.round((now - s.sessionStartedAt) / 60000));

  const pick = useEventCallback((key, value) => {
    const r = setLimitLive(key, value);
    if (r.reason === 'DEFERRED') {
      say(
        html`🧭 Limit <b>gevşetmesi kaydedildi</b> — 24 saat sonra (◈ ${fmt(
          value
        )} dürTL) yürürlüğe girer. O zamana kadar mevcut, daha sıkı sınır geçerli.`
      );
    } else if (r.reason !== 'NO_CHANGE') {
      say(html`🧭 <b>Yeni sınırın aktif:</b> ◈ ${fmt(value)} dürTL. Sıkılaştırma anında işler.`);
    }
    setS(getLimits());
  });

  const takeBreak = useEventCallback(minutes => {
    const r = coolOffLive(minutes);
    if (r.reason === 'OK') {
      say(html`🧭 <b>Mola başladı.</b> ${fmt(
        Math.trunc(minutes / 60) >= 24 ? Math.trunc(minutes / 1440) + ' gün' : Math.trunc(minutes / 60) + ' saat'
      )} boyunca hiçbir bahis kabul edilmeyecek. Erken bitirme yok — bu kural seni koruyor.`);
    }
    setS(getLimits());
    setNow(Date.now());
  });

  return (
    <Modal onClose={onClose} title="Sorumlu Oyun" className="pnl" style={{ width: 'min(540px,100%)' }}>
      <span className="tag">🧭 Sorumlu Oyun</span>
      <h3>Sınırı sen koyarsın, Dürtü aşamaz</h3>
      <p className="noteline">
        Kulüp iadesi ve gece yakıtı seni masada tutmaya çalışan mekaniklerdir. Buradaki
        sınırlar ise ters yönde çalışır: bahis kapısı, bakiyeden <b>önce</b> bu değerlere bakar.
      </p>

      <div className="stat-rows">
        <div className="stat-row"><span>Bu oturumun süresi</span><b>{fmt(sessionMin)} dk</b></div>
        <div className="stat-row"><span>Oturum çevrimi</span><b>◈ {fmt(s.sessionWagered)}</b></div>
        <div className="stat-row">
          <span>Oturum net kaybı</span>
          <b className={netLoss > 0 ? 'red' : undefined}>◈ {fmt(netLoss)}</b>
        </div>
        <div className="stat-row"><span>Engellenen bahis denemesi</span><b>{fmt(s.betsBlocked)}</b></div>
        <div className="stat-row"><span>Gerçeklik molası uyarısı</span><b>{fmt(s.realityChecks)} kez</b></div>
      </div>

      {cooling && (
        <div style={{ margin: '.9rem 0', padding: '.7rem .85rem', borderRadius: 8, border: '1px solid var(--red)', background: 'rgba(200,80,64,.1)' }}>
          <b style={{ color: 'var(--red)', fontSize: '.8rem' }}>⏸ Mola aktif — kalan {remaining(s.coolOffUntil)}</b>
          <p className="muted" style={{ fontSize: '.66rem', margin: '.3rem 0 0' }}>
            Bu süre dolmadan hiçbir bahis kabul edilmez ve gece yakıtı verilmez.
            Erken çıkış kapalıdır.
          </p>
        </div>
      )}

      {/* ── Oturum kayıp limiti ── */}
      <p className="muted" style={{ fontSize: '.7rem', margin: '1rem 0 .45rem' }}>
        <b style={{ color: 'var(--gold2)' }}>Oturum kayıp limiti</b> — net kayıp bu değere ulaşınca bahis durur.
      </p>
      <div className="chiprow" style={{ flexWrap: 'wrap' }}>
        {LOSS_STEPS.map(v => (
          <button
            key={v}
            className={'chipB' + (s.sessionLossLimit === v ? ' on' : '')}
            style={{ width: 62, height: 40, borderRadius: 8 }}
            onClick={() => pick('sessionLossLimit', v)}
            title={v === 0 ? 'Limit kapalı' : `◈ ${fmt(v)} net kayıpta dur`}
          >
            {v === 0 ? 'Kapalı' : fmt(v)}
          </button>
        ))}
      </div>
      {s.pending?.key === 'sessionLossLimit' && (
        <p className="muted" style={{ fontSize: '.66rem', marginTop: '.4rem' }}>
          ⏳ Bekleyen gevşetme: ◈ {fmt(s.pending.value)} — yürürlük {new Date(s.pending.at).toLocaleString('tr-TR')}
        </p>
      )}

      {/* ── Gerçeklik molası ── */}
      <p className="muted" style={{ fontSize: '.7rem', margin: '1rem 0 .45rem' }}>
        <b style={{ color: 'var(--gold2)' }}>Gerçeklik molası</b> — kaç dakikada bir süre/net kayıp hatırlatılsın?
      </p>
      <div className="chiprow" style={{ flexWrap: 'wrap' }}>
        {CHECK_STEPS.map(v => (
          <button
            key={v}
            className={'chipB' + (s.realityCheckMin === v ? ' on' : '')}
            style={{ width: 62, height: 40, borderRadius: 8 }}
            onClick={() => pick('realityCheckMin', v)}
          >
            {v === 0 ? 'Kapalı' : v + ' dk'}
          </button>
        ))}
      </div>

      {/* ── Kendini men ── */}
      <p className="muted" style={{ fontSize: '.7rem', margin: '1.1rem 0 .45rem' }}>
        <b style={{ color: 'var(--gold2)' }}>Mola ver</b> — süre dolmadan açılamaz.
      </p>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {COOL_OFF_CHOICES.map(c => (
          <button
            key={c.min}
            className="btn"
            style={{ flex: '1 1 96px' }}
            onClick={() => takeBreak(c.min)}
            disabled={cooling}
          >
            {c.label}
          </button>
        ))}
      </div>

      <button
        className="btn ghost"
        style={{ width: '100%', marginTop: '.9rem' }}
        onClick={() => { resetSessionLive(); setS(getLimits()); say('🧭 Oturum sayaçları sıfırlandı. Limitlerin ve mola durumun korundu.'); }}
      >
        ↻ Oturum sayaçlarını sıfırla
      </button>

      <p className="muted" style={{ fontSize: '.62rem', marginTop: '.9rem', textAlign: 'center', lineHeight: 1.7 }}>
        Gevşetmeler {fmt(LOOSEN_DELAY_MS / 3600000)} saat gecikmeli yürürlüğe girer; sıkılaştırmalar anında.
        Bu bir demo: gerçek para yok. Kumar oynama dürtüsü kontrolden çıkıyorsa
        Yeşilay Danışmanlık Merkezi (YEDAM) 115 hattını arayabilirsin.
      </p>
    </Modal>
  );
}
