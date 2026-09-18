import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div>
        <div className="serif" style={{ color: 'var(--gold)', letterSpacing: '.3em', marginBottom: '1rem' }}>✦ DÜRTÜ</div>
        <h2 className="serif" style={{ fontWeight: 600 }}>Bu kapı başka bir yere açılıyor.</h2>
        <p className="muted" style={{ margin: '.8rem 0 1.6rem' }}>Aradığın sayfa bulunamadı.</p>
        <Link className="btn solid" href="/">Salona Dön</Link>
      </div>
    </div>
  );
}
