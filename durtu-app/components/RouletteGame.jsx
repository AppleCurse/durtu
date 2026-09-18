'use client';
import { useRef, useState, useEffect } from 'react';
import { fmt, say } from '../lib/toast';
import { logRound } from '../lib/store';
import { useRoundLock } from '../lib/useRoundLock';
import { acquireAudio, releaseAudio, tone, fanfare } from '../lib/audio';
import Modal from './ui/Modal';
import { useEventCallback } from '../lib/useEventCallback';

const WHEEL_NUMS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const RED_NUMS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const FICHES = [10, 25, 50, 100, 250, 500];

// 3 rows x 12 columns standard layout
const ROW_1 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
const ROW_2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const ROW_3 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

export default function RouletteGame({ chips, spend, win, onClose }) {
  const [selectedChip, setSelectedChip] = useState(25);
  const [bets, setBets] = useState({}); // { [betKey]: amount }
  const [lastBets, setLastBets] = useState(null);
  const { busy: spinning, acquire, release } = useRoundLock();
  const [winningNum, setWinningNum] = useState(null);
  const [history, setHistory] = useState([]);   // sahte tur geçmişi gösterilmez
  const [msg, setMsg] = useState({ t: 'Fişini seç, masaya yerleştir ve çarkı çevir.', cls: '' });
  const [ballAngle, setBallAngle] = useState(0);
  const [wheelAngle, setWheelAngle] = useState(0);
  const animRef = useRef(0);
  const sfxRef = useRef(true);
  const roundBetsRef = useRef(null);
  const roundTotalRef = useRef(0);

  const totalBet = Object.values(bets).reduce((a, b) => a + b, 0);

  function playBallWhirr() {
    if (!sfxRef.current) return;
    tone(450, { dur: 3.8, type: 'sawtooth', gain: 0.04 });
  }

  function playChipSound() {
    if (!sfxRef.current) return;
    tone(1400, { dur: 0.04, type: 'triangle', gain: 0.08 });
  }

  function playWinSound() {
    if (!sfxRef.current) return;
    fanfare([523, 659, 784, 1046], { gain: 0.12, step: 0.09 });
  }

  function placeBet(key) {
    if (spinning) return;
    playChipSound();
    setBets(prev => ({
      ...prev,
      [key]: (prev[key] || 0) + selectedChip,
    }));
  }

  function clearBets() {
    if (spinning) return;
    setBets({});
  }

  function doubleBets() {
    if (spinning) return;
    setBets(prev => {
      const next = {};
      for (const [k, v] of Object.entries(prev)) next[k] = v * 2;
      return next;
    });
  }

  function rebet() {
    if (spinning || !lastBets) return;
    setBets({ ...lastBets });
  }

  function settleResult(num) {
    release();
    const roundBets = roundBetsRef.current || {};
    const roundTotal = roundTotalRef.current || 0;
    setWinningNum(num);
    setHistory(h => [num, ...h].slice(0, 10));

    const isRed = RED_NUMS.has(num);
    const colName = num === 0 ? 'Yeşil' : isRed ? 'Kırmızı' : 'Siyah';

    // Calculate payouts
    let totalWin = 0;

    for (const [key, amount] of Object.entries(roundBets)) {
      let multiplier = 0;
      if (key.startsWith('num_')) {
        const betNum = parseInt(key.replace('num_', ''), 10);
        if (betNum === num) multiplier = 36;
      } else if (key === 'red' && num !== 0 && isRed) {
        multiplier = 2;
      } else if (key === 'black' && num !== 0 && !isRed) {
        multiplier = 2;
      } else if (key === 'even' && num !== 0 && num % 2 === 0) {
        multiplier = 2;
      } else if (key === 'odd' && num !== 0 && num % 2 === 1) {
        multiplier = 2;
      } else if (key === 'low' && num >= 1 && num <= 18) {
        multiplier = 2;
      } else if (key === 'high' && num >= 19 && num <= 36) {
        multiplier = 2;
      } else if (key === 'doz1' && num >= 1 && num <= 12) {
        multiplier = 3;
      } else if (key === 'doz2' && num >= 13 && num <= 24) {
        multiplier = 3;
      } else if (key === 'doz3' && num >= 25 && num <= 36) {
        multiplier = 3;
      } else if (key === 'col1' && ROW_1.includes(num)) {
        multiplier = 3;
      } else if (key === 'col2' && ROW_2.includes(num)) {
        multiplier = 3;
      } else if (key === 'col3' && ROW_3.includes(num)) {
        multiplier = 3;
      }

      totalWin += amount * multiplier;
    }

    if (totalWin > 0) {
      win(totalWin);
      playWinSound();
      const profit = totalWin - roundTotal;
      setMsg({
        t: `🎯 ${num} ${colName} kazandırdı! ◈ +${fmt(profit)} dürTL kazanç kasana eklendi.`,
        cls: 'win',
      });
      logRound('Rulet Masası', roundTotal, totalWin, roundTotal > 0 ? Number((totalWin / roundTotal).toFixed(2)) : null);
    } else {
      setMsg({
        t: `${num} ${colName} — bu tur masa kazandı.`,
        cls: 'lose',
      });
      logRound('Rulet Masası', roundTotal, 0);
    }
  }

  const spin = useEventCallback(() => {
    if (totalBet === 0) {
      say('Önce masaya en az bir fiş koy.');
      return;
    }
    if (!acquire()) return;                      // senkron kilit
    if (!spend(totalBet)) {
      release();
      say('Yetersiz bakiye — fişlerini düzenle.');
      return;
    }

    // Tur sözleşmesi: settle bu dondurulmuş bahislere göre yapılır.
    roundBetsRef.current = { ...bets };
    roundTotalRef.current = totalBet;
    setLastBets({ ...bets });
    setWinningNum(null);
    setMsg({ t: 'Krupiye: “Rien ne va plus — bahisler kapandı.”', cls: '' });
    playBallWhirr();

    const chosenIdx = Math.floor(Math.random() * WHEEL_NUMS.length);
    const resultNum = WHEEL_NUMS[chosenIdx];

    // Wheel animation over 4.2 seconds
    const startTime = Date.now();
    const duration = 4200;
    const startWheel = wheelAngle;
    const wheelTarget = startWheel + 360 * 4;

    // Ball spins opposite direction
    const seg = 360 / 37;
    const targetBallPos = 360 * 7 + (360 - chosenIdx * seg);

    function frame() {
      const now = Date.now();
      const elapsed = now - startTime;
      const p = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - p, 3);

      setWheelAngle(startWheel + (wheelTarget - startWheel) * ease);
      setBallAngle(targetBallPos * ease);

      if (p < 1) {
        animRef.current = requestAnimationFrame(frame);
      } else {
        settleResult(resultNum);
      }
    }

    animRef.current = requestAnimationFrame(frame);
  });



  useEffect(() => {
    acquireAudio();
    return () => {
      cancelAnimationFrame(animRef.current);
      releaseAudio();
    };
  }, []);

  // Helper to render bet chip on table
  const renderChipBadge = key => {
    const val = bets[key];
    if (!val) return null;
    return (
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: val >= 250 ? '#990017' : val >= 100 ? '#111' : val >= 50 ? '#1565c0' : '#b26a00',
          color: '#fff',
          border: '1.5px dashed #fff',
          borderRadius: '50%',
          width: 22,
          height: 22,
          fontSize: '.55rem',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,.8)',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        {val}
      </span>
    );
  };

  return (
    <Modal onClose={onClose} title="Rulet" className="pnl" zIndex={75} style={{ width: 'min(760px, 98vw)', padding: '1.2rem 1.4rem' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
          <div>
            <span className="tag" style={{ color: 'var(--gold)' }}>🎡 MONTE CARLO VIP</span>
            <h3 style={{ margin: '.1rem 0', fontSize: '1.3rem' }}>Avrupa Rulet Masası</h3>
          </div>

          {/* History Badges */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: '.65rem', color: 'var(--muted)', marginRight: 4 }}>Sonuçlar:</span>
            {history.map((n, i) => (
              <span
                key={i}
                style={{
                  fontSize: '.68rem',
                  fontWeight: 800,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: n === 0 ? '#1b5e20' : RED_NUMS.has(n) ? '#b71c1c' : '#111',
                  color: '#fff',
                  border: i === 0 ? '1.5px solid var(--gold)' : '1px solid rgba(255,255,255,.2)',
                }}
              >
                {n}
              </span>
            ))}
          </div>
        </div>

        {/* Center Stage: Interactive Animated Wheel + Result Banner */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '.6rem 0', background: '#0a0d0a', padding: '.8rem', borderRadius: 12, border: '1px solid rgba(212,175,55,.2)' }}>
          {/* Wheel Graphic */}
          <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0, margin: '0 auto' }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                border: '6px solid #8b6508',
                boxShadow: 'inset 0 0 15px rgba(0,0,0,.9), 0 0 15px rgba(0,0,0,.6)',
                background: `conic-gradient(from 0deg, ${WHEEL_NUMS.map((n, i) => `${n === 0 ? '#1b5e20' : RED_NUMS.has(n) ? '#b71c1c' : '#111'} ${(i * 360) / 37}deg ${((i + 1) * 360) / 37}deg`).join(', ')})`,
                transform: `rotate(${wheelAngle}deg)`,
                transition: spinning ? 'none' : 'transform .4s ease-out',
              }}
            />
            {/* Center Turret */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'radial-gradient(circle, #f6e27a, #8b6508)',
                boxShadow: '0 0 8px rgba(0,0,0,.8)',
                border: '1px solid #fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '.9rem',
                color: '#000',
              }}
            >
              {winningNum !== null ? winningNum : '◈'}
            </div>
            {/* Spinning Ball */}
            {spinning && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 30% 30%, #fff, #999)',
                  boxShadow: '0 0 6px #fff',
                  transform: `rotate(${ballAngle}deg) translate(54px) rotate(-${ballAngle}deg)`,
                }}
              />
            )}
          </div>

          {/* Status and Action Message */}
          <div style={{ flex: 1 }}>
            <div className={'bj-msg' + (msg.cls ? ' ' + msg.cls : '')} style={{ textAlign: 'left', margin: 0 }}>
              {msg.t}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.6rem', fontSize: '.78rem', color: 'var(--muted)' }}>
              <span>Toplam Bahis: <b style={{ color: 'var(--gold)' }}>◈ {fmt(totalBet)} dürTL</b></span>
              <span>Bakiye: <b>◈ {fmt(chips)} dürTL</b></span>
            </div>
          </div>
        </div>

        {/* Real Casino Roulette Felt Table (Kumaş Masa) */}
        <div
          style={{
            background: 'linear-gradient(135deg, #093318 0%, #05210f 100%)',
            border: '2px solid rgba(212,175,55,.5)',
            borderRadius: 10,
            padding: '.6rem',
            boxShadow: 'inset 0 0 30px rgba(0,0,0,.7)',
            overflowX: 'auto',
          }}
        >
          <div style={{ minWidth: 620 }}>
            {/* Main Numbers Grid (3 rows x 12 cols) with '0' on left and '2 to 1' on right */}
            <div style={{ display: 'flex', gap: 2 }}>
              {/* ZERO (0) */}
              <button
                onClick={() => placeBet('num_0')}
                style={{
                  width: 44,
                  background: '#1b5e20',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,.3)',
                  borderRadius: '4px 0 0 4px',
                  fontWeight: 800,
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  cursor: 'pointer',
                }}
              >
                0
                {renderChipBadge('num_0')}
              </button>

              {/* 3 Rows Grid */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Row 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                  {ROW_1.map(n => (
                    <button
                      key={n}
                      onClick={() => placeBet(`num_${n}`)}
                      style={{
                        background: RED_NUMS.has(n) ? '#b71c1c' : '#111',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,.2)',
                        padding: '.6rem 0',
                        fontWeight: 800,
                        fontSize: '.85rem',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      {n}
                      {renderChipBadge(`num_${n}`)}
                    </button>
                  ))}
                </div>

                {/* Row 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                  {ROW_2.map(n => (
                    <button
                      key={n}
                      onClick={() => placeBet(`num_${n}`)}
                      style={{
                        background: RED_NUMS.has(n) ? '#b71c1c' : '#111',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,.2)',
                        padding: '.6rem 0',
                        fontWeight: 800,
                        fontSize: '.85rem',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      {n}
                      {renderChipBadge(`num_${n}`)}
                    </button>
                  ))}
                </div>

                {/* Row 3 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                  {ROW_3.map(n => (
                    <button
                      key={n}
                      onClick={() => placeBet(`num_${n}`)}
                      style={{
                        background: RED_NUMS.has(n) ? '#b71c1c' : '#111',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,.2)',
                        padding: '.6rem 0',
                        fontWeight: 800,
                        fontSize: '.85rem',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      {n}
                      {renderChipBadge(`num_${n}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2 to 1 Column Bets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 44 }}>
                {['col1', 'col2', 'col3'].map(cKey => (
                  <button
                    key={cKey}
                    onClick={() => placeBet(cKey)}
                    style={{
                      flex: 1,
                      background: 'rgba(0,0,0,.4)',
                      color: 'var(--gold)',
                      border: '1px solid rgba(255,255,255,.25)',
                      fontWeight: 800,
                      fontSize: '.68rem',
                      position: 'relative',
                      cursor: 'pointer',
                    }}
                  >
                    2:1
                    {renderChipBadge(cKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Dozen Bets (1st 12, 2nd 12, 3rd 12) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginTop: 4, marginLeft: 46, marginRight: 46 }}>
              {[
                { k: 'doz1', l: '1. 12 (1–12) ×3' },
                { k: 'doz2', l: '2. 12 (13–24) ×3' },
                { k: 'doz3', l: '3. 12 (25–36) ×3' },
              ].map(d => (
                <button
                  key={d.k}
                  onClick={() => placeBet(d.k)}
                  style={{
                    background: 'rgba(0,0,0,.45)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,.25)',
                    padding: '.5rem 0',
                    fontWeight: 700,
                    fontSize: '.72rem',
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                >
                  {d.l}
                  {renderChipBadge(d.k)}
                </button>
              ))}
            </div>

            {/* Outside Bets (1-18, Even, Red, Black, Odd, 19-36) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2, marginTop: 2, marginLeft: 46, marginRight: 46 }}>
              {[
                { k: 'low', l: '1–18 ×2' },
                { k: 'even', l: 'ÇİFT ×2' },
                { k: 'red', l: '🔴 KIRMIZI ×2', bg: '#8e1b1b' },
                { k: 'black', l: '⚫ SİYAH ×2', bg: '#161310' },
                { k: 'odd', l: 'TEK ×2' },
                { k: 'high', l: '19–36 ×2' },
              ].map(o => (
                <button
                  key={o.k}
                  onClick={() => placeBet(o.k)}
                  style={{
                    background: o.bg || 'rgba(0,0,0,.5)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,.25)',
                    padding: '.5rem 0',
                    fontWeight: 700,
                    fontSize: '.7rem',
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                >
                  {o.l}
                  {renderChipBadge(o.k)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chip Denomination Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.8rem' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '.7rem', color: 'var(--muted)', marginRight: 4 }}>Fiş:</span>
            {FICHES.map(f => (
              <button
                key={f}
                disabled={spinning}
                className={'chipB' + (selectedChip === f ? ' on' : '')}
                onClick={() => setSelectedChip(f)}
                style={{
                  width: 34,
                  height: 34,
                  fontSize: '.72rem',
                  fontWeight: 800,
                  borderRadius: '50%',
                  border: selectedChip === f ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,.2)',
                  background: f >= 250 ? '#990017' : f >= 100 ? '#111' : f >= 50 ? '#1565c0' : '#b26a00',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Quick Table Modifiers */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" disabled={spinning || totalBet === 0} onClick={clearBets} style={{ fontSize: '.68rem', padding: '.4rem .6rem' }}>
              🗑 Temizle
            </button>
            <button className="btn" disabled={spinning || totalBet === 0} onClick={doubleBets} style={{ fontSize: '.68rem', padding: '.4rem .6rem' }}>
              2× Katla
            </button>
            {lastBets && (
              <button className="btn" disabled={spinning} onClick={rebet} style={{ fontSize: '.68rem', padding: '.4rem .6rem' }}>
                ↺ Son Bahis
              </button>
            )}
          </div>
        </div>

        {/* Spin Button */}
        <div style={{ marginTop: '.8rem' }}>
          <button
            className="btn solid"
            disabled={spinning || totalBet === 0}
            onClick={spin}
            style={{
              width: '100%',
              padding: '.85rem',
              fontSize: '.95rem',
              fontWeight: 800,
              letterSpacing: '.14em',
              background: totalBet > 0 ? 'var(--gold)' : 'rgba(255,255,255,.1)',
              color: totalBet > 0 ? '#000' : 'var(--muted)',
            }}
          >
            {spinning ? 'TOP DÖNÜYOR…' : `ÇARKI ÇEVİR (◈ ${fmt(totalBet)} dürTL)`}
          </button>
        </div>
      </Modal>
  );
}
