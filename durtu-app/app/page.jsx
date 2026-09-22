'use client';
import { useEffect, useRef, useState } from 'react';
import Gate from '../components/Gate';
import Salon from '../components/Salon';
import Lounge360 from '../components/Lounge360';
import GameGrid from '../components/GameGrid';
import SlotGame from '../components/SlotGame';
import CrashGame from '../components/CrashGame';
import BlackjackGame from '../components/BlackjackGame';
import RouletteGame from '../components/RouletteGame';
import MinesGame from '../components/MinesGame';
import SportBet from '../components/SportBet';
import PlinkoGame from '../components/PlinkoGame';
import LimboGame from '../components/LimboGame';
import HiloGame from '../components/HiloGame';
import WheelGame from '../components/WheelGame';
import VaultModal from '../components/VaultModal';
import ClubModal from '../components/ClubModal';
import LimitsModal from '../components/LimitsModal';
import StatsModal from '../components/StatsModal';
import DailyCheckInModal from '../components/DailyCheckInModal';
import ProvablyFairModal from '../components/ProvablyFairModal';
import Ticker from '../components/Ticker';
import Chat from '../components/Chat';
import AmbienceBtn from '../components/AmbienceBtn';
import Toasts from '../components/Toasts';
import { GAMES } from '../lib/games';
import { fmt, say, html } from '../lib/toast';
import { toChips, isValidBet, isValidPayout } from '../lib/money';
import { log } from '../lib/logger';
import {
  checkDailyLogin,
  getProfile,
  saveChips,
  getCheckInStatus,
} from '../lib/store';
import { clubBadge, rescueCheck, getClub } from '../lib/club';
import { gateBet, getLimits, isCoolingOff } from '../lib/limits';

const GAME_MODALS = {
  aviator: 'crash',
  bj: 'bj',
  rl: 'rl',
  mines: 'mines',
  sport: 'sport',
  plinko: 'plinko',
  limbo: 'limbo',
  hilo: 'hilo',
  wheel: 'wheel',
};

export default function Page() {
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState('Misafir');
  const [chips, setChips] = useState(1000);
  const [slotId, setSlotId] = useState(null);
  const [open, setOpen] = useState(null); // 'crash' | 'bj' | 'rl' | 'mines' | 'sport' | 'plinko' | 'limbo' | 'hilo' | 'wheel' | 'vault' | 'club' | 'stats' | 'checkin'
  const [checkInResult, setCheckInResult] = useState(null);
  const [checkInInfo, setCheckInInfo] = useState(null);
  // `open`'dan bağımsız: gerçeklik molası açık bir oyunun ÜSTÜNE biner, oyunu kapatmaz.
  const [limitsOpen, setLimitsOpen] = useState(false);
  const chipsRef = useRef(1000);

  // Bakiye her yazımda normalize edilir: NaN/Infinity/negatif/ondalıklı asla girmez.
  const setC = v => {
    const safe = toChips(v, chipsRef.current);
    chipsRef.current = safe;
    setChips(safe);
    saveChips(safe);
  };

  /** Bahsi düşer. Geçersiz tutar veya yetersiz bakiyede false döner — çağıran MUTLAKA kontrol etmeli. */
  const spend = b => {
    // SORUMLU OYUN KAPISI: bakiyeden ÖNCE denetlenir. Oyuncunun kendi koyduğu
    // mola/kayıp limiti, oyun kodunun hiçbir yolundan绕过 edilemez.
    const gate = gateBet(b);
    if (!gate.ok) {
      if (gate.reason === 'COOL_OFF') {
        say('🧭 <b>Mola aktif.</b> Kendi koyduğun aralık dolmadan bahis açılmaz — bu kuralı sen koydun.');
      } else if (gate.reason === 'LOSS_LIMIT') {
        say(
          html`🧭 <b>Oturum kayıp limitine ulaştın</b> — net ◈ ${fmt(
            gate.netLoss
          )} dürTL. Limiti panelde gevşetebilirsin, ama 24 saat sonra yürürlüğe girer.`
        );
        setLimitsOpen(true);
      }
      return false;
    }
    if (!isValidBet(b, chipsRef.current)) return false;
    setC(chipsRef.current - b);
    return true;
  };

  /** Kazancı ekler. Geçersiz ödeme sisteme girmeden reddedilir ve raporlanır. */
  const win = n => {
    if (!isValidPayout(n)) {
      log.critical('page.win', new Error('INVALID_PAYOUT'), { amount: String(n) });
      return;
    }
    setC(chipsRef.current + n);
  };

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Profil ve bakiye yükle
    // localStorage yalnızca istemcide var; sunucu HTML'i "Misafir"/1000 ile
    // render edilir ve mount sonrası gerçek profile geçilir. Lazy initializer
    // kullanmak burada hidrasyon uyuşmazlığı yaratırdı.
    const p = getProfile();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidrasyon güvenliği
    if (p.name && p.name !== 'Misafir') setName(p.name);
    const startChips = toChips(p.chips, 1000);
    chipsRef.current = startChips;
    setChips(startChips);
    setCheckInInfo(getCheckInStatus());
  }, []);

  useEffect(() => {
    const onFair = () => setOpen('fair');
    window.addEventListener('durtu:openfair', onFair);
    return () => window.removeEventListener('durtu:openfair', onFair);
  }, []);

  useEffect(() => {
    const onSelin = e => say(e.detail);
    window.addEventListener('durtu:selin', onSelin);
    return () => window.removeEventListener('durtu:selin', onSelin);
  }, []);

  /* ── Kulüp katmanı: nav rozeti + sıfır bakiyede Selin'in araya girmesi ── */
  const [clubTick, setClubTick] = useState(0);
  const bustPrompted = useRef(false);

  // Rozet, kulüp kaydı her değiştiğinde tazelenir (tur tahakkuku, iade, yakıt).
  useEffect(() => {
    const bump = () => setClubTick(t => t + 1);
    window.addEventListener('durtu:club', bump);
    return () => window.removeEventListener('durtu:club', bump);
  }, []);

  useEffect(() => {
    if (!entered || chips > 0) {
      bustPrompted.current = false;
      return;
    }
    if (bustPrompted.current) return;
    const check = rescueCheck(getClub(), chips);
    if (!check.ok) return;
    bustPrompted.current = true;
    window.dispatchEvent(
      new CustomEvent('durtu:selin', {
        detail: html`💬 <b>Selin:</b> kasa sıfırlandı. Kulüp kuralı: <b>💎 KULÜP</b> panelinde ◈ <b>${fmt(
          check.amount
        )}</b> dürTL gece yakıtın hazır. Al ya da bu akşamı burada kapat — karar senin.`,
      })
    );
  }, [entered, chips, clubTick]);

  // Gerçeklik molası: limits katmanı aralık dolunca haber verir.
  useEffect(() => {
    const onLimits = e => {
      if (e.detail?.kind !== 'round' || !e.detail.realityCheck) return;
      const s = getLimits();
      const mins = Math.round((Date.now() - s.sessionStartedAt) / 60000);
      say(
        html`⏰ <b>Gerçeklik molası:</b> ${fmt(
          mins
        )} dakikadır oynuyorsun. Oturum: ◈ ${fmt(s.sessionWagered)} çevrim, net ◈ ${fmt(
          Math.max(0, s.sessionWagered - s.sessionWon)
        )} dürTL. Ara vermek her zaman açık bir seçenek.`
      );
      setLimitsOpen(true);
    };
    window.addEventListener('durtu:limits', onLimits);
    return () => window.removeEventListener('durtu:limits', onLimits);
  }, []);

  const club = clubBadge(chips);
  const limits = getLimits();
  const coolingOff = isCoolingOff(limits);

  function enter(n) {
    setName(n);
    setEntered(true);
    window.scrollTo(0, 0);

    // Günün ilk girişini ve bonusunu hesapla
    const res = checkDailyLogin(n);
    setCheckInInfo(getCheckInStatus());

    if (res.isNewCheckIn) {
      setC(res.chips);
      setCheckInResult(res);
      setOpen('checkin');
      setTimeout(() => {
        say(
          html`☀️ <b>Günlük Giriş Bonusu:</b> +${fmt(res.bonus)} dürTL hesabına aktarıldı (${res.streak}. gün serisi). Dürtü düzenli misafirini sever.`
        );
      }, 700);
    } else {
      setTimeout(() => {
        say(
          html`<b>Hoş geldin, ${n}.</b> Günlük serin: ${res.streak} gün. Bugün senin için 3 seçki hazırlandı.`
        );
      }, 900);
    }
  }

  function handleClaimDailyBonus(force = false) {
    const res = checkDailyLogin(name, force);
    setC(res.chips);
    setCheckInResult(res);
    setCheckInInfo(getCheckInStatus());
    if (res.isNewCheckIn) {
      say(html`☀️ <b>Günlük Bonus Alındı:</b> +${fmt(res.bonus)} dürTL kasana eklendi!`);
    }
    setOpen('checkin');
  }

  // Oyun kimliği → modal anahtarı. Yeni oyun eklemek if/else zincirini büyütmez (OCP).
  function handlePlay(id) {
    const modalKey = GAME_MODALS[id];
    if (modalKey) {
      setSlotId(null);        // iki oyun modalı aynı anda açılamaz
      setOpen(modalKey);
    } else {
      setOpen(null);
      setSlotId(id);
    }
  }

  const game = slotId ? GAMES.find(g => g.id === slotId) : null;

  if (!entered) return (<><Gate onEnter={enter} /><Toasts /></>);

  return (
    <>
      <nav>
        <div className="nav-logo serif" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>✦ DÜRTÜ</div>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
          <AmbienceBtn />
          <button
            className="btn btn-sm"
            onClick={() => handleClaimDailyBonus(false)}
            title="Günlük Giriş Ritüeli ve Seri"
            style={{
              padding: '.32rem .7rem',
              fontSize: '.66rem',
              background: checkInInfo?.checkedInToday ? 'rgba(212,175,55,.1)' : 'rgba(212,175,55,.24)',
              border: '1px solid var(--gold)',
              color: 'var(--gold2)',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              letterSpacing: '.06em',
            }}
          >
            ☀️ {checkInInfo?.streak ? `${checkInInfo.streak}. GÜN` : 'RİTÜEL'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setOpen('fair')}
            title="Doğrulanabilir Adillik (Provably Fair)"
            style={{ padding: '.32rem .7rem', fontSize: '.66rem', background: 'rgba(127,191,127,.12)', border: '1px solid var(--gd)', color: 'var(--gold2)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, letterSpacing: '.08em' }}
          >
            🛡️ ADİLLİK
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setLimitsOpen(true)}
            title="Sorumlu oyun — kayıp limiti, gerçeklik molası, kendini men"
            style={{ padding: '.32rem .7rem', fontSize: '.66rem', background: coolingOff ? 'rgba(200,80,64,.2)' : 'rgba(127,191,127,.1)', border: '1px solid ' + (coolingOff ? 'var(--red)' : 'var(--gd)'), color: coolingOff ? 'var(--red)' : 'var(--gold2)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, letterSpacing: '.08em' }}
          >
            🧭 {coolingOff ? 'MOLA' : 'LİMİT'}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setOpen('club')}
            title="Kulüp — VIP kademe, kayıp iadesi, gece yakıtı"
            style={{ padding: '.32rem .7rem', fontSize: '.66rem', background: 'rgba(212,175,55,.14)', border: '1px solid var(--gold)', color: 'var(--gold2)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, letterSpacing: '.08em' }}
          >
            💎 KULÜP{club.claimable > 0 ? ` · ◈ ${fmt(club.claimable)}` : ''}
            {club.claimable > 0 || club.rescueReady ? <span className="dot" style={{ marginLeft: '.45rem', marginRight: 0 }} /> : null}
          </button>
          <button className="btn btn-sm" onClick={() => setOpen('vault')} style={{ padding: '.32rem .7rem', fontSize: '.66rem', background: 'rgba(212,175,55,.14)', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, letterSpacing: '.08em' }}>
            + KASA
          </button>
          <span className="hc" onClick={() => setOpen('stats')} title="Dürtü Raporun" style={{ cursor: 'pointer' }}>◈ {fmt(chips)} dürTL</span>
          <span className="hc" style={{ color: 'var(--cream)' }}>{name}</span>
        </div>
      </nav>

      <main>
        <Salon
          name={name}
          chips={chips}
          onPlay={handlePlay}
          onOpenLounge={() => setOpen('lounge')}
          checkInInfo={checkInInfo}
          onOpenCheckIn={() => {
            setCheckInResult(
              checkInResult || {
                bonus: checkInInfo?.lastCheckInBonus || checkInInfo?.currentBonus || 100,
                streak: checkInInfo?.streak || 1,
                nextBonus: checkInInfo?.nextBonus || 125,
              }
            );
            setOpen('checkin');
          }}
          onClaimCheckIn={() => handleClaimDailyBonus(false)}
        />
        <GameGrid onPlay={handlePlay} />
      </main>

      <footer style={{ paddingBottom: 40 }}>
        <div className="serif" style={{ color: 'var(--gold)', letterSpacing: '.3em', marginBottom: '.5rem' }}>✦ DÜRTÜ</div>
        <p>React/Next.js portu — konsept demosu; gerçek para kullanılmaz.<br />18+ • Sorumlu oyun: limitlerini belirle, ara vermekten çekinme.</p>
      </footer>

      <Ticker />

      {game && <SlotGame game={game} spend={spend} win={win} onClose={() => setSlotId(null)} />}
      {open === 'crash' && <CrashGame spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'bj' && <BlackjackGame chips={chips} spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'rl' && <RouletteGame chips={chips} spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'mines' && <MinesGame chips={chips} spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'sport' && <SportBet spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'plinko' && <PlinkoGame chips={chips} spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'limbo' && <LimboGame chips={chips} spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'hilo' && <HiloGame chips={chips} spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'wheel' && <WheelGame chips={chips} spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'vault' && <VaultModal chips={chips} spend={spend} win={win} onClose={() => setOpen(null)} />}
      {open === 'club' && <ClubModal chips={chips} win={win} onClose={() => setOpen(null)} />}
      {open === 'stats' && <StatsModal name={name} chips={chips} onClose={() => setOpen(null)} />}
      {open === 'fair' && <ProvablyFairModal onClose={() => setOpen(null)} />}
      {open === 'lounge' && (
        <Lounge360
          name={name}
          chips={chips}
          onClose={() => setOpen(null)}
          onPlay={handlePlay}
        />
      )}
      {open === 'checkin' && (
        <DailyCheckInModal
          checkInResult={
            checkInResult || {
              bonus: checkInInfo?.lastCheckInBonus || checkInInfo?.currentBonus || 100,
              streak: checkInInfo?.streak || 1,
              nextBonus: checkInInfo?.nextBonus || 125,
            }
          }
          onClose={() => setOpen(null)}
        />
      )}
      {limitsOpen && <LimitsModal onClose={() => setLimitsOpen(false)} />}
      <Chat name={name} />
      <Toasts />
    </>
  );
}
