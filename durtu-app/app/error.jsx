'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('[DURTU] beklenmeyen hata', {
      message: error?.message,
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div>
        <div className="serif" style={{ color: 'var(--gold)', letterSpacing: '.3em', marginBottom: '1rem' }}>✦ DÜRTÜ</div>
        <h2 className="serif" style={{ fontWeight: 600 }}>Salon bir an için karardı.</h2>
        <p className="muted" style={{ margin: '.8rem 0 1.6rem', lineHeight: 1.7 }}>
          Beklenmeyen bir sorun oluştu. Bakiyen ve geçmişin korunuyor.
        </p>
        <button className="btn solid" onClick={reset}>Salona Dön</button>
        {error?.digest && (
          <p className="muted" style={{ fontSize: '.6rem', marginTop: '1.2rem', letterSpacing: '.1em' }}>
            Referans: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
