'use client';
import { useEffect, useRef, useState } from 'react';

const TTL_MS = 3800;
const MAX_TOASTS = 5;

/**
 * Toast kuyruğu.
 *
 * GÜVENLİK NOTU (BLOCKER #8): buradaki dangerouslySetInnerHTML bilinçli bir
 * tercihtir (toast'lar <b>/<span> gibi basit vurgu markup'ı taşır), ANCAK içerik
 * yalnızca lib/toast.js'teki `html` tagged-template'inden gelmelidir — o şablon
 * tüm interpolasyonları escape eder. say() çağrılarında ASLA ham şablon literali
 * ile kullanıcı girdisi birleştirme:
 *
 *   ✗ say(`<b>Hoş geldin, ${name}</b>`)        // XSS
 *   ✓ say(html`<b>Hoş geldin, ${name}</b>`)    // güvenli
 */
export default function Toasts() {
  const [list, setList] = useState([]);
  const timers = useRef(new Map());

  useEffect(() => {
    const onToast = e => {
      const markup = typeof e.detail === 'string' ? e.detail : String(e.detail ?? '');
      if (!markup) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setList(l => {
        const next = [...l, { id, html: markup }];
        // Taşma koruması: hızlı oto-bahis modunda kuyruk sınırsız büyüyordu.
        if (next.length <= MAX_TOASTS) return next;
        const dropped = next.slice(0, next.length - MAX_TOASTS);
        dropped.forEach(d => {
          clearTimeout(timers.current.get(d.id));
          timers.current.delete(d.id);
        });
        return next.slice(-MAX_TOASTS);
      });

      const t = setTimeout(() => {
        setList(l => l.filter(x => x.id !== id));
        timers.current.delete(id);
      }, TTL_MS);
      timers.current.set(id, t);
    };

    window.addEventListener('durtu:toast', onToast);
    const pending = timers.current;
    return () => {
      window.removeEventListener('durtu:toast', onToast);
      // Unmount sonrası setState sızıntısını engelle.
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return (
    <div id="toasts" role="status" aria-live="polite" aria-atomic="false">
      {list.map(t => (
        <div key={t.id} className="toast" dangerouslySetInnerHTML={{ __html: t.html }} />
      ))}
    </div>
  );
}
