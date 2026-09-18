'use client';
import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { getFairIdentity, getLastFairRound } from '../lib/store';
import { commitHash, verifyRound, randomSeed } from '../lib/engines/provablyFair';

const mono = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '.66rem', wordBreak: 'break-all' };

/**
 * Provably Fair paneli — monolitten port.
 * Son turun commit/reveal paketini gösterir ve "KENDİN HESAPLA" aracıyla
 * herhangi bir (serverSeed, clientSeed, nonce) üçlüsünün sonucunu
 * bağımsız yeniden üretir.
 */
export default function ProvablyFairModal({ onClose }) {
  const [last, setLast] = useState(null);
  const [id, setId] = useState(null);
  const [game, setGame] = useState('crash');
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('0');
  const [minesCount, setMinesCount] = useState('3');
  const [out, setOut] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- son commit/reveal paketi localStorage'dan mount'ta okunur (null iken render edilmez)
    setLast(getLastFairRound());
    const fair = getFairIdentity();
    setId(fair);
    setClientSeed(fair.clientSeed);
  }, []);

  function calc() {
    const n = Number.parseInt(nonce, 10);
    const mc = Number.parseInt(minesCount, 10) || 3;
    if (!serverSeed || !clientSeed || !Number.isInteger(n) || n < 0) {
      setOut({ error: 'Server seed, client seed ve geçerli bir nonce gir.' });
      return;
    }
    const res = verifyRound({ game, serverSeed, clientSeed, nonce: n, minesCount: mc });
    setOut(res);
  }

  function rotateClientSeed() {
    const seed = randomSeed().slice(0, 32);
    try {
      localStorage.setItem('durtu_react_fair_id', JSON.stringify({ clientSeed: seed, nonce: id?.nonce ?? 0 }));
    } catch { /* quota — demo */ }
    setId({ clientSeed: seed, nonce: id?.nonce ?? 0 });
    setClientSeed(seed);
    setOut(null);
  }

  const field = {
    width: '100%', padding: '.5rem .6rem', fontSize: '.72rem',
    background: 'var(--card2)', border: '1px solid var(--line)',
    borderRadius: 4, color: 'var(--cream)', ...mono,
  };

  return (
    <Modal onClose={onClose} title="Provably Fair" zIndex={80} style={{ width: 'min(620px, 98vw)', padding: '1.4rem 1.6rem' }}>
      <button className="close" onClick={onClose}>✕</button>
      <span className="tag">🛡️ Kriptografik Güvence</span>
      <h3 className="serif" style={{ margin: '.4rem 0 .6rem' }}>Doğrulanabilir Adillik</h3>
      <p className="muted" style={{ fontSize: '.76rem', lineHeight: 1.6 }}>
        DÜRTÜ her turun sonucunu tur <b>başlamadan</b> SHA-256 ile kilitler. Kasa veya oyuncu
        sonuca sonradan müdahale edemez; aşağıdaki araçla her turu bağımsız yeniden hesaplayabilirsin.
      </p>

      {last && (
        <div style={{ background: 'var(--card2)', border: '1px solid var(--line)', borderRadius: 8, padding: '.8rem .9rem', margin: '.6rem 0' }}>
          <div className="tag" style={{ color: 'var(--gold2)' }}>SON TUR · {last.game?.toLocaleUpperCase('tr-TR')} #{last.nonce}</div>
          <p style={{ ...mono, margin: '.5rem 0 .2rem' }}>Önceden kilitlenen hash: <b>{last.hash}</b></p>
          <p style={{ ...mono, margin: '.2rem 0' }}>Açığa çıkan kasa anahtarı: <b>{last.serverSeed}</b></p>
          <p style={{ ...mono, margin: '.2rem 0' }}>Client seed: <b>{last.clientSeed}</b> · nonce: <b>{last.nonce}</b></p>
          <p style={{ ...mono, margin: '.2rem 0' }}>
            Sonuç: <b>{Array.isArray(last.result) ? `${last.result.filter(Boolean).length} mayın` : `${last.result}×`}</b>
            {' '}· hash tutarlı: <b style={{ color: 'var(--green, #7fbf7f)' }}>{commitHash(last.serverSeed) === last.hash ? '✅' : '❌'}</b>
          </p>
        </div>
      )}

      <h4 className="serif" style={{ margin: '.8rem 0 .4rem' }}>KENDİN HESAPLA & DOĞRULA</h4>
      <div style={{ display: 'grid', gap: '.5rem' }}>
        <select value={game} onChange={e => setGame(e.target.value)} style={field} aria-label="Oyun türü">
          <option value="crash">✈️ Aviator (Crash)</option>
          <option value="mines">💣 Mines</option>
        </select>
        <input value={serverSeed} onChange={e => setServerSeed(e.target.value.trim())} placeholder="Kasa anahtarı (server seed)" style={field} aria-label="Kasa anahtarı" />
        <input value={clientSeed} onChange={e => setClientSeed(e.target.value.trim())} placeholder="İstemci anahtarı (client seed)" style={field} aria-label="İstemci anahtarı" />
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <input value={nonce} onChange={e => setNonce(e.target.value)} placeholder="Nonce" style={{ ...field, flex: 1 }} aria-label="Nonce" />
          {game === 'mines' && (
            <input value={minesCount} onChange={e => setMinesCount(e.target.value)} placeholder="Mayın" style={{ ...field, width: 90 }} aria-label="Mayın sayısı" />
          )}
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn solid" type="button" onClick={calc}>HESAPLA</button>
          <button className="btn ghost" type="button" onClick={rotateClientSeed}>🎲 Yeni client seed</button>
        </div>
      </div>

      {out?.error && <p style={{ color: '#e57373', fontSize: '.74rem' }}>{out.error}</p>}
      {out && !out.error && (
        <div style={{ background: 'var(--card2)', border: '1px solid var(--line)', borderRadius: 8, padding: '.7rem .8rem', marginTop: '.6rem' }}>
          <p style={{ ...mono, margin: '.2rem 0' }}>SHA-256(serverSeed): <b>{out.hash}</b></p>
          <p style={{ ...mono, margin: '.2rem 0' }}>
            Üretilen sonuç: <b>{Array.isArray(out.replayed) ? `${out.replayed.filter(Boolean).length} mayın` : `${out.replayed}×`}</b>
          </p>
          <p style={{ fontSize: '.72rem', margin: '.2rem 0' }}>
            {out.ok ? '✅ Doğrulandı: aynı girdiler aynı sonucu verir.' : '❌ Uyuşmazlık: girdileri kontrol et.'}
          </p>
        </div>
      )}
    </Modal>
  );
}
