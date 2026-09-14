'use client';
import { fmt } from '../lib/toast';
import { DAILY_REWARDS } from '../lib/store';

export default function DailyCheckInModal({ checkInResult, onClose }) {
  if (!checkInResult) return null;

  const { bonus = 100, streak = 1, nextBonus = 125 } = checkInResult;

  return (
    <div className="ovl" onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 75 }}>
      <div className="pnl" style={{ width: 'min(500px, 95vw)', textAlign: 'center', padding: '2rem 1.8rem' }}>
        <button className="close" onClick={onClose}>✕</button>
        
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 30%, #f6e27a, #9e7d23)',
          color: '#1a1306',
          fontSize: '1.8rem',
          margin: '0 auto .6rem',
          boxShadow: '0 0 30px rgba(212,175,55,.45)'
        }}>
          ☀️
        </div>

        <span className="tag" style={{ letterSpacing: '.3em' }}>✦ G Ü N L Ü K &nbsp; R İ T Ü E L</span>
        <h3 style={{ fontSize: '1.45rem', marginTop: '.3rem', marginBottom: '.3rem' }}>
          Günün İlk Giriş Hediyesi
        </h3>
        
        <p className="noteline" style={{ textAlign: 'center', border: 'none', padding: 0, margin: '.4rem 0 1.2rem' }}>
          Dürtü düzenli misafirini ödüllendirir. Günün ilk kapı çalışında bonus kasana işlendi.
        </p>

        {/* Big reward box */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(212,175,55,.14), rgba(212,175,55,.04))',
          border: '1px solid rgba(212,175,55,.4)',
          borderRadius: 14,
          padding: '1.2rem 1rem',
          margin: '0 0 1.3rem',
          position: 'relative',
          boxShadow: 'inset 0 0 25px rgba(212,175,55,.1)'
        }}>
          <span style={{ fontSize: '.64rem', letterSpacing: '.24em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            KAZANILAN BONUSA
          </span>
          <div style={{
            fontFamily: 'var(--serif)',
            fontSize: '2.6rem',
            fontWeight: 700,
            color: 'var(--gold2)',
            textShadow: '0 0 20px rgba(212,175,55,.5)',
            lineHeight: 1.15,
            margin: '.2rem 0'
          }}>
            +{fmt(bonus)} <span style={{ fontSize: '1.4rem' }}>dürTL</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', background: 'rgba(212,175,55,.12)', border: '1px solid rgba(212,175,55,.3)', borderRadius: 20, padding: '.25rem .8rem', fontSize: '.72rem', color: 'var(--gold)' }}>
            <span>🔥</span>
            <b>{streak}. Gün Kesintisiz Seri</b>
          </div>
        </div>

        {/* 7-Day progress streak pills */}
        <div style={{ margin: '0 0 1.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem', fontSize: '.68rem', color: 'var(--muted)' }}>
            <span style={{ letterSpacing: '.12em', textTransform: 'uppercase' }}>7 Günlük Ritüel Zinciri</span>
            <span style={{ color: 'var(--gold)' }}>Yarın: +{nextBonus} dürTL</span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 6
          }}>
            {DAILY_REWARDS.map((d) => {
              const isPast = streak > d.day;
              const isCurrent = streak === d.day;
              return (
                <div
                  key={d.day}
                  style={{
                    background: isCurrent
                      ? 'linear-gradient(180deg, rgba(212,175,55,.35), rgba(212,175,55,.15))'
                      : isPast
                      ? 'rgba(212,175,55,.1)'
                      : 'rgba(255,255,255,.03)',
                    border: isCurrent
                      ? '1px solid var(--gold)'
                      : isPast
                      ? '1px solid rgba(212,175,55,.35)'
                      : '1px solid rgba(255,255,255,.07)',
                    borderRadius: 8,
                    padding: '.5rem .2rem',
                    textAlign: 'center',
                    transform: isCurrent ? 'scale(1.05)' : 'none',
                    boxShadow: isCurrent ? '0 0 14px rgba(212,175,55,.3)' : 'none',
                    transition: 'all .3s'
                  }}
                >
                  <div style={{ fontSize: '.75rem', marginBottom: 2 }}>
                    {isPast ? '✓' : d.icon}
                  </div>
                  <div style={{ fontSize: '.58rem', color: isCurrent || isPast ? 'var(--gold)' : 'var(--muted)', fontWeight: 600 }}>
                    G{d.day}
                  </div>
                  <div style={{ fontSize: '.54rem', color: isCurrent ? '#fff' : 'var(--muted)', marginTop: 2 }}>
                    {d.bonus}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          className="btn solid"
          onClick={onClose}
          style={{ width: '100%', padding: '.85rem 1.4rem', fontSize: '.8rem', letterSpacing: '.2em' }}
        >
          Teşekkürler, Salona Geç
        </button>
      </div>
    </div>
  );
}
