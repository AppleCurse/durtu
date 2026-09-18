'use client';
import { useEffect, useState } from 'react';
import { CATS, GAMES as FALLBACK } from '../lib/games';
import { shuffle } from '../lib/shuffle';
import { log } from '../lib/logger';

export default function GameGrid({ onPlay }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [fromApi, setFromApi] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch('/api/games', { cache: 'no-store' });
      // fetch HTTP 500'de reject ETMEZ; durum ve gövde ayrıca doğrulanmalı.
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j?.ok || !Array.isArray(j.data) || j.data.length === 0) {
        throw new Error('MALFORMED_PAYLOAD');
      }
      setGames(shuffle(j.data));
      setFromApi(true);
    } catch (err) {
      log.warn('gamegrid.refresh', '/api/games başarısız — yerel seçkiye düşüldü', { err: err?.message });
      setGames(shuffle(FALLBACK));
      setFromApi(false);
    } finally {
      setLoading(false);
    }
  }
  // Asenkron veri çekimi: setState'ler await sonrasında, yani senkron
  // cascading render değil. Kural bunu ayırt edemiyor.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch
  useEffect(() => { refresh(); }, []);

  // İkinci savunma katmanı: games her ihtimale karşı dizi olmayabilir.
  const list = (Array.isArray(games) ? games : FALLBACK).filter(
    g => g && (filter === 'all' || g.cat === filter)
  );

  return (
    <section id="secki">
      <span className="tag">Küratörün Seçkisi {fromApi ? '· /api/games' : '· yerel yedek'}</span>
      <h2 className="sect">5.000 oyun değil. Senin için seçilmiş {list.length} oyun.</h2>
      <div className="filters">
        {CATS.map(([k, l]) => (
          <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <button className="chip" style={{ borderStyle: 'dashed' }} onClick={refresh}>🔄 Tazele</button>
      </div>
      <div className="ggrid">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div className="gcard skel" key={i}><div className="skl tall" /><div className="skl" /><div className="skl w60" /></div>
            ))
          : list.map(x => (
              <div
                className="gcard"
                key={x.id}
                role="button"
                tabIndex={0}
                onClick={() => onPlay(x.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(x.id); }
                }}
              >
                <div className="ic">{x.icon}</div>
                <h3>{x.name}</h3>
                <div className="meta">RTP %{x.rtp} · {x.vol}</div>
                <div className="note">“{x.note}”</div>
                <div style={{ marginTop: '1rem' }}>
                  <span className="tag" style={{ letterSpacing: '.2em' }}>
                    {x.type === 'slot'
                      ? 'Oyna →'
                      : x.type === 'crash'
                      ? 'Uç →'
                      : x.type === 'plinko'
                      ? 'Bırak →'
                      : x.type === 'limbo'
                      ? 'Roketle →'
                      : x.type === 'hilo'
                      ? 'Tahmin Et →'
                      : x.type === 'wheel'
                      ? 'Çevir →'
                      : x.type === 'mines'
                      ? 'Tarlaya Gir →'
                      : 'Masaya Git →'}
                  </span>
                </div>
              </div>
            ))}
      </div>
    </section>
  );
}
