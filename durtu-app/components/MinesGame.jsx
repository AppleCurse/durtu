'use client';
import { useEffect, useState, useRef } from 'react';
import { fmt, say } from '../lib/toast';
import { logRound } from '../lib/store';
import { calcMultiplier, placeMines, GRID_SIZE } from '../lib/engines/mines';
import { acquireAudio, releaseAudio, tone, fanfare } from '../lib/audio';

const QUICK_MINES = [1, 2, 3, 5, 10, 15, 20, 24];

export default function MinesGame({ chips, spend, win, onClose }) {
  const [bet, setBet] = useState(25);
  const [mineCount, setMineCount] = useState(3);
  const [grid, setGrid] = useState(null); // boolean[25] mines
  const [revealed, setRevealed] = useState([]); // indices
  const [busted, setBusted] = useState(false);
  const [cashed, setCashed] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [msg, setMsg] = useState({ t: 'Mayın sayısını ve bahsini seç, tarlayı başlat.', cls: '' });
  const sfxRef = useRef(true);
  const betRef = useRef(25);
  const minesRef = useRef(3);
  const bustedRef = useRef(false);
  const cashedRef = useRef(false);

  const playing = !!grid && !busted && !cashed;
  const gemCount = revealed.length;
  const currentMult = calcMultiplier(mineCount, gemCount);
  const nextMult = calcMultiplier(mineCount, gemCount + 1);
  const currentProfit = Math.round(bet * currentMult) - bet;

  function playGemSound(gemIndex) {
    if (!sfxRef.current) return;
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];
    tone(scale[gemIndex % scale.length], { dur: 0.22, type: 'triangle', gain: 0.12 });
  }

  function playBombSound() {
    if (!sfxRef.current) return;
    tone(140, { dur: 0.45, type: 'sawtooth', gain: 0.3 });
  }

  function playCashoutSound() {
    if (!sfxRef.current) return;
    fanfare([659, 784, 1046, 1318], { gain: 0.12 });
  }

  useEffect(() => {
    acquireAudio();
    return () => releaseAudio();
  }, []);

  function start() {
    if (playing) return;
    if (!spend(bet)) {
      say('Yetersiz bakiye — fişi küçült.');
      return;
    }
    betRef.current = bet;              // tur boyunca sabit bahis
    minesRef.current = mineCount;
    bustedRef.current = false;
    cashedRef.current = false;

    setGrid(placeMines(mineCount));
    setRevealed([]);
    setBusted(false);
    setCashed(false);
    setRevealed([]);
    setMsg({ t: 'Tarla hazır! Karoları seç — elmaslar çarpanı katlar.', cls: '' });
  }

  function pickTile(index) {
    if (!playing || bustedRef.current || cashedRef.current || revealed.includes(index)) return;

    if (grid[index]) {
      // Mine hit!
      bustedRef.current = true;
      setBusted(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 450);
      playBombSound();
      setMsg({ t: `💣 MAYIN PATLADI! ◈ ${fmt(bet)} dürTL tarlada kaldı.`, cls: 'lose' });
      logRound('Mines Deluxe', bet, 0);
      return;
    }

    const nextRevealed = [...revealed, index];
    setRevealed(nextRevealed);
    playGemSound(nextRevealed.length - 1);

    const safeTilesTotal = GRID_SIZE - mineCount;
    if (nextRevealed.length === safeTilesTotal) {
      // Cleared entire field!
      cashout(nextRevealed);
    } else {
      const mult = calcMultiplier(mineCount, nextRevealed.length);
      setMsg({
        t: `💎 ${nextRevealed.length}. Elmas! Çarpan: ${mult.toFixed(2)}× (Kasa: ${fmt(Math.round(bet * mult))} dürTL)`,
        cls: 'win',
      });
    }
  }

  function randomPick() {
    if (!playing) return;
    const remaining = [];
    for (let i = 0; i < 25; i++) {
      if (!revealed.includes(i)) remaining.push(i);
    }
    if (remaining.length > 0) {
      const lucky = remaining[Math.floor(Math.random() * remaining.length)];
      pickTile(lucky);
    }
  }

  function cashout(forceArr) {
    const list = forceArr || revealed;
    // Aynı render frame'inde mayına basıp cashout tetiklenirse `playing` hâlâ
    // true görünüyordu → patlamış turdan ödeme. Ref'ler senkron olduğu için kapatır.
    if (bustedRef.current || cashedRef.current) return;
    if (!playing && !forceArr) return;
    if (list.length === 0) return;
    cashedRef.current = true;

    const mult = calcMultiplier(mineCount, list.length);
    const totalPrize = Math.round(bet * mult);

    win(totalPrize);
    setCashed(true);
    playCashoutSound();
    setMsg({
      t: `★ KASADAN ÇIKILDI! ${list.length} elmas ile ◈ +${fmt(totalPrize - bet)} dürTL kâr sağlandı.`,
      cls: 'win',
    });
    logRound('Mines Deluxe', bet, totalPrize, mult);
  }

  return (
    <div className="ovl" onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 75 }}>
      <div className="pnl" style={{ width: 'min(580px, 98vw)', padding: '1.4rem 1.6rem' }}>
        <button className="close" onClick={onClose}>✕</button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
          <div>
            <span className="tag" style={{ color: 'var(--gold)' }}>💣 MAYIN TARLASI DELUXE</span>
            <h3 style={{ margin: '.1rem 0', fontSize: '1.4rem' }}>Mines Deluxe</h3>
          </div>
          <div style={{ textAlign: 'right', fontSize: '.75rem', color: 'var(--muted)' }}>
            Bakiye: <b style={{ color: 'var(--gold)' }}>◈ {fmt(chips)} dürTL</b>
          </div>
        </div>

        {/* Live HUD Multiplier Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 6,
            background: 'rgba(0,0,0,.4)',
            padding: '.6rem',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,.08)',
            margin: '.6rem 0 .8rem',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '.64rem', color: 'var(--muted)' }}>GÜNCEL ÇARPAN</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: gemCount > 0 ? 'var(--gold2)' : 'var(--cream)' }}>
              {currentMult.toFixed(2)}×
            </div>
          </div>
          <div>
            <div style={{ fontSize: '.64rem', color: 'var(--muted)' }}>SONRAKİ ELMAS</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#81c784' }}>
              {playing && gemCount < GRID_SIZE - mineCount ? `${nextMult.toFixed(2)}×` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '.64rem', color: 'var(--muted)' }}>KALAN GÜVENLİ</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--cream)' }}>
              {grid ? GRID_SIZE - mineCount - gemCount : GRID_SIZE - mineCount}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '.64rem', color: 'var(--muted)' }}>TAHSİLAT</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: gemCount > 0 ? 'var(--green)' : 'var(--muted)' }}>
              {gemCount > 0 ? `◈ ${fmt(Math.round(bet * currentMult))}` : '—'}
            </div>
          </div>
        </div>

        {/* 5x5 Grid Board */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
            margin: '.6rem 0',
            background: 'radial-gradient(circle at center, #181c20 0%, #0d1013 100%)',
            padding: '.9rem',
            borderRadius: 14,
            border: '2px solid rgba(255,255,255,.08)',
            boxShadow: 'inset 0 0 25px rgba(0,0,0,.7)',
            transform: shaking ? 'translateX(-6px)' : 'none',
            transition: 'transform .08s ease',
          }}
        >
          {Array.from({ length: 25 }, (_, i) => {
            const isRevealed = revealed.includes(i);
            const isMine = grid && grid[i];
            const showAll = busted || cashed;

            let bg = 'linear-gradient(180deg, #2b323b, #1d2229)';
            let borderColor = 'rgba(255,255,255,.12)';
            let content = '';

            if (isRevealed) {
              bg = 'radial-gradient(circle, #2e7d32, #1b5e20)';
              borderColor = '#4caf50';
              content = '💎';
            } else if (showAll) {
              if (isMine) {
                bg = 'radial-gradient(circle, #b71c1c, #4a0000)';
                borderColor = '#ef5350';
                content = '💣';
              } else {
                bg = 'rgba(255,255,255,.04)';
                borderColor = 'rgba(255,255,255,.05)';
                content = '💎';
              }
            }

            return (
              <button
                key={i}
                disabled={!playing || isRevealed}
                onClick={() => pickTile(i)}
                style={{
                  aspectRatio: '1/1',
                  background: bg,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 10,
                  fontSize: '1.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: playing && !isRevealed ? 'pointer' : 'default',
                  boxShadow: isRevealed
                    ? '0 0 16px rgba(76,175,80,.6)'
                    : showAll && isMine
                    ? '0 0 16px rgba(239,83,80,.6)'
                    : '0 4px 10px rgba(0,0,0,.4)',
                  transform: isRevealed ? 'scale(1.02)' : 'scale(1)',
                  transition: 'transform .15s, background .2s, border-color .2s',
                  opacity: showAll && !isMine && !isRevealed ? 0.35 : 1,
                }}
              >
                {content}
              </button>
            );
          })}
        </div>

        <div className={'bj-msg' + (msg.cls ? ' ' + msg.cls : '')} style={{ minHeight: 24, margin: '.4rem 0' }}>
          {msg.t}
        </div>

        {/* Setup Controls (when not in a round) */}
        {!playing && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem', margin: '.6rem 0' }}>
            {/* Bet Selector */}
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>BAHİS (dürTL)</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="number"
                  min={1}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Number(e.target.value)))}
                  className="inp"
                  style={{ padding: '.45rem', fontSize: '.84rem', width: '100%' }}
                />
                <button className="btn" style={{ padding: '.2rem .5rem', fontSize: '.65rem' }} onClick={() => setBet(b => Math.max(1, Math.floor(b / 2)))}>½</button>
                <button className="btn" style={{ padding: '.2rem .5rem', fontSize: '.65rem' }} onClick={() => setBet(b => b * 2)}>2×</button>
              </div>
            </div>

            {/* Mines Count Selector */}
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>MAYIN SAYISI ({mineCount})</label>
              <div style={{ display: 'flex', gap: 3, overflowX: 'auto' }}>
                {QUICK_MINES.map(m => (
                  <button
                    key={m}
                    className={'btn ' + (mineCount === m ? 'solid' : '')}
                    style={{ flex: 1, padding: '.45rem 0', fontSize: '.7rem' }}
                    onClick={() => setMineCount(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '.6rem', marginTop: '.6rem' }}>
          {!playing ? (
            <button
              className="btn solid"
              onClick={start}
              style={{
                flex: 1,
                padding: '.85rem',
                fontSize: '.95rem',
                fontWeight: 800,
                letterSpacing: '.12em',
                background: 'var(--gold)',
                color: '#000',
              }}
            >
              TARLAYI BAŞLAT (◈ {bet})
            </button>
          ) : (
            <>
              <button
                className="btn ghost"
                onClick={randomPick}
                style={{ flex: 1, padding: '.85rem', fontSize: '.82rem' }}
              >
                🎲 Rastgele Aç
              </button>
              <button
                className="btn solid"
                disabled={gemCount === 0}
                onClick={() => cashout()}
                style={{
                  flex: 2,
                  padding: '.85rem',
                  fontSize: '.92rem',
                  fontWeight: 800,
                  letterSpacing: '.08em',
                  background: gemCount > 0 ? 'linear-gradient(180deg, #4caf50, #2e7d32)' : 'rgba(255,255,255,.1)',
                  color: gemCount > 0 ? '#fff' : 'var(--muted)',
                  border: gemCount > 0 ? '1px solid #81c784' : 'none',
                  boxShadow: gemCount > 0 ? '0 0 18px rgba(76,175,80,.4)' : 'none',
                }}
              >
                KASAYA GİR ◈ {fmt(Math.round(bet * currentMult))} dürTL (+{fmt(currentProfit)})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
