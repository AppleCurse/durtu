'use client';
import { useEffect, useState } from 'react';
import { getLastFairRound } from '../../lib/store';

/**
 * Tur bazlı commit/reveal rozeti.
 *  - Tur sürerken: BAŞLAMADAN kilitlenen SHA-256 özetini gösterir
 *  - Tur bitince: açığa çıkan kasa anahtarının ilk baytlarını ve nonce'u gösterir,
 *    "Doğrula" düğmesi Provably Fair panelini açar (durtu:openfair olayı)
 */
export default function FairBadge({ liveHash }) {
  const [last, setLast] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reveal paketi localStorage'dan mount/tur olayında senkronlanır
    setLast(getLastFairRound());
    const sync = () => setLast(getLastFairRound());
    window.addEventListener('durtu:fair', sync);
    return () => window.removeEventListener('durtu:fair', sync);
  }, [liveHash]);

  const mono = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '.62rem', letterSpacing: '.04em' };

  if (liveHash) {
    return (
      <p className="muted" style={{ ...mono, margin: '0 0 .6rem' }} title="Tur başlamadan kilitlenen özet">
        🛡️ Adil Oyun · Kilitli Hash (SHA-256): <b style={{ color: 'var(--gold2)' }}>{liveHash.slice(0, 24)}…</b>
      </p>
    );
  }
  if (!last) return null;
  return (
    <p className="muted" style={{ ...mono, margin: '0 0 .6rem' }}>
      🛡️ Son tur #{last.nonce} · kilit <b style={{ color: 'var(--gold2)' }}>{last.hash?.slice(0, 12)}…</b>
      {' '}· anahtar <b style={{ color: 'var(--green, #7fbf7f)' }}>{last.serverSeed?.slice(0, 12)}…</b>
      {' '}·{' '}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('durtu:openfair'))}
        style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}
      >
        Doğrula ➔
      </button>
    </p>
  );
}
