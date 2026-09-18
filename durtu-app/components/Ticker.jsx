'use client';
import { useEffect, useRef, useState } from 'react';

const NAMES = ['Kaan S.', 'Emre', 'Bora T.', 'Selin A.', 'Mert K.', 'Zeynep Ö.', 'Onur D.', 'Ece Y.', 'Deniz Ç.', 'Yusuf A.', 'İpek V.', 'Baran T.'];
const GAMES = ['Gates of Olympus', 'Sweet Bonanza', 'Aviator', 'Türkçe Blackjack', 'Money Train 4', 'Tek Kişilik Rulet', 'Wanted Dead or a Wild', 'Mines', 'Starlight Princess', 'Blood Suckers'];
const BASE = [120, 250, 400, 750, 1200, 2400, 4800, 8400];

function gen() {
  const game = GAMES[Math.random() * GAMES.length | 0];
  const mul = game === 'Aviator' ? Number((1.2 + Math.random() * 8).toFixed(2)) : null;
  let amt = BASE[Math.random() * BASE.length | 0];
  if (mul) amt = Math.round(((50 + Math.random() * 450) * mul) / 10) * 10;
  return { who: NAMES[Math.random() * NAMES.length | 0], game, amt, mul, id: Date.now() + Math.random() };
}

export default function Ticker() {
  const [items, setItems] = useState(() => []);
  const q = useRef([]);
  useEffect(() => {
    q.current = Array.from({ length: 10 }, gen);
    setItems([...q.current]);
    const onTick = e => { q.current.unshift({ ...e.detail, who: 'Sen', id: Date.now() + Math.random() }); if (q.current.length > 30) q.current.pop(); setItems([...q.current]); };
    window.addEventListener('durtu:tick', onTick);
    const iv = setInterval(() => { if (Math.random() < .72) { q.current.push(gen()); if (q.current.length > 30) q.current.shift(); setItems([...q.current]); } }, 5200);
    return () => { window.removeEventListener('durtu:tick', onTick); clearInterval(iv); };
  }, []);
  const line = items.map(t => t).concat(items); // kesintisiz döngü için ikiye katla
  return (
    <div id="ticker">
      <div className="ticker-track">
        {line.map((t, i) => (
          <span className="tick-item" key={t.id + '.' + i}>
            ◆ <b style={t.who === 'Sen' ? { color: 'var(--gold2)' } : undefined}>{t.who}</b> · {t.game}
            {t.mul ? <span style={{ color: 'var(--gold2)' }}> {t.mul.toFixed(2)}×</span> : null} · <b>◈ +{t.amt.toLocaleString('tr-TR')} dürTL</b>
          </span>
        ))}
      </div>
    </div>
  );
}
