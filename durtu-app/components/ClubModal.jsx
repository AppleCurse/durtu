'use client';
// DÜRTÜ — Kulüp paneli: VIP kademe · kayıp iadesi (discount) · gece yakıtı.
//
// Sahadaki sadakat dili: "Kaybettiğimde bana ne veriyorsun?"
// Tüm hesap lib/club.js'te; bu bileşen yalnızca okur, eylemi tetikler ve
// parayı sayfanın tek doğruluk kaynağı olan win() üzerinden kasaya işler.

import { useEffect, useState } from 'react';
import { fmt, say, html } from '../lib/toast';
import { clubView, claimRebate, takeRescue, rescueCheck, TIERS } from '../lib/club';
import { addLedger } from '../lib/store';
import { acquireAudio, releaseAudio, coinRain, fanfare } from '../lib/audio';
import Modal from './ui/Modal';
import { useEventCallback } from '../lib/useEventCallback';

const pct = r => '%' + Math.round(r * 100);

export default function ClubModal({ chips, win, onClose }) {
  const [v, setV] = useState(() => clubView());
  const [flash, setFlash] = useState('');

  // Kulüp kaydı her turda değişir; nav ve panel aynı olayı dinler.
  useEffect(() => {
    const refresh = () => setV(clubView());
    window.addEventListener('durtu:club', refresh);
    return () => window.removeEventListener('durtu:club', refresh);
  }, []);

  useEffect(() => {
    acquireAudio();
    return () => releaseAudio();
  }, []);

  const rescue = rescueCheck(v.state, chips);
  const progress = v.next ? Math.min(1, v.state.lifeWagered / v.next.min) : 1;

  const onClaim = useEventCallback(() => {
    const r = claimRebate();
    if (!r.ok) {
      say(
        r.reason === 'NO_NET_LOSS'
          ? '<b>Selin:</b> bugün net kaybın yok — iade edilecek bir şey de yok. Bu akşam masayı sen yendin.'
          : '<b>Selin:</b> bu turun iadesi zaten kasanda. Yeni net kayıp oluşunca tekrar dolacak.'
      );
      return;
    }
    win(r.amount);
    addLedger('deposit', `💎 Kayıp İadesi — ${r.tier.name} (${pct(r.tier.rate)})`, r.amount, 'ok');
    coinRain();
    fanfare([523, 659, 784, 1046], { gain: 0.1, step: 0.07 });
    setFlash('rebate');
    setTimeout(() => setFlash(''), 900);
    say(html`💬 <b>Selin:</b> kulüp kuralı işledi — gece kaybının <b>${pct(r.tier.rate)}</b>’i, ◈ <b>${fmt(r.amount)}</b> dürTL kasana aktarıldı. Devam edelim mi?`);
  });

  const onRescue = useEventCallback(() => {
    const r = takeRescue(chips);
    if (!r.ok) {
      say(
        r.reason === 'COOL_OFF'
          ? '🧭 <b>Selin:</b> mola aktifken yakıt vermiyorum — bu kural kasıtlı, seni koruyor.'
          : r.reason === 'BALANCE_POSITIVE'
          ? '<b>Selin:</b> kasan henüz boş değil — yakıtı sıfırı görünce konuşuruz.'
          : r.reason === 'NOT_ENOUGH_PLAY'
            ? html`<b>Selin:</b> yakıt için bu kademede en az ◈ <b>${fmt(r.tier.rescueMin)}</b> dürTL çevrim gerekiyor.`
            : '<b>Selin:</b> bu gece yakıtını zaten aldın. Yarın kapı yine açık.'
      );
      return;
    }
    win(r.amount);
    addLedger('deposit', `🌙 Gece Yakıtı — ${r.tier.name}`, r.amount, 'ok');
    coinRain({ count: 10 });
    setFlash('rescue');
    setTimeout(() => setFlash(''), 900);
    say(html`💬 <b>Selin:</b> kasa boşaldı ama gece bitmedi — ◈ <b>${fmt(r.amount)}</b> dürTL yakıt kasanda. Yine de: bu akşam son elin olsun, olur mu?`);
  });

  return (
    <Modal onClose={onClose} title="Kulüp" className="pnl" style={{ width: 'min(540px,100%)' }}>
      <span className="tag">✦ DÜRTÜ Kulüp Katı</span>
      <h3>{v.tier.icon} {v.tier.name}</h3>
      <p className="noteline">
        İade seni oyunda tutmak için yok — masada kalma kararını sana bırakmak için var.
        Limitini sen koyarsın, Dürtü onu aşmaz.
      </p>

      <div className="stat-rows">
        <div className="stat-row">
          <span>Ömür boyu çevrim</span><b>◈ {fmt(v.state.lifeWagered)}</b>
        </div>
        <div className="stat-row">
          <span>Bugünkü net kayıp</span>
          <b className={v.netLoss > 0 ? 'red' : undefined}>◈ {fmt(v.netLoss)}</b>
        </div>
        <div className="stat-row">
          <span>Kademe iade oranı</span><b>{pct(v.tier.rate)} · günlük tavan ◈ {fmt(v.tier.cap)}</b>
        </div>
        <div className="stat-row">
          <span>Bugün çekilen iade</span><b>◈ {fmt(v.state.claimed)}</b>
        </div>
      </div>

      {v.next && (
        <div style={{ margin: '.9rem 0 .3rem' }}>
          <div className="stat-row" style={{ border: 'none', paddingBottom: '.25rem' }}>
            <span>Sıradaki kademe: {v.next.icon} {v.next.name} ({pct(v.next.rate)} iade)</span>
            <b>◈ {fmt(v.toNext)} kaldı</b>
          </div>
          <div style={{ height: 6, background: '#1a1710', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(212,175,55,.2)' }}>
            <div style={{ width: (progress * 100) + '%', height: '100%', background: 'linear-gradient(90deg,#8a6a20,#f6e27a)', transition: 'width .6s' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.1rem', flexWrap: 'wrap' }}>
        <button
          className={'btn solid' + (flash === 'rebate' ? ' on' : '')}
          style={{ flex: '1 1 200px' }}
          onClick={onClaim}
          disabled={v.claimable <= 0}
        >
          {v.claimable > 0 ? `💎 İadeyi Al — ◈ ${fmt(v.claimable)}` : '💎 İade tahakkuk etmedi'}
        </button>
      </div>

      <div style={{ marginTop: '1rem', borderTop: '1px dashed rgba(212,175,55,.18)', paddingTop: '.9rem' }}>
        <div className="stat-row" style={{ border: 'none' }}>
          <span>🌙 Gece Yakıtı — kasa sıfırlanınca bir kez</span>
          <b>◈ {fmt(v.tier.rescue)}</b>
        </div>
        <p className="muted" style={{ fontSize: '.68rem', margin: '.2rem 0 .7rem' }}>
          {rescue.ok
            ? 'Kasan boş. Selin sana bir yakıt ayırdı — günde bir kez.'
            : rescue.reason === 'ALREADY_TODAY'
              ? 'Bu gece yakıtını zaten aldın.'
              : rescue.reason === 'NOT_ENOUGH_PLAY'
                ? html`Bu kademenin yakıtı için ömür boyu ◈ ${fmt(v.tier.rescueMin)} çevrim gerekiyor.`
                : 'Kasan boşaldığında bu düğme açılır.'}
        </p>
        <button
          className="btn"
          style={{ width: '100%' }}
          onClick={onRescue}
          disabled={!rescue.ok}
        >
          {rescue.ok ? `🌙 Gece Yakıtını Al — ◈ ${fmt(rescue.amount)}` : '🌙 Gece Yakıtı'}
        </button>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
        {TIERS.map(t => (
          <span
            key={t.id}
            className="tag"
            style={{
              opacity: v.state.lifeWagered >= t.min ? 1 : 0.38,
              borderColor: t.id === v.tier.id ? 'var(--gold)' : undefined,
            }}
          >
            {t.icon} {t.name}
          </span>
        ))}
      </div>
    </Modal>
  );
}
