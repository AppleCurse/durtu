'use client';
// Prosedürel caz ambiyansı — ii–V–I–VI walking bass + Rhodes + fırça (prototip paritesi)
import { useEffect, useRef, useState } from 'react';
import { say } from '../lib/toast';
import { acquireAudio, releaseAudio } from '../lib/audio';
import { log } from '../lib/logger';

const PROG = [
  { root: 38, chord: [62, 65, 69, 72] },  // Dm7
  { root: 43, chord: [59, 62, 65, 67] },  // G7
  { root: 36, chord: [60, 64, 67, 71] },  // Cmaj7
  { root: 33, chord: [57, 61, 64, 67] },  // A7
];
const mf = m => 440 * Math.pow(2, (m - 69) / 12);

export default function AmbienceBtn(){
  const [on, setOn] = useState(false);
  const z = useRef({ A: null, master: null, iv: 0, nextT: 0, beat: 0, noiseSrc: null, bpm: 76 });

  // Unmount'ta zamanlayıcı ve ses kaynaklarını bırak
  useEffect(() => () => {
    const c = z.current;
    clearInterval(c.iv);
    if (c.noiseSrc) { try { c.noiseSrc.stop(); } catch (err) { log.ignorable('ambience.stopNoise', err); } c.noiseSrc = null; }
    if (c.A) releaseAudio();
  }, []);

  function note(f, t, dur, type, g){
    const { A, master } = z.current;
    const o = A.createOscillator(), gn = A.createGain();
    o.type = type; o.frequency.value = f;
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(g, t + .025);
    gn.gain.exponentialRampToValueAtTime(.0001, t + Math.max(.08, dur));
    o.connect(gn); gn.connect(master);
    o.start(t); o.stop(t + dur + .06);
  }
  function hat(t){
    const { A, master } = z.current;
    const len = A.sampleRate * .05, buf = A.createBuffer(1, len, A.sampleRate), d = buf.getChannelData(0);
    for(let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1) * Math.pow(1 - i/len, 3);
    const src = A.createBufferSource(), hp = A.createBiquadFilter(), g = A.createGain();
    hp.type = 'highpass'; hp.frequency.value = 6500; g.gain.value = .3;
    src.buffer = buf; src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t);
  }
  function beat(b, t, spb){
    const bar = (b / 4) | 0, bi = b % 4;
    const cur = PROG[bar], nxt = PROG[(bar + 1) % 4];
    let nm;
    if(bi === 0) nm = cur.root;
    else if(bi === 1) nm = cur.root + 7;
    else if(bi === 2) nm = cur.root + (bar % 2 ? 3 : 4);
    else nm = nxt.root + (Math.random() < .5 ? 1 : -1);
    note(mf(nm), t, spb * .95, 'triangle', .5);
    if(bi === 0 || bi === 2 || (bi === 1 && Math.random() < .4))
      cur.chord.forEach((m, i) => note(mf(m), t + .015 * i, spb * 1.7, 'sine', .045));
    if(bi % 2 === 1) hat(t + spb * .08);
  }
  function sched(){
    const c = z.current;
    const spb = 60 / c.bpm;
    while(c.A && c.nextT < c.A.currentTime + .35){
      beat(c.beat, c.nextT, spb);
      c.beat = (c.beat + 1) % 16;
      c.nextT += spb;
    }
  }
  function crackle(onOff){
    const c = z.current;
    if(!onOff){
      if (c.noiseSrc) { try { c.noiseSrc.stop(); } catch (err) { log.ignorable('ambience.stopNoise', err); } c.noiseSrc = null; }
      return;
    }
    try{
      const a = c.A, len = a.sampleRate * 2, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for(let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1) * .5 * Math.random();
      const src = a.createBufferSource(); src.loop = true; src.buffer = buf;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = a.createGain(); g.gain.value = .012;
      src.connect(lp); lp.connect(g); g.connect(a.destination);
      src.start(); c.noiseSrc = src;
    } catch (err) { log.ignorable('ambience.node', err); }
  }
  function toggle(){
    const c = z.current;
    if(on){
      clearInterval(c.iv);
      if(c.master && c.A) c.master.gain.setTargetAtTime(0, c.A.currentTime, .35);
      crackle(false);
      setOn(false);
      return;
    }
    try{
      if(!c.A) c.A = acquireAudio();
      if(!c.A){ say('Ses bu tarayıcıda desteklenmiyor.'); return; }
      if(!c.master){
        c.master = c.A.createGain(); c.master.gain.value = 0;
        const lp = c.A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        c.master.connect(lp); lp.connect(c.A.destination);
      }
      c.master.gain.cancelScheduledValues(c.A.currentTime);
      c.master.gain.setTargetAtTime(.16, c.A.currentTime, .8);
      crackle(true);
      c.beat = 0; c.nextT = c.A.currentTime + .12;
      clearInterval(c.iv); c.iv = setInterval(sched, 180);
      setOn(true);
      say('♪ <b>Salon ambiyansı</b> açık — bu gece ' + c.bpm + ' BPM caz çalıyor.');
    }catch(err){ log.warn('ambience.toggle','ambiyans başlatılamadı',{ err: err?.message }); say('Ses bu tarayıcıda desteklenmiyor.'); }
  }

  return (
    <button className="hc" style={{ background: 'none', color: on ? 'var(--gold)' : 'var(--muted)' }}
      onClick={toggle} title="Salon ambiyansı (prosedürel caz)">
      ♪{on ? ' açık' : ''}
    </button>
  );
}
