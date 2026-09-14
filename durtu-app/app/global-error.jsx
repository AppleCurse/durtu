'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html lang="tr">
      <body style={{ background: '#0A0A0A', color: '#F5F5DC', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
          <div>
            <div style={{ color: '#D4AF37', letterSpacing: '.3em', marginBottom: '1rem' }}>✦ DÜRTÜ</div>
            <h2>Beklenmeyen bir hata oluştu.</h2>
            <p style={{ color: '#9b9583', margin: '.8rem 0 1.6rem' }}>
              Sayfayı yenilemeyi dene. Kayıtlı verilerin korunuyor.
            </p>
            <button
              onClick={reset}
              style={{ background: '#D4AF37', color: '#000', border: 'none', padding: '.7rem 1.6rem', borderRadius: 3, cursor: 'pointer', letterSpacing: '.2em', fontSize: '.7rem' }}
            >
              TEKRAR DENE
            </button>
            {error?.digest && <p style={{ color: '#9b9583', fontSize: '.6rem', marginTop: '1.2rem' }}>Referans: {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  );
}
