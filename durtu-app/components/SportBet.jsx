'use client';
import { useEffect, useRef, useState } from 'react';
import { say, fmt, html } from '../lib/toast';
import { logRound } from '../lib/store';
import { useRoundLock } from '../lib/useRoundLock';
import Modal from './ui/Modal';

const MATCHES = [
  {id:'ucl1', league:'Şampiyonlar Ligi', time:'Bu akşam 22:00', home:'Real Madrid', away:'Bayern München', odds:{'1':2.10,'X':3.40,'2':3.10}},
  {id:'ucl2', league:'Şampiyonlar Ligi', time:'Bu akşam 22:00', home:'Arsenal', away:'Inter', odds:{'1':2.45,'X':3.20,'2':2.85}},
  {id:'sl1', league:'Süper Lig', time:'Yarın 19:00', home:'Galatasaray', away:'Fenerbahçe', odds:{'1':2.30,'X':3.10,'2':3.00}},
];

export default function SportBet({ spend, win, onClose }){
  const [sel,setSel]=useState(null); // {mid, market, odds, match}
  const [stake,setStake]=useState(25);
  const { busy: settling, acquire, release } = useRoundLock();
  const [result,setResult]=useState(null);
  const [progress,setProgress]=useState(0);
  const ivRef=useRef(null);
  const timerRef=useRef(null);

  // Modal kapatılırsa bekleyen settlement unmount sonrası setState çağırmasın
  useEffect(()=>()=>{ clearInterval(ivRef.current); clearTimeout(timerRef.current); },[]);

  function pick(mid, market){
    const m=MATCHES.find(x=>x.id===mid);
    const odds=m.odds[market];
    setSel({mid, market, odds, match:m});
    setResult(null);
  }
  function potential(){ return sel ? Math.round(stake*sel.odds) : 0; }

  function confirm(){
    if(!sel){ say('Önce bir oran seç.'); return; }
    if(!acquire()) return;
    if(!spend(stake)){ release(); say('Yetersiz bakiye.'); return; }
    // Tur sözleşmesi — settlement bu dondurulmuş kupona göre yapılır.
    const round = Object.freeze({ stake, market: sel.market, odds: sel.odds, match: sel.match });
    setResult(null); setProgress(0);
    let p=0;
    const iv=setInterval(()=>{ p=Math.min(92,p+Math.random()*20); setProgress(p); },120);
    ivRef.current=iv;
    timerRef.current=setTimeout(()=>{
      clearInterval(iv); setProgress(100);
      const m=round.match;
      const inv={ '1':1/m.odds['1'], 'X':1/m.odds['X'], '2':1/m.odds['2'] };
      const sum=inv['1']+inv['X']+inv['2'];
      const prob={ '1':inv['1']/sum, 'X':inv['X']/sum, '2':inv['2']/sum };
      const r=Math.random(); let outcome;
      if(r<prob['1']) outcome='1'; else if(r<prob['1']+prob['X']) outcome='X'; else outcome='2';
      const won = outcome===round.market;
      const payout = won ? Math.round(round.stake*round.odds) : 0;
      if(won) win(payout);
      logRound('Spor · '+m.home+' — '+m.away, round.stake, payout, round.odds);
      setResult({outcome, won, payout, profit:payout-round.stake});
      release();
      if(won) say(html`🏆 <b>Kupon kazandı!</b> ${m.home} — ${m.away} · +${fmt(payout)} dürTL`);
      else say(html`⚽ Kupon yattı — ${outcome==='1'?m.home:outcome==='2'?m.away:'Beraberlik'} geldi.`);
    }, 1800);
  }

  return (
    <Modal onClose={onClose} title="Spor Bahisleri" className="pnl" style={{width:'min(560px,100%)'}}>
        <h3>🏆 Spor Bahsi — Gerçek Kupon</h3>
        <p className="noteline">3 maç · 1X2 · oranlar küratörlü · bakiye entegre.</p>
        <div style={{display:'flex',flexDirection:'column',gap:'.85rem',margin:'.9rem 0'}}>
          {MATCHES.map(m=>(
            <div key={m.id} style={{border:'1px solid var(--line)',borderRadius:10,padding:'.65rem .75rem',background:'rgba(255,255,255,.02)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'.5rem'}}>
                <span className="tag">{m.league} · {m.time}</span>
                <span className="muted" style={{fontSize:'.66rem'}}>{m.id.toUpperCase()}</span>
              </div>
              <div className="serif" style={{textAlign:'center',fontSize:'1rem',marginBottom:'.55rem'}}>{m.home} <span className="muted">—</span> {m.away}</div>
              <div style={{display:'flex',gap:'.4rem'}}>
                {['1','X','2'].map(k=>(
                  <button key={k} className={`odd ${sel?.mid===m.id&&sel?.market===k?'sel':''}`} style={{flex:1,padding:'.5rem .2rem',borderRadius:8,border:'1px solid var(--line)',background:sel?.mid===m.id&&sel?.market===k?'rgba(212,175,55,.18)':'rgba(255,255,255,.04)',cursor:'pointer'}} onClick={()=>pick(m.id,k)}>
                    <small style={{display:'block',fontSize:'.62rem',opacity:.7}}>MS {k}</small><b>{m.odds[k].toFixed(2)}</b>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:'.6rem',alignItems:'center',margin:'.6rem 0'}}>
          <div className="hud-box" style={{flex:1}}><small>BAHİS</small>
            <select className="hud-sel" value={stake} onChange={e=>setStake(Number(e.target.value))}>
              {[10,25,50,100,250].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="hud-box" style={{flex:1.2}}><small>POTANSİYEL</small><b style={{color:'var(--gold)'}}>{sel? '◈ '+fmt(potential())+' dürTL' : '—'}</b></div>
        </div>
        <div className="muted" style={{fontSize:'.8rem',marginBottom:'.6rem',lineHeight:1.5}}>
          {sel ? <><b>{sel.match.home} — {sel.match.away}</b> · <span style={{color:'var(--gold)'}}>{sel.market==='1'?sel.match.home:sel.market==='2'?sel.match.away:'Beraberlik'} @ {sel.odds.toFixed(2)}</span><br/><span className="muted">Tek maç · kupon hazır.</span></> : 'Bir oran seç — kupon burada belirir.'}
        </div>
        <button className="btn solid" style={{width:'100%'}} disabled={settling} onClick={confirm}>{settling?'Sonuçlanıyor…':'Kuponu Onayla — Gerçek Settlement'}</button>
        {settling && <div style={{height:4,background:'var(--line)',borderRadius:4,marginTop:'.6rem',overflow:'hidden'}}><div style={{height:'100%',width:progress+'%',background:'var(--gold)',transition:'width .2s'}}/></div>}
        {result && (
          <div style={{marginTop:'.85rem',padding:'.8rem',border:'1px solid var(--line)',borderRadius:10,background:'rgba(255,255,255,.03)'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><b style={{color:result.won?'var(--gold)':'var(--cream)'}}>{result.won?'✅ KAZANDI':'❌ KAYBETTİ'}</b><span className="tag">{sel.match.league}</span></div>
            <div style={{margin:'.5rem 0 .3rem',fontSize:'.92rem'}}>{sel.match.home} — {sel.match.away}<br/><span className="muted">Seçimin: {sel.market==='1'?sel.match.home:sel.market==='2'?sel.match.away:'Beraberlik'} @ {sel.odds.toFixed(2)} · Sonuç: {result.outcome==='1'?sel.match.home:result.outcome==='2'?sel.match.away:'Beraberlik'} ({result.outcome})</span></div>
            <div style={{fontSize:'.92rem'}}><b>Bahis:</b> ◈ {fmt(stake)} · <b>{result.won?'Kazanç':'İade'}:</b> ◈ {fmt(result.payout)} {result.won&&<span style={{color:'var(--gold)'}}>(+{fmt(result.profit)})</span>}</div>
          </div>
        )}
        <p className="muted" style={{fontSize:'.66rem',marginTop:'.7rem',lineHeight:1.4}}>Oranlar küratörlü; sonuç, oranların ima ettiği olasılığa göre ağırlıklı olarak üretilir. Kazanç anında dürTL bakiyene işlenir.</p>
      </Modal>
  );
}
