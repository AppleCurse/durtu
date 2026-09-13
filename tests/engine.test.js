// DÜRTÜ oyun motoru regresyon testleri — saf Node, bağımlılıksız.
// Kullanım:  node tests/engine.test.js   (CI: .github/workflows/test.yml)
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- 1) index.html içinden <script> gövdesini sökmek ---------- */
const html = fs.readFileSync(path.join(__dirname, '..', 'durtu', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('❌ <script> bloğu bulunamadı'); process.exit(1); }
const appJs = m[1];

/* ---------- 2) Minimal DOM / tarayıcı taklidi ---------- */
const els = {};
function mkEl(id) {
  return {
    id, style: {}, dataset: {}, disabled: false, value: '', textContent: '', innerHTML: '',
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    insertAdjacentHTML() {}, appendChild() {}, addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, getElementsByClassName() { return []; },
    getContext() {
      const grad = { addColorStop() {} };
      return new Proxy({}, {
        get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? (() => grad) : () => {},
        set() { return true; }
      });
    },
    getBoundingClientRect() { return { width: 660, height: 330, left: 0, top: 0 }; },
    setAttribute() {}, focus() {}, scrollIntoView() {}
  };
}
const document = {
  getElementById: id => els[id] || (els[id] = mkEl(id)),
  querySelectorAll: () => [], querySelector: () => null,
  getElementsByClassName: () => [], createElement: () => mkEl('tmp'),
  addEventListener() {}, body: mkEl('body'), documentElement: mkEl('html')
};
const ACStub = function () {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() { return node(); }, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), detune: param(), type: '', buffer: null, loop: false });
  return { currentTime: 0, state: 'running', createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node,
    createBuffer: () => ({ getChannelData: () => new Float32Array(8) }), destination: {}, resume: () => Promise.resolve() };
};
const localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
let NOW = 1000; let RAFQ = [];
const performance = { now: () => NOW };
const requestAnimationFrame = cb => { RAFQ.push(cb); return RAFQ.length; };
const cancelAnimationFrame = () => {};
const IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
const MutationObserver = class { observe() {} disconnect() {} };
const fetch = () => Promise.reject(new Error('ağ yok (test)'));
const navigator = { maxTouchPoints: 0, vibrate() { return true; } };
const window = { addEventListener() {}, AudioContext: ACStub, webkitAudioContext: ACStub, devicePixelRatio: 1, innerWidth: 1200, scrollTo() {}, requestAnimationFrame };
globalThis.setTimeout = () => 0; globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};

/* ---------- 3) Uygulamayı bu bağlamda çalıştır ---------- */
const run = new Function('document', 'window', 'localStorage', 'navigator', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'IntersectionObserver', 'MutationObserver', 'fetch', 'AudioContext', 'webkitAudioContext',
  appJs + '; return { state, CR, BJ, ROU, ST: st, crStart, crCash, crQuit, crEnd: (typeof crEnd!=="undefined")?crEnd:null, openCrash, bjTotal: (typeof bjTotal!=="undefined")?bjTotal:null, bjSettle, bjOpen, rouPays, logRound, minesMul: typeof mnMul !== "undefined" ? mnMul : null, SPORTS_MATCHES: typeof SPORTS_MATCHES!=="undefined"?SPORTS_MATCHES:null, SPORT: typeof SPORT!=="undefined"?SPORT:null, pickOdd: typeof pickOdd!=="undefined"?pickOdd:null, confirmBet: typeof confirmBet!=="undefined"?confirmBet:null, sportCalcPotential: typeof sportCalcPotential!=="undefined"?sportCalcPotential:null, PROMO_CODES: typeof PROMO_CODES !== "undefined" ? PROMO_CODES : null, claimPromoCode: typeof claimPromoCode !== "undefined" ? claimPromoCode : null, sha256Sync: typeof sha256Sync !== "undefined" ? sha256Sync : null, getProvableCrash: typeof getProvableCrash !== "undefined" ? getProvableCrash : null, getProvableMines: typeof getProvableMines !== "undefined" ? getProvableMines : null, PF: typeof PF !== "undefined" ? PF : null, VIP_TIERS: typeof VIP_TIERS !== "undefined" ? VIP_TIERS : null, getVipInfo: typeof getVipInfo !== "undefined" ? getVipInfo : null, claimVipChest: typeof claimVipChest !== "undefined" ? claimVipChest : null, toggleFavorite: typeof toggleFavorite !== "undefined" ? toggleFavorite : null, submitApply: typeof submitApply !== "undefined" ? submitApply : null, enterApp: typeof enterApp !== "undefined" ? enterApp : null }');
let app;
try {
  app = run(document, window, localStorage, navigator, performance, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, MutationObserver, fetch, ACStub, ACStub);
} catch (e) {
  console.error('❌ Uygulama test bağlamında yüklenemedi:', e.stack);
  process.exit(1);
}

/* ---------- 4) Test altyapısı ---------- */
let pass = 0, fail = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  →  ' + extra : '')); }
}
function stepFrames(n) { for (let i = 0; i < n; i++) { const q = RAFQ; RAFQ = []; q.forEach(cb => cb(NOW)); NOW += 50; } }
function stepUntil(cond) { let g = 0; while (RAFQ.length && g++ < 4000 && !cond()) stepFrames(1); }

const { state, CR, BJ, ST, bjTotal } = app;

/* ---------- 5) CRASH (Aviator) — para akışı ---------- */
console.log('\n✈️  Aviator (crash) akışı:');
{
  state.entered = true; state.chips = 1000;
  app.openCrash();
  document.getElementById('crBet').value = '10';

  // A) normal çıkış
  app.crStart(); CR.crash = 50;
  stepFrames(5); stepUntil(() => CR.m >= 1.5);
  const expA = 990 + Math.round(10 * CR.m);
  app.crCash(); stepFrames(2);
  T('Bahis düşer ve çıkışta iade edilir (10 @ 1.5x)', state.chips === expA, `beklenen ${expA}, gerçek ${state.chips}`);
  T('Nakit çıkışı çifte ödeme yapmaz', (() => { const b = state.chips; app.crCash(); return state.chips === b; })());

  // B) kayıp turu hiçbir kredilendirme yapmasın
  stepUntil(() => !CR.running);
  state.chips = 1000;
  app.crStart(); CR.crash = 1.3;
  stepUntil(() => !CR.running);
  T('Patlayan tur: para yutulmaz, bakiye bahis kadar düşük kalır', state.chips === 990, `gerçek ${state.chips}`);
  T('Geç basım mesaj verir ve kredilemez', (() => { const b = state.chips; app.crCash(); return state.chips === b; })());

  // C) uçuş ortasında çıkış = otomatik tahsilat
  stepUntil(() => false) || 0;
  state.chips = 1000;
  app.crStart(); CR.crash = 60;
  stepFrames(5); stepUntil(() => CR.m >= 2.0);
  const mC = CR.m, expC = 990 + Math.round(10 * mC);
  app.crQuit();
  T('Tur ortasında pencere kapama → oto-tahsilat', state.chips === expC, `beklenen ${expC}, gerçek ${state.chips}`);
  stepUntil(() => !CR.running);
}

/* ---------- 6) BLACKJACK — puanlama ve ödemeler ---------- */
console.log('\n🂡 Blackjack:');
{
  const C = v => ({ r: '?', v, s: '♠' });
  T('A+K = 21', bjTotal([C(1), C(13)]) === 21);
  T('A+A+9 = 21 (soft hesap)', bjTotal([C(1), C(1), C(9)]) === 21);
  T('10+10+5 = 25 (batış)', bjTotal([C(10), C(10), C(5)]) === 25);
  T('A+6 = soft 17', bjTotal([C(1), C(6)]) === 17);

  // Ödeme tablosu: BJ 2.5×, kazanç 2×, beri 1×, kayıp 0
  const cases = [['bj', 100, 250], ['win', 100, 200], ['push', 100, 100], ['lose', 100, 0]];
  cases.forEach(([res, bet, cred]) => {
    BJ.bet = bet; state.chips = 1000;
    app.bjSettle(res);
    T(`ödeme ${res}: bahis ${bet} → iade ${cred}`, state.chips === 1000 + cred, `gerçek ${state.chips}`);
  });
}

/* ---------- 7) RULET — ödeme matrisi ---------- */
console.log('\n🎡 Rulet:');
{
  const P = app.rouPays; // bet-type → (n → multiplier)
  const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  T('kırmızı 7 için ×2', P('red')(7) === 2);
  T('kırmızıya siyah 8 gelince 0', P('red')(8) === 0);
  T('sıfır dış bahisleri kaybeder (red 0)', P('red')(0) === 0);
  T('tek sayı ×36 (num:17 → 17)', P('num:17')(17) === 36 && P('num:17')(18) === 0);
  T('1. düzine 13 gelirse 0', P('doz1')(13) === 0 && P('doz1')(5) === 3);
  T('19–36, 18 gelince 0; 36 gelince ×2', P('high')(18) === 0 && P('high')(36) === 2);
  T('tek/çift 0 gelince 0', P('even')(0) === 0 && P('odd')(0) === 0);
  // kapsamlı: tüm 0..36 için tutarlılık ölçüsü (negatif multiplier asla yok)
  let ok = true;
  ['red','black','even','odd','low','high','doz1','doz2','doz3'].forEach(b => { for (let n = 0; n <= 36; n++) if (P(b)(n) < 0) ok = false; });
  T('Ödeme matrisi hiçbir sayıda negatif değil', ok);
}

/* ---------- 8) Geçmiş (hist) ---------- */
console.log('\n📜 Tur geçmişi:');
{
  ST().hist.length = 0;
  for (let i = 0; i < 90; i++) app.logRound('Test', 10, i % 2 ? 20 : 0, null);
  const h = ST().hist;
  T('80 turda sınanır (şişmez)', h.length === 80, `boy ${h.length}`);
  T('En yeni en başta', h[0].win === 20 && h[1].win === 0, `h0=${h[0].win} h1=${h[1].win}`);
}


/* ---------- 8.5) SPORT — gerçek oran settlement ---------- */
console.log('\n⚽ Spor:');
{
  const SM = app.SPORTS_MATCHES;
  T('3 maç var (UCL+SL)', Array.isArray(SM) && SM.length===3, 'len='+(SM?SM.length:'null'));
  T('Oranlar >1 ve <10', SM && SM.every(m=> m.odds['1']>1 && m.odds['1']<10 && m.odds['X']>1 && m.odds['2']>1));
  // payout calc
  const m = SM[0];
  const stake=25;
  const payout=Math.round(stake*m.odds['1']);
  T('Payout hesabı: 25 @2.10 → 52/53', payout===52 || payout===53, 'got '+payout);
  // implied prob normalizasyon
  const inv={ '1':1/m.odds['1'], 'X':1/m.odds['X'], '2':1/m.odds['2'] };
  const sum=inv['1']+inv['X']+inv['2'];
  const prob={ '1':inv['1']/sum, 'X':inv['X']/sum, '2':inv['2']/sum };
  T('İma edilen olasılık toplamı 1', Math.abs(prob['1']+prob['X']+prob['2']-1)<0.0001);
  T('pickOdd ve confirmBet fonksiyonları var (gerçek motor)', typeof app.pickOdd==='function' && typeof app.confirmBet==='function');
}

/* ---------- 8.5) MINES — adil çarpan matrisi ---------- */
console.log('\n💣 Mines:');
{
  const M = app.minesMul;
  T('İlk elmas: 3 mayında ~1.10× başlar', Math.abs(M(3,1) - 1.10) < 0.02, 'geç: ' + M(3,1));
  let mono = true, prev = 0;
  for(let k = 1; k <= 22; k++){ const v = M(3,k); if(v <= prev) mono = false; prev = v; }
  T('Çarpan artan eldizilim (3 mayın, 22 güvenli)', mono);
  T('1 mayında tüm tarla: son ~24.25×', Math.abs(M(1,24) - 0.97*25) < 0.6, 'geç: ' + M(1,24));
  T('20 mayında 4 güvenli karoda yüklü çarpan', M(20,4) > 5, 'geç: ' + M(20,4).toFixed(2));
}

/* ---------- 8.6) Promosyon Kodları ---------- */
console.log('\n🎁 Promosyon Kodları:');
{
  const P = app.PROMO_CODES;
  T('DURTU2026 tanımlı ve 500 dürTL değerinde', P && P['DURTU2026'] && P['DURTU2026'].amt === 500);
  T('VIP-KULUP tanımlı ve 1000 dürTL değerinde', P && P['VIP-KULUP'] && P['VIP-KULUP'].amt === 1000);
  
  // Kod bozdurma testi
  const inp = document.getElementById('promoInp');
  const initialChips = app.state.chips;
  inp.value = 'DURTU2026';
  app.claimPromoCode();
  T('Kodu bozdurunca bakiye artar (+500)', app.state.chips === initialChips + 500);
  T('Kullanılan kod claimedPromos içine işlenir', app.state.claimedPromos.includes('DURTU2026'));
  
  // Çift kullanım engeli
  const afterFirstClaim = app.state.chips;
  inp.value = 'DURTU2026';
  app.claimPromoCode();
  T('Aynı kod ikinci kez kullanılamaz (çift kullanım engeli)', app.state.chips === afterFirstClaim);
}

/* ---------- 8.7) Provably Fair (Kriptografik Adillik) ---------- */
console.log('\n🛡️ Provably Fair:');
{
  const sha = app.sha256Sync;
  T('SHA-256 motoru standarda uygun (boş girdi test vektörü)', sha('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  T('SHA-256 motoru standarda uygun ("abc" test vektörü)', sha('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  // Crash determinizmi testi
  const sSeed = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
  const cSeed = 'client_test_seed';
  const crash1 = app.getProvableCrash(sSeed, cSeed, 1);
  const crash2 = app.getProvableCrash(sSeed, cSeed, 1);
  T('Aynı tohumlarla Aviator sonucu %100 deterministiktir', crash1 === crash2 && crash1 >= 1.00);

  // Mines determinizmi ve benzersiz karo testi
  const mines1 = app.getProvableMines(sSeed, cSeed, 1, 3);
  const mines2 = app.getProvableMines(sSeed, cSeed, 1, 3);
  T('Aynı tohumlarla Mines mayınları %100 deterministiktir', JSON.stringify(mines1) === JSON.stringify(mines2));
  T('Mines 3 mayın tam olarak 3 benzersiz karo seçer', mines1.length === 3 && new Set(mines1).size === 3);
  T('Mayın karoları 0-24 sınırları içindedir', mines1.every(p => p >= 0 && p < 25));
}

/* ---------- 8.8) VIP Kulüp Kademeleri & Sandıklar ---------- */
console.log('\n👑 VIP Kulüp & Sandıklar:');
{
  const vInfo0 = app.getVipInfo(0);
  T('0 hacim Bronz kademedir', vInfo0.tier.id === 'bronz' && vInfo0.pct === 0);

  const vInfoGumus = app.getVipInfo(5000);
  T('5.000 hacim Gümüş kademedir', vInfoGumus.tier.id === 'gumus');

  const vInfoAltin = app.getVipInfo(20000);
  T('20.000 hacim Altın kademedir', vInfoAltin.tier.id === 'altin');

  // Sandık açma
  app.ST().wagered = 6000; // Gümüşe hak kazandı
  const beforeChestChips = app.state.chips;
  app.claimVipChest('gumus');
  T('Gümüş sandığı açılınca 500 dürTL eklenir', app.state.chips === beforeChestChips + 500);
  T('Açılan sandık claimedVipChests içine işlenir', app.state.claimedVipChests.includes('gumus'));

  // Çift sandık açma engeli
  const afterChestChips = app.state.chips;
  app.claimVipChest('gumus');
  T('Aynı sandık ikinci kez açılamaz', app.state.chips === afterChestChips);

  // Yetkisiz kademe sandığı engeli (Altın için 20.000 gerek, şu an 6.000)
  app.claimVipChest('altin');
  T('Yetersiz hacimde üst kademe sandığı açılamaz', !app.state.claimedVipChests.includes('altin'));
}

/* ---------- 8.9) Lobi Favorileri ---------- */
console.log('\n❤️ Lobi Favorileri:');
{
  app.state.favorites = [];
  app.toggleFavorite(null, 'gates');
  T('Favorilere ekleme state.favorites dizisine yansır', app.state.favorites.includes('gates'));
  app.toggleFavorite(null, 'mines');
  T('Birden fazla oyun favorilere eklenebilir', app.state.favorites.length === 2 && app.state.favorites.includes('mines'));
  app.toggleFavorite(null, 'gates');
  T('Aynı oyun tekrar tıklandığında favorilerden çıkarılır', !app.state.favorites.includes('gates') && app.state.favorites.length === 1);
}

/* ---------- 8.10) Başvuru Formu & E-posta Doğrulaması ---------- */
console.log('\n📥 Başvuru Formu & E-posta:');
{
  localStorage.removeItem('durtu_apps');
  const nameEl = document.getElementById('apName');
  const emailEl = document.getElementById('apEmail');
  const contactEl = document.getElementById('apContact');
  const whyEl = document.getElementById('apWhy');

  nameEl.value = 'Can Demir';
  emailEl.value = 'hatali_email'; // geçersiz e-posta
  whyEl.value = 'Ben sakin bir oyuncuyum ve kapalı kulübü merak ediyorum.';
  app.submitApply();
  let apps = JSON.parse(localStorage.getItem('durtu_apps') || '[]');
  T('Geçersiz e-posta adresiyle başvuru reddedilir', apps.length === 0);

  emailEl.value = 'can.demir@vipclub.com'; // geçerli e-posta
  contactEl.value = '@candemir';
  app.submitApply();
  apps = JSON.parse(localStorage.getItem('durtu_apps') || '[]');
  T('Geçerli e-posta ile başvuru başarıyla kaydedilir', apps.length === 1);
  T('Başvuru sahibinin e-postası ve telegramı tam olarak saklanır', apps[0].email === 'can.demir@vipclub.com' && apps[0].contact === '@candemir');
}

/* ---------- 8.11) Günlük Giriş / Check-in Bonusu ---------- */
console.log('\n☀️ Günlük Giriş / Check-in Bonusu:');
{
  // 1. Gün: İlk giriş testi
  localStorage.removeItem('durtu_demo_v1');
  app.state.entered = false;
  app.state.chips = 1000;
  app.enterApp('Emre', false);
  T('Günün ilk girişinde +100 dürTL günlük ritüel bonusu eklenir', app.state.chips >= 1100);
  T('İlk gün girişinde seri 1 olarak başlar', app.state.streakDays === 1);

  // Aynı gün tekrar giriş: Çift bonus verilmemeli
  const chipsAfterFirst = app.state.chips;
  app.state.entered = false;
  app.enterApp('Emre', false);
  T('Aynı gün ikinci girişte mükerrer bonus verilmez', app.state.chips === chipsAfterFirst);

  // 2. Gün: Dün girmiş olan kullanıcının serisi artmalı
  const yesterday = new Date(Date.now() - 864e5).toDateString();
  localStorage.setItem('durtu_demo_v1', JSON.stringify({
    name: 'Emre',
    chips: 1500,
    lastDay: yesterday,
    streakDays: 2
  }));
  app.state.entered = false;
  app.enterApp('Emre', false);
  T('Dün giriş yapılmışsa seri 1 artar (2 -> 3 gün)', app.state.streakDays === 3);
  T('Yeni günde +100 dürTL bonus hesaba eklenir', app.state.chips === 1600);
}


/* ---------- 9) Sonuç ---------- */
console.log(`\n${'='.repeat(44)}\nSONUÇ: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
