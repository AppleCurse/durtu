'use client';
import { useEffect, useMemo, useState } from 'react';
import { CATS, GAMES as FALLBACK } from '../lib/games';
import { shuffle } from '../lib/shuffle';
import { log } from '../lib/logger';
import { getFavs, toggleFav } from '../lib/store';

export default function GameGrid({ onPlay }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [fromApi, setFromApi] = useState(false);
  const [query, setQuery] = useState('');
  const [favs, setFavs] = useState([]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- favoriler localStorage'dan mount'ta okunur (SSR'da [] olup istemcide dolması bilinçli)
  useEffect(() => { setFavs(getFavs()); }, []);

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

  function onToggleFav(id, e) {
    e.stopPropagation();
    setFavs(toggleFav(id));
  }

  // İkinci savunma katmanı: games her ihtimale karşı dizi olmayabilir.
  const base = Array.isArray(games) ? games : FALLBACK;
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return base.filter(g => {
      if (!g) return false;
      if (filter === 'fav' && !favs.includes(g.id)) return false;
      if (filter !== 'all' && filter !== 'fav' && g.cat !== filter) return false;
      if (!q) return true;
      const hay = `${g.name} ${g.note} ${g.type} ${g.rtp} ${g.vol}`.toLocaleLowerCase('tr-TR');
      return hay.includes(q);
    });
  }, [base, filter, favs, query]);

  return (
    <section id="secki">
      <span className="tag">Küratörün Seçkisi {fromApi ? '· /api/games' : '· yerel yedek'}</span>
      <h2 className="sect">5.000 oyun değil. Senin için seçilmiş {base.length} oyun.</h2>

      {/* Lobi arama çubuğu (monolitten port) */}
      <div style={{ margin: '1rem 0 .9rem', position: 'relative', maxWidth: 440 }}>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="🔍 Oyun veya kategori ara (Gates, Rulet, Slot, 98%...)"
          aria-label="Oyun ara"
          style={{
            width: '100%', padding: '.65rem .9rem', fontSize: '.82rem',
            background: 'var(--card2)', border: '1px solid var(--line)',
            borderRadius: 4, color: 'var(--cream)',
          }}
        />
      </div>

      <div className="filters">
        {CATS.map(([k, l]) => (
          <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <button
          className={'chip' + (filter === 'fav' ? ' on' : '')}
          onClick={() => setFilter('fav')}
          title="Favori oyunların"
        >
          ❤️ Favorilerim ({favs.length})
        </button>
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
                <button
                  type="button"
                  aria-label={favs.includes(x.id) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  title={favs.includes(x.id) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  onClick={e => onToggleFav(x.id, e)}
                  style={{
                    position: 'absolute', top: '.7rem', right: '.7rem',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '1rem', color: favs.includes(x.id) ? 'var(--gold)' : 'var(--muted)',
                    padding: '.2rem', lineHeight: 1,
                  }}
                >
                  {favs.includes(x.id) ? '♥' : '♡'}
                </button>
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
                      : x.type === 'sport'
                      ? 'Kupon Yap →'
                      : 'Masaya Git →'}
                  </span>
                </div>
              </div>
            ))}
        {!loading && list.length === 0 && (
          <p className="muted" style={{ gridColumn: '1/-1' }}>
            {filter === 'fav' && favs.length === 0
              ? 'Henüz favori seçmedin — bir kartın ♡ simgesine dokun.'
              : 'Bu aramaya uyan oyun yok.'}
          </p>
        )}
      </div>
    </section>
  );
}
