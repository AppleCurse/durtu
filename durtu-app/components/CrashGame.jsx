'use client';
// Aviator — canvas uçuş + canlı sofa (prototip paritesi)
import { useEffect, useRef, useState } from 'react';
import { say, fmt, buzz } from '../lib/toast';
import { logRound } from '../lib/store';
import { crashPoint, evaluateFrame } from '../lib/engines/crash';
import { acquireAudio, releaseAudio, getAudio, tone as sharedTone, noiseBurst } from '../lib/audio';
import { log } from '../lib/logger';
import Modal from './ui/Modal';
import FairBadge from './ui/FairBadge';
import { beginCrashRound } from '../lib/fairRound';

const CRW = 660, CRH = 330;
const NAMES = ['M*** K***','A*** Y***','S*** D***','E*** T***','B*** Ö***','H*** Ç***','Z*** A***','K*** Ş***','N*** V***','T*** G***'];
const ac2 = () => getAudio();

export default function CrashGame({ spend, win, onClose }){
  const [fairHash, setFairHash] = useState('');
  const cvRef = useRef(null);
  const cx = useRef(null);
  const E = useRef({ running:false, cashed:false, m:1, crash:1, bet:10, oto:0, t0:0, raf:0, pts:[], hum:null });
  const sfx = useRef(true);
  const [sfxIcon, setSfxIcon] = useState(true);
  const [players, setPlayers] = useState([]);
  const playersRef = useRef([]);
  const [hist, setHist] = useState([]);
  const [running, setRunning] = useState(false);
  const [canCash, setCanCash] = useState(false);
  const [boom, setBoom] = useState('');
  const [myMsg, setMyMsg] = useState('Tur hazır. Uçak seni bekliyor.');
  const betRef = useRef(25);
  const otoRef = useRef(null);
  const cashRef = useRef(null);
  const bestsRef = useRef(0);

  function tone(f, t0, dur, type, g){
    if(!sfx.current) return;
    sharedTone(f, { delay: t0, dur, type: type || 'sine', gain: g || .12 });
  }

  function hum(on){
    try{
      if(on && sfx.current){
        const a = ac2(), o = a.createOscillator(), g = a.createGain();
        o.type = 'sawtooth'; o.frequency.value = 52; g.gain.value = 0;
        o.connect(g); g.connect(a.destination); o.start();
        g.gain.linearRampToValueAtTime(.02, a.currentTime + .4);
        E.current.hum = { o, g };
      } else if(E.current.hum){
        const h = E.current.hum, a = ac2();
        h.g.gain.linearRampToValueAtTime(0, a.currentValueOf ? 0 : a.currentTime + .18);
        setTimeout(() => { try { h.o.stop(); } catch (err) { log.ignorable('crash.stopHum', err); } }, 350);
        E.current.hum = null;
      }
    } catch (err) { log.ignorable('crash.audio', err); }
  }
  function boomSnd(){
    if(!sfx.current) return;
    noiseBurst({ dur: .35, gain: .28, decay: 2.2 });
    tone(66, 0, .42, 'sine', .24); buzz([70, 55, 130]);
  }

  function newRoundPlayers(){
    const n = 5 + (Math.random()*3 | 0), arr = [];
    for(let i = 0; i < n; i++)
      arr.push({ n: NAMES[Math.random()*NAMES.length | 0], bet: [10,25,50,100][Math.random()*4 | 0], out: crashPoint(), done:false, win:0 });
    arr.sort((a,b) => b.bet - a.bet);
    playersRef.current = arr;
    setPlayers(arr.map(p => ({ ...p })));
  }

  const mapX = (t, tV) => 26 + (t / tV) * (CRW - 110);
  const mapY = (m, mV) => CRH - 34 - (Math.log(m) / Math.log(mV)) * (CRH - 86);

  function draw(t, dead){
    const g = cx.current; if(!g) return;
    const e = E.current;
    const bg = g.createLinearGradient(0, 0, 0, CRH);
    bg.addColorStop(0, '#070a18'); bg.addColorStop(1, '#04040a');
    g.fillStyle = bg; g.fillRect(0, 0, CRW, CRH);
    const mV = Math.max(3, e.m * 1.12), tV = Math.max(6, t * 1.15);
    g.font = '10px Inter, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    [1, 2, 3, 5, 10, 20, 50].forEach(gl => {
      if(gl > mV) return;
      const y = mapY(gl, mV);
      g.strokeStyle = 'rgba(212,175,55,.08)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(26, y); g.lineTo(CRW - 20, y); g.stroke();
      g.fillStyle = 'rgba(155,149,131,.7)'; g.fillText(gl + '×', CRW - 38, y);
    });
    g.strokeStyle = 'rgba(212,175,55,.18)';
    g.beginPath(); g.moveTo(26, CRH - 34); g.lineTo(CRW - 20, CRH - 34); g.stroke();
    if(e.pts.length > 1){
      g.save(); g.beginPath();
      e.pts.forEach((pt, i) => { const x = mapX(pt[0], tV), y = mapY(pt[1], mV); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.strokeStyle = dead ? 'rgba(255,115,97,.85)' : '#D4AF37';
      g.lineWidth = 2.4; g.lineJoin = 'round';
      g.shadowColor = dead ? 'rgba(255,115,97,.7)' : 'rgba(212,175,55,.75)';
      g.shadowBlur = 14; g.stroke();
      g.lineTo(mapX(e.pts[e.pts.length-1][0], tV), CRH - 34); g.lineTo(mapX(0, tV), CRH - 34); g.closePath();
      const fg = g.createLinearGradient(0, 60, 0, CRH);
      fg.addColorStop(0, dead ? 'rgba(255,115,97,.1)' : 'rgba(212,175,55,.14)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fg; g.fill(); g.restore();
      if(!dead){
        const last = e.pts[e.pts.length-1], prev = e.pts[Math.max(0, e.pts.length-6)];
        const x = mapX(last[0], tV), y = mapY(last[1], mV);
        const ang = Math.atan2(mapY(last[1], mV) - mapY(prev[1], mV), mapX(last[0], tV) - mapX(prev[0], tV));
        g.save(); g.translate(x, y); g.rotate(ang);
        g.shadowColor = '#f6e27a'; g.shadowBlur = 16; g.fillStyle = '#f6e27a';
        g.beginPath(); g.moveTo(15, 0); g.lineTo(-11, -8); g.lineTo(-4, 0); g.lineTo(-11, 8); g.closePath(); g.fill();
        g.restore();
      }
    }
    g.font = '600 30px "Playfair Display", Georgia, serif';
    g.fillStyle = dead ? '#ff7361' : '#F5F5DC';
    g.shadowColor = dead ? 'rgba(255,115,97,.6)' : 'rgba(212,175,55,.4)'; g.shadowBlur = 12;
    g.fillText(e.m.toFixed(2) + '×', 30, 48); g.shadowBlur = 0;
  }

  function loop(now){
    const e = E.current;
    if(!e.running) return;

    const gap = now - (e.lastFrame || now);
    e.lastFrame = now;
    const t = (now - e.t0) / 1000;

    const { action, m } = evaluateFrame({
      elapsedSec: t,
      frameGapMs: gap,
      crashAt: e.crash,
      autoCashAt: e.oto,
      alreadyCashed: e.cashed,
    });

    e.m = m;

    // Sofa oyuncuları (görsel) — çarpan clamp'lenmiş değerle ilerler
    let changed = false;
    playersRef.current.forEach(p => {
      if(!p.done && m >= p.out){
        p.done = true; p.win = Math.round(p.bet * p.out); changed = true;
        if(sfx.current && Math.random() < .35) tone(620 + Math.random()*240, 0, .06, 'sine', .05);
      }
    });
    if(changed) setPlayers(playersRef.current.map(p => ({ ...p })));
    if(cashRef.current) cashRef.current.textContent = '◈ ' + fmt(Math.round(e.bet * m));
    if (e.hum) { try { e.hum.o.frequency.setTargetAtTime(50 + Math.min(420, (m - 1) * 38), getAudio().currentTime, 0.06); } catch (err) { log.ignorable('crash.hum', err); } }

    // PATLAMA her zaman önce değerlendirilir — arka plan sekmesinden dönen
    // dev çarpan sıçramasıyla geriye dönük ödeme alınamaz.
    if(action === 'crash'){ endRound(); return; }
    if(action === 'suspend'){
      say('⏸ Sekme askıya alındı — bu tur güvenlik gereği kapatıldı.');
      endRound({ suspended: true });
      return;
    }
    if(action === 'autocash') doCash(true);

    e.pts.push([t, m]); draw(t, false);
    e.raf = requestAnimationFrame(loop);
  }

  function start(){
    const e = E.current;
    if(e.running) return;
    const bet = betRef.current;
    if(!spend(bet)){ say('Yetersiz demo bakiyesi.'); return; }
    const fair = beginCrashRound();          // commit → play → reveal
    e.fair = fair;
    setFairHash(fair.hash);
    e.running = true; e.cashed = false; e.m = 1; e.bet = bet; e.crash = fair.result; e.pts = [[0, 1]];
    e.oto = parseFloat((otoRef.current?.value || '').replace(',', '.')) || 0;
    setRunning(true); setCanCash(true); setBoom('');
    setMyMsg('Uçak havada. Çıkışını bekle…');
    newRoundPlayers(); hum(true);
    if(cashRef.current) cashRef.current.textContent = '';
    e.t0 = performance.now();
    e.lastFrame = e.t0;
    cancelAnimationFrame(e.raf);
    e.raf = requestAnimationFrame(loop);
    tone(520, 0, .1, 'sawtooth', .05);
  }
  function doCash(auto){
    const e = E.current;
    if(e.cashed) return;
    if(!e.running){
      if(!auto){ say('Tur çoktan bitti — top düştükten sonra çıkış olmaz.'); }
      return;
    }
    e.cashed = true;
    const m = Math.min(e.m, e.crash);        // ödeme asla patlama noktasını aşamaz
    const w = Math.round(e.bet * m);
    win(w);
    logRound('Aviator', e.bet, w, Math.round(m * 100) / 100);
    tone(523, 0, .15, 'triangle', .12); tone(784, .1, .25, 'triangle', .12); buzz([30, 45, 75]);
    bestsRef.current = Math.max(bestsRef.current, m);
    setCanCash(false);
    setMyMsg((auto ? 'Oto çıkış — ' : '') + m.toFixed(2) + '× noktasında indin: +' + fmt(w) + ' ◈. Temiz karar.');
    if(m >= 5) say('✈️ <b>Usta işi çıkış:</b> ' + m.toFixed(2) + '×');
  }
  function endRound({ suspended = false } = {}){
    const e = E.current;
    if(!e.running) return;
    e.running = false;
    hum(false); boomSnd();
    playersRef.current.forEach(p => { if(!p.done){ p.done = true; p.win = 0; } });
    setPlayers(playersRef.current.map(p => ({ ...p })));
    setHist(h => [e.crash.toFixed(2) + '×', ...h].slice(0, 6));
    setBoom('💥 UÇTU · ' + e.crash.toFixed(2) + '×');
    draw((performance.now() - e.t0) / 1000, true);
    if(!e.cashed) logRound('Aviator', e.bet, 0, Math.round(e.crash * 100) / 100);
    setMyMsg(e.cashed
      ? 'Uçak ' + e.crash.toFixed(2) + '× noktasında düştü — sen çoktan inmiştin. Dürtü bunu not etti.'
      : suspended
        ? 'Sekme askıya alındığı için tur kapatıldı — bahis sofaya kaldı.'
        : 'Uçak ' + e.crash.toFixed(2) + '× noktasında düştü. Bahis sofaya kaldı — nefes al, yeni tur geliyor.');
    setRunning(false); setCanCash(false);
    setTimeout(() => setBoom(''), 1700);
  }

  useEffect(() => {
    const cv = cvRef.current, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = CRW * dpr; cv.height = CRH * dpr;
    cx.current = cv.getContext('2d'); cx.current.setTransform(dpr, 0, 0, dpr, 0, 0);
    E.current.pts = [[0, 1]]; E.current.m = 1;
    draw(0, false);
    acquireAudio();
    const keyH = e => { if(e.code === 'Space'){ e.preventDefault(); start(); } };
    // Sekme gizlenirse turu anında kapat — geri dönüşte sıçrama ödemesi olmasın.
    const visH = () => { if(document.hidden && E.current.running) endRound({ suspended: true }); };
    window.addEventListener('keydown', keyH);
    document.addEventListener('visibilitychange', visH);
    const engine = E.current;   // cleanup'ta ref.current yeniden okunmasın
    return () => {
      cancelAnimationFrame(engine.raf);
      engine.running = false;
      hum(false);
      window.removeEventListener('keydown', keyH);
      document.removeEventListener('visibilitychange', visH);
      releaseAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal onClose={onClose} title="Aviator" className="pnl slot-pnl">
      <FairBadge liveHash={fairHash} />
        <div className="slot-head">
          <div>
            <span className="demo-badge">Demo · Gerçek para yok</span>
            <h3>✈️ Aviator <span className="muted" style={{ fontFamily: 'var(--sans)', fontSize: '.66rem', letterSpacing: '.14em' }}>· CANLI</span></h3>
          </div>
          <button className="btn ghost" style={{ padding: '.4rem .8rem' }}
            onClick={() => { sfx.current = !sfx.current; setSfxIcon(sfx.current); if(!sfx.current) hum(false); }}>
            {sfxIcon ? '🔊' : '🔇'}
          </button>
        </div>
        <p className="noteline">Seçkideki tek crash oyunu — Dürtü bilinçli seçti. Uçak kalkmadan değil, <b>düşmeden önce</b> in.</p>
        {hist.length > 0 && (
          <div className="cr-hist">{hist.map((h, i) => <span key={i} className={parseFloat(h) >= 3 ? 'hot' : ''}>{h}</span>)}</div>
        )}
        <div className="crash-wrap">
          <div className="crash-main">
            <div className="slot-stage">
              <canvas ref={cvRef} />
              {boom && <div className="stage-ovl boom"><span>{boom}</span></div>}
            </div>
          </div>
          <div className="cr-feed">
            <h6>CANLI BAHİSLER</h6>
            <div>
              {players.length === 0
                ? <div className="cr-idle">Tur başlayınca<br />sofa dolacak.</div>
                : players.map((p, i) => (
                    <div key={i} className={'crp' + (p.done ? (p.win > 0 ? ' win' : ' lose') : '')}>
                      <span>{p.n}</span><b>{p.done ? (p.win > 0 ? '+' + fmt(p.win) + ' ◈' : '✕') : '◈ ' + fmt(p.bet)}</b>
                    </div>
                  ))}
            </div>
          </div>
        </div>
        <div className="slot-hud">
          <div className="hud-box"><small>BAHİS</small>
            <select className="hud-sel" defaultValue="25" onChange={e => betRef.current = Number(e.target.value)}>
              {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="hud-box"><small>OTO ÇIKIŞ</small>
            <input className="hud-sel" placeholder="örn. 2.00" inputMode="decimal" ref={otoRef} disabled={running} />
          </div>
          <button className="btn solid spin-btn" onClick={start} disabled={running}>UÇUR</button>
          <button className="btn spin-btn" style={{ borderColor: 'var(--gold)' }} onClick={() => doCash(false)} disabled={!canCash}>
            NAKİT ÇIKIŞ<span ref={cashRef} style={{ display: 'block', fontSize: '.62rem', opacity: .75, marginTop: '.2rem' }} />
          </button>
        </div>
        <div className="slot-foot"><span className="muted">{myMsg}</span><span className="muted">Dürtü bilir — ama söylemez.</span></div>
      </Modal>
  );
}
