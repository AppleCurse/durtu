'use client';
import { useEffect, useState, useRef } from 'react';
import { fmt, say } from '../lib/toast';
import { logRound } from '../lib/store';
import { randomCard, hiloOdds, evaluateGuess } from '../lib/engines/hilo';
import { acquireAudio, releaseAudio, tone } from '../lib/audio';
import Modal from './ui/Modal';

export default function HiloGame({ chips, spend, win, onClose }) {
  const [bet, setBet] = useState(25);
  const [activeCard, setActiveCard] = useState(() => randomCard());
  const [cardHistory, setCardHistory] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [multiplier, setMultiplier] = useState(1.0);
  const [streak, setStreak] = useState(0);
  const [msg, setMsg] = useState({ t: 'Bahsini seç ve tura başla.', cls: '' });
  const sfxRef = useRef(true);

  function playTone(freq, dur = 0.08, type = 'sine', gain = 0.1) {
    if (!sfxRef.current) return;
    tone(freq, { dur, type, gain });
  }

  useEffect(() => {
    acquireAudio();
    return () => releaseAudio();
  }, []);

  // Adil oranlar — eşitlik KAYBEDER (house edge kaynağı).
  const { pHigher, pLower, higherMult, lowerMult } = hiloOdds(activeCard.v);

  function startRound() {
    if (!spend(bet)) {
      say('Yetersiz bakiye — fişi küçült.');
      return;
    }
    const card = randomCard();
    setActiveCard(card);
    setCardHistory([card]);
    setPlaying(true);
    setMultiplier(1.0);
    setStreak(0);
    setMsg({ t: 'Kart açıldı. Yüksek mi, Düşük mü tahmin et.', cls: '' });
    playTone(600, 0.06, 'triangle', 0.12);
  }

  function skipCard() {
    if (!playing || streak > 0) return;
    const card = randomCard();
    setActiveCard(card);
    setCardHistory([card]);
    playTone(500, 0.05, 'sine', 0.08);
  }

  function guess(direction) {
    if (!playing) return;

    const stepMult = direction === 'hi' ? higherMult : lowerMult;
    if (stepMult == null) {
      // A'da 'düşük', K'da 'yüksek' imkânsızdır — çarpan uydurulmaz, bahis alınmaz.
      say('Bu kartta o yön imkânsız — diğer yönü seç.');
      return;
    }

    const nextCard = randomCard();
    const isCorrect = evaluateGuess(direction, activeCard, nextCard);
    const isTie = nextCard.v === activeCard.v;

    if (isCorrect) {
      const newMult = Number((multiplier * stepMult).toFixed(2));
      const newStreak = streak + 1;
      setMultiplier(newMult);
      setStreak(newStreak);
      setActiveCard(nextCard);
      setCardHistory(h => [nextCard, ...h]);
      playTone(750 + newStreak * 50, 0.1, 'triangle', 0.15);
      setMsg({
        t: `Doğru! ${nextCard.r}${nextCard.suit} geldi. Çarpan: ${newMult.toFixed(2)}× (Kasa: ${fmt(Math.round(bet * newMult))} dürTL)`,
        cls: 'win',
      });
    } else {
      setPlaying(false);
      setActiveCard(nextCard);
      setCardHistory(h => [nextCard, ...h]);
      playTone(160, 0.2, 'sawtooth', 0.15);
      setMsg({
        t: isTie
          ? `Eşitlik! ${nextCard.r}${nextCard.suit} geldi — eşitlik kasaya yazılır, bahis elden çıktı.`
          : `Bilemedin! ${nextCard.r}${nextCard.suit} geldi — bahis elden çıktı.`,
        cls: 'lose',
      });
      logRound('Hi-Lo', bet, 0);
    }
  }

  function cashout() {
    if (!playing || streak === 0) return;
    const totalWin = Math.round(bet * multiplier);
    win(totalWin);
    setPlaying(false);
    logRound('Hi-Lo', bet, totalWin, multiplier);
    playTone(880, 0.18, 'triangle', 0.2);
    setTimeout(() => playTone(1320, 0.25, 'sine', 0.2), 120);
    setMsg({
      t: `Kasada! ${streak} doğru tahminle ◈ +${fmt(totalWin - bet)} dürTL kâr sağlandı.`,
      cls: 'win',
    });
  }

  const isRed = activeCard.suit === '♥' || activeCard.suit === '♦';

  return (
    <Modal onClose={onClose} title="Hi-Lo" className="pnl" zIndex={75} style={{ width: 'min(580px, 98vw)', padding: '1.4rem 1.6rem' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <div>
            <span className="tag" style={{ color: 'var(--gold)' }}>🃏 SERİ STRATEJİSİ</span>
            <h3 style={{ margin: '.2rem 0', fontSize: '1.4rem' }}>Hi-Lo Yüksek / Düşük</h3>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>Bakiye</span>
            <div style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--gold)' }}>◈ {fmt(chips)} dürTL</div>
          </div>
        </div>

        {/* Center Card Stage */}
        <div
          style={{
            background: 'radial-gradient(ellipse at center, #1c261e 0%, #0c120e 100%)',
            border: '1px solid rgba(212,175,55,.25)',
            borderRadius: 14,
            padding: '1.4rem',
            textAlign: 'center',
            position: 'relative',
            margin: '.8rem 0 1.2rem',
            boxShadow: 'inset 0 0 35px rgba(0,0,0,.7)',
          }}
        >
          {/* Streak indicator */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '.72rem', color: 'var(--muted)', background: 'rgba(255,255,255,.05)', padding: '.2rem .6rem', borderRadius: 20 }}>
              🔥 Seri: <b>{streak} Kart</b>
            </span>
            <span style={{ fontSize: '.84rem', fontWeight: 700, color: multiplier > 1 ? 'var(--gold2)' : 'var(--muted)' }}>
              {multiplier.toFixed(2)}× Çarpan
            </span>
          </div>

          {/* Realistic Playing Card */}
          <div
            style={{
              width: 120,
              height: 170,
              background: '#ffffff',
              borderRadius: 12,
              margin: '0 auto',
              color: isRed ? '#d32f2f' : '#111111',
              boxShadow: '0 12px 35px rgba(0,0,0,.6), 0 0 12px rgba(255,255,255,.15)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '.8rem',
              border: '2px solid #e0e0e0',
              position: 'relative',
              userSelect: 'none',
              transform: 'scale(1)',
              transition: 'transform .2s',
            }}
          >
            <div style={{ textAlign: 'left', lineHeight: 1 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{activeCard.r}</div>
              <div style={{ fontSize: '1.1rem' }}>{activeCard.suit}</div>
            </div>

            <div style={{ fontSize: '2.8rem', textAlign: 'center', margin: 'auto' }}>
              {activeCard.suit}
            </div>

            <div style={{ textAlign: 'right', lineHeight: 1, transform: 'rotate(180deg)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{activeCard.r}</div>
              <div style={{ fontSize: '1.1rem' }}>{activeCard.suit}</div>
            </div>
          </div>

          <div className={'bj-msg' + (msg.cls ? ' ' + msg.cls : '')} style={{ marginTop: '1rem', minHeight: 28 }}>
            {msg.t}
          </div>

          {/* History strip */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: '.8rem', overflowX: 'auto' }}>
            {cardHistory.slice(0, 8).map((c, i) => {
              const red = c.suit === '♥' || c.suit === '♦';
              return (
                <div
                  key={i}
                  style={{
                    fontSize: '.72rem',
                    background: '#fff',
                    color: red ? '#d32f2f' : '#111',
                    padding: '.2rem .4rem',
                    borderRadius: 4,
                    fontWeight: 700,
                  }}
                >
                  {c.r}{c.suit}
                </div>
              );
            })}
          </div>
        </div>

        {/* Prediction Buttons */}
        {playing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem', marginBottom: '1rem' }}>
            <button
              className="btn solid"
              onClick={() => guess('hi')}
              disabled={higherMult == null}
              style={{
                padding: '1rem .5rem',
                fontSize: '.9rem',
                background: 'linear-gradient(180deg, #2e7d32, #1b5e20)',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                border: '1px solid #4caf50',
              }}
            >
              <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>▲ YÜKSEK</span>
              <span style={{ fontSize: '.72rem', opacity: .9 }}>
                {higherMult == null ? 'imkânsız' : `${higherMult}× · %${Math.round(pHigher * 100)} Şans`}
              </span>
            </button>

            <button
              className="btn solid"
              onClick={() => guess('lo')}
              disabled={lowerMult == null}
              style={{
                padding: '1rem .5rem',
                fontSize: '.9rem',
                background: 'linear-gradient(180deg, #c62828, #8e0000)',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                border: '1px solid #ef5350',
              }}
            >
              <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>▼ DÜŞÜK</span>
              <span style={{ fontSize: '.72rem', opacity: .9 }}>
                {lowerMult == null ? 'imkânsız' : `${lowerMult}× · %${Math.round(pLower * 100)} Şans`}
              </span>
            </button>
          </div>
        ) : null}

        {/* Action / Bottom Controls */}
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
          {!playing ? (
            <>
              <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                <input
                  type="number"
                  min={1}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Number(e.target.value)))}
                  className="inp"
                  style={{ padding: '.5rem', fontSize: '.84rem', width: '100%' }}
                />
                <button className="btn" style={{ padding: '.2rem .5rem', fontSize: '.65rem' }} onClick={() => setBet(b => Math.max(1, Math.floor(b / 2)))}>½</button>
                <button className="btn" style={{ padding: '.2rem .5rem', fontSize: '.65rem' }} onClick={() => setBet(b => b * 2)}>2×</button>
              </div>

              <button
                className="btn solid"
                onClick={startRound}
                style={{ flex: 1.5, padding: '.8rem', fontSize: '.9rem', background: 'var(--gold)', color: '#000', fontWeight: 700 }}
              >
                TURA BAŞLA (◈ {bet})
              </button>
            </>
          ) : (
            <>
              {streak === 0 && (
                <button className="btn ghost" onClick={skipCard} style={{ flex: 1, padding: '.75rem', fontSize: '.78rem' }}>
                  🔄 Kartı Değiştir
                </button>
              )}
              <button
                className="btn solid"
                disabled={streak === 0}
                onClick={cashout}
                style={{
                  flex: 2,
                  padding: '.8rem',
                  fontSize: '.92rem',
                  fontWeight: 700,
                  background: streak > 0 ? 'var(--gold)' : 'rgba(255,255,255,.1)',
                  color: streak > 0 ? '#000' : 'var(--muted)',
                }}
              >
                KASAYA GİR ◈ {fmt(Math.round(bet * multiplier))} dürTL
              </button>
            </>
          )}
        </div>
      </Modal>
  );
}
