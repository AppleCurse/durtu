'use client';
import { useState } from 'react';
import { say } from '../lib/toast';
import { log } from '../lib/logger';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Kapı: tek giriş kartı.
 *
 * Kod yok, şifre yok, başvuru kuyruğu yok: Ad Soyad + E-posta zorunlu,
 * Telegram/telefon opsiyonel. Kart /api/entry üzerinden kulübe iletilir
 * (mail ya da log), kapı 1,4 sn'de açılır ve isim profile yazılır —
 * kart bir daha sorulmaz (geri dönüşte otomatik giriş, bkz. page.jsx).
 *
 * Görünmez "website" alanı bal küpüdür: insan göremez, bot doldurur —
 * doluysa istek sessizce yutulur.
 */
export default function Gate({ onEnter }) {
  const [busy, setBusy] = useState(false);
  const [door, setDoor] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy || door) return;
    const fd = new FormData(e.target);
    const name = String(fd.get('name') ?? '').trim().slice(0, 60);
    const email = String(fd.get('email') ?? '').trim().toLowerCase();
    const contact = String(fd.get('contact') ?? '').trim().slice(0, 80);
    if (String(fd.get('website') ?? '').trim()) return; // bal küpü: sessiz yut
    if (!name) {
      say('<b>Dürtü:</b> Adını ve soyadını yaz — kapı isimle açılır.');
      return;
    }
    if (!email || !EMAIL_RE.test(email)) {
      say('<b>Dürtü:</b> Geçerli bir e-posta adresi gir — kartın oraya düşer.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, contact }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || 'UNKNOWN');
    } catch (err) {
      // Kart iletilemediyse kapı AÇILMAZ — "girdin" yalanı yok.
      log.critical('gate.submitEntry', err, { emailDomain: email.split('@')[1] });
      setBusy(false);
      say('<b>Dürtü:</b> Kart şu an iletilemedi — bağlantını kontrol edip tekrar dener misin?');
      return;
    }
    setDoor(true);
    setTimeout(() => onEnter(name), 1400);
  }

  return (
    <>
      <section className="gate">
        <span className="tag gate-tag">K a p a l ı &nbsp; K u l ü p</span>
        <div className="wm">DÜRTÜ</div>
        <div className="gate-rule" />
        <p className="gate-sub">“Dürtü seni çağırıyor.”</p>
        <form className="gate-form" onSubmit={submit}>
          <label htmlFor="g-name">Ad Soyad</label>
          <input
            className="inp"
            id="g-name"
            name="name"
            placeholder="Adınız Soyadınız"
            required
            maxLength={60}
            autoComplete="name"
          />
          <label htmlFor="g-email">E-posta</label>
          <input
            className="inp"
            id="g-email"
            name="email"
            type="email"
            placeholder="ornek@alanadi.com"
            required
            maxLength={254}
            autoComplete="email"
          />
          <label htmlFor="g-contact">
            Telegram / Telefon <span className="muted">(opsiyonel)</span>
          </label>
          <input
            className="inp"
            id="g-contact"
            name="contact"
            placeholder="@kullaniciadi veya 05XX XXX XX XX"
            maxLength={80}
          />
          {/* Bal küpü: ekran dışı, odaklanamaz — insan ulaşamaz, bot doldurur. */}
          <div
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}
            aria-hidden="true"
          >
            <input tabIndex={-1} autoComplete="off" name="website" />
          </div>
          <button className="btn solid" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Kapı aralanıyor…' : 'Giriş Kartını Doldur'}
          </button>
        </form>
        <p className="gate-foot">18+ | Sorumlu oyun</p>
      </section>

      {door && (
        <div className="door"><span className="tag">Kapı aralanıyor</span><div className="door-line" /></div>
      )}
    </>
  );
}
