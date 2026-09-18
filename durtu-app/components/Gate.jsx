'use client';
import { useState } from 'react';
import { say } from '../lib/toast';
import { log } from '../lib/logger';
import Modal from './ui/Modal';

export default function Gate({ onEnter }) {
  const [code, setCode] = useState('');
  const [appOpen, setAppOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [door, setDoor] = useState(false);

  function knock(e) {
    e.preventDefault();
    if (code.trim().length >= 4) { setDoor(true); setTimeout(() => onEnter('Misafir'), 1950); }
    else say('<b>Dürtü:</b> bu kod kapıyı açmadı. Davetin yoksa başvuru seni bekliyor.');
  }

  async function submitApp(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = ((fd.get('name') || '').toString().trim().replace(/[<>&"']/g, '').slice(0, 40)) || 'Misafir';
    const email = (fd.get('email') || '').toString().trim();
    const contact = (fd.get('contact') || '').toString().trim();
    const why = (fd.get('why') || '').toString().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      say('<b>Dürtü:</b> Geçerli bir e-posta adresi girin — davetiyeniz buraya gönderilecek.');
      return;
    }
    if (why.length < 12) { say('<b>Dürtü:</b> Üç cümle bekliyoruz — içtenlikle yaz.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, contact, why, type: fd.get('type'), budget: fd.get('budget') }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || 'UNKNOWN');
    } catch (err) {
      // Başvuru iletilemediyse kullanıcıya "Onaylandın" DENMEZ.
      log.critical('gate.submitApply', err, { emailDomain: email.split('@')[1] });
      setBusy(false);
      say('<b>Dürtü:</b> Başvurun şu an iletilemedi — bağlantını kontrol edip tekrar dener misin?');
      return;
    }
    setBusy(false);
    setApproved(true);
    setTimeout(() => { setDoor(true); setTimeout(() => onEnter(name), 1800); }, 1600);
  }

  return (
    <>
      <section className="gate">
        <span className="tag gate-tag">K a p a l ı &nbsp; K u l ü p</span>
        <div className="wm">DÜRTÜ</div>
        <div className="gate-rule" />
        <p className="gate-sub">“Dürtü seni çağırıyor.”</p>
        <p className="gate-hint" style={{ letterSpacing: '.14em' }}>Seçilmişler için · Giriş yalnızca davetle</p>
        <form className="gate-form" onSubmit={knock}>
          <input className="inp" style={{ textAlign: 'center', letterSpacing: '.3em' }} maxLength={12}
            placeholder="DAVET KODU" value={code} onChange={e => setCode(e.target.value)} />
          <button className="btn solid" type="submit">Kapıyı Çal</button>
          <button className="btn ghost" type="button" onClick={() => setAppOpen(true)}>Başvuru Yap</button>
          <p className="gate-hint">Demo: 4+ karakterli her kod kapıyı açar — örn. <b style={{ color: 'var(--gold)' }}>EV-2026</b></p>
          <p className="gate-hint" style={{ marginTop: '.4rem', color: 'var(--gold2)', fontSize: '.68rem' }}>☀️ Günün ilk girişinde +100 dürTL hoş geldin ritüeli kasana eklenir</p>
        </form>
        <p className="gate-foot">İki adımlı doğrulama • Şifreli iletişim • 18+ | Sorumlu oyun</p>
      </section>

      {door && (
        <div className="door"><span className="tag">Kapı aralanıyor</span><div className="door-line" /></div>
      )}

      {appOpen && (
        <Modal onClose={() => setAppOpen(false)} title="Üyelik Başvurusu" className="pnl">
            <span className="tag">Üyelik Başvurusu</span>
            <h3>Kayıt değil. Başvuru.</h3>
            <p className="noteline">Her üyelik Dürtü tarafından tek tek değerlendirilir. Acele etme; içtenlikle yaz.</p>
            {!approved ? (
              <form onSubmit={submitApp}>
                <label htmlFor="ap-name">Adın Soyadın</label>
                <input className="inp" id="ap-name" name="name" placeholder="Adınız Soyadınız" required />
                <label htmlFor="ap-email">E-posta Adresin (Zorunlu — Davetiyen buraya iletilir)</label>
                <input className="inp" id="ap-email" type="email" name="email" placeholder="ornek@alanadi.com" required />
                <label htmlFor="ap-contact">Telegram veya Telefon (VIP Temsilci Hattı — Opsiyonel)</label>
                <input className="inp" id="ap-contact" name="contact" placeholder="@kullaniciadi veya 05XX XXX XX XX" />
                <label htmlFor="ap-why">Neden DÜRTÜ&apos;ye katılmak istiyorsun? (3 cümle)</label>
                <textarea className="inp" id="ap-why" name="why" placeholder="Seni buraya çeken nedir?" required />
                <label htmlFor="ap-type">Hangi türde kendini uzman hissediyorsun?</label>
                <select className="inp" id="ap-type" name="type"><option>Slot</option><option>Canlı Bahis</option><option>Masa Oyunları</option><option>Crash</option></select>
                <label htmlFor="ap-budget">Aylık oyun bütçen</label>
                <select className="inp" id="ap-budget" name="budget"><option>5.000 TL altı</option><option>5.000 – 25.000 TL</option><option>25.000 – 100.000 TL</option><option>100.000 TL üzeri</option></select>
                <div style={{ marginTop: '1.4rem' }}>
                  <button className="btn solid" style={{ width: '100%' }} disabled={busy}>
                    {busy ? 'Değerlendiriliyor…' : 'Başvuruyu Gönder'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="noteline serif" style={{ border: 'none', padding: 0, textAlign: 'center', color: 'var(--gold)', fontSize: '1.05rem' }}>
                ✦ Onaylandın. Davetiyen hazır…
              </p>
            )}
        </Modal>
      )}
    </>
  );
}
