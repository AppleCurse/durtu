'use client';
import { useEffect, useState } from 'react';
import { say, fmt } from '../lib/toast';
import { getCheckInStatus, DAILY_REWARDS } from '../lib/store';

export default function Salon({ name, chips, onPlay, onOpenCheckIn, checkInInfo, onClaimCheckIn }) {
  const [greet, setGreet] = useState('Hoş geldin');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState(() => checkInInfo || getCheckInStatus());

  // Saat/tarih yalnızca istemcide hesaplanabilir: sunucuda üretilen HTML ile
  // istemcinin saati farklı olursa hidrasyon uyuşmazlığı oluşur. Bu yüzden
  // ilk değerler bilinçli olarak mount sonrasında yazılıyor.
  useEffect(() => {
    const h = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidrasyon güvenliği
    setGreet(h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : h < 23 ? 'İyi akşamlar' : 'İyi geceler');
    setDate(new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' — salon hazır.');
    setStatus(getCheckInStatus());
  }, [checkInInfo, chips]);

  const streak = status?.streak || 1;
  const isCheckedIn = status?.checkedInToday;
  const currentBonus = status?.lastCheckInBonus || status?.currentBonus || 100;
  const nextBonus = status?.nextBonus || 125;

  return (
    <>
      <section id="salon">
        <span className="tag">Senin Salonun</span>
        <h1 className="serif" style={{ fontSize: 'clamp(1.7rem,4vw,2.6rem)', fontWeight: 600, margin: '.5rem 0 .3rem' }}>
          {greet}, {name}.
        </h1>
        <p className="muted" suppressHydrationWarning>{date}</p>

        {/* ☀️ Günlük Giriş Ritüeli */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,.12) 0%, rgba(18,18,16,.92) 80%)',
            border: '1px solid var(--gd)',
            borderRadius: 14,
            padding: '1.2rem 1.4rem',
            margin: '1.4rem 0 .8rem',
            boxShadow: '0 12px 36px rgba(0,0,0,.45)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.3rem' }}>
                <span className="tag" style={{ color: 'var(--gold2)', letterSpacing: '.24em' }}>
                  ☀️ GÜNLÜK RİTÜEL · GİRİŞ HEDİYESİ
                </span>
                <span
                  style={{
                    fontSize: '.62rem',
                    background: isCheckedIn ? 'rgba(127,191,127,.18)' : 'rgba(212,175,55,.2)',
                    color: isCheckedIn ? 'var(--green)' : 'var(--gold2)',
                    border: '1px solid ' + (isCheckedIn ? 'rgba(127,191,127,.4)' : 'var(--gd)'),
                    padding: '.15rem .6rem',
                    borderRadius: 12,
                    fontWeight: 600,
                  }}
                >
                  {isCheckedIn ? '✓ BUGÜN ALINDI' : '🎁 BEKLİYOR'}
                </span>
              </div>

              <h3 className="serif" style={{ fontSize: '1.28rem', fontWeight: 600, color: 'var(--cream)', margin: '.2rem 0' }}>
                {isCheckedIn
                  ? `Günün İlk Giriş Bonusu: +${fmt(currentBonus)} dürTL Hesabında`
                  : `Bugünün Giriş Bonusu: +${fmt(currentBonus)} dürTL Seni Bekliyor!`}
              </h3>

              <p style={{ fontSize: '.8rem', color: 'var(--muted)', margin: '.2rem 0 .7rem', lineHeight: 1.5, maxWidth: 580 }}>
                {isCheckedIn
                  ? `Günün ilk kapı çalmasında jestin kasana eklendi. Düzenli giriş serin: ${streak} gün. Yarınki girişinde +${nextBonus} dürTL seni bekliyor.`
                  : 'Dürtü kulübüne her gün ilk adımında hesabına dürTL bonusu yüklenir. Hemen teslim al ve masaya geç.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              {!isCheckedIn && onClaimCheckIn && (
                <button
                  className="btn solid"
                  style={{ padding: '.6rem 1.2rem', fontSize: '.72rem', whiteSpace: 'nowrap' }}
                  onClick={() => onClaimCheckIn()}
                >
                  +{currentBonus} dürTL Bonusu Al
                </button>
              )}
              {onOpenCheckIn && (
                <button
                  className="btn ghost"
                  style={{ padding: '.55rem 1rem', fontSize: '.68rem', whiteSpace: 'nowrap' }}
                  onClick={() => onOpenCheckIn()}
                  title="Seri Takvimi ve Ödüller"
                >
                  🔥 {streak}. Gün Serisi ◈
                </button>
              )}
            </div>
          </div>

          <div style={{ marginTop: '.6rem', paddingTop: '.8rem', borderTop: '1px dashed rgba(212,175,55,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.45rem' }}>
              <span style={{ fontSize: '.62rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                7 Günlük Dürtü Giriş Zinciri (Mevcut Seri: <b style={{ color: 'var(--gold)' }}>{streak} Gün</b>)
              </span>
              <span style={{ fontSize: '.64rem', color: 'var(--gold2)' }}>
                En Yüksek: +250 dürTL (7. Gün)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
              {DAILY_REWARDS.map((d) => {
                const isDone = isCheckedIn ? streak >= d.day : streak > d.day;
                const isCurrent = isCheckedIn ? streak === d.day : streak + 1 === d.day;
                return (
                  <div
                    key={d.day}
                    style={{
                      background: isDone
                        ? 'linear-gradient(180deg, rgba(212,175,55,.24), rgba(212,175,55,.08))'
                        : isCurrent
                        ? 'rgba(212,175,55,.1)'
                        : 'rgba(255,255,255,.02)',
                      border: isDone
                        ? '1px solid var(--gold)'
                        : isCurrent
                        ? '1px dashed var(--gold)'
                        : '1px solid rgba(255,255,255,.06)',
                      borderRadius: 6,
                      padding: '.35rem .15rem',
                      textAlign: 'center',
                      transition: 'all .3s',
                    }}
                  >
                    <div style={{ fontSize: '.68rem' }}>{isDone ? '✓' : d.icon}</div>
                    <div style={{ fontSize: '.56rem', color: isDone ? 'var(--gold2)' : 'var(--muted)', fontWeight: 600 }}>
                      G{d.day}
                    </div>
                    <div style={{ fontSize: '.54rem', color: isDone ? 'var(--cream)' : 'var(--muted)' }}>
                      +{d.bonus}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <h2 className="sect" style={{ marginTop: '2rem' }}>Bugün senin için hazırlananlar</h2>
        <div className="picks">
          <div className="pick">
            <span className="tag">🎰 Slot · Gerçek</span>
            <div className="ic">⚡</div>
            <h3>Zeus&apos;un Günü</h3>
            <p>Gates 6×5 scatter — 8+ her yerde öder, tumble, çarpan birikir.</p>
            <button className="btn" onClick={() => onPlay('gates')}>Oyna</button>
          </div>
          <div className="pick">
            <span className="tag">⚽ Canlı · Gerçek</span>
            <div className="ic">🏆</div>
            <h3>Şampiyonlar Ligi Gecesi</h3>
            <p>3 maç · 1X2 gerçek oran · anında settlement · dürTL bakiye entegre.</p>
            <button className="btn solid" onClick={() => onPlay('sport')}>Bahis Yap — Gerçek</button>
          </div>
          <div className="pick">
            <span className="tag">🟢 Kripto Orijinal</span>
            <div className="ic">🟢</div>
            <h3>Plinko 1000×</h3>
            <p>Çivi piramidinden süzülen toplar — 8-16 satır ve 1000× dev çarpan.</p>
            <button className="btn" onClick={() => onPlay('plinko')}>Topu Bırak</button>
          </div>
          <div className="pick">
            <span className="tag">🎴 VIP Masa</span>
            <div className="ic">🂡</div>
            <h3>VIP Blackjack</h3>
            <p>Özel krupiye ile tek masa. Split, Double Down ve Sigorta seçenekleriyle otantik deneyim.</p>
            <button className="btn" onClick={() => onPlay('bj')}>Masaya Katıl</button>
          </div>
        </div>

        <div className="strip">
          <div className="mini">
            <span className="tag">📊 Performansın</span>
            <div className="big-num">+12%</div>
            <svg width="130" height="42" viewBox="0 0 130 42" aria-hidden="true">
              <polyline points="0,34 20,28 40,32 60,20 80,24 100,12 128,8" fill="none" stroke="#D4AF37" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="128" cy="8" r="2.6" fill="#D4AF37" />
            </svg>
            <p>Bu haftanın özeti. Sakin ve istikrarlı — tam Dürtü tarzı.</p>
          </div>
          <div className="mini">
            <span className="tag">🧠 Dürtü Analizi</span>
            <h4 className="serif" style={{ fontStyle: 'italic', fontWeight: 400, lineHeight: 1.55, color: 'var(--cream)' }}>
              “Gates 6×5 tumble + çarpan birikimi, Bonanza 6×5 bomba — ikisi de gerçek scatter. Spor da gerçek settlement.”
            </h4>
            <button className="btn" onClick={() => onPlay('sb')}>Sweet Bonanza&apos;ya git</button>
          </div>
          <div className="mini">
            <span className="tag">🎁 Sana Özel</span>
            <h4>50 Ücretsiz Dönüş</h4>
            <p>Banner yok, spam yok — sadece sana. Gates of Olympus&apos;ta geçerli.</p>
            <button className="btn solid" onClick={() => { say('<b>50 ücretsiz dönüş</b> tanımlandı (demo). Bol şans.'); onPlay('gates'); }}>Kullan</button>
          </div>
        </div>
      </section>
    </>
  );
}
