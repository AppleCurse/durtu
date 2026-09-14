'use client';
import { useEffect, useRef, useState } from 'react';
import { fmt, say } from '../lib/toast';
import { logRound } from '../lib/store';
import { WHEEL_PRESETS, spinWheelIndex, settleWheel } from '../lib/engines/wheel';
import { useRoundLock } from '../lib/useRoundLock';
import { acquireAudio, releaseAudio, tone, fanfare } from '../lib/audio';

const _COLORS = [
  '#2a2318', '#b26a00', '#1c221e', '#2e7d32',
  '#1b1c26', '#1565c0', '#2d1822', '#c2185b',
  '#2a1515', '#c62828', '#261c28', '#6a1b9a',
  '#23281c', '#33691e', '#2a2216', '#ff8f00',
];

export default function WheelGame({ chips, spend, win, onClose }) {
  const canvasRef = useRef(null);
  const [bet, setBet] = useState(25);
  const [risk, setRisk] = useState('med');
  const { busy: spinning, acquire, release } = useRoundLock();
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState({ t: 'Risk seviyeni seç ve çarkı çevir.', cls: '' });
  const rotRef = useRef(0);
  const animRef = useRef(0);
  const sfxRef = useRef(true);

  const segments = WHEEL_PRESETS[risk];
  const segAngle = (Math.PI * 2) / segments.length;

  function playTick() {
    if (!sfxRef.current) return;
    tone(800, { dur: 0.03, type: 'triangle', gain: 0.04 });
  }

  function playWin() {
    if (!sfxRef.current) return;
    fanfare([523, 659, 784, 1046], { gain: 0.12 });
  }

  function drawWheel(angle) {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width;
    const h = cv.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 16;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Draw Segments
    for (let i = 0; i < segments.length; i++) {
      const startA = i * segAngle;
      const endA = (i + 1) * segAngle;
      const val = segments[i];

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startA, endA);
      ctx.closePath();

      ctx.fillStyle = val === 0 ? '#1a1816' : val >= 10 ? '#7e1b1b' : val >= 3 ? '#b75b00' : '#1e382b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,55,.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Text label
      ctx.save();
      ctx.rotate(startA + segAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = val > 0 ? '#ffd54f' : '#666';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(val > 0 ? val + '×' : '0×', radius - 18, 4);
      ctx.restore();
    }

    // Outer Rim
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Center Cap
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    const capGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
    capGrad.addColorStop(0, '#f6e27a');
    capGrad.addColorStop(1, '#8b6508');
    ctx.fillStyle = capGrad;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Top Pointer Pin
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - radius - 8);
    ctx.lineTo(cx + 10, cy - radius - 8);
    ctx.lineTo(cx, cy - radius + 12);
    ctx.closePath();
    ctx.fillStyle = '#ff1744';
    ctx.shadowColor = 'rgba(255,23,68,.8)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  useEffect(() => {
    drawWheel(rotRef.current);
  }, [risk]);

  useEffect(() => {
    acquireAudio();
    return () => {
      cancelAnimationFrame(animRef.current);
      releaseAudio();
    };
  }, []);

  function spinWheel() {
    if (!acquire()) return;                       // senkron kilit — çift tıklama tek tur
    if (!spend(bet)) {
      release();
      say('Yetersiz bakiye — fişi küçült.');
      return;
    }

    // Tur sözleşmesi: ödeme animasyon bitince bu snapshot'a göre yapılır,
    // kullanıcı arada risk/bahis değiştirse bile.
    const round = Object.freeze({ bet, risk, segments });

    setMsg({ t: 'Çark dönüyor…', cls: '' });

    const winIdx = spinWheelIndex(round.segments);
    const { mult: winVal, payout } = settleWheel(round.bet, round.segments, winIdx);

    const currentRot = rotRef.current % (Math.PI * 2);
    const targetSegCenter = winIdx * segAngle + segAngle / 2;
    const neededAngle = (Math.PI * 3) / 2 - targetSegCenter;
    const fullSpins = (5 + Math.floor(Math.random() * 3)) * Math.PI * 2;
    const targetRot =
      rotRef.current + fullSpins + ((neededAngle - currentRot + Math.PI * 2) % (Math.PI * 2));

    const startRot = rotRef.current;
    const totalDist = targetRot - startRot;
    const duration = 4000;
    const startTime = Date.now();
    let lastTickAngle = startRot;

    function step() {
      const now = Date.now();
      const progress = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const curRot = startRot + totalDist * ease;
      rotRef.current = curRot;
      drawWheel(curRot);

      if (Math.abs(curRot - lastTickAngle) >= segAngle) {
        playTick();
        lastTickAngle = curRot;
      }

      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
        return;
      }

      release();
      if (winVal > 0) {
        win(payout);
        playWin();
        setMsg({ t: `Kazandın! ${winVal}× çarpan → ◈ +${fmt(payout - round.bet)} dürTL kâr.`, cls: 'win' });
        logRound('Şans Çarkı', round.bet, payout, winVal);
      } else {
        setMsg({ t: '0× geldi — bu tur boş geçti.', cls: 'lose' });
        logRound('Şans Çarkı', round.bet, 0);
      }
      setHistory(h => [{ val: winVal, won: payout, ts: Date.now() }, ...h].slice(0, 10));
    }

    animRef.current = requestAnimationFrame(step);
  }

  return (
    <div className="ovl" onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 75 }}>
      <div className="pnl" style={{ width: 'min(580px, 98vw)', padding: '1.4rem 1.6rem', textAlign: 'center' }}>
        <button className="close" onClick={onClose}>✕</button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <div style={{ textAlign: 'left' }}>
            <span className="tag" style={{ color: 'var(--gold)' }}>🎯 ŞANS ÇARKI</span>
            <h3 style={{ margin: '.2rem 0', fontSize: '1.4rem' }}>Wheel of Fortune</h3>
          </div>

          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: 260 }}>
            {history.map((h, i) => (
              <span
                key={h.ts + '-' + i}
                style={{
                  fontSize: '.65rem',
                  padding: '.15rem .45rem',
                  borderRadius: 4,
                  fontWeight: 700,
                  background: h.val >= 10 ? '#7e1b1b' : h.val >= 2 ? '#b75b00' : h.val > 0 ? '#1e382b' : '#222',
                  color: h.val > 0 ? '#ffd54f' : '#888',
                }}
              >
                {h.val}×
              </span>
            ))}
          </div>
        </div>

        {/* Wheel Canvas */}
        <div style={{ margin: '0 auto', width: 340, height: 340, position: 'relative' }}>
          <canvas ref={canvasRef} width={340} height={340} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div className={'bj-msg' + (msg.cls ? ' ' + msg.cls : '')} style={{ margin: '.8rem 0', minHeight: 24 }}>
          {msg.t}
        </div>

        {/* Risk Selection */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: '1rem' }}>
          {[
            { id: 'low', l: 'Düşük Risk (Maks 5×)' },
            { id: 'med', l: 'Orta Risk (Maks 10×)' },
            { id: 'high', l: 'Yüksek Risk (Maks 50×)' },
          ].map(r => (
            <button
              key={r.id}
              disabled={spinning}
              className={'btn ' + (risk === r.id ? 'solid' : '')}
              style={{ padding: '.4rem .7rem', fontSize: '.72rem' }}
              onClick={() => setRisk(r.id)}
            >
              {r.l}
            </button>
          ))}
        </div>

        {/* Bet & Spin Controls */}
        <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, width: 180 }}>
            <input
              type="number"
              min={1}
              disabled={spinning}
              value={bet}
              onChange={e => setBet(Math.max(1, Number(e.target.value)))}
              className="inp"
              style={{ padding: '.5rem', fontSize: '.84rem', width: '100%' }}
            />
            <button className="btn" disabled={spinning} style={{ padding: '.2rem .5rem', fontSize: '.65rem' }} onClick={() => setBet(b => Math.max(1, Math.floor(b / 2)))}>½</button>
            <button className="btn" disabled={spinning} style={{ padding: '.2rem .5rem', fontSize: '.65rem' }} onClick={() => setBet(b => b * 2)}>2×</button>
          </div>

          <button
            className="btn solid"
            disabled={spinning}
            onClick={spinWheel}
            style={{
              flex: 1,
              padding: '.8rem',
              fontSize: '.92rem',
              fontWeight: 700,
              letterSpacing: '.14em',
              background: 'var(--gold)',
              color: '#000',
            }}
          >
            {spinning ? 'DÖNÜYOR…' : `ÇARKI DÖNDÜR (◈ ${bet})`}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.8rem', fontSize: '.7rem', color: 'var(--muted)' }}>
          <span>Seçili Risk: <b style={{ color: 'var(--gold)' }}>{risk.toUpperCase()}</b></span>
          <span>Bakiye: ◈ {fmt(chips)} dürTL</span>
        </div>
      </div>
    </div>
  );
}
