'use client';
import { useEffect, useRef, useState } from 'react';
import { fmt, say } from '../lib/toast';
import { logRound } from '../lib/store';
import { useRoundLock } from '../lib/useRoundLock';
import { acquireAudio, releaseAudio, tone } from '../lib/audio';
import Modal from './ui/Modal';
import BetControl from './ui/BetControl';
import { useEventCallback } from '../lib/useEventCallback';

export default function LimboGame({ chips, spend, win, onClose }) {
  const [bet, setBet] = useState(25);
  const [target, setTarget] = useState(2.0);
  const { busy: rolling, acquire, release } = useRoundLock();
  const [currDisplay, setCurrDisplay] = useState(1.0);
  const [lastResult, setLastResult] = useState(null); // { won: bool, mult: number }
  const [history, setHistory] = useState([]);
  const [turbo, setTurbo] = useState(false);
  const sfxRef = useRef(true);
  const rafRef = useRef(0);

  useEffect(() => {
    acquireAudio();
    return () => {
      cancelAnimationFrame(rafRef.current);
      releaseAudio();
    };
  }, []);

  // Win chance: (99 / target)% with 1% house edge
  const winChance = Math.min(98, Math.max(0.01, 98 / target)).toFixed(2);
  const winProfit = Math.round(bet * target - bet);

  function playTone(freq, dur = 0.08, type = 'sine', gain = 0.1) {
    if (!sfxRef.current) return;
    tone(freq, { dur, type, gain });
  }

  function handleTargetChange(val) {
    const num = Math.max(1.01, Math.min(10000, parseFloat(val) || 1.01));
    setTarget(num);
  }

  function handleWinChanceChange(val) {
    const chance = Math.max(0.01, Math.min(98, parseFloat(val) || 1));
    const derivedTarget = (98 / chance).toFixed(2);
    setTarget(parseFloat(derivedTarget));
  }

  function finalizeRound(round, outcome, isWon) {
    setCurrDisplay(outcome);
    release();
    setLastResult({ won: isWon, mult: outcome });
    setHistory(h => [{ won: isWon, mult: outcome, ts: Date.now() }, ...h].slice(0, 12));

    if (isWon) {
      const totalWin = Math.round(round.bet * round.target);   // snapshot'tan
      win(totalWin);
      logRound('Limbo', round.bet, totalWin, round.target);
      playTone(880, 0.15, 'triangle', 0.2);
      setTimeout(() => playTone(1320, 0.2, 'sine', 0.2), 100);
    } else {
      logRound('Limbo', round.bet, 0);
      playTone(180, 0.12, 'sawtooth', 0.15);
    }
  }

  const playRound = useEventCallback(() => {
    if (!acquire()) return;                    // senkron kilit
    if (!spend(bet)) {
      release();
      say('Yetersiz bakiye — fişi küçült.');
      return;
    }

    // TUR SÖZLEŞMESİ — ödeme bu dondurulmuş değerlere göre yapılır.
    // Eskiden kazanma kararı tur başındaki target'a, ödeme ise animasyon
    // bitişindeki target'a göre hesaplanıyordu: kullanıcı 1.01 ile başlayıp
    // sayaç dönerken hedefi 10000 yaparak her turu 10.000× ödetebiliyordu.
    const round = Object.freeze({ bet, target });

    const rawOutcome = 0.98 / (1 - Math.random());
    const outcome = Math.min(10000, Math.max(1.0, Math.floor(rawOutcome * 100) / 100));
    const isWon = outcome >= round.target;

    playTone(400, 0.05, 'triangle', 0.08);

    if (turbo) {
      finalizeRound(round, outcome, isWon);
      return;
    }

    const startTime = Date.now();
    const duration = 500;

    function step() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      setCurrDisplay(1.0 + (outcome - 1.0) * Math.pow(progress, 2));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        finalizeRound(round, outcome, isWon);
      }
    }
    rafRef.current = requestAnimationFrame(step);
  });



  return (
    <Modal onClose={onClose} title="Limbo" className="pnl" zIndex={75} style={{ width: 'min(560px, 98vw)', padding: '1.4rem 1.6rem' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <div>
            <span className="tag" style={{ color: 'var(--gold)' }}>🚀 KRİPTO ORİJİNAL</span>
            <h3 style={{ margin: '.2rem 0', fontSize: '1.4rem' }}>Limbo Rocket</h3>
          </div>

          {/* History bar */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: 280, paddingBottom: 4 }}>
            {history.map((h, i) => (
              <span
                key={h.ts + '-' + i}
                style={{
                  fontSize: '.65rem',
                  padding: '.15rem .4rem',
                  borderRadius: 4,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  background: h.won ? '#256d29' : '#2a2220',
                  color: h.won ? '#81c784' : '#b0a69a',
                  border: h.won ? '1px solid #4caf50' : '1px solid rgba(255,255,255,.05)',
                }}
              >
                {h.mult.toFixed(2)}×
              </span>
            ))}
          </div>
        </div>

        {/* Big Counter Screen */}
        <div
          style={{
            height: 200,
            background: 'radial-gradient(ellipse at center, #181926 0%, #0a0b12 100%)',
            border: lastResult?.won ? '1px solid #4caf50' : lastResult?.won === false ? '1px solid #d32f2f' : '1px solid rgba(255,255,255,.1)',
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '.8rem 0 1.2rem',
            position: 'relative',
            boxShadow: lastResult?.won ? '0 0 35px rgba(76,175,80,.25)' : 'none',
            transition: 'border .3s, box-shadow .3s',
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 'clamp(2.8rem, 8vw, 4.2rem)',
              fontWeight: 800,
              letterSpacing: '-.02em',
              color: lastResult?.won ? '#4caf50' : lastResult?.won === false ? '#e53935' : 'var(--cream)',
              textShadow: lastResult?.won ? '0 0 30px rgba(76,175,80,.6)' : 'none',
            }}
          >
            {currDisplay.toFixed(2)}×
          </div>

          <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 4 }}>
            Hedef: <b style={{ color: 'var(--gold)' }}>{target.toFixed(2)}×</b> · Kazanma Şansı: %{winChance}
          </div>

          {lastResult && (
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                fontSize: '.74rem',
                fontWeight: 600,
                color: lastResult.won ? '#81c784' : '#ef5350',
              }}
            >
              {lastResult.won ? `✓ HEDEF AŞILDI! +${fmt(winProfit)} dürTL KÂR` : `✕ HEDEFİN ALTINDA KALDI`}
            </div>
          )}
        </div>

        {/* Target Presets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
          {[1.5, 2.0, 3.0, 5.0, 10.0, 50.0, 100.0].map(m => (
            <button
              key={m}
              className={'btn ' + (target === m ? 'solid' : '')}
              style={{ flex: 1, padding: '.35rem 0', fontSize: '.68rem' }}
              onClick={() => handleTargetChange(m)}
            >
              {m}×
            </button>
          ))}
        </div>

        {/* Input Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.8rem' }}>
          {/* Bet Input */}
          <BetControl
            value={bet}
            onChange={setBet}
            max={chips}
            disabled={rolling}
          />

          {/* Target Multiplier Input */}
          <div>
            <label style={{ fontSize: '.68rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>HEDEF ÇARPAN (×)</label>
            <input
              type="number"
              step="0.1"
              min={1.01}
              max={10000}
              value={target}
              onChange={e => handleTargetChange(e.target.value)}
              disabled={rolling}
              className="inp"
              style={{ padding: '.45rem .6rem', fontSize: '.84rem', width: '100%' }}
            />
          </div>

          {/* Win Chance Input */}
          <div>
            <label style={{ fontSize: '.68rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>KAZANMA ŞANSI (%)</label>
            <input
              type="number"
              step="0.5"
              min={0.01}
              max={98}
              value={winChance}
              onChange={e => handleWinChanceChange(e.target.value)}
              disabled={rolling}
              className="inp"
              style={{ padding: '.45rem .6rem', fontSize: '.84rem', width: '100%' }}
            />
          </div>
        </div>

        {/* Action Button and Turbo */}
        <div style={{ display: 'flex', gap: '.6rem', marginTop: '1.2rem', alignItems: 'center' }}>
          <button
            className="btn solid"
            disabled={rolling}
            onClick={playRound}
            style={{
              flex: 2,
              padding: '.85rem',
              fontSize: '.92rem',
              fontWeight: 700,
              letterSpacing: '.14em',
              background: 'var(--gold)',
              color: '#000',
            }}
          >
            {rolling ? 'ROKETLİYOR…' : `ROKETLE ◈ ${bet} (+${fmt(winProfit)})`}
          </button>

          <button
            className={'btn ' + (turbo ? 'solid' : 'ghost')}
            onClick={() => setTurbo(t => !t)}
            style={{ padding: '.85rem 1.2rem', fontSize: '.78rem', whiteSpace: 'nowrap' }}
          >
            ⚡ {turbo ? 'TURBO AÇIK' : 'TURBO'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.7rem', fontSize: '.7rem', color: 'var(--muted)' }}>
          <span>Hedefte Net Kazanç: <b style={{ color: 'var(--green)' }}>+{fmt(winProfit)} dürTL</b></span>
          <span>Bakiye: ◈ {fmt(chips)} dürTL</span>
        </div>
      </Modal>
  );
}
