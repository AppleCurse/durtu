'use client';
import { useEffect, useRef, useState } from 'react';
import { fmt, say } from '../lib/toast';
import { logRound } from '../lib/store';
import { getMultipliers } from '../lib/engines/plinko';
import { acquireAudio, releaseAudio, tone } from '../lib/audio';

const MAX_BALLS = 30;



function getBinColor(val) {
  if (val >= 100) return 'linear-gradient(180deg, #ff1a40, #990017)';
  if (val >= 20) return 'linear-gradient(180deg, #ff5722, #b72b00)';
  if (val >= 5) return 'linear-gradient(180deg, #ff9800, #b26a00)';
  if (val >= 2) return 'linear-gradient(180deg, #ffd54f, #c69500)';
  if (val >= 1) return 'linear-gradient(180deg, #4caf50, #256d29)';
  return 'linear-gradient(180deg, #37474f, #1f292e)';
}

export default function PlinkoGame({ chips, spend, win, onClose }) {
  const canvasRef = useRef(null);
  const [bet, setBet] = useState(25);
  const [rows, setRows] = useState(16);
  const [risk, setRisk] = useState('high'); // 'low' | 'med' | 'high'
  const [history, setHistory] = useState([]);
  const [autoDrop, setAutoDrop] = useState(false);
  const [activeBins, setActiveBins] = useState({});
  const sfxRef = useRef(true);

  const ballsRef = useRef([]);
  const animRef = useRef(0);
  const rowsRef = useRef(rows);
  const riskRef = useRef(risk);
  const betRef = useRef(bet);

  rowsRef.current = rows;
  riskRef.current = risk;
  betRef.current = bet;

  const currentMults = getMultipliers(rows, risk);

  function playTone(f, dur = 0.05, type = 'sine', gain = 0.08) {
    if (!sfxRef.current) return;
    tone(f, { dur, type, gain });
  }

  function dropBall() {
    if (ballsRef.current.length >= MAX_BALLS) return;   // sınırsız nesne birikimini engelle
    if (!spend(betRef.current)) {
      say('Yetersiz bakiye — fişi küçült.');
      setAutoDrop(false);
      return false;
    }

    playTone(700, 0.04, 'triangle', 0.1);

    const cv = canvasRef.current;
    if (!cv) return;
    const w = cv.width;
    const currentRows = rowsRef.current;
    const currentRisk = riskRef.current;
    const currentBet = betRef.current;

    // Ball starts at top center with slight random offset
    ballsRef.current.push({
      x: w / 2 + (Math.random() - 0.5) * 4,
      y: 20,
      vx: (Math.random() - 0.5) * 0.8,
      vy: 1.5,
      radius: 5.5,
      rowTarget: 0,
      step: 0,
      targetBin: null,
      color: '#ffd54f',
      rows: currentRows,
      risk: currentRisk,
      bet: currentBet,
      id: Math.random(),
    });
  }

  // Auto-drop interval
  useEffect(() => {
    let timer = null;
    if (autoDrop) {
      timer = setInterval(() => {
        if (dropBall() === false) setAutoDrop(false);   // bakiye bitince otomatik dur
      }, 350);
    }
    return () => clearInterval(timer);
  }, [autoDrop]);

  // Main canvas animation & physics loop
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');

    let running = true;

    function render() {
      if (!running) return;

      const w = cv.width;
      const h = cv.height;
      ctx.clearRect(0, 0, w, h);

      // Background subtle gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#0c0c10');
      bgGrad.addColorStop(1, '#060608');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const rCount = rowsRef.current;
      const startY = 55;
      const endY = h - 65;
      const rowSpacing = (endY - startY) / rCount;

      // Draw Pegs (Piramit Çivileri)
      for (let r = 0; r < rCount; r++) {
        const pegsInRow = r + 3;
        const rowY = startY + r * rowSpacing;
        const rowWidth = (pegsInRow - 1) * rowSpacing * 0.95;
        const startX = (w - rowWidth) / 2;

        for (let p = 0; p < pegsInRow; p++) {
          const pegX = startX + p * (rowSpacing * 0.95);
          ctx.beginPath();
          ctx.arc(pegX, rowY, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(255,255,255,0.4)';
          ctx.shadowBlur = 4;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Update and Draw Balls
      const gravity = 0.22;
      const bounceFriction = 0.55;

      for (let i = ballsRef.current.length - 1; i >= 0; i--) {
        const b = ballsRef.current[i];
        b.vy += gravity;
        b.x += b.vx;
        b.y += b.vy;

        // Çarpışma — yalnızca topun yakınındaki satır/çiviler taranır.
        // Eskiden her top için tüm piramit (171 çivi) her frame taranıyordu.
        const ballRowSpacing = (endY - startY) / b.rows;
        const pegGap = ballRowSpacing * 0.95;
        const hitR = b.radius + 3.2;
        const hitR2 = hitR * hitR;

        const nearRow = Math.floor((b.y - startY) / ballRowSpacing);
        const rFrom = Math.max(0, nearRow - 1);
        const rTo = Math.min(b.rows - 1, nearRow + 1);

        for (let r = rFrom; r <= rTo; r++) {
          const rowY = startY + r * ballRowSpacing;
          if (Math.abs(b.y - rowY) > hitR) continue;

          const pegsInRow = r + 3;
          const rowStartX = (w - (pegsInRow - 1) * pegGap) / 2;
          const pNear = Math.round((b.x - rowStartX) / pegGap);

          for (let p = Math.max(0, pNear - 1); p <= Math.min(pegsInRow - 1, pNear + 1); p++) {
            const pegX = rowStartX + p * pegGap;
            const dx = b.x - pegX;
            const dy = b.y - rowY;
            const d2 = dx * dx + dy * dy;

            if (d2 < hitR2) {
              const dist = Math.sqrt(d2) || 0.0001;
              const angle = Math.atan2(dy, dx);
              const push = hitR - dist;
              b.x += Math.cos(angle) * push;
              b.y += Math.sin(angle) * push;

              const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
              const dir = Math.random() < 0.5 ? -1 : 1;
              b.vx = Math.cos(angle) * speed * bounceFriction + dir * 0.45;
              b.vy = Math.max(1.2, Math.sin(angle) * speed * bounceFriction);

              playTone(1200 + Math.random() * 400, 0.02, 'sine', 0.03);
            }
          }
        }

        // Draw Ball
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        const ballGrad = ctx.createRadialGradient(b.x - 1.5, b.y - 1.5, 1, b.x, b.y, b.radius);
        ballGrad.addColorStop(0, '#fff4b8');
        ballGrad.addColorStop(1, '#ffb300');
        ctx.fillStyle = ballGrad;
        ctx.shadowColor = 'rgba(255, 193, 7, 0.7)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Check bottom landing
        if (b.y >= endY + 12) {
          // Determine which bucket it fell into
          const mults = getMultipliers(b.rows, b.risk);
          const totalBins = mults.length;
          const bucketWidth = (w - 24) / totalBins;
          let binIndex = Math.floor((b.x - 12) / bucketWidth);
          binIndex = Math.max(0, Math.min(totalBins - 1, binIndex));

          const multiplier = mults[binIndex];
          const wonAmount = Math.round(b.bet * multiplier);

          if (wonAmount > 0) {
            win(wonAmount);
          }
          logRound('Plinko', b.bet, wonAmount, multiplier);

          // Highlight bin
          setActiveBins(prev => ({ ...prev, [binIndex]: Date.now() }));

          // Sound effect
          if (multiplier >= 10) {
            playTone(880, 0.18, 'triangle', 0.2);
            setTimeout(() => playTone(1320, 0.25, 'sine', 0.2), 120);
          } else if (multiplier >= 1) {
            playTone(660, 0.1, 'triangle', 0.12);
          } else {
            playTone(260, 0.08, 'sine', 0.08);
          }

          // History pill
          setHistory(h => [{ mult: multiplier, won: wonAmount, ts: Date.now() }, ...h].slice(0, 10));

          // Remove ball
          ballsRef.current.splice(i, 1);
        }
      }

      animRef.current = requestAnimationFrame(render);
    }

    acquireAudio();
    animRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      releaseAudio();
    };
  }, []);

  return (
    <div className="ovl" onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 75 }}>
      <div className="pnl" style={{ width: 'min(640px, 98vw)', padding: '1.2rem 1.4rem' }}>
        <button className="close" onClick={onClose}>✕</button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <div>
            <span className="tag" style={{ color: 'var(--gold)' }}>🟢 KRİPTO ORİJİNAL</span>
            <h3 style={{ margin: '.2rem 0', fontSize: '1.4rem' }}>Plinko</h3>
          </div>

          {/* Recent Multipliers History */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: 320, paddingBottom: 4 }}>
            {history.map((h, idx) => (
              <span
                key={h.ts + '-' + idx}
                style={{
                  fontSize: '.65rem',
                  padding: '.15rem .45rem',
                  borderRadius: 4,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  background: h.mult >= 10 ? '#990017' : h.mult >= 2 ? '#b26a00' : h.mult >= 1 ? '#256d29' : '#1f292e',
                  color: '#fff',
                  boxShadow: h.mult >= 10 ? '0 0 8px rgba(255,26,64,.6)' : 'none',
                }}
              >
                {h.mult}×
              </span>
            ))}
          </div>
        </div>

        {/* Plinko Board Canvas */}
        <div style={{ position: 'relative', width: '100%', height: 380, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
          <canvas ref={canvasRef} width={600} height={380} style={{ width: '100%', height: '100%', display: 'block' }} />

          {/* Bottom Multiplier Buckets */}
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 12,
              right: 12,
              display: 'grid',
              gridTemplateColumns: `repeat(${currentMults.length}, 1fr)`,
              gap: 2,
              pointerEvents: 'none',
            }}
          >
            {currentMults.map((val, idx) => {
              const isHit = activeBins[idx] && Date.now() - activeBins[idx] < 600;
              return (
                <div
                  key={idx}
                  style={{
                    background: getBinColor(val),
                    color: '#fff',
                    textAlign: 'center',
                    padding: '.35rem 0',
                    fontSize: rows > 12 ? '.52rem' : '.62rem',
                    fontWeight: 800,
                    borderRadius: 4,
                    transform: isHit ? 'scale(1.2) translateY(-4px)' : 'scale(1)',
                    boxShadow: isHit ? '0 0 16px rgba(255,213,79,.9)' : 'none',
                    transition: 'transform .15s ease-out',
                    border: isHit ? '1px solid #fff' : '1px solid rgba(0,0,0,.3)',
                  }}
                >
                  {val}×
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls Section */}
        <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.8rem', alignItems: 'end' }}>
          {/* Bet Input */}
          <div>
            <label style={{ fontSize: '.68rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>BAHİS (dürTL)</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                min={1}
                value={bet}
                onChange={e => setBet(Math.max(1, Number(e.target.value)))}
                className="inp"
                style={{ padding: '.4rem .6rem', fontSize: '.82rem', width: '100%' }}
              />
              <button className="btn" style={{ padding: '.2rem .5rem', fontSize: '.65rem' }} onClick={() => setBet(b => Math.max(1, Math.floor(b / 2)))}>½</button>
              <button className="btn" style={{ padding: '.2rem .5rem', fontSize: '.65rem' }} onClick={() => setBet(b => b * 2)}>2×</button>
            </div>
          </div>

          {/* Risk Selector */}
          <div>
            <label style={{ fontSize: '.68rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>RİSK SEVİYESİ</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { id: 'low', l: 'Düşük' },
                { id: 'med', l: 'Orta' },
                { id: 'high', l: 'Yüksek' },
              ].map(r => (
                <button
                  key={r.id}
                  className={'btn ' + (risk === r.id ? 'solid' : '')}
                  style={{ flex: 1, padding: '.4rem .2rem', fontSize: '.68rem' }}
                  onClick={() => setRisk(r.id)}
                >
                  {r.l}
                </button>
              ))}
            </div>
          </div>

          {/* Rows Selector */}
          <div>
            <label style={{ fontSize: '.68rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>SATIR SAYISI ({rows})</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[8, 10, 12, 14, 16].map(rw => (
                <button
                  key={rw}
                  className={'btn ' + (rows === rw ? 'solid' : '')}
                  style={{ flex: 1, padding: '.4rem 0', fontSize: '.68rem' }}
                  onClick={() => setRows(rw)}
                >
                  {rw}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '.6rem', marginTop: '1rem' }}>
          <button
            className="btn solid"
            onClick={dropBall}
            style={{ flex: 2, padding: '.8rem', fontSize: '.9rem', fontWeight: 700, letterSpacing: '.12em', background: 'var(--gold)', color: '#000' }}
          >
            🟢 TOP BIRAK (◈ {bet})
          </button>
          <button
            className={'btn ' + (autoDrop ? 'solid' : 'ghost')}
            onClick={() => setAutoDrop(a => !a)}
            style={{ flex: 1, padding: '.8rem', fontSize: '.78rem' }}
          >
            {autoDrop ? '⏹ OTO DURDUR' : '⚡ OTO BIRAK'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.6rem', fontSize: '.7rem', color: 'var(--muted)' }}>
          <span>Maksimum Çarpan: <b style={{ color: 'var(--gold)' }}>{Math.max(...currentMults)}×</b></span>
          <span>Bakiye: ◈ {fmt(chips)} dürTL</span>
        </div>
      </div>
    </div>
  );
}
