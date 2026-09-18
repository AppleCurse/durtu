'use client';
// DÜRTÜ — paylaşılan bahis girdisi.
//
// Aynı "input + ½ + 2×" bloğu 8 oyunda kopyalanmıştı ve her kopyada ufak
// farklar vardı: bazılarında tur sırasında input kilitlenmiyordu (Blocker #4'ün
// sömürü yüzeyi), bazılarında bakiye üstü bahis engellenmiyordu, hiçbirinde
// <label> girdiye bağlı değildi (ekran okuyucu "bahis" demiyordu).
//
// Tek kaynağa indirilince: doğrulama, kilit ve erişilebilirlik hepsinde aynı.

import { useId } from 'react';
import { MIN_BET, normalizeBet } from '../../lib/money';

export default function BetControl({
  value,
  onChange,
  disabled = false,
  max,
  label = 'BAHİS (dürTL)',
  step = 1,
  compact = false,
}) {
  const id = useId();

  const clamp = n => {
    const v = normalizeBet(n, MIN_BET);
    return Number.isFinite(max) && max > 0 ? Math.min(v, Math.max(MIN_BET, Math.trunc(max))) : v;
  };

  const set = next => onChange(clamp(next));

  const btnStyle = { padding: '.2rem .5rem', fontSize: '.65rem' };

  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          style={{ fontSize: '.68rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}
        >
          {label}
        </label>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={MIN_BET}
          max={Number.isFinite(max) ? max : undefined}
          step={step}
          value={value}
          disabled={disabled}
          onChange={e => set(e.target.value)}
          onBlur={e => set(e.target.value)}
          className="inp"
          style={{
            padding: compact ? '.35rem .5rem' : '.45rem .6rem',
            fontSize: compact ? '.78rem' : '.84rem',
            width: '100%',
          }}
        />
        <button
          type="button"
          className="btn"
          style={btnStyle}
          disabled={disabled}
          aria-label="Bahsi yarıya indir"
          onClick={() => set(Math.floor(Number(value) / 2))}
        >
          ½
        </button>
        <button
          type="button"
          className="btn"
          style={btnStyle}
          disabled={disabled}
          aria-label="Bahsi ikiye katla"
          onClick={() => set(Number(value) * 2)}
        >
          2×
        </button>
      </div>
    </div>
  );
}
