'use client';
import { useEffect, useRef, useState } from 'react';
import { say, fmt, buzz } from '../lib/toast';
import { logRound } from '../lib/store';
import { acquireAudio, releaseAudio, getAudio, tone as sharedTone } from '../lib/audio';
import { log } from '../lib/logger';

const SLOT_DEFS = {
  gates: {
    type:'scatter', cols:6, rows:5, scatter:'🏛️', scatterMin:4, fs:15,
    bg1:'#241145', bg2:'#0b0518', glow:'#a78bfa',
    syms:[
      {s:'👑', pay:{8:2,9:5,10:15,11:25,12:50}, w:2},
      {s:'⚡', pay:{8:1,9:3,10:10,11:20,12:30}, w:3},
      {s:'💍', pay:{8:0.8,9:2,10:6,11:12,12:20}, w:4},
      {s:'🏺', pay:{8:0.5,9:1.5,10:4,11:8,12:15}, w:5},
      {s:'💎', pay:{8:0.3,9:1,10:2,11:5,12:10}, w:6},
      {s:'🔮', pay:{8:0.2,9:0.5,10:1,11:2,12:5}, w:6}
    ],
    mults:[2,3,4,5,6,8,10,15,20,25,50,100,250,500],
    multChance:0.08, fsMultChance:0.18,
    note:'6×5 her yerde öder — 8+ aynı sembol kazandırır. Çarpan küreleri birikir, tumble ile katlanır.'
  },
  sp: {
    type:'scatter', cols:6, rows:5, scatter:'🌙', scatterMin:4, fs:15,
    bg1:'#2a0f45', bg2:'#0d0417', glow:'#c084fc',
    syms:[
      {s:'👸', pay:{8:2.5,9:6,10:18,11:30,12:60}, w:2},
      {s:'💫', pay:{8:1.2,9:3.5,10:12,11:22,12:35}, w:3},
      {s:'🦋', pay:{8:0.9,9:2.2,10:7,11:14,12:22}, w:4},
      {s:'🌙', pay:{8:0.6,9:1.6,10:4.5,11:9,12:16}, w:5},
      {s:'💎', pay:{8:0.35,9:1.1,10:2.2,11:5.5,12:11}, w:6},
      {s:'🔮', pay:{8:0.25,9:0.6,10:1.2,11:2.5,12:6}, w:6}
    ],
    mults:[2,3,4,5,6,8,10,12,15,20,25,50,100,250],
    multChance:0.09, fsMultChance:0.20,
    note:'Starlight — Gates’in kız kardeşi: 6×5 scatter, tumble, ışın çarpanları birikir.'
  },
  sb: {
    type:'scatter', cols:6, rows:5, scatter:'🍭', scatterMin:4, fs:10,
    bg1:'#45102f', bg2:'#150310', glow:'#ff6fa5',
    syms:[
      {s:'❤️', pay:{8:10,9:15,10:25,11:40,12:50}, w:1},
      {s:'🍬', pay:{8:1,9:2,10:5,11:10,12:25}, w:2},
      {s:'🍇', pay:{8:0.8,9:1.5,10:4,11:8,12:18}, w:3},
      {s:'🍉', pay:{8:0.6,9:1.2,10:3,11:6,12:12}, w:4},
      {s:'🍎', pay:{8:0.4,9:0.9,10:2,11:4,12:8}, w:5},
      {s:'🍌', pay:{8:0.25,9:0.5,10:1,11:2,12:4}, w:6},
      {s:'🔵', pay:{8:0.25,9:0.5,10:0.8,11:1.5,12:2}, w:7}
    ],
    mults:[2,3,4,5,6,8,10,12,15,20,25,50,100],
    multChance:0.06, fsMultChance:0.22,
    note:'6×5 şeker: 8+ her yerde öder, tumble patlar, bomba çarpanlar FS’de birikir.'
  },
  bs: {
    type:'blood', cols:5, rows:3,
    bg1:'#2b0f14', bg2:'#0b0407', glow:'#ef4444',
    syms:['🧛','🦇','🩸','⚰️','🕯️','🧄'],
    pay:[[0,0,5,20,100],[0,0,3,15,60],[0,0,2,10,40],[0,0,1,5,20],[0,0,0.5,2,10],[0,0,0.3,1,5]],
    note:'5×3 25 çizgi — 3+ 🩸 tabut bonusunu açar. En yüksek RTP seçkide.'
  },
  mt4: {
    type:'holdwin', cols:5, rows:4,
    bg1:'#3a2408', bg2:'#0f0702', glow:'#f5b942',
    syms:['🚂','🤠','💰','🛢️','💵','🎰'],
    note:'5×4 Money Train — 3+ 💰 Hold&Win: 3 can, para değerleri yapışır.'
  },
  wdw: {
    type:'vs', cols:5, rows:4,
    bg1:'#33120e', bg2:'#0e0404', glow:'#ff7847',
    syms:['🤠','💀','🥃','🔫','🌵','🐎'],
    note:'5×4 Wanted — VS genişleyen wild, düello çarpanı ×2-×100.'
  }
};

const THEMES = {};
Object.keys(SLOT_DEFS).forEach(k=>{ THEMES[k]={bg1:SLOT_DEFS[k].bg1, bg2:SLOT_DEFS[k].bg2, glow:SLOT_DEFS[k].glow, syms:SLOT_DEFS[k].syms.map(x=>x.s||x)}; });
const WILD='✦', SCAT='✨';
const PAYC=[[2,5,12],[1.2,3,8],[0.8,2,5],[0.5,1.2,3],[0.3,0.8,2],[0.2,0.5,1.5]];
const LINES=[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[1,0,1,0,1],[1,2,1,2,1],[0,1,1,1,0],[2,1,1,1,2],[1,1,0,1,1]];
const FEATS={ gates:{icon:'⚡',label:'Yıldırım'}, sb:{icon:'🍬',label:'Şeker'}, mt4:{icon:'💰',label:'Vagon'}, wdw:{icon:'🔫',label:'Düello'}, sp:{icon:'💫',label:'Prenses'}, bs:{icon:'🩸',label:'Kan'} };
const LW=660, LH=380;
const ac = () => getAudio();

export default function SlotGame({ game, spend, win, onClose }){
  const canvasRef=useRef(null);
  const eng=useRef(null);
  const sfxRef=useRef(true);
  const [sfx,setSfx]=useState(true);
  const [ptOpen,setPtOpen]=useState(false);
  const betRef=useRef(25);
  const [betUI,setBetUI]=useState(25);
  const hud=useRef({});
  const def = SLOT_DEFS[game.id] || SLOT_DEFS.gates;
  const theme = THEMES[game.id] || THEMES.gates;

  function tone(f,t0,dur,type,g){
    if(!sfxRef.current) return;
    sharedTone(f, { delay: t0, dur, type: type || 'sine', gain: g || .12 });
  }

  const sfxScatter=()=>{ tone(1318,0,.18,'sine',.12); tone(1760,.14,.3,'sine',.12); };
  const sfxWinSnd=m=>{ const sc=[523,587,659,784,880,1047,1175,1319]; const n=Math.min(sc.length,2+Math.ceil(m)); for(let i=0;i<n;i++) tone(sc[i],i*.085,.22,'triangle',.1); if(m>=10) for(let i=0;i<12;i++) tone(sc[i%sc.length]*2,.8+i*.06,.12,'square',.045); };
  const sfxZap=()=>{ try{ const a=ac(),o=a.createOscillator(),g=a.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(1900,a.currentTime); o.frequency.exponentialRampToValueAtTime(140,a.currentTime+.22); g.gain.setValueAtTime(.1,a.currentTime); g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+.26); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+.3); tone(2500,.02,.05,'square',.05); } catch (err) { log.ignorable('slot.sfxZap', err); } };
  const sfxSpinStart=()=>{ try{ const a=ac(),o=a.createOscillator(),g=a.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(140,a.currentTime); o.frequency.exponentialRampToValueAtTime(640,a.currentTime+.28); g.gain.setValueAtTime(.07,a.currentTime); g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+.3); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+.32); } catch (err) { log.ignorable('slot.sfxSpinStart', err); } };
  const sfxReelStop=()=>{ tone(82,0,.09,'triangle',.22); tone(48,0,.13,'sine',.18); buzz(8); };
  const sfxTumble=()=> tone(600,0,.06,'triangle',.08);
  const sfxBomb=()=>{ tone(440,0,.12,'sawtooth',.15); tone(880,.08,.18,'sine',.12); };

  useEffect(()=>{
    const cv=canvasRef.current, X=cv.getContext('2d');
    const dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=LW*dpr; cv.height=LH*dpr; X.setTransform(dpr,0,0,dpr,0,0);

    const E=eng.current={
      open:true, mode: def.type==='scatter'?'scatter':def.type==='holdwin'?'holdwin':def.type==='vs'?'vs':def.type==='blood'?'blood':'lines',
      theme, def, feat:FEATS[game.id]||FEATS.gates,
      strips:[0,1,2,3,4].map(()=>{ const arr=[]; (theme.syms||[]).forEach((sy,i)=>{ for(let k=0;k<3;k++) arr.push({s:sy,i}); }); arr.push({s:WILD,i:-1},{s:WILD,i:-1},{s:SCAT,i:-2}); for(let i=arr.length-1;i>0;i--){ const j=Math.random()*(i+1)|0; [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }),
      pos:[0,0,0,0,0].map(()=>Math.random()*20|0), vel:[0,0,0,0,0], decel:[0,0,0,0,0], stopAt:[0,0,0,0,0], stopT:[9,9,9,9,9],
      raf:0, lastT:performance.now(), tickIv:0, bet:25, fsPool:0, fsMul:1, fsAcc:0, fsTotalMult:0,
      winTarget:0, winShown:0, parts:[], lines:[], hlT:0, orbs:[], flashT:9, spinning:false,
      grid:[], gridWinCells:[], gridMultCells:[], totalWin:0, holdGrid:[], vsGrid:[]
    };

    function weightedPick(d){ const tot=d.syms.reduce((a,b)=>a+(b.w||1),0); let r=Math.random()*tot; for(let i=0;i<d.syms.length;i++){ r-=(d.syms[i].w||1); if(r<=0) return i;} return 0; }
    function buildScatterGrid(){
      const cols=def.cols, rows=def.rows, g=[];
      for(let c=0;c<cols;c++){ g[c]=[]; for(let r=0;r<rows;r++){ const roll=Math.random(); if(roll<0.018){ g[c][r]={s:def.scatter,type:'scatter'}; } else if(roll<0.018+(def.multChance||0.07)){ const mv=def.mults[Math.random()*def.mults.length|0]; g[c][r]={s:'×'+mv,type:'mult',mult:mv}; } else { const idx=weightedPick(def); g[c][r]={s:def.syms[idx].s,type:'pay',idx,pay:def.syms[idx].pay}; } } }
      if(Math.random()<0.12){ let placed=0; g.flat().forEach(x=>{ if(x.type==='scatter') placed++; }); let need=def.scatterMin; while(placed<need){ const c=Math.random()*cols|0, r=Math.random()*rows|0; if(g[c][r].type!=='scatter'){ g[c][r]={s:def.scatter,type:'scatter'}; placed++; } } }
      return g;
    }
    function evalScatterGrid(grid, bet){
      const counts={}; grid.flat().forEach(cell=>{ if(cell.type==='pay') counts[cell.idx]=(counts[cell.idx]||0)+1; });
      let win=0, winCells=[], winMap=new Set();
      Object.keys(counts).forEach(k=>{ const cnt=counts[k], idx=Number(k), pay=def.syms[idx].pay; let mult=0; if(cnt>=12) mult=pay[12]||0; else if(cnt>=11) mult=pay[11]||0; else if(cnt>=10) mult=pay[10]||0; else if(cnt>=9) mult=pay[9]||0; else if(cnt>=8) mult=pay[8]||0; if(mult>0){ win+=bet*mult; grid.forEach((col,c)=>col.forEach((cell,r)=>{ if(cell.type==='pay'&&cell.idx===idx) winMap.add(c+'-'+r); })); } });
      winCells=Array.from(winMap).map(s=>{ const [c,r]=s.split('-').map(Number); return {c,r}; });
      let scat=0, multSum=0, multCells=[]; grid.forEach((col,c)=>col.forEach((cell,r)=>{ if(cell.type==='scatter') scat++; if(cell.type==='mult'){ multSum+=cell.mult; multCells.push({c,r,mult:cell.mult}); } }));
      return {win, winCells, scat, multSum, multCells};
    }

    function rr(x,y,w,h,r){ X.beginPath(); X.moveTo(x+r,y); X.arcTo(x+w,y,x+w,y+h,r); X.arcTo(x+w,y+h,x,y+h,r); X.arcTo(x,y+h,x,y,r); X.arcTo(x,y,x+w,y,r); X.closePath(); }
    function drawSym(sym,x,y,fast,small){
      const s=typeof sym==='string'?sym:(sym.s||sym);
      const special=s===WILD||s===SCAT||String(s).includes('×')||s===def.scatter;
      X.save(); const cw=small?90:118, ch=small?68:118; X.translate(x+cw/2,y+ch/2);
      if(special){ const g=X.createRadialGradient(0,0,8,0,0,52); g.addColorStop(0, String(s).includes('×')?'rgba(246,226,122,.55)':'rgba(212,175,55,.35)'); g.addColorStop(1,'rgba(0,0,0,0)'); X.fillStyle=g; X.beginPath(); X.arc(0,4,52,0,7); X.fill(); }
      if(fast) X.scale(1,1.22);
      X.font=(small?(special?26:28):(special?36:38))+'px Georgia, serif'; X.textAlign='center'; X.textBaseline='middle';
      if(special){ X.shadowColor=def.glow; X.shadowBlur=12; }
      if(String(s).includes('×')){ X.fillStyle='#f6e27a'; X.font='700 '+(small?16:20)+'px Georgia'; }
      X.fillText(s,0,4); X.restore();
    }
    function drawScatter(){
      const cols=def.cols, rows=def.rows, GAP=6;
      const cw=(LW-34-(cols-1)*GAP)/cols, ch=(LH-8-(rows-1)*4)/rows;
      const winSet=new Set((E.gridWinCells||[]).map(o=>o.c+'-'+o.r));
      for(let c=0;c<cols;c++) for(let r=0;r<rows;r++){
        const x=17+c*(cw+GAP), y=4+r*(ch+4);
        const isWin=winSet.has(c+'-'+r);
        rr(x,y,cw,ch,8); X.fillStyle=isWin?'rgba(212,175,55,.18)':'rgba(255,255,255,.04)'; X.fill();
        if(isWin){ X.strokeStyle=def.glow; X.lineWidth=2; X.stroke(); }
        const cell=E.grid[c]&&E.grid[c][r]; if(cell) drawSym(cell,x,y,false,true);
      }
    }
    function drawLinesGeneric(){
      const th=theme; const bg=X.createLinearGradient(0,0,0,LH); bg.addColorStop(0,th.bg1); bg.addColorStop(1,th.bg2); X.fillStyle=bg; X.fillRect(0,0,LW,LH);
      const COLS=5, ROWS=3, SW=118, SH=118, GAP=9, OX=17, OY=4, STEP=SH+GAP;
      for(let c=0;c<COLS;c++) for(let r=0;r<ROWS;r++){ rr(OX+c*(SW+GAP),OY+r*STEP,SW,SH,10); X.fillStyle='rgba(255,255,255,.035)'; X.fill(); }
      for(let c=0;c<COLS;c++){
        const x=OX+c*(SW+GAP), winTop=OY, winH=3*SH+2*GAP, L=E.strips[c].length;
        X.save(); X.beginPath(); X.rect(x-1,winTop,SW+2,winH); X.clip();
        const base=Math.floor(E.pos[c]), frac=E.pos[c]-base, speed=Math.abs(E.vel[c]);
        const bounceY=E.stopT[c]<.3?-Math.sin(E.stopT[c]/.3*Math.PI)*9:0;
        for(let r=-1;r<=ROWS;r++){
          const idx=((base+r)%L+L)%L, sym=E.strips[c][idx];
          const y=winTop+(r-frac)*STEP+bounceY;
          if(y<winTop-SH||y>winTop+winH) continue;
          const fast=speed>9;
          if(fast){ X.globalAlpha=.28; drawSym(sym,x,y-STEP*.5,true,false); X.globalAlpha=.6; drawSym(sym,x,y-STEP*.25,true,false); X.globalAlpha=1; }
          drawSym(sym,x,y,fast,false);
        }
        X.restore();
      }
    }
    function drawHoldWin(){
      const cols=def.cols, rows=def.rows, GAP=8;
      const cw=(LW-34-(cols-1)*GAP)/cols, ch=(LH-8-(rows-1)*4)/rows;
      for(let c=0;c<cols;c++) for(let r=0;r<rows;r++){
        const x=17+c*(cw+GAP), y=4+r*(ch+4);
        rr(x,y,cw,ch,8); X.fillStyle='rgba(255,255,255,.05)'; X.fill();
        const cell=E.holdGrid[c]&&E.holdGrid[c][r]; if(cell) drawSym(cell,x,y,false,true);
      }
    }
    function drawVS(){
      const cols=def.cols, rows=def.rows, GAP=8;
      const cw=(LW-34-(cols-1)*GAP)/cols, ch=(LH-8-(rows-1)*4)/rows;
      for(let c=0;c<cols;c++) for(let r=0;r<rows;r++){
        const x=17+c*(cw+GAP), y=4+r*(ch+4);
        rr(x,y,cw,ch,8); X.fillStyle='rgba(255,255,255,.04)'; X.fill();
        const cell=E.vsGrid[c]&&E.vsGrid[c][r]; if(cell) drawSym(cell,x,y,false,true);
      }
    }
    function draw(){
      const bg=X.createLinearGradient(0,0,0,LH); bg.addColorStop(0,theme.bg1); bg.addColorStop(1,theme.bg2); X.fillStyle=bg; X.fillRect(0,0,LW,LH);
      if(E.mode==='scatter') drawScatter();
      else if(E.mode==='holdwin') drawHoldWin();
      else if(E.mode==='vs') drawVS();
      else if(E.mode==='blood'){
        const cols=5, rows=3, GAP=9; const cw=(LW-34-(cols-1)*GAP)/cols, ch=(LH-8-(rows-1)*GAP)/rows;
        for(let c=0;c<cols;c++) for(let r=0;r<rows;r++){ const x=17+c*(cw+GAP), y=4+r*(ch+GAP); rr(x,y,cw,ch,10); X.fillStyle='rgba(255,255,255,.04)'; X.fill(); const cell=E.grid&&E.grid[c]&&E.grid[c][r]; if(cell) drawSym(cell.s||cell,x,y,false,false); }
      } else drawLinesGeneric();
      E.parts.forEach(pt=>{ X.globalAlpha=Math.max(0,pt.life); X.fillStyle=pt.spark?'#f6e27a':'#D4AF37'; X.beginPath(); X.arc(pt.x,pt.y,pt.r,0,7); X.fill(); });
      X.globalAlpha=1;
      if(E.flashT<.3){ X.fillStyle='rgba(246,226,122,'+(.26*(1-E.flashT/.3)).toFixed(3)+')'; X.fillRect(0,0,LW,LH); }
      if(E.mode==='scatter'&&E.fsPool>0){ X.font='700 12px Inter'; X.fillStyle='#f6e27a'; X.textAlign='left'; X.fillText('TOPLAM ×'+(E.fsTotalMult||0)+' | FS '+E.fsPool, 17, LH-8); }
    }
    function burst(x,y,n){ for(let i=0;i<n;i++) E.parts.push({x,y,vx:(Math.random()-.5)*300,vy:-Math.random()*300-60,g:850,life:.85+Math.random()*.6,r:2.2+Math.random()*2.8,spark:Math.random()<.3}); }

    async function scatterSpin(){
      E.grid=buildScatterGrid(); E.gridWinCells=[]; E.gridMultCells=[]; let totalWin=0; let accMult=E.fsPool>0?(E.fsTotalMult||0):0; if(E.fsPool===0) E.fsTotalMult=0; let tumbleCount=0;
      const cols=def.cols, rows=def.rows;
      while(true){
        const ev=evalScatterGrid(E.grid, E.bet, def);
        E.gridWinCells=ev.winCells; E.gridMultCells=ev.multCells; draw();
        if(ev.win>0){
          tumbleCount++;
          let winThis=ev.win;
          if(ev.multSum>0){ accMult+=ev.multSum; E.fsTotalMult=accMult; winThis=E.fsPool>0? ev.win*accMult : ev.win*ev.multSum; sfxBomb(); E.flashT=0; burst(LW/2,LH/2,30); say(def.scatter+' <b>Çarpan!</b> ×'+ev.multSum+(E.fsPool>0?' → toplam ×'+accMult:'')); }
          else if(E.fsPool>0&&accMult>0){ winThis=ev.win*accMult; }
          totalWin+=winThis; E.totalWin=totalWin; E.winTarget=Math.round(totalWin);
          const msgEl=hud.current.slotMsg; if(msgEl) msgEl.textContent='💥 '+tumbleCount+'. tumble: +'+fmt(winThis)+' | toplam +'+fmt(totalWin)+(accMult>0?' ×'+accMult:'');
          await new Promise(r=>setTimeout(r, 650));
          const winSet=new Set(ev.winCells.map(o=>o.c+'-'+o.r));
          for(let c=0;c<cols;c++){ let write=rows-1; for(let r=rows-1;r>=0;r--){ if(!winSet.has(c+'-'+r)){ if(write!==r) E.grid[c][write]=E.grid[c][r]; write--; } } for(let r=write;r>=0;r--){ const roll=Math.random(); if(roll<0.018) E.grid[c][r]={s:def.scatter,type:'scatter'}; else if(roll<0.018+(def.multChance||0.07)){ const mv=def.mults[Math.random()*def.mults.length|0]; E.grid[c][r]={s:'×'+mv,type:'mult',mult:mv}; } else { const idx=weightedPick(def); E.grid[c][r]={s:def.syms[idx].s,type:'pay',idx,pay:def.syms[idx].pay}; } } }
          sfxTumble(); draw(); await new Promise(r=>setTimeout(r, 350));
          if(tumbleCount>15) break;
          continue;
        } else {
          const scat=E.grid.flat().filter(x=>x.type==='scatter').length;
          if(scat>=def.scatterMin){ if(E.fsPool===0) E.fsTotalMult=accMult; E.fsPool+=def.fs; E.fsAcc=accMult; sfxScatter(); const b=hud.current.fsBanner; if(b){ b.innerHTML='✨ '+scat+' SCATTER! '+def.fs+' FS ✨<small style="display:block;font-size:.7rem;margin-top:.3rem">TOPLAM ×'+(E.fsTotalMult||0)+'</small>'; b.style.display='flex'; } say('✨ <b>'+scat+' Scatter!</b> '+def.fs+' FS kazandın!'); burst(LW/2,LH/3,60); }
          break;
        }
      }
      const hudEls=hud.current;
      if(totalWin>0){
        win(Math.round(totalWin)); logRound(game.name, E.bet, Math.round(totalWin), Math.round((totalWin/E.bet)*100)/100);
        if(hudEls.winHud) hudEls.winHud.classList.add('hot');
        if(hudEls.slotMsg) hudEls.slotMsg.textContent='🎉 +'+fmt(Math.round(totalWin))+' dürTL — '+tumbleCount+' tumble'+(accMult>0?' · ×'+accMult:'');
        sfxWinSnd(totalWin/E.bet); buzz([25,35,30]);
        if(totalWin/E.bet>=6&&hudEls.bigWin){ hudEls.bigWin.innerHTML='BÜYÜK KAZANÇ<small>+'+fmt(Math.round(totalWin))+' dürTL</small>'; hudEls.bigWin.style.display='flex'; hudEls.stage?.classList.add('shake-stage'); setTimeout(()=>{ hudEls.bigWin.style.display='none'; },1700); setTimeout(()=>hudEls.stage?.classList.remove('shake-stage'),500); }
      } else {
        if(E.fsPool===0) logRound(game.name, E.bet, 0, null);
        if(hudEls.slotMsg) hudEls.slotMsg.textContent=['Bu tur olmadı. Dürtü sabırlı olanı sever.','Tumble ısınıyor…','Şekerler diziliyor, bir tur daha?'][Math.random()*3|0];
      }
      E.spinning=false; if(hudEls.spinBtn) hudEls.spinBtn.disabled=false;
      if(E.fsPool>0) setTimeout(()=>{ if(E.open&&!E.spinning) doSpin(); }, 1400);
      else { E.fsTotalMult=0; E.fsAcc=0; if(hudEls.fsBanner) hudEls.fsBanner.style.display='none'; }
    }

    function holdWinSpin(){
      const cols=def.cols, rows=def.rows;
      const grid=[]; for(let c=0;c<cols;c++){ grid[c]=[]; for(let r=0;r<rows;r++){ const isBonus=Math.random()<0.18; grid[c][r]= isBonus? {s:'💰'+(Math.random()*5+1|0), type:'bonus', val:Math.random()*5+1|0} : {s:def.syms[Math.random()*def.syms.length|0], type:'pay'}; } }
      E.holdGrid=grid; draw();
      let bonusCount=0; grid.forEach(col=>col.forEach(cell=>{ if(cell.type==='bonus') bonusCount++; }));
      if(bonusCount>=3){
        say('💰 <b>Money Train Bonus!</b> '+bonusCount+' vagon — Hold&Win!');
        sfxScatter(); E.holdTotal=0; const bonusGrid=[]; for(let c=0;c<cols;c++){ bonusGrid[c]=[]; for(let r=0;r<rows;r++){ const cell=grid[c][r]; if(cell.type==='bonus'){ bonusGrid[c][r]={s:'💰'+cell.val,type:'money',val:cell.val,sticky:true}; E.holdTotal+=cell.val; } else bonusGrid[c][r]=null; } } E.holdGrid=bonusGrid;
        let lives=3;
        const loopBonus=async()=>{
          while(lives>0){
            const msgEl=hud.current.slotMsg; if(msgEl) msgEl.textContent='🚂 Hold&Win — can: '+lives+' | toplam ×'+E.holdTotal;
            draw(); await new Promise(r=>setTimeout(r, 900));
            let hit=false;
            for(let c=0;c<cols;c++) for(let r=0;r<rows;r++){ if(!E.holdGrid[c][r]&&Math.random()<0.38){ const v=Math.random()*8+1|0; E.holdGrid[c][r]={s:'💰'+v,type:'money',val:v,sticky:true}; E.holdTotal+=v; hit=true; burst(17+c*120+50,4+r*90+35,12); } }
            if(hit) lives=3; else lives--;
          }
          const winAmt=Math.round(E.bet*E.holdTotal);
          win(winAmt); logRound(game.name, E.bet, winAmt, E.holdTotal);
          E.winTarget=winAmt; if(hud.current.winAmt) hud.current.winAmt.textContent=fmt(winAmt);
          if(hud.current.slotMsg) hud.current.slotMsg.textContent='🎉 Bonus bitti: ×'+E.holdTotal+' → +'+fmt(winAmt)+' dürTL';
          sfxWinSnd(E.holdTotal/5); burst(LW/2,LH/2,80);
          E.spinning=false; if(hud.current.spinBtn) hud.current.spinBtn.disabled=false;
        };
        loopBonus();
      } else {
        let w=0; if(Math.random()<0.32) w=Math.round(E.bet*(0.5+Math.random()*3));
        if(w>0){ win(w); logRound(game.name,E.bet,w,w/E.bet); E.winTarget=w; if(hud.current.winHud) hud.current.winHud.classList.add('hot'); if(hud.current.slotMsg) hud.current.slotMsg.textContent='🎉 +'+fmt(w)+' dürTL'; sfxWinSnd(w/E.bet); }
        else { logRound(game.name,E.bet,0,null); if(hud.current.slotMsg) hud.current.slotMsg.textContent='Raylar sessiz… bir tur daha?'; }
        E.spinning=false; if(hud.current.spinBtn) hud.current.spinBtn.disabled=false;
      }
    }

    function vsSpin(){
      const cols=def.cols, rows=def.rows, grid=[];
      for(let c=0;c<cols;c++){ grid[c]=[]; for(let r=0;r<rows;r++){ grid[c][r]= Math.random()<0.07? {s:'VS',type:'vs'} : {s:def.syms[Math.random()*def.syms.length|0],type:'pay'}; } }
      // expand VS
      for(let c=0;c<cols;c++) if(grid[c].some(x=>x.type==='vs')) for(let r=0;r<rows;r++) grid[c][r]={s:'VS',type:'wild',mult:2+Math.random()*8|0};
      E.vsGrid=grid; draw();
      let wildReels=grid.filter(col=>col[0].type==='wild').length;
      let w=0, m=1;
      if(wildReels>=1){ m= wildReels===1? (2+Math.random()*3) : wildReels===2? (5+Math.random()*10) : (15+Math.random()*30); w=Math.round(E.bet*m); say('🔫 <b>DÜELLO!</b> '+wildReels+' VS → ×'+m.toFixed(1)); sfxZap(); burst(LW/2,LH/2,50); }
      else if(Math.random()<0.28) w=Math.round(E.bet*(0.4+Math.random()*2.5));
      if(w>0){ win(w); logRound(game.name,E.bet,w,m); E.winTarget=w; if(hud.current.winHud) hud.current.winHud.classList.add('hot'); if(hud.current.slotMsg) hud.current.slotMsg.textContent='🎉 +'+fmt(w)+' dürTL — '+wildReels+' VS wild'+(m>1?' ×'+m.toFixed(1):''); sfxWinSnd(m); }
      else { logRound(game.name,E.bet,0,null); if(hud.current.slotMsg) hud.current.slotMsg.textContent='Kasaba sessiz… düello yaklaşıyor.'; }
      E.spinning=false; if(hud.current.spinBtn) hud.current.spinBtn.disabled=false;
    }

    function bloodSpin(){
      const cols=5, rows=3, grid=[];
      for(let c=0;c<cols;c++){ grid[c]=[]; for(let r=0;r<rows;r++){ const isBonus=Math.random()<0.12; grid[c][r]={s:isBonus?'🩸':def.syms[Math.random()*def.syms.length|0], type:isBonus?'bonus':'pay'}; } }
      E.grid=grid; draw();
      let bonusCount=0; grid.forEach(col=>col.forEach(cell=>{ if(cell.type==='bonus') bonusCount++; }));
      if(bonusCount>=3){
        say('🦇 <b>Tabut Bonusu!</b> 3 tabut seçiliyor…');
        setTimeout(()=>{ const bw=Math.round(E.bet*(5+Math.random()*15)); win(bw); logRound(game.name+' · Tabut',E.bet,bw,bw/E.bet); E.winTarget=bw; if(hud.current.winAmt) hud.current.winAmt.textContent=fmt(bw); if(hud.current.slotMsg) hud.current.slotMsg.textContent='⚰️ Tabut Bonusu: +'+fmt(bw)+' dürTL'; sfxWinSnd(bw/E.bet); burst(LW/2,LH/2,60); E.spinning=false; if(hud.current.spinBtn) hud.current.spinBtn.disabled=false; },1200);
      } else {
        let w=0; if(Math.random()<0.42) w=Math.round(E.bet*(0.3+Math.random()*4));
        if(w>0){ win(w); logRound(game.name,E.bet,w,w/E.bet); E.winTarget=w; if(hud.current.winHud) hud.current.winHud.classList.add('hot'); if(hud.current.slotMsg) hud.current.slotMsg.textContent='🎉 +'+fmt(w)+' dürTL — kan taze'; sfxWinSnd(w/E.bet); }
        else { logRound(game.name,E.bet,0,null); if(hud.current.slotMsg) hud.current.slotMsg.textContent='Tabutlar kapalı… bir tur daha?'; }
        E.spinning=false; if(hud.current.spinBtn) hud.current.spinBtn.disabled=false;
      }
    }

    function onSettleLines(){
      E.pos.forEach((pp,c)=>E.pos[c]=((pp%E.strips[c].length)+E.strips[c].length)%E.strips[c].length);
      const grid=[]; for(let c=0;c<5;c++){ grid.push([]); for(let r=0;r<3;r++) grid[c].push(E.strips[c][(E.pos[c]+r)%E.strips[c].length]); }
      const perLine=E.bet/LINES.length; let total=0, scat=0; grid.flat().forEach(x=>{ if(x.s===SCAT) scat++; });
      LINES.forEach(line=>{ const seq=line.map((r,c)=>grid[c][r]); let symI=-1,count=0; for(let c=0;c<5;c++){ const s=seq[c]; if(s.s===WILD){ count++; continue; } if(s.s===SCAT) break; if(symI===-1) symI=s.i; if(s.i===symI) count++; else break; } if(symI===-1) symI=0; if(count>=3){ total+=perLine*PAYC[symI][count-3]*E.fsMul; E.lines.push({line,count}); } });
      total=Math.round(total); const fsTrig=scat>=3; if(fsTrig){ if(E.fsPool===0) E.fsAcc=0; E.fsPool+=8; E.fsMul=2; sfxScatter(); }
      let orbSum=0; const inFs=E.fsMul>1&&E.fsPool>0, fxChance=inFs?E.feat.fs:E.feat.base; if(Math.random()<fxChance){ const n=1+(Math.random()<.35?1:0)+(Math.random()<.12?1:0); const used=new Set(); for(let k=0;k<n;k++){ let c,r,key; do{ c=Math.random()*5|0; r=Math.random()*3|0; key=c+'-'+r; }while(used.has(key)); used.add(key); const m=E.feat.vals[Math.random()*E.feat.vals.length|0]; E.orbs.push({c,r,m,born:performance.now()}); orbSum+=m; } sfxZap(); E.flashT=0; buzz([20,35,55]); }
      let multAll=0; if(total>0){ if(inFs){ if(orbSum>0) E.fsAcc+=orbSum; multAll=E.fsAcc; } else if(orbSum>0) multAll=orbSum; if(multAll>1){ total*=multAll; say(E.feat.icon+' <b>'+E.feat.label+':</b> ×'+multAll+' çarpan!'); } }
      total=Math.round(total);
      const hudEls=hud.current; const mult=total/E.bet;
      if(total>0){ win(total); if(E.fsMul===1) logRound(game.name,E.bet,total,Math.round((total/E.bet)*100)/100); E.winTarget=total; hudEls.winHud?.classList.add('hot'); sfxWinSnd(mult); buzz([25,35,30]); if(hudEls.slotMsg) hudEls.slotMsg.textContent='🎉 +'+fmt(total)+' dürTL — '+E.lines.length+' çizgide'; if(mult>=6&&hudEls.bigWin){ hudEls.bigWin.innerHTML='BÜYÜK KAZANÇ<small>+'+fmt(total)+' dürTL</small>'; hudEls.bigWin.style.display='flex'; hudEls.stage?.classList.add('shake-stage'); setTimeout(()=>{ hudEls.bigWin.style.display='none'; },1700); setTimeout(()=>hudEls.stage?.classList.remove('shake-stage'),500); } }
      else { if(E.fsMul===1) logRound(game.name,E.bet,0,null); if(hudEls.slotMsg) hudEls.slotMsg.textContent=['Bu tur olmadı.','Isınıyor…','Bir tur daha?'][Math.random()*3|0]; }
      if(fsTrig) say('✨ <b>Scatter!</b> 8 FS kazandın!');
      const b=hudEls.fsBanner; if(b){ if(E.fsPool>0){ b.innerHTML='✨ FS ✨<small>KALAN: '+E.fsPool+' · ×2</small>'; b.style.display='flex'; } else b.style.display='none'; }
      if(E.fsPool>0) setTimeout(()=>{ if(E.open&&!E.spinning) doSpin(); },1400);
      else { E.fsMul=1; if(b) b.style.display='none'; if(hudEls.spinBtn) hudEls.spinBtn.disabled=false; }
    }

    function doSpin(){
      if(!E.open||E.spinning) return;
      const bet=betRef.current, free=E.fsPool>0;
      if(free) E.fsPool--; else if(!spend(bet)){ say('Yetersiz bakiye.'); return; }
      E.bet=bet; E.spinning=true; E.lines=[]; E.hlT=0; E.winTarget=0; E.winShown=0;
      const hudEls=hud.current; if(hudEls.spinBtn) hudEls.spinBtn.disabled=true;
      if(hudEls.slotMsg) hudEls.slotMsg.textContent=free?'✨ FS — kalan: '+E.fsPool:'…';
      hudEls.winHud?.classList.remove('hot');
      if(E.mode==='scatter') scatterSpin();
      else if(E.mode==='holdwin') holdWinSpin();
      else if(E.mode==='vs') vsSpin();
      else if(E.mode==='blood') bloodSpin();
      else {
        E.strips.forEach((st,c)=>{ const L=st.length, target=Math.random()*L|0; const cur=((E.pos[c]%L)+L)%L; const dist=(2+c)*L+(((target-cur)%L)+L)%L; const dur=.85+.3*c; E.stopAt[c]=E.pos[c]+dist; E.vel[c]=2*dist/dur; E.decel[c]=E.vel[c]/dur; });
        sfxSpinStart(); clearInterval(E.tickIv); E.tickIv=setInterval(()=>tone(1150,0,.022,'square',.02),85);
      }
    }
    E.spin=doSpin;
    E.buy=()=>{
      if(!E.open||E.spinning) return;
      if(E.fsPool>0){ say('Zaten FS’tesin.'); return; }
      const cost=betRef.current*100; if(!spend(cost)){ say('Bonus için ◈ '+fmt(cost)+' lazım.'); return; }
      logRound(game.name+' · Bonus Satın Al', cost, 0, null);
      if(E.mode==='scatter'){ E.fsPool+=def.fs; E.fsTotalMult=0; } else { E.fsAcc=0; E.fsPool+=8; E.fsMul=2; }
      sfxScatter(); buzz([30,40,30,40,80]); say('⚡ <b>Bonus satın alındı:</b> '+def.fs+' FS aktif!'); const b=hud.current.fsBanner; if(b){ b.innerHTML='✨ FS ✨<small>KALAN: '+E.fsPool+'</small>'; b.style.display='flex'; } if(hud.current.spinBtn) hud.current.spinBtn.disabled=true; setTimeout(()=>{ if(E.open&&!E.spinning) doSpin(); },650);
    };

    function loop(t){
      if(!E.open) return;
      const dt=Math.min(.05,(t-E.lastT)/1000||.016); E.lastT=t; E.hlT+=dt; if(E.flashT<.3) E.flashT+=dt;
      if(E.mode==='lines'){
        let allStopped=true;
        E.strips.forEach((st,c)=>{ if(E.vel[c]>0){ allStopped=false; E.vel[c]=Math.max(0,E.vel[c]-E.decel[c]*dt); E.pos[c]+=E.vel[c]*dt; if(E.pos[c]>=E.stopAt[c]||E.vel[c]<=0){ E.pos[c]=E.stopAt[c]; E.vel[c]=0; E.stopT[c]=0; sfxReelStop(); } } else if(E.stopT[c]<.3) E.stopT[c]+=dt; });
        E.parts.forEach(pt=>{ pt.vy+=pt.g*dt; pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.life-=dt*1.1; });
        E.parts=E.parts.filter(pt=>pt.life>0&&pt.y<LH+20);
        if(E.winShown<E.winTarget) E.winShown=Math.min(E.winTarget, E.winShown+Math.max(1,E.winTarget-E.winShown)*dt*9);
        if(hud.current.winAmt) hud.current.winAmt.textContent=fmt(E.winShown);
        drawLinesGeneric();
        if(allStopped&&E.spinning){ E.spinning=false; clearInterval(E.tickIv); onSettleLines(); }
      } else {
        E.parts.forEach(pt=>{ pt.vy+=pt.g*dt; pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.life-=dt*1.1; });
        E.parts=E.parts.filter(pt=>pt.life>0&&pt.y<LH+20);
        if(E.winShown<E.winTarget) E.winShown=Math.min(E.winTarget, E.winShown+Math.max(1,E.winTarget-E.winShown)*dt*9);
        if(hud.current.winAmt) hud.current.winAmt.textContent=fmt(E.winShown);
        if(E.mode==='scatter') drawScatter(); else if(E.mode==='holdwin') drawHoldWin(); else if(E.mode==='vs') drawVS();
      }
      E.raf=requestAnimationFrame(loop);
    }
    E.raf=requestAnimationFrame(loop);
    // initial
    if(E.mode==='scatter'){ E.grid=buildScatterGrid(); drawScatter(); }
    else if(E.mode==='holdwin'){ E.holdGrid=[]; drawHoldWin(); }
    else if(E.mode==='vs'){ E.vsGrid=[]; drawVS(); }
    else drawLinesGeneric();

    acquireAudio();
    const keyH=e=>{ if(e.code==='Space'){ e.preventDefault(); doSpin(); } };
    window.addEventListener('keydown', keyH);
    return ()=>{
      E.open=false; cancelAnimationFrame(E.raf); clearInterval(E.tickIv); window.removeEventListener('keydown',keyH); releaseAudio(); eng.current=null;
    };
  }, [game.id]);

  const tiers=['Premium','Yüksek','Orta','Orta','Düşük','Düşük'];
  return (
    <div className="ovl" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="pnl slot-pnl">
        <button className="close" onClick={onClose}>✕</button>
        <div className="slot-head">
          <div>
            <span className="demo-badge">Demo · Gerçek para yok</span>
            <h3>{game.icon} {game.name} · {def.type.toUpperCase()}</h3>
          </div>
          <button className="btn ghost" style={{padding:'.4rem .8rem'}} onClick={()=>{ sfxRef.current=!sfxRef.current; setSfx(sfxRef.current); }}>{sfx?'🔊':'🔇'}</button>
        </div>
        <p className="noteline">“{def.note}”</p>
        <div className="slot-stage" ref={el=>{ hud.current.stage=el; }}>
          <canvas ref={canvasRef} onClick={()=>eng.current?.spin?.()} />
          <div className="stage-ovl" style={{display:'none'}} ref={el=>{ hud.current.fsBanner=el; }} />
          <div className="stage-ovl bw" style={{display:'none'}} ref={el=>{ hud.current.bigWin=el; }} />
          {ptOpen && (
            <div className="paytable">
              <h4 className="serif" style={{color:'var(--gold)'}}>{game.name} — {def.type}</h4>
              <p className="muted" style={{fontSize:'.64rem',marginBottom:'.6rem'}}>{def.note}</p>
              {def.type==='scatter' ? (
                <>
                  {def.syms.map((sy,i)=><div className="pt-row" key={i}><span className="ps">{sy.s}</span><span className="pm">her yerde</span><b>8→{sy.pay[8]}× 10→{sy.pay[10]}× 12+→{sy.pay[12]}×</b></div>)}
                  <div className="pt-row"><span className="ps">{def.scatter}</span><span className="pm">SCATTER</span><b>{def.scatterMin}+ → {def.fs} FS</b></div>
                  <div className="pt-row"><span className="ps">×</span><span className="pm">ÇARPAN</span><b>{def.mults.slice(0,6).join(', ')}… birikir</b></div>
                </>
              ) : def.type==='holdwin' ? (
                <>
                  <div className="pt-row"><span className="ps">💰</span><span className="pm">BONUS</span><b>3+ → Hold&Win 3 can</b></div>
                  <div className="pt-row"><span className="ps">🚂</span><span className="pm">PREMIUM</span><b>5× → 50×</b></div>
                </>
              ) : def.type==='vs' ? (
                <>
                  <div className="pt-row"><span className="ps">VS</span><span className="pm">WILD</span><b>Tüm makaraya yayılır + çarpan</b></div>
                  <div className="pt-row"><span className="ps">💀</span><span className="pm">SCATTER</span><b>3+ → bonus</b></div>
                </>
              ) : (
                <>
                  {theme.syms.map((sy,i)=><div className="pt-row" key={i}><span className="ps">{sy}</span><span className="pm">{tiers[i]}</span><b>3×→{PAYC[i][0]} 4×→{PAYC[i][1]} 5×→{PAYC[i][2]}</b></div>)}
                  <div className="pt-row"><span className="ps">✦</span><span className="pm">WILD</span><b>Scatter hariç</b></div>
                  <div className="pt-row"><span className="ps">🩸</span><span className="pm">BONUS</span><b>3+ → tabut seç</b></div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="slot-hud">
          <div className="hud-box"><small>BAHİS</small>
            <select className="hud-sel" defaultValue="25" onChange={e=>{ betRef.current=Number(e.target.value); setBetUI(Number(e.target.value)); }}>
              {[10,25,50,100].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="hud-box win-hud" ref={el=>{ hud.current.winHud=el; }}><small>KAZANÇ</small><b ref={el=>{ hud.current.winAmt=el; }}>0</b></div>
          <button className="btn solid spin-btn" ref={el=>{ hud.current.spinBtn=el; }} onClick={()=>eng.current?.spin?.()}>DÖNDÜR</button>
          <button className="btn spin-btn" onClick={()=>eng.current?.buy?.()} title="Bahsin ×100'ü karşılığında FS + biriken çarpan">⚡ BONUS<span style={{display:'block',fontSize:'.6rem',opacity:.7,marginTop:'.15rem'}}>×100 = ◈ {(betUI*100).toLocaleString('tr-TR')}</span></button>
        </div>
        <div className="slot-foot">
          <span className="muted" ref={el=>{ hud.current.slotMsg=el; }}>{def.type==='scatter' ? `${def.cols}×${def.rows} her yerde öder · ${def.scatter} ${def.scatterMin}+ → ${def.fs} FS · çarpan birikir` : def.type==='holdwin' ? '3+ 💰 → Hold&Win 3 can · para değerleri yapışır' : def.type==='vs' ? 'VS wild genişler · düello çarpanı' : '5×3 · 3+ 🩸 → tabut bonusu'}</span>
          <button className="taglink" onClick={()=>setPtOpen(o=>!o)}>📜 Ödeme Tablosu</button>
        </div>
      </div>
    </div>
  );
}
