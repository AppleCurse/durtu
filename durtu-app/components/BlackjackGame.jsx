'use client';
import { useEffect, useRef, useState } from 'react';
import { fmt, say, html } from '../lib/toast';
import { logRound } from '../lib/store';
import { acquireAudio, releaseAudio, tone, fanfare } from '../lib/audio';
import Modal from './ui/Modal';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = [
  ['A', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5],
  ['6', 6], ['7', 7], ['8', 8], ['9', 9], ['10', 10],
  ['J', 10], ['Q', 10], ['K', 10]
];
const FICHES = [10, 25, 50, 100, 250, 500];

function createShoe() {
  const deck = [];
  for (let s = 0; s < 6; s++) { // 6-deck shoe
    SUITS.forEach(suit => {
      RANKS.forEach(([r, v]) => {
        deck.push({ r, v, s: suit });
      });
    });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handTotal(hand) {
  let total = 0;
  let aces = 0;
  hand.forEach(c => {
    total += c.v;
    if (c.r === 'A') aces++;
  });
  while (aces > 0 && total + 10 <= 21) {
    total += 10;
    aces--;
  }
  return total;
}

function CardView({ card, hidden, win }) {
  if (hidden) {
    return (
      <div
        style={{
          width: 58,
          height: 84,
          borderRadius: 6,
          background: 'repeating-linear-gradient(45deg, #1a237e, #1a237e 6px, #0d1642 6px, #0d1642 12px)',
          border: '2px solid #e0e0e0',
          boxShadow: '0 4px 12px rgba(0,0,0,.6)',
          display: 'inline-block',
          margin: '0 4px',
        }}
      />
    );
  }

  const isRed = card.s === '♥' || card.s === '♦';

  return (
    <div
      style={{
        width: 58,
        height: 84,
        borderRadius: 6,
        background: '#ffffff',
        border: win ? '2px solid var(--gold)' : '2px solid #dcdcdc',
        boxShadow: win ? '0 0 14px rgba(212,175,55,.8)' : '0 4px 12px rgba(0,0,0,.5)',
        color: isRed ? '#d32f2f' : '#111',
        display: 'inline-flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '4px 6px',
        margin: '0 4px',
        userSelect: 'none',
        transform: 'translateY(0)',
        transition: 'transform .2s, box-shadow .2s',
      }}
    >
      <div style={{ fontSize: '.78rem', fontWeight: 800, lineHeight: 1 }}>
        {card.r}<span style={{ fontSize: '.7rem', marginLeft: 1 }}>{card.s}</span>
      </div>
      <div style={{ fontSize: '1.4rem', textAlign: 'center', margin: 'auto' }}>
        {card.s}
      </div>
      <div style={{ fontSize: '.78rem', fontWeight: 800, lineHeight: 1, textAlign: 'right', transform: 'rotate(180deg)' }}>
        {card.r}<span style={{ fontSize: '.7rem', marginLeft: 1 }}>{card.s}</span>
      </div>
    </div>
  );
}

export default function BlackjackGame({ chips, spend, win, onClose }) {
  const shoeRef = useRef(createShoe());
  const [bet, setBet] = useState(50);
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [phase, setPhase] = useState('bet'); // 'bet' | 'insurance' | 'play' | 'over'
  const [_insuranceBet, setInsuranceBet] = useState(0);
  const [msg, setMsg] = useState({ t: 'Bahsini belirle ve “Kart Dağıt”a bas.', cls: '' });
  const [resultOutcome, setResultOutcome] = useState(''); // 'win' | 'lose' | 'bj' | 'push'
  const activeBetRef = useRef(0);
  const sfxRef = useRef(true);

  function playCardSlide() {
    if (!sfxRef.current) return;
    tone(300, { dur: 0.08, type: 'sawtooth', gain: 0.04 });
  }

  function playChipSound() {
    if (!sfxRef.current) return;
    tone(1600, { dur: 0.04, type: 'triangle', gain: 0.06 });
  }

  function playWinFanfare() {
    if (!sfxRef.current) return;
    fanfare([523, 659, 784, 1046], { gain: 0.12 });
  }

  useEffect(() => {
    acquireAudio();
    return () => releaseAudio();
  }, []);

  function drawCard() {
    if (shoeRef.current.length < 20) {
      shoeRef.current = createShoe();
    }
    playCardSlide();
    return shoeRef.current.pop();
  }

  function deal() {
    if (phase === 'play') return;
    if (!spend(bet)) {
      say('Yetersiz bakiye — fişi küçült.');
      return;
    }

    activeBetRef.current = bet;
    setInsuranceBet(0);
    setResultOutcome('');

    const p1 = drawCard();
    const d1 = drawCard();
    const p2 = drawCard();
    const d2 = drawCard();

    const initialPH = [p1, p2];
    const initialDH = [d1, d2];

    setPlayerHand(initialPH);
    setDealerHand(initialDH);



    // If dealer shows Ace, offer insurance
    if (d1.r === 'A') {
      setPhase('insurance');
      setMsg({ t: 'Krupiye As gösteriyor. Sigorta almak ister misin? (Bahsin yarısı)', cls: '' });
      return;
    }

    checkNaturals(initialPH, initialDH);
  }

  function checkNaturals(pHand, dHand) {
    const pTot = handTotal(pHand);
    const dTot = handTotal(dHand);

    if (pTot === 21 && dTot === 21) {
      finalize('push', 'Her iki tarafta da Blackjack — Berabere.');
    } else if (pTot === 21) {
      finalize('bj', 'BLACKJACK! 3:2 Kazandın!');
    } else if (dTot === 21) {
      finalize('lose', 'Krupiyede Blackjack.');
    } else {
      setPhase('play');
      setMsg({ t: 'Kart çek (Hit), Dur (Stand) veya İkiye Katla (Double).', cls: '' });
    }
  }

  function takeInsurance(accept) {
    const dTot = handTotal(dealerHand);
    const hasBJ = dTot === 21;

    if (accept) {
      const insCost = Math.floor(activeBetRef.current / 2);
      if (insCost < 1) {
        say('Sigorta için bahis çok küçük — sigortasız devam ediliyor.');
      } else if (!spend(insCost)) {
        say('Sigorta için yeterli bakiye yok — sigortasız devam ediliyor.');
      } else {
        setInsuranceBet(insCost);
        say(html`Sigorta alındı: ◈ ${fmt(insCost)} dürTL`);
        if (hasBJ) win(insCost * 3); // 2:1 ödeme + anapara iadesi
      }
    }

    checkNaturals(playerHand, dealerHand);
  }

  function hit() {
    if (phase !== 'play') return;
    const card = drawCard();
    const newHand = [...playerHand, card];
    setPlayerHand(newHand);

    const total = handTotal(newHand);
    if (total > 21) {
      finalize('lose', `Battın — Skorun: ${total}`);
    } else if (total === 21) {
      stand(newHand);
    }
  }

  function doubleDown() {
    if (phase !== 'play' || playerHand.length !== 2) return;

    // spend() dönüşü MUTLAKA kontrol edilir. Eskiden yok sayılıyordu: bakiye
    // yetmese bile activeBetRef ikiye katlanıyor ve finalize('win') karşılığı
    // alınmamış bahsi 2× ödüyordu.
    const extra = activeBetRef.current;
    if (!spend(extra)) {
      say(html`İkiye katlamak için ◈ ${fmt(extra)} dürTL gerekli — bakiyen yetmiyor.`);
      return;
    }
    activeBetRef.current = extra * 2;
    say(html`🎩 İkiye katladın! Bahis: ◈ ${fmt(activeBetRef.current)}`);

    const card = drawCard();
    const newHand = [...playerHand, card];
    setPlayerHand(newHand);

    const total = handTotal(newHand);
    if (total > 21) {
      finalize('lose', `Battın — Skorun: ${total}`);
    } else {
      stand(newHand);
    }
  }

  function stand(finalPlayerHand) {
    if (phase !== 'play') return;
    setPhase('over');

    const curPH = finalPlayerHand || playerHand;
    const pTot = handTotal(curPH);

    // Dealer draws to soft/hard 17
    let curDH = [...dealerHand];
    while (handTotal(curDH) < 17) {
      curDH.push(drawCard());
    }
    setDealerHand(curDH);
    const dTot = handTotal(curDH);

    if (dTot > 21) {
      finalize('win', `Krupiye battı (${dTot})! Sen kazandın.`);
    } else if (pTot > dTot) {
      finalize('win', `Sen ${pTot}, Krupiye ${dTot} — Kazandın!`);
    } else if (pTot < dTot) {
      finalize('lose', `Krupiye ${dTot}, Sen ${pTot} — Krupiye kazandı.`);
    } else {
      finalize('push', `Berabere (${pTot} - ${dTot}) — Fişin iade edildi.`);
    }
  }

  function finalize(outcome, note) {
    setPhase('over');
    setResultOutcome(outcome);

    const currentBet = activeBetRef.current;
    let payout = 0;

    if (outcome === 'bj') {
      payout = Math.floor(currentBet * 2.5); // 3:2 payout
      win(payout);
      playWinFanfare();
      setMsg({ t: `★ ${note} ◈ +${fmt(payout - currentBet)} dürTL kazanç!`, cls: 'win' });
      logRound('VIP Blackjack', currentBet, payout, 2.5);
    } else if (outcome === 'win') {
      payout = currentBet * 2;
      win(payout);
      playWinFanfare();
      setMsg({ t: `✓ ${note} ◈ +${fmt(currentBet)} dürTL kâr!`, cls: 'win' });
      logRound('VIP Blackjack', currentBet, payout, 2.0);
    } else if (outcome === 'push') {
      payout = currentBet;
      win(payout);
      setMsg({ t: note, cls: '' });
      logRound('VIP Blackjack', currentBet, payout, 1.0);
    } else {
      setMsg({ t: `✕ ${note}`, cls: 'lose' });
      logRound('VIP Blackjack', currentBet, 0);
    }
  }

  function resetRound() {
    setPlayerHand([]);
    setDealerHand([]);
    setPhase('bet');
    setResultOutcome('');
    setMsg({ t: 'Yeni el. Fişini seç ve dağıt.', cls: '' });
  }

  const pTotal = handTotal(playerHand);
  const dTotal = handTotal(dealerHand);
  const dealerVisibleTotal = dealerHand.length > 0 ? (phase === 'play' ? handTotal([dealerHand[0]]) : dTotal) : 0;

  return (
    <Modal onClose={onClose} title="Blackjack" className="pnl" zIndex={75} style={{ width: 'min(640px, 98vw)', padding: '1.2rem 1.4rem' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
          <div>
            <span className="tag" style={{ color: 'var(--gold)' }}>🂡 VIP CASINO MASA 1</span>
            <h3 style={{ margin: '.1rem 0', fontSize: '1.35rem' }}>VIP Blackjack Masası</h3>
          </div>
          <div style={{ textAlign: 'right', fontSize: '.75rem', color: 'var(--muted)' }}>
            Bakiye: <b style={{ color: 'var(--gold)' }}>◈ {fmt(chips)} dürTL</b>
          </div>
        </div>

        {/* Casino Table Felt */}
        <div
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, #0d4223 0%, #052412 100%)',
            border: '2px solid rgba(212,175,55,.6)',
            borderRadius: 14,
            padding: '1.2rem',
            position: 'relative',
            boxShadow: 'inset 0 0 35px rgba(0,0,0,.8), 0 8px 24px rgba(0,0,0,.6)',
            margin: '.6rem 0',
          }}
        >
          {/* Table Golden Inscription */}
          <div
            style={{
              textAlign: 'center',
              fontSize: '.62rem',
              letterSpacing: '.18em',
              fontWeight: 700,
              color: 'rgba(212,175,55,.55)',
              textTransform: 'uppercase',
              marginBottom: '1rem',
              borderBottom: '1px dashed rgba(212,175,55,.25)',
              paddingBottom: '.4rem',
            }}
          >
            Blackjack pays 3 to 2 • Dealer stands on 17 • Insurance pays 2 to 1
          </div>

          {/* Dealer Area */}
          <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
            <div style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.8)', fontWeight: 600, marginBottom: 6 }}>
              KRUPİYE · <span style={{ color: 'var(--gold)' }}>{dealerHand.length > 0 ? (phase === 'play' ? `${dealerVisibleTotal} + ?` : dTotal) : '—'}</span>
            </div>
            <div style={{ minHeight: 88, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {dealerHand.map((c, i) => (
                <CardView key={i} card={c} hidden={phase === 'play' && i === 1} win={resultOutcome === 'lose'} />
              ))}
            </div>
          </div>

          {/* Center Message / Bet Spotlight */}
          <div
            className={'bj-msg' + (msg.cls ? ' ' + msg.cls : '')}
            style={{
              background: 'rgba(0,0,0,.45)',
              backdropFilter: 'blur(4px)',
              padding: '.4rem .8rem',
              borderRadius: 20,
              display: 'inline-block',
              margin: '0 auto .8rem',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {msg.t}
          </div>

          {/* Player Area */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ minHeight: 88, display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 6 }}>
              {playerHand.map((c, i) => (
                <CardView key={i} card={c} win={resultOutcome === 'win' || resultOutcome === 'bj'} />
              ))}
            </div>

            <div style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.8)', fontWeight: 600 }}>
              OYUNCU (SEN) · <span style={{ color: 'var(--gold)' }}>{playerHand.length > 0 ? pTotal : '—'}</span>
            </div>

            {/* Active Chip on Table */}
            {activeBetRef.current > 0 && (
              <div style={{ marginTop: 6 }}>
                <span
                  style={{
                    display: 'inline-block',
                    background: 'rgba(0,0,0,.6)',
                    border: '1px solid var(--gold)',
                    borderRadius: 20,
                    padding: '.2rem .6rem',
                    fontSize: '.68rem',
                    fontWeight: 700,
                    color: 'var(--gold)',
                  }}
                >
                  ◈ Masadaki Fiş: {fmt(activeBetRef.current)} dürTL
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Chip Bar (when betting) */}
        {phase === 'bet' && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', margin: '.6rem 0' }}>
            <span style={{ fontSize: '.72rem', color: 'var(--muted)', marginRight: 4 }}>Fiş:</span>
            {FICHES.map(f => (
              <button
                key={f}
                className={'chipB' + (bet === f ? ' on' : '')}
                onClick={() => {
                  playChipSound();
                  setBet(f);
                }}
                style={{
                  width: 36,
                  height: 36,
                  fontSize: '.74rem',
                  fontWeight: 800,
                  borderRadius: '50%',
                  background: f >= 250 ? '#990017' : f >= 100 ? '#111' : f >= 50 ? '#1565c0' : '#b26a00',
                  color: '#fff',
                  border: bet === f ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,.2)',
                  cursor: 'pointer',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Action Controls */}
        <div style={{ marginTop: '.6rem' }}>
          {phase === 'bet' && (
            <button
              className="btn solid"
              onClick={deal}
              style={{
                width: '100%',
                padding: '.85rem',
                fontSize: '.95rem',
                fontWeight: 800,
                letterSpacing: '.14em',
                background: 'var(--gold)',
                color: '#000',
              }}
            >
              KARTLARI DAĞIT (◈ {bet})
            </button>
          )}

          {phase === 'insurance' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn solid"
                onClick={() => takeInsurance(true)}
                style={{ flex: 1, padding: '.8rem', background: '#1b5e20', color: '#fff', fontWeight: 700 }}
              >
                ✓ SİGORTA AL (◈ {Math.floor(activeBetRef.current / 2)})
              </button>
              <button
                className="btn ghost"
                onClick={() => takeInsurance(false)}
                style={{ flex: 1, padding: '.8rem' }}
              >
                ✕ PAS GEÇ
              </button>
            </div>
          )}

          {phase === 'play' && (
            <div style={{ display: 'grid', gridTemplateColumns: playerHand.length === 2 && chips >= activeBetRef.current ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
              <button
                className="btn solid"
                onClick={hit}
                style={{ padding: '.8rem', fontSize: '.9rem', fontWeight: 800, background: '#1565c0', color: '#fff' }}
              >
                KART ÇEK (HIT)
              </button>

              <button
                className="btn solid"
                onClick={() => stand()}
                style={{ padding: '.8rem', fontSize: '.9rem', fontWeight: 800, background: '#c62828', color: '#fff' }}
              >
                DUR (STAND)
              </button>

              {playerHand.length === 2 && chips >= activeBetRef.current && (
                <button
                  className="btn solid"
                  onClick={doubleDown}
                  style={{ padding: '.8rem', fontSize: '.9rem', fontWeight: 800, background: 'var(--gold)', color: '#000' }}
                >
                  İKİYE KATLA (2×)
                </button>
              )}
            </div>
          )}

          {phase === 'over' && (
            <button
              className="btn solid"
              onClick={resetRound}
              style={{
                width: '100%',
                padding: '.85rem',
                fontSize: '.95rem',
                fontWeight: 800,
                background: 'var(--gold)',
                color: '#000',
              }}
            >
              YENİ EL BAŞLAT (◈ {bet})
            </button>
          )}
        </div>
      </Modal>
  );
}
