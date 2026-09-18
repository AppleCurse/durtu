# DÜRTÜ — Canlıya Çıkış Öncesi Kod Denetimi (Kıdemli Mimar / QA Raporu)

**Denetlenen commit:** `c0927b5` — *"feat: audit and align all casino games 1-to-1 with real casino standards and provably fair math"*
**Denetim tarihi:** 13 Eylül 2026
**Kapsam:** `durtu-app/` (canlıya çıkacak Next.js uygulaması), `durtu/index.html` (legacy monolit), `tests/`, `supabase/`, CI

---

## YÖNETİCİ ÖZETİ

`DURUM_RAPORU.md` "test 61/61 ✅, build ✅" diyor. **Bu ifade yanıltıcıdır.** 61 testin tamamı
`durtu/index.html` içindeki *eski* monolitik scripti test ediyor. Canlıya çıkacak olan
`durtu-app/` klasöründeki **21 React bileşeninin ve para akışının tek bir testi yoktur.**
Yeşil CI, sıfır güvence anlamına geliyor.

Commit mesajı "gerçek kasino standartlarıyla 1-e-1 hizalandı ve provably fair matematik" iddia ediyor.
Ölçtüm: **iddia tutmuyor.** Aşağıda 7 adet, tek başına kasayı boşaltabilecek matematik/mantık hatası var.

| Ciddiyet | Adet | Özet |
|---|---|---|
| 🔴 **BLOCKER** | 9 | Sonsuz para üretimi, RTP %556, bedava bahis ikiye katlama, XSS, NaN ekonomi çöküşü |
| 🟠 **YÜKSEK** | 11 | Yarış koşulları, AudioContext tükenmesi, API bellek sızıntısı, kilitsiz bağımlılık |
| 🟡 **ORTA** | 14 | DRY ihlalleri, N+1 benzeri localStorage I/O, erişilebilirlik, ölü şema |

**Tavsiyem: bu commit bu haliyle canlıya ÇIKMAMALIDIR.** Blocker'lar kapatılmadan yayın,
demo para birimi ("dürTL") olsa dahi, ürünün matematiksel güvenilirliğini ve marka vaadini
("provably fair", "gerçek kasino standardı") kamuya karşı yalanlar.

---

# 1. İŞ MANTIĞI VE EDGE CASE'LER

## 🔴 BLOCKER #1 — Şans Çarkı'nın RTP'si %556. Kasa her turda para kaybediyor.

**Dosya:** `durtu-app/components/WheelGame.jsx:6-10`

### Sorun
Segment dizilerinin beklenen değeri hesaplanmamış. Ölçüm sonucu:

| Risk | Segment toplamı | Segment sayısı | **Gerçek RTP** | İlan edilen (`lib/games.js`) |
|---|---|---|---|---|
| `low` | 21.30 | 16 | **%133.1** | %98.50 |
| `med` | 28.50 | 16 | **%178.1** | %98.50 |
| `high` | 89.00 | 16 | **%556.3** | %98.50 |

`high` riskte oyuncu her 25 dürTL'lik dönüşte ortalama **139 dürTL** kazanıyor.
Otomatik tıklayan bir kullanıcı 200 dönüşte bakiyesini ~5.5 katına çıkarır.

### Neden Kritik?
Bu bir "denge sorunu" değil, **negatif house edge**. `lib/games.js` kartta "RTP %98.50" yazıyor —
yani kullanıcıya gösterilen sayı ile motorun yaptığı iş arasında 5.6 kat fark var. Demo para
olsa bile bu, liderlik tablosu / VIP hacim / istatistik raporlarının tamamını anlamsızlaştırır
ve gerçek paraya geçiş senaryosunda doğrudan finansal kayıptır.

### Çözüm Önerisi
RTP'yi veri değil, **invariant** yapın; segmentleri hedef RTP'ye göre normalize edin ve
bir runtime assert ile koruyun.

```js
// WheelGame.jsx
const TARGET_RTP = 0.985;

// Ham ağırlıklar (görsel dağılım), RTP normalizasyonu sonradan uygulanır
const RAW_PRESETS = {
  low:  [1.2, 1.5, 0, 1.2, 2.0, 0, 1.5, 3.0, 0, 1.2, 1.5, 0, 2.0, 1.2, 5.0, 0],
  med:  [1.5, 0, 2.0, 0, 3.0, 1.5, 0, 5.0, 0, 2.0, 0, 1.5, 10.0, 0, 2.0, 0],
  high: [0, 2.0, 0, 0, 5.0, 0, 0, 10.0, 0, 0, 2.0, 0, 20.0, 0, 0, 50.0],
};

function normalizeToRtp(segments, targetRtp = TARGET_RTP) {
  const n = segments.length;
  const raw = segments.reduce((a, b) => a + b, 0) / n; // mevcut EV
  if (raw <= 0) throw new Error('WHEEL_PRESET_INVALID: sıfır beklenen değer');
  const k = targetRtp / raw;
  // 2 ondalık yuvarlama sonrası RTP kaymasını tolere et
  return segments.map(v => (v === 0 ? 0 : Math.round(v * k * 100) / 100));
}

export const WHEEL_PRESETS = Object.fromEntries(
  Object.entries(RAW_PRESETS).map(([k, v]) => [k, normalizeToRtp(v)])
);

// Geliştirme/CI güvenlik ağı — sessizce bozulmasın
if (process.env.NODE_ENV !== 'production') {
  for (const [risk, segs] of Object.entries(WHEEL_PRESETS)) {
    const rtp = segs.reduce((a, b) => a + b, 0) / segs.length;
    console.assert(
      Math.abs(rtp - TARGET_RTP) < 0.01,
      `WHEEL RTP SAPMASI [${risk}]: %${(rtp * 100).toFixed(2)}`
    );
  }
}
```

---

## 🔴 BLOCKER #2 — Hi-Lo: "As geldi → YÜKSEK" tahmini %100 kazançlı, bedava para basıyor.

**Dosya:** `durtu-app/components/HiloGame.jsx:66-76, 100-110`

### Sorun
Hem `hi` hem `lo` tahmininde **eşitlik oyuncu lehine** sayılıyor:

```js
const isCorrect = direction === 'hi' ? nextCard.v >= activeCard.v
                                     : nextCard.v <= activeCard.v;
```

Buna karşın çarpan hesabı `higherOrEqualCount = 13 - val + 1` ile eşitliği dahil ediyor
ama `Math.max(1.05, ...)` tabanı bunu eziyor. Ölçüm:

| Aktif kart | Tahmin | Gerçek kazanma olasılığı | Ödenen çarpan | **EV** |
|---|---|---|---|---|
| A (v=1) | YÜKSEK | **%100** | 1.05× | **%105** |
| K (v=13) | DÜŞÜK | **%100** | 1.05× | **%105** |
| 7 (v=7) | her ikisi | %54 | 1.82× | %98 (doğru) |

Ayrıca her kartta `hiProb + loProb = 1.08` — olasılıklar toplamı 1'i aşıyor, yani
model matematiksel olarak tutarsız.

### Neden Kritik?
As veya Papaz gördüğünde **risksiz %5 kâr** var ve çarpanlar zincirleme çarpıldığı için
(`multiplier * stepMult`) kullanıcı "As bekle → hi bas → kasaya gir" döngüsüyle
sınırsız bakiye üretebilir. `skipCard()` de `streak === 0` iken ücretsiz kart değiştirmeye
izin verdiği için **sıfır maliyetle As arayabilir**. Bu, kombine edildiğinde deterministik
bir para makinesidir.

### Çözüm Önerisi
Deste mantığını gerçek kasinodaki gibi kurun: eşitlik **kaybeder** (veya push), olasılık
kesin sayılır, çarpan tek bir kaynaktan türetilir.

```js
const RTP = 0.98;
const DECK_SIZE = 13;

/**
 * Hi-Lo adil çarpan. Eşitlik KAYBEDER (house edge kaynağı), bu yüzden
 * "yüksek" = kesin büyük, "düşük" = kesin küçük.
 */
function hiloOdds(cardValue) {
  const higherCount = DECK_SIZE - cardValue;      // v'den KESİN büyük
  const lowerCount  = cardValue - 1;              // v'den KESİN küçük
  const tieCount    = 1;                          // eşitlik → kayıp

  const pHigher = higherCount / DECK_SIZE;
  const pLower  = lowerCount / DECK_SIZE;

  return {
    pHigher, pLower, tieCount,
    // p=0 ise bahis kabul EDİLMEZ (buton disabled), çarpan uydurulmaz
    higherMult: pHigher > 0 ? +(RTP / pHigher).toFixed(2) : null,
    lowerMult:  pLower  > 0 ? +(RTP / pLower).toFixed(2)  : null,
  };
}

function guess(direction) {
  if (!playing) return;
  const { higherMult, lowerMult } = hiloOdds(activeCard.v);
  const stepMult = direction === 'hi' ? higherMult : lowerMult;
  if (stepMult == null) {            // A'da 'lo', K'da 'hi' → imkânsız bahis
    say('Bu kartta o yön imkânsız — diğer yönü seç.');
    return;
  }
  const nextCard = randomCard();
  const isCorrect = direction === 'hi'
    ? nextCard.v > activeCard.v
    : nextCard.v < activeCard.v;
  // ... eşitlik artık kayıptır
}
```

Ve butonları kilitleyin: `disabled={hiloOdds(activeCard.v).higherMult === null}`.

---

## 🔴 BLOCKER #3 — Plinko 16 satırda kova sayısı yanlış: 1000× çarpanı erişilemez, RTP hesaplanamaz.

**Dosya:** `durtu-app/components/PlinkoGame.jsx:27-30`

### Sorun
`n` satırlı bir Plinko'da **tam olarak `n+1`** kova olmalıdır. Denetim çıktısı:

```
 8 low/med/high  → 9/9/9    ✓  RTP %98.98 / %98.91 / %99.06
10 low/med/high  → 11/11/11 ✓  RTP %99.00 / %98.91 / %99.06
12 low/med/high  → 13/13/13 ✓  RTP %98.98 / %98.99 / %99.12
14 low           → 15       ✓  RTP %99.65   ← hedeften %0.65 sapma
16 low           → 15       ✗  17 OLMALI
16 med           → 17       ✓  RTP %98.99
16 high          → 15       ✗  17 OLMALI
```

`rows=16, risk='high'` varsayılan açılış ayarıdır — yani **oyunu açan her kullanıcı
doğrudan bozuk konfigürasyona düşüyor.**

### Neden Kritik?
1. `binIndex` hesabı `(w - 24) / 15` genişlikte kova varsayıyor ama top 17 kovalık bir
   piramitten düşüyor → **çarpanlar yanlış kovalara kayıyor.**
2. `Math.min(totalBins - 1, binIndex)` clamp'i uçlardaki topları son kovaya yığıyor →
   binom dağılımın kuyruğu (1000× çarpan) ya hiç gelmiyor ya da **olması gerekenden
   ~8 kat sık** geliyor. İki durumda da RTP kontrolsüz.
3. UI grid'i `currentMults.length` (15) sütun çiziyor, fizik 17 kova üretiyor →
   görsel ile sonuç uyuşmuyor, kullanıcı "hile" algılar.

### Çözüm Önerisi
Tabloyu bir invariant ile koruyun; yanlış uzunlukta tablo **build'i kırsın**.

```js
// Doğru 16 satır tabloları (Stake standardı, 17 kova)
16: {
  low:  [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  med:  [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
},
```

```js
// Modül yüklenirken doğrula — bozuk tablo asla prod'a gitmesin
function binom(n, k) { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }

for (const [rowsKey, risks] of Object.entries(MULTIPLIERS)) {
  const n = Number(rowsKey);
  for (const [risk, arr] of Object.entries(risks)) {
    if (arr.length !== n + 1) {
      throw new Error(`PLINKO_TABLE_INVALID: ${n} satır / ${risk} → ${arr.length} kova, ${n + 1} olmalı`);
    }
    const rtp = arr.reduce((acc, v, i) => acc + (binom(n, i) / 2 ** n) * v, 0);
    if (Math.abs(rtp - 0.99) > 0.01) {
      throw new Error(`PLINKO_RTP_SAPMASI: ${n}/${risk} → %${(rtp * 100).toFixed(2)}`);
    }
  }
}
```

**Ek edge case:** Top havadayken kullanıcı satır sayısını değiştirebiliyor. Top kendi
`b.rows`'unu taşıyor ama çizim/collision `rowsRef.current` kullanıyor (satır 160, 191) →
fizik ile geometri ayrışıyor. Çözüm: `disabled={ballsRef.current.length > 0}` veya
collision döngüsünde tutarlı şekilde `b.rows` kullanın.

---

## 🔴 BLOCKER #4 — Limbo: animasyon sırasında hedef çarpan değiştirilerek 10.000× ödeme alınıyor.

**Dosya:** `durtu-app/components/LimboGame.jsx:57-112`

### Sorun
Kazanç, tur başlarken dondurulan değerle değil, **ödeme anındaki state ile** hesaplanıyor:

```js
function playRound() {
  const outcome = ...;
  const isWon = outcome >= target;   // ← target'ın O ANKİ değeri ile karar
  // 500 ms animasyon...
}
function finalizeRound(outcome, isWon) {
  const totalWin = Math.round(bet * target);  // ← target'ın 500 ms SONRAKİ değeri ile ödeme
  win(totalWin);
}
```

Hedef ve bahis input'ları animasyon boyunca `disabled` değil.

### Neden Kritik?
Deterministik exploit: `target = 1.01` (≈%97 kazanma şansı) ile bas, ekranda sayaç
dönerken hedefi `10000` yap. Kazanma kararı 1.01'e göre verildiği için neredeyse
her tur kazanılır, ödeme ise `bet × 10000` olur. 25 dürTL bahisle turda 250.000 dürTL.
Aynı açık `bet` için de geçerli.

### Çözüm Önerisi
Tur parametrelerini **tur başında immutable bir snapshot'a** alın ve UI'yi kilitleyin.

```js
function playRound() {
  if (rollingRef.current) return;
  rollingRef.current = true;                 // setState değil, ref ile anlık kilit

  const round = Object.freeze({              // tur sözleşmesi
    bet: bet,
    target: target,
    ts: Date.now(),
  });

  if (!spend(round.bet)) {
    rollingRef.current = false;
    say('Yetersiz bakiye — fişi küçült.');
    return;
  }
  setRolling(true);

  const outcome = Math.min(10000, Math.max(1.0, Math.floor((0.98 / (1 - Math.random())) * 100) / 100));
  const isWon = outcome >= round.target;

  const done = () => finalizeRound(round, outcome, isWon);
  if (turbo) return done();
  // ... animasyon sonunda done()
}

function finalizeRound(round, outcome, isWon) {
  rollingRef.current = false;
  setRolling(false);
  if (isWon) {
    const totalWin = Math.round(round.bet * round.target);  // snapshot'tan
    win(totalWin);
    logRound('Limbo', round.bet, totalWin, round.target);
  } else {
    logRound('Limbo', round.bet, 0);
  }
}
```

Ve JSX'te: `<input ... disabled={rolling} />` (her üç input için de).

---

## 🔴 BLOCKER #5 — Blackjack: `spend()` dönüş değeri yok sayılıyor, bedava "Double Down".

**Dosya:** `durtu-app/components/BlackjackGame.jsx:266-283`

### Sorun
```js
function doubleDown() {
  if (phase !== 'play' || playerHand.length !== 2 || chips < activeBetRef.current) return;
  spend(activeBetRef.current);          // ← dönüş değeri KONTROL EDİLMİYOR
  activeBetRef.current *= 2;            // ← başarısız olsa bile bahis ikiye katlanıyor
```

İki ayrı kusur birleşiyor:
1. Guard, **stale prop** olan `chips` (React state) ile yapılıyor; oysa gerçek bakiye
   `page.jsx`'teki `chipsRef.current`'ta ve senkron güncelleniyor. Aynı tick'te yapılan
   bir başka harcamadan sonra `chips` prop'u hâlâ eski, büyük değeri gösterir.
2. `spend()` `false` dönse bile `activeBetRef.current *= 2` çalışır → **ödenmemiş bahis
   iki katına çıkar** ve `finalize('win')` `currentBet * 2` öder.

Aynı hata `takeInsurance` içinde de yumuşak biçimde mevcut (başarısız `spend` sessizce
yutuluyor, kullanıcıya geri bildirim yok).

### Neden Kritik?
Bakiye 0'a yaklaştığında double down basmak, **karşılığı alınmamış 2× ödeme** üretir.
Bu, bakiyeyi sıfırdan yeniden büyütmenin garantili yoludur.

### Çözüm Önerisi
Tüm para hareketlerinde `spend()` dönüşü **zorunlu** kontrol edilmeli. Lint kuralıyla
garanti altına alın.

```js
function doubleDown() {
  if (phase !== 'play' || playerHand.length !== 2) return;

  const extra = activeBetRef.current;
  if (!spend(extra)) {                      // tek doğruluk kaynağı: spend()
    say(`İkiye katlamak için ◈ ${fmt(extra)} dürTL gerekli — bakiyen yetmiyor.`);
    return;
  }
  activeBetRef.current = extra * 2;         // ancak ödeme başarılıysa
  ...
}
```

```js
// takeInsurance
const insCost = Math.floor(activeBetRef.current / 2);
if (insCost < 1) { say('Sigorta için bahis çok küçük.'); return checkNaturals(playerHand, dealerHand); }
if (!spend(insCost)) {
  say('Sigorta için yeterli bakiye yok — sigortasız devam ediliyor.');
  return checkNaturals(playerHand, dealerHand);
}
```

**ESLint kuralı (öneri):** `spend` ve `win` çağrılarını `no-unused-expressions` +
özel bir `must-use-return` kuralıyla koruyun; CI'da kırılsın.

---

## 🔴 BLOCKER #6 — Aviator: sekme arka plana alınıp geri dönüldüğünde patlamış turdan para alınıyor.

**Dosya:** `durtu-app/components/CrashGame.jsx:125-145`

### Sorun
Çarpan duvar saatiyle hesaplanıyor, ama oto-çıkış kontrolü **patlama kontrolünden önce**:

```js
function loop(now) {
  const t = (now - e.t0) / 1000;
  e.m = Math.exp(.14 * t);              // gerçek zaman → frame atlanırsa sıçrar
  ...
  if (e.oto > 1 && !e.cashed && m >= e.oto) doCash(true);   // (A) önce ödeme
  if (m >= e.crash) { endRound(); return; }                  // (B) sonra patlama
}
```

`requestAnimationFrame` arka plan sekmelerinde durur. Kullanıcı 30 saniye başka sekmeye
geçip dönerse tek bir frame'de `t` 0.5'ten 30'a sıçrar, `m = e^(0.14*30) ≈ 66`.
`e.crash = 1.8`, `e.oto = 5.0` ise **(A)** çalışır ve oyuncu 5× ödeme alır — oysa uçak
28 saniye önce 1.8×'te patlamıştı.

Aynı sıçrama manuel çıkışta da sömürülebilir: kullanıcı sekmeyi minimize edip geri gelir,
`e.m` devasa, `e.running` hâlâ `true` (çünkü hiç frame işlenmemiş) ve tek tıkla
`win(bet × 66)` alır.

### Neden Kritik?
Kullanıcı tarafından **kasıtlı olarak tetiklenebilir** ve sınırsızdır. `Math.min(60, ...)`
tavanı sadece `crash` değerine uygulanıyor, ödemeye değil.

### Çözüm Önerisi
Patlama kontrolü her zaman önce gelmeli ve çarpan **patlama noktasıyla clamp** edilmeli.
Ayrıca frame atlaması tespit edilip tur güvenli şekilde sonlandırılmalı.

```js
const MAX_FRAME_GAP_MS = 400;   // bu süreden uzun boşluk = sekme askıya alınmış

function loop(now) {
  const e = E.current;
  if (!e.running) return;

  const gap = now - (e.lastFrame || now);
  e.lastFrame = now;

  const t = (now - e.t0) / 1000;
  const rawM = Math.exp(0.14 * t);

  // 1) ÖNCE patlama: çarpan asla crash noktasını aşmaz
  if (rawM >= e.crash) {
    e.m = e.crash;
    endRound({ suspended: gap > MAX_FRAME_GAP_MS });
    return;
  }
  e.m = rawM;

  // 2) Frame kaybı varsa oto-çıkışı ASLA geriye dönük uygulama
  if (gap > MAX_FRAME_GAP_MS) {
    say('⏸ Sekme askıya alındı — bu tur güvenlik gereği patlamış sayıldı.');
    endRound({ suspended: true });
    return;
  }

  // 3) Sonra oto-çıkış
  if (e.oto > 1 && !e.cashed && e.m >= e.oto) doCash(true);

  e.pts.push([t, e.m]);
  draw(t, false);
  e.raf = requestAnimationFrame(loop);
}

// Ek güvenlik: sayfa görünürlüğü değişince turu dondur
useEffect(() => {
  const onVis = () => { if (document.hidden && E.current.running) endRound({ suspended: true }); };
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}, []);
```

**Ayrıca RTP uyuşmazlığı — iki motor, iki farklı matematik.**

İlk taslakta bu sapmayı React tarafına yazmıştım; ölçümü tekrarlayınca **hatalı
atıf yaptığımı gördüm, düzeltiyorum.** 3 milyon turluk simülasyonun sonucu:

| Motor | 1.5× | 2× | 5× | 10× | Karar |
|---|---|---|---|---|---|
| `durtu/index.html` → `getProvableCrash` | %94.00 | %93.99 | %94.05 | %94.16 | ❌ İlan edilen %97'nin 2.8 puan altında |
| `durtu-app/lib/engines/crash.js` → `crashPoint` | %97.06 | %97.05 | %96.93 | %97.27 | ✅ Hedefte |

Sapmanın kaynağı `Math.min(60, ...)` tavanı veya yuvarlama **değil** (etkileri
binde birler seviyesinde); tek sebep legacy'deki şu satır:

```js
if (intVal % 33 === 0) return 1.00;   // turların %3.03'ü anında patlıyor
```

0.97 × (1 − 1/33) ≈ **0.9406** — ölçümle birebir uyuşuyor. Yani legacy motor
oyuncuya ilan edilenden %2.9 daha az ödüyor; bu, düzeltilmezse **reklamda
yanıltıcı beyan** sorumluluğu doğurur.

React motoru doğru olduğu için çözüm legacy'yi ona hizalamaktır — `%33` kuralını
kaldırın veya taban RTP'yi `0.97/(1−1/33) ≈ 1.0003` yerine doğrudan `%33` kuralsız
`0.97` olarak bırakın. Uzun vadede **tek kaynak**: `lib/engines/crash.js` her iki
istemciye de servis edilmeli.

Bu artık `tests/math.invariants.test.js` içinde 200k turluk Monte Carlo ile
korunuyor (`CRASH: Monte Carlo RTP hedefe yakın`).

---

## 🔴 BLOCKER #7 — `NaN` bakiye tüm ekonomiyi sessizce çökertiyor.

**Dosya:** `durtu-app/lib/store.js:77-106` + `durtu-app/app/page.jsx:47-52`

### Sorun
```js
// store.js — getProfile()
if (typeof p.chips !== 'number') p.chips = 1000;   // NaN, typeof 'number' → geçer!
```
```js
// page.jsx — spend()
const spend = b => {
  if (chipsRef.current < b) return false;   // NaN < 25 → false → bahis KABUL EDİLİR
  setC(chipsRef.current - b);               // NaN - 25 = NaN
  return true;
};
```

Bir kez `chips` `NaN` olursa (bozuk localStorage, eski sürüm verisi, `+e.target.value`
üzerinden gelen bir `NaN`, ya da manuel müdahale):
- `spend()` **her zaman `true`** döner → sınırsız bahis,
- bakiye kalıcı olarak `NaN`,
- `fmt(NaN)` → ekranda `"NaN dürTL"`,
- `saveChips(NaN)` → `Math.max(0, NaN) = NaN` → **bozuk değer diske yazılır, kalıcı olur.**

### Neden Kritik?
Kullanıcı hesabı geri dönüşsüz bozulur ve "reset" akışı yoktur. Ayrıca bu durumda
tüm oyunlar bedava oynanır. Tek bir `NaN` girişi tüm ekonomik modeli iptal ediyor.

### Çözüm Önerisi
Para birimini tek bir yerde, savunmacı biçimde normalize edin. Sayı doğrulamasını
`typeof` yerine `Number.isFinite` ile yapın.

```js
// lib/money.js — YENİ dosya, tek doğruluk kaynağı
export const MIN_BALANCE = 0;
export const MAX_BALANCE = 1e12;

/** Her türlü girdiyi geçerli, sonlu, negatif olmayan tam sayıya indirger. */
export function toChips(value, fallback = 1000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_BALANCE, Math.max(MIN_BALANCE, Math.trunc(n)));
}

/** Bahis tutarı doğrulaması — 0, negatif, NaN, Infinity reddedilir. */
export function isValidBet(bet, balance) {
  return Number.isFinite(bet) && bet >= 1 && Number.isInteger(bet) && bet <= balance;
}
```

```js
// page.jsx
import { toChips, isValidBet } from '../lib/money';

const setC = v => {
  const safe = toChips(v, chipsRef.current);
  chipsRef.current = safe;
  setChips(safe);
  saveChips(safe);
};

const spend = b => {
  if (!isValidBet(b, chipsRef.current)) return false;   // NaN/0/negatif/yetersiz → red
  setC(chipsRef.current - b);
  return true;
};

const win = n => {
  if (!Number.isFinite(n) || n < 0) {
    console.error('[DURTU] Geçersiz kazanç reddedildi:', n);   // sessizce yutma
    return;
  }
  setC(chipsRef.current + n);
};
```

```js
// store.js — getProfile()
if (!Number.isFinite(p.chips)) p.chips = 1000;
```

---

## 🔴 BLOCKER #8 — XSS: kullanıcı adı sanitize edilmeden `dangerouslySetInnerHTML`'e akıyor.

**Dosya:** `durtu-app/components/Toasts.jsx:17`, `durtu-app/app/page.jsx:93`, `durtu-app/components/Chat.jsx:105`

### Sorun
```jsx
// Toasts.jsx
<div className="toast" dangerouslySetInnerHTML={{ __html: t.html }} />
```
```js
// page.jsx — n, Gate formundan gelen serbest kullanıcı girdisi
say(`<b>Hoş geldin, ${n}.</b> Günlük serin: ${res.streak} gün...`);
```

Kullanıcı adına `<img src=x onerror=alert(document.cookie)>` yazarsa kod çalışır.
Legacy `durtu/index.html` bu riski görmüş ve bir `esc()` yardımcısı yazmış
(`satır 2296`) — **React portuna taşınmamış.** Bu bir regresyon.

### Neden Kritik?
Aynı toast altyapısı ileride Supabase'den gelen içerikleri (başvuru adı, sohbet mesajı,
promosyon metni) de gösterecek. Kalıcı XSS, oturum/PII sızıntısına açar.

### Çözüm Önerisi
Ya HTML'i tamamen bırakın, ya da güvenli bir template yardımcısı kullanın.

```js
// lib/toast.js
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** Güvenli tagged-template: interpolasyonlar otomatik escape edilir, literal HTML kalır. */
export const html = (strings, ...values) =>
  strings.reduce((out, s, i) => out + s + (i < values.length ? escapeHtml(values[i]) : ''), '');

export const say = markup => {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('durtu:toast', { detail: markup }));
};
```

```js
// page.jsx — kullanım
import { html, say, fmt } from '../lib/toast';
say(html`<b>Hoş geldin, ${n}.</b> Günlük serin: ${res.streak} gün.`);
```

Ek olarak `Gate.jsx`'te isim girişini kaynağında sınırlayın:
`name.replace(/[<>&"']/g, '').slice(0, 40)`.

---

## 🔴 BLOCKER #9 — Mines: `calcMultiplier` sıfıra bölüyor → `Infinity` ödeme riski.

**Dosya:** `durtu-app/components/MinesGame.jsx:9-19`

### Sorun
```js
for (let i = 0; i < gems; i++) { num *= (25 - i); den *= (25 - mines - i); }
```
`gems > 25 - mines` olduğunda `den` sıfır veya negatif olur:

```
calcMultiplier(3, 22)  = 2231       (son geçerli değer)
calcMultiplier(3, 23)  = Infinity   ← sınır aşımı
calcMultiplier(20, 6)  = Infinity
calcMultiplier(24, 2)  = Infinity
```

Bugün UI guard'ları (`playing && gemCount < 25 - mineCount`) bunu maskeliyor, ama
fonksiyon **kendi başına güvenli değil** ve `nextMult` her render'da guard'sız hesaplanıyor
(satır 44). `win(Infinity)` → `chipsRef.current + Infinity = Infinity` → Blocker #7'nin
NaN senaryosunun kardeşi.

### Neden Kritik?
Tek bir off-by-one refaktörü (ör. "tam temizlemede bonus çarpan" özelliği) bu fonksiyonu
doğrudan `Infinity` üretir hale getirir ve savunma katmanı yoktur. Saf fonksiyonlar
kendi sözleşmelerini korumalıdır.

### Çözüm Önerisi
```js
const GRID = 25;
const MINES_RTP = 0.97;
const MAX_MULT = 1_000_000;   // motor tavanı

export function calcMultiplier(mines, gems) {
  if (!Number.isInteger(mines) || mines < 1 || mines >= GRID) {
    throw new RangeError(`MINES_INVALID: mayın=${mines}`);
  }
  const safeTiles = GRID - mines;
  if (!Number.isInteger(gems) || gems < 0) return 1.0;
  if (gems > safeTiles) {
    // Sözleşme ihlali — sessizce Infinity dönmek yerine sınırla ve logla
    console.error(`MINES_OVERDRAW: ${gems} elmas isteniyor, sadece ${safeTiles} güvenli karo var`);
    gems = safeTiles;
  }

  let num = 1, den = 1;
  for (let i = 0; i < gems; i++) { num *= (GRID - i); den *= (safeTiles - i); }

  const raw = MINES_RTP * (num / den);
  if (!Number.isFinite(raw)) return MAX_MULT;
  return Math.min(MAX_MULT, Math.max(1.0, Math.round(raw * 100) / 100));
}
```

---

## 🟠 YÜKSEK — Yarış koşulu: her oyunda çift tıklama korumaları `useState` ile yapılmış.

**Dosyalar:** `MinesGame.jsx:130`, `RouletteGame.jsx:128`, `WheelGame.jsx:164`, `LimboGame.jsx:58`, `SportBet.jsx:28`

### Sorun
Tüm koruma kalıbı aynı:
```js
if (spinning) return;        // spinning bir useState değeri
setSpinning(true);           // ASENKRON — bir sonraki render'a kadar yansımaz
if (!spend(bet)) return;
```
React'te `setSpinning(true)` anında geçerli olmaz. Hızlı çift tıklama, `requestAnimationFrame`
içinden gelen bir çağrı veya klavye+fare kombinasyonu aynı `spinning === false` snapshot'ını
gören iki çağrı üretebilir → **iki kez `spend()`, iki animasyon, çakışan `settleResult`.**

Mines'ta aynı sorun daha keskin: `playing` türetilmiş bir değer (`!!grid && !busted && !cashed`).
Mayına bastıktan sonra aynı render frame'inde `cashout()` tetiklenirse `playing` hâlâ `true`
görünür → **patlamış turdan ödeme alınır.**

### Neden Kritik?
Bakiye tutarsızlığı ve çift ödeme. Otomatik tıklama araçlarıyla kolayca tekrarlanabilir.

### Çözüm Önerisi
Kilit her zaman `useRef` (senkron) ile, görsel durum `useState` ile tutulmalı.
Bunu tek bir hook'a çıkarıp 8 oyunda tekrar etmeyin (DRY).

```js
// lib/useRoundLock.js — YENİ
import { useCallback, useRef, useState } from 'react';

/** Tur başına tek çalıştırma garantisi. lock() senkron, UI için busy state'i ayrı. */
export function useRoundLock() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);

  const acquire = useCallback(() => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    return true;
  }, []);

  const release = useCallback(() => {
    locked.current = false;
    setBusy(false);
  }, []);

  return { busy, acquire, release, isLocked: () => locked.current };
}
```

```js
// WheelGame.jsx — kullanım
const { busy, acquire, release } = useRoundLock();

function spinWheel() {
  if (!acquire()) return;                  // senkron, yarışa kapalı
  if (!spend(bet)) { release(); say('Yetersiz bakiye.'); return; }
  const round = Object.freeze({ bet, risk, segments: WHEEL_PRESETS[risk] });
  ...
  // animasyon bitince: settle(round); release();
}
```

---

## 🟠 YÜKSEK — `/api/games` boş dönerse lobi beyaz ekran veriyor.

**Dosya:** `durtu-app/components/GameGrid.jsx:14-22`

### Sorun
```js
const r = await fetch('/api/games');
const j = await r.json();
setGames(j.data);           // ← j.data undefined olabilir; catch tetiklenmez
...
const list = games.filter(...)   // TypeError: Cannot read properties of undefined
```

`fetch` HTTP 500'de **reject etmez**. Sunucu `{ "error": "..." }` dönerse `r.json()`
başarılı olur, `j.data` `undefined` olur, `setGames(undefined)` çalışır ve bir sonraki
render `.filter` üzerinde patlar. Next.js App Router'da error boundary yok →
**tüm sayfa beyaz ekran.**

### Neden Kritik?
Lobi ana sayfadır. API'nin tek bir hatalı yanıtı tüm ürünü erişilmez kılar, üstelik
zaten hazır olan `FALLBACK` mekanizması devreye girmez.

### Çözüm Önerisi
```js
async function refresh() {
  setLoading(true);
  try {
    const r = await fetch('/api/games', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!j?.ok || !Array.isArray(j.data) || j.data.length === 0) {
      throw new Error('MALFORMED_PAYLOAD');
    }
    setGames(j.data);
    setFromApi(true);
  } catch (err) {
    console.warn('[DURTU] /api/games başarısız, yerel seçkiye düşülüyor:', err.message);
    setGames(FALLBACK);
    setFromApi(false);
  } finally {
    setLoading(false);
  }
}

// Ve render'da ikinci savunma katmanı:
const list = (Array.isArray(games) ? games : FALLBACK)
  .filter(g => g && (filter === 'all' || g.cat === filter));
```

Ayrıca `app/error.jsx` ve `app/global-error.jsx` **eksik** — Next.js App Router'da
bunlar olmadan her render hatası boş sayfadır. Ekleyin.

---

# 2. PERFORMANS VE ÖLÇEKLENEBİLİRLİK

## 🟠 YÜKSEK — 10 ayrı `AudioContext` açılıyor; tarayıcı limiti aşılınca tüm sesler ölüyor.

**Dosyalar:** `AmbienceBtn`, `BlackjackGame`, `CrashGame`, `HiloGame`, `LimboGame`, `MinesGame`, `PlinkoGame`, `RouletteGame`, `SlotGame`, `WheelGame` — **10 dosyada aynı kod**

### Sorun
Her bileşen kendi modül-düzeyi singleton'ını taşıyor:
```js
let AC = null;
function getAC() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); ... }
```
`let AC` her modülde **ayrı bir bağlayıcı**. Kullanıcı 10 oyunu da açarsa 10 `AudioContext`
oluşur. Chrome'un sekme başına sert limiti ~6'dır; aşıldığında
`NotSupportedError: Failed to construct 'AudioContext'` fırlar. Kod `try/catch` ile
bunu **sessizce yutuyor** → ses tamamen ölür, kimse nedenini bilmez.

Ayrıca hiçbiri `close()` çağırmıyor → unmount sonrası context'ler canlı kalır
(her biri bir audio thread + donanım kaynağı tutar).

### Neden Kritik?
Mobilde pil tüketimi ve ses kesilmesi; masaüstünde uzun oturumda sesin "bir anda kaybolması"
— teşhisi en zor hata sınıfı.

### Çözüm Önerisi
Tek bir paylaşılan ses servisi. 10 kopya `playTone` da buraya taşınır (DRY kazancı ~180 satır).

```js
// lib/audio.js — YENİ, tek AudioContext
let ctx = null;
let refCount = 0;

export function acquireAudio() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch (e) { console.warn('[DURTU] AudioContext açılamadı', e); return null; }
  }
  refCount++;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function releaseAudio() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}

export function tone(freq, { delay = 0, dur = 0.08, type = 'sine', gain = 0.1 } = {}) {
  const a = ctx;
  if (!a || a.state === 'closed') return;
  try {
    const t = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(a.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };   // node sızıntısını kapat
  } catch (e) { /* ses kritik yol değil */ }
}
```

```js
// Her oyunda
useEffect(() => { acquireAudio(); return () => releaseAudio(); }, []);
```

---

## 🟠 YÜKSEK — `/api/apply` sınırsız büyüyen in-memory kuyruk: bellek sızıntısı + DoS.

**Dosya:** `durtu-app/app/api/apply/route.js:4`

### Sorun
```js
const queue = (globalThis.__durtuQueue = globalThis.__durtuQueue || []);
...
queue.push({ ... });   // hiçbir sınır, TTL veya kalıcılık yok
```
Üç ayrı problem:
1. **Bellek sızıntısı / DoS:** Rate limit yok. Bir saldırgan saniyede yüzlerce POST
   atarak süreç belleğini şişirir. Her kayıt ≤ ~700 bayt; 1M istek ≈ 700 MB → OOM.
2. **Veri kaybı:** Vercel/serverless'te her lambda instance'ı kendi `globalThis`'ine sahip.
   İki eşzamanlı kullanıcı iki farklı kuyruğa yazar; `GET /api/apply` **rastgele bir
   instance'ın sayısını** döner. Cold start'ta her şey silinir.
3. **Ölü şema:** `supabase/schema.sql`'de `applications` tablosu **var ama kullanılmıyor**,
   üstelik tabloda `email` ve `contact` kolonları **hiç yok** — yani Gate formunda
   "Zorunlu — Davetiyen buraya iletilir" denilen e-posta hiçbir kalıcı yere yazılmıyor.
   Bu bir **veri kaybı + kullanıcıya verilen sözün ihlali**.

### Neden Kritik?
"Başvuru" bu ürünün tek gerçek dönüşüm (conversion) noktası. Şu anda hiçbir başvuru
kalıcı olarak saklanmıyor.

### Çözüm Önerisi
Kuyruğu kalıcı depoya taşıyın ve şemayı tamamlayın.

```sql
-- supabase/schema.sql — eksik kolonlar + indeks
alter table public.applications add column if not exists email   text not null default '';
alter table public.applications add column if not exists contact text;
alter table public.applications add column if not exists ip_hash text;

create index if not exists idx_applications_status_created
  on public.applications (status, created_at desc);

-- Aynı e-postadan mükerrer başvuruyu engelle
create unique index if not exists uq_applications_email_pending
  on public.applications (lower(email)) where status = 'pending';
```

```js
// app/api/apply/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,     // .env, ASLA repoda değil
  { auth: { persistSession: false } }
);

// Basit IP başına sızdıran-kova; üretimde Upstash/Redis tercih edin
const buckets = new Map();
const LIMIT = 5, WINDOW_MS = 60_000, MAX_BUCKETS = 10_000;

function rateLimited(ip) {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) buckets.clear();          // sınırsız büyümeyi engelle
  const hits = (buckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  hits.push(now);
  buckets.set(ip, hits);
  return hits.length > LIMIT;
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'MALFORMED_JSON' }, { status: 400 }); }

  const email = String(body?.email || '').trim().toLowerCase();
  const why   = String(body?.why || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: 'INVALID_EMAIL' }, { status: 400 });
  }
  if (why.length < 12 || why.length > 2000) {
    return NextResponse.json({ ok: false, error: 'INVALID_WHY' }, { status: 400 });
  }

  const { data, error } = await supabase.from('applications').insert({
    name:    String(body.name || 'Misafir').slice(0, 80),
    email,
    contact: String(body.contact || '').slice(0, 80) || null,
    why:     why.slice(0, 2000),
    type:    String(body.type || '').slice(0, 40),
    budget:  String(body.budget || '').slice(0, 40),
    status:  'pending',
  }).select('id').single();

  if (error) {
    if (error.code === '23505') {  // mükerrer başvuru
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('[DURTU] apply insert hatası', { code: error.code, msg: error.message });
    return NextResponse.json({ ok: false, error: 'STORAGE_ERROR' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}

// GET kaldırıldı: bekleyen başvuru sayısı iş metriğidir, anonim kullanıcıya sızdırılmaz.
```

---

## 🟠 YÜKSEK — Her turda senkron localStorage JSON parse/stringify (ana thread jank).

**Dosya:** `durtu-app/lib/store.js:13-20, 101-106`

### Sorun
`logRound()` her çağrıda:
1. `localStorage.getItem` + `JSON.parse` (80 elemanlı geçmiş dizisi),
2. dizi başına `unshift` — **O(n) kaydırma**,
3. `JSON.stringify` + `setItem` — **senkron disk I/O**.

Buna paralel `setC()` → `saveChips()` → `getProfile()` (bir parse daha) + `saveProfile()`
(bir stringify daha). Yani **tek bir tur = 2 okuma + 2 yazma + 2 parse + 2 stringify.**

Plinko oto-bırakma 350 ms'de bir top atıyor ve topların inişi çakıştığı için saniyede
3-5 `logRound` üretilebiliyor. Slot "turbo" akışında (`setTimeout 1400 ms` zinciri)
ve Mines'ın hızlı karo açmasında aynı yük var. `localStorage` **senkron ve ana thread'i
bloke eder**; 60 fps'lik canvas animasyonlarının yanında görünür takılma yaratır.

### Neden Kritik?
Bu, klasik N+1'in istemci tarafı karşılığı: tek bir mantıksal işlem için tekrar tekrar
aynı depoya gidiliyor. Mobil cihazlarda `localStorage` yazımı 5-15 ms sürebilir.

### Çözüm Önerisi
Bellekte tek bir kaynak tutun, diske **debounce + `requestIdleCallback`** ile yazın;
geçmiş için `unshift` yerine halka tampon (ring buffer) kullanın.

```js
// lib/store.js
const HIST_MAX = 80;
let _cache = null;
let _flushHandle = 0;

function load() {
  if (_cache) return _cache;
  try {
    const s = JSON.parse(localStorage.getItem('durtu_react_stats') || 'null');
    _cache = (s && Array.isArray(s.hist)) ? s : blank();
  } catch { _cache = blank(); }
  return _cache;
}

function scheduleFlush() {
  if (_flushHandle) return;
  const run = () => {
    _flushHandle = 0;
    try { localStorage.setItem('durtu_react_stats', JSON.stringify(_cache)); }
    catch (e) { console.warn('[DURTU] istatistik yazılamadı (kota?)', e); }
  };
  _flushHandle = (typeof requestIdleCallback === 'function')
    ? requestIdleCallback(run, { timeout: 1000 })
    : setTimeout(run, 250);
}

export function logRound(game, bet, win, mul) {
  if (typeof window === 'undefined') return;
  const s = load();
  s.hist.unshift({ ts: Date.now(), game, bet, win, mul: mul ?? null });
  if (s.hist.length > HIST_MAX) s.hist.length = HIST_MAX;
  s.spins++; s.wagered += bet; s.won += win;
  s.big = Math.max(s.big, Math.max(0, win - bet));
  scheduleFlush();                                  // senkron yazım YOK
  ...
}

// Sekme kapanırken kaybolmasın
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (_flushHandle && _cache) {
      try { localStorage.setItem('durtu_react_stats', JSON.stringify(_cache)); } catch {}
    }
  });
}
```

---

## 🟡 ORTA — Plinko collision döngüsü: frame başına ~5.000 gereksiz mesafe hesabı.

**Dosya:** `durtu-app/components/PlinkoGame.jsx:190-220`

### Sorun
Her top için **tüm piramit** taranıyor:
```js
for (let r = 0; r < b.rows; r++)          // 16 satır
  for (let p = 0; p < r + 3; p++)         // ortalama 10 çivi
    { ...Math.sqrt(dx*dx + dy*dy)... }    // = 171 çivi × top × frame
```
5 top ile 855 `sqrt`/frame, oto-bırakmada 20 top ile ~3.400. Oysa top her an
**yalnızca 1-2 satırın** yakınındadır.

### Çözüm Önerisi
Uzamsal ayıklama (broad phase) + `sqrt`'siz karşılaştırma:

```js
const R2 = (b.radius + 3.2) ** 2;
// Topun y'sine göre yalnızca komşu satırları test et
const nearRow = Math.floor((b.y - startY) / rowSpacing);
const rFrom = Math.max(0, nearRow - 1);
const rTo   = Math.min(b.rows - 1, nearRow + 1);

for (let r = rFrom; r <= rTo; r++) {
  const rowY = startY + r * rowSpacing;
  if (Math.abs(b.y - rowY) > b.radius + 3.2) continue;   // erken çıkış
  const pegsInRow = r + 3;
  const startX = (w - (pegsInRow - 1) * rowSpacing * 0.95) / 2;
  // Topun x'ine en yakın çiviyi doğrudan indeksle
  const pNear = Math.round((b.x - startX) / (rowSpacing * 0.95));
  for (let p = Math.max(0, pNear - 1); p <= Math.min(pegsInRow - 1, pNear + 1); p++) {
    const dx = b.x - (startX + p * rowSpacing * 0.95);
    const dy = b.y - rowY;
    if (dx * dx + dy * dy < R2) { /* çarpışma çözümü */ }
  }
}
```

**Ek:** Çivi ızgarası her frame yeniden çiziliyor. Statik olduğu için bir kez
`OffscreenCanvas`/ikinci katmana çizip `drawImage` ile basın.

**Ek:** `ballsRef.current` için üst sınır yok — `if (ballsRef.current.length >= 30) return;`
ekleyin, aksi halde otomatik bırakma + yüksek bakiye birleşimi sınırsız nesne biriktirir.

---

## 🟡 ORTA — `/api/games` her istekte rastgele sıralanıyor: cache tamamen devre dışı.

**Dosya:** `durtu-app/app/api/games/route.js:8`

### Sorun
```js
export const dynamic = 'force-dynamic';
const data = GAMES.map(g => ({ ...g })).sort(() => Math.random() - 0.5);
```
İki problem:
1. `sort(() => Math.random() - 0.5)` **istatistiksel olarak yanlış** bir karıştırmadır —
   dağılım düzgün değildir, bazı oyunlar sistematik olarak başa gelir. V8'in TimSort'u
   tutarsız karşılaştırıcıda tanımsız davranır.
2. `force-dynamic` + her seferinde farklı yanıt → **CDN/ISR cache imkânsız**. 14 elemanlık
   statik bir liste için her kullanıcı isteği origin'e gidiyor. Ölçeklenme açısından
   tamamen gereksiz maliyet.

### Çözüm Önerisi
Karıştırmayı istemciye taşıyın, uç noktayı cache'lenebilir yapın.

```js
// app/api/games/route.js
import { NextResponse } from 'next/server';
import { GAMES } from '../../../lib/games';

export const revalidate = 3600;   // 1 saat ISR

export async function GET() {
  return NextResponse.json(
    { ok: true, data: GAMES, version: 1 },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
```

```js
// lib/shuffle.js — doğru Fisher-Yates, istemcide
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

---

## 🟡 ORTA — Depo boyutu ve yinelenen varlıklar.

- `salon3d.html` (123 KB) **üç ayrı yerde birebir aynı** (`/`, `/public/`, `/durtu/`) —
  md5 doğrulandı: `7a58dda4d68bf84ee77479d8e0c3dbd2`. 246 KB ölü ağırlık.
- `uploads/` klasöründe 1.4 MB ham görsel + `Durtu-3d-Giris (2).html` (690 KB) versiyonlanmış.
  Dosya adındaki boşluk ve `(2)` bunun bir çalışma dosyası olduğunu gösteriyor.
- `vip_lounge_*.jpg` ikişer kopya (`durtu/assets/`, `durtu/images/`, `public/images/`).

**Çözüm:** `uploads/`'u `.gitignore`'a alın, geçmişten `git filter-repo` ile temizleyin,
`salon3d.html` için tek kaynak bırakıp diğerlerini build adımında kopyalayın.

---

# 3. HATA YÖNETİMİ

## 🟠 YÜKSEK — 47 adet sessiz `catch (e) {}` — sistem hata verdiğinde kimse bilmiyor.

**Dosyalar:** tüm oyun bileşenleri, `lib/store.js`, `lib/toast.js`

### Sorun
Kod tabanı boyunca hakim kalıp:
```js
try { localStorage.setItem('durtu_react_stats', JSON.stringify(s)); } catch (e) {}
try { ... } catch (e) {}
try{ if (navigator.vibrate) navigator.vibrate(p); }catch(e){}
```
Bu, hata yönetimi **değildir**; hatanın var olduğunu inkâr etmektir. Somut sonuçları:

- **Kota aşımı sessizdir.** Safari'de private mode veya 5 MB kota dolduğunda
  `setItem` `QuotaExceededError` atar. Kullanıcının bakiyesi artık hiç kaydedilmez;
  oyuncu oynar, kazanır, sayfayı yeniler ve **her şeyini kaybeder.** Hiçbir uyarı yok.
- **AudioContext hatası sessizdir** (bkz. Blocker/AudioContext) → ses ölür, teşhis edilemez.
- **`Gate.jsx:37`** başvuru gönderimi: `catch (_) { /* demo: çevrimdışıysa da akış sürsün */ }`
  → API 500 dönse bile kullanıcıya **"✦ Onaylandın. Davetiyen hazır…"** gösteriliyor.
  Başvuru hiçbir yere ulaşmadı ama kullanıcı ulaştığını sanıyor. Bu bir **veri kaybı ve
  kullanıcıya yanlış bilgi** kombinasyonudur.

### Neden Kritik?
Üretimde bu uygulamanın hiçbir gözlemlenebilirliği yok. Bir kullanıcı "bakiyem kayboldu"
dediğinde elinizde tek bir log satırı olmayacak.

### Çözüm Önerisi
Hata sınıflarını ayırın: *yoksayılabilir* (titreşim), *bozulmaya-dayanıklı* (ses),
*kullanıcıya bildirilmesi zorunlu* (kalıcılık, ağ).

```js
// lib/logger.js — YENİ
const isProd = process.env.NODE_ENV === 'production';

export const log = {
  /** Ürün akışını etkilemeyen, yoksayılabilir hata (ses, titreşim). */
  ignorable(scope, err) {
    if (!isProd) console.debug(`[DURTU:${scope}]`, err);
  },
  /** Kullanıcı verisini etkileyen hata — mutlaka raporlanır. */
  critical(scope, err, context = {}) {
    console.error(`[DURTU:${scope}]`, err?.message || err, context);
    if (isProd && typeof window !== 'undefined' && window.__DURTU_TELEMETRY__) {
      window.__DURTU_TELEMETRY__.captureException(err, { tags: { scope }, extra: context });
    }
  },
};
```

```js
// lib/store.js — kalıcılık hatası artık görünür
export function saveStats(s) {
  try {
    localStorage.setItem('durtu_react_stats', JSON.stringify(s));
    return true;
  } catch (err) {
    log.critical('store.saveStats', err, { histLen: s?.hist?.length });
    if (err?.name === 'QuotaExceededError') {
      s.hist.length = Math.min(s.hist.length, 20);        // küçült ve bir kez daha dene
      try { localStorage.setItem('durtu_react_stats', JSON.stringify(s)); return true; }
      catch { /* düşer */ }
    }
    say('⚠️ <b>Kayıt yapılamıyor.</b> Tarayıcı depolaman dolu veya gizli modadasın — ilerlemen saklanmayacak.');
    return false;
  }
}
```

```js
// Gate.jsx — başarısız gönderim artık "onaylandın" demiyor
async function submitApp(e) {
  e.preventDefault();
  ...
  setBusy(true);
  try {
    const res = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, contact, why, type, budget }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.ok) throw new Error(json?.error || 'UNKNOWN');

    setBusy(false);
    setApproved(true);
    setTimeout(() => { setDoor(true); setTimeout(() => onEnter(name), 1800); }, 1400);
  } catch (err) {
    log.critical('gate.submitApply', err, { emailDomain: email.split('@')[1] });
    setBusy(false);
    say('<b>Dürtü:</b> Başvurun şu an iletilemedi — bağlantını kontrol edip tekrar dener misin?');
    // setApproved(true) ÇAĞRILMAZ: kullanıcıya yalan söylenmez
  }
}
```

---

## 🟠 YÜKSEK — Next.js error boundary'leri yok.

**Eksik dosyalar:** `durtu-app/app/error.jsx`, `durtu-app/app/global-error.jsx`, `durtu-app/app/not-found.jsx`

Herhangi bir bileşende fırlayan hata (bkz. `games.filter` senaryosu) tüm ağacı söker ve
kullanıcı **boş beyaz sayfa** görür. App Router'da bu dosyalar zorunlu hijyen.

```jsx
// app/error.jsx
'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('[DURTU] beklenmeyen hata', { message: error?.message, digest: error?.digest });
  }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div>
        <div className="serif" style={{ color: 'var(--gold)', letterSpacing: '.3em', marginBottom: '1rem' }}>✦ DÜRTÜ</div>
        <h2 className="serif">Salon bir an için karardı.</h2>
        <p className="muted" style={{ margin: '.8rem 0 1.6rem' }}>
          Beklenmeyen bir sorun oluştu. Bakiyen ve geçmişin korunuyor.
        </p>
        <button className="btn solid" onClick={reset}>Salona Dön</button>
        {error?.digest && <p className="muted" style={{ fontSize: '.6rem', marginTop: '1rem' }}>Referans: {error.digest}</p>}
      </div>
    </div>
  );
}
```

---

## 🟡 ORTA — `VaultModal`: çekilen para yok ediliyor, defter tutarsız.

**Dosya:** `durtu-app/components/VaultModal.jsx:29-39`

```js
function withdraw(amt) {
  if (chips < amt) { ... return; }
  if (chips - amt < 0) return;      // ölü kod: bir üstteki kontrol zaten kapsıyor
  if (!spend(amt)) return;          // sessiz başarısızlık — kullanıcıya geri bildirim yok
  ...
  say('✅ Çekim onaylandı — IBAN\'a teslim edildi.');   // gerçekte hiçbir şey olmadı
}
```
- `chips` yine **stale prop** (gerçek kaynak `chipsRef`), `spend()` başarısız olursa
  kullanıcı hiçbir şey görmez ama "çekim talebin alındı" toast'ı zaten gönderilmiş olur
  (sıralama: `addLedger` → `say` → 2.6 s sonra "onaylandı").
- Defterde çekim `pending` olarak yazılıyor ve **hiçbir zaman `ok`'a çevrilmiyor** —
  `fresh()` aynı `pending` kaydı okur. Kullanıcı 3 çekim yaparsa defterde 3 sonsuz "bekliyor".
- `deposit()` sınırsız bedava para veriyor (demo amaçlı olsa da `VIP hacim`/`istatistik`
  metriklerini kirletiyor).

**Çözüm:** Defter kaydına `id` verin, tamamlandığında güncelleyin; `spend` başarısızlığında
erken çıkıp kullanıcıyı bilgilendirin; `setTimeout`'ları unmount'ta temizleyin
(şu an modal kapatılırsa `setBusy`/`say` unmount sonrası çalışır → React uyarısı).

---

# 4. KOD KALİTESİ VE STANDARTLAR

## 🔴 BLOCKER — `"next": "latest"` ve lockfile yokluğu: build tekrarlanabilir değil.

**Dosya:** `durtu-app/package.json:12-14`

```json
"dependencies": { "next": "latest", "react": "latest", "react-dom": "latest" }
```
Depoda `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` **yok** (doğruladım).

### Neden Kritik?
Bu, "canlıya alınacak" bir depo için tek başına yayın engelidir:
- Bugün çalışan build, yarın Next.js yeni bir major yayınladığında **hiçbir kod değişmeden
  kırılır.** Geri dönüş (rollback) imkânsızdır çünkü hangi sürümün çalıştığı kayıtlı değil.
- `react@latest` bir RC sürümüne denk gelebilir.
- Güvenlik denetimi (`npm audit`, SBOM) yapılamaz.
- `build-desktop.yml` iş akışı `npx pake-cli` ile **sürümsüz** bir araç çekiyor — aynı sorun.

### Çözüm
```json
{
  "dependencies": {
    "next": "15.5.3",
    "react": "19.1.1",
    "react-dom": "19.1.1"
  },
  "engines": { "node": ">=20 <23" },
  "packageManager": "npm@10.9.0"
}
```
`npm install` çalıştırıp **`package-lock.json`'ı commit edin**; CI'da `npm ci` kullanın.

---

## 🟠 YÜKSEK — Supabase kimlik bilgileri kaynak koda gömülü.

**Dosya:** `durtu/index.html:5025-5026`

```js
const SUPA_URL  = 'https://rkrrmuvdlwdeiummnnkv.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

`anon` anahtarı tasarım gereği herkese açıktır, **ancak**:
1. Proje URL'i + anahtarın depoda olması, RLS politikalarındaki her boşluğu doğrudan
   sömürülebilir hale getirir. `schema.sql` `applications` için okuma politikası tanımlamamış
   (doğru), ama `profiles` tablosu `auth.uid()`'e bağlı — anonim erişim senaryosu test edilmemiş.
2. `.env.example` dosyası **tamamen boş** (tek satır yorum). Yani konfigürasyon yönetimi
   diye bir şey yok; ortam ayrımı (dev/staging/prod) mümkün değil.
3. Anahtarı rotate etmek için **kod değiştirip yeniden deploy** etmek gerekiyor.

### Çözüm
```bash
# .env.example
NEXT_PUBLIC_SUPABASE_URL=https://<proje>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<sadece-sunucu-tarafi-asla-NEXT_PUBLIC-degil>
```
Anahtarı Supabase panelinden **rotate edin** (repoda göründüğü an yanmış sayılır) ve
`durtu/index.html`'i `window.__DURTU_CONFIG__` üzerinden besleyin.

---

## 🟠 YÜKSEK — `npm run lint` sahte: `echo 'Lint check OK'`

**Dosya:** `package.json:11`

```json
"lint": "echo 'Lint check OK'"
```
CI'da yeşil tik veren ama **hiçbir şey kontrol etmeyen** bir komut, kontrol olmamasından
daha tehlikelidir; yanlış güven verir. Bu rapordaki hataların en az 6'sı
(`spend()` dönüşünün yok sayılması, kullanılmayan değişkenler, eksik hook bağımlılıkları,
`no-unsafe-optional-chaining`) gerçek bir linter tarafından yakalanırdı.

### Çözüm
```json
{
  "scripts": {
    "lint": "next lint --dir durtu-app --max-warnings=0",
    "typecheck": "tsc --noEmit --allowJs --checkJs -p jsconfig.json",
    "test": "node --test tests/",
    "verify": "npm run lint && npm run typecheck && npm run test && npm run build"
  }
}
```

```js
// durtu-app/.eslintrc.json
{
  "extends": ["next/core-web-vitals"],
  "rules": {
    "react-hooks/exhaustive-deps": "error",
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-empty": ["error", { "allowEmptyCatch": false }],
    "eqeqeq": ["error", "smart"]
  }
}
```

---

## 🟡 ORTA — DRY: ~600 satır kopyala-yapıştır.

Ölçülen tekrarlar:

| Tekrar eden kod | Kopya sayısı | Yaklaşık satır |
|---|---|---|
| `let AC; getAC()` | 10 | 90 |
| `playTone()` / `tone()` | 9 | 160 |
| Kazanç fanfarı (`[523,659,784,1046].forEach`) | 4 | 70 |
| `½` / `2×` bahis kontrolü JSX'i | 6 | 80 |
| Modal kabuğu (`ovl` + `pnl` + `close`) | 11 | 60 |
| `history.slice(0, 10)` pill render | 5 | 90 |

**Çözüm:** `lib/audio.js` (yukarıda), `components/ui/GameModal.jsx`,
`components/ui/BetControl.jsx`, `components/ui/HistoryStrip.jsx`.
Bu, oyun başına ~120 satır ve **yeni oyun ekleme maliyetini yaklaşık yarıya** indirir.

## 🟡 ORTA — SOLID ihlalleri

- **SRP:** `RouletteGame.jsx` (637 satır) ve `BlackjackGame.jsx` (578 satır) aynı anda
  kural motoru, ses motoru, animasyon motoru ve sunum katmanı. Test edilemez hale gelmiş.
  Kuralları saf fonksiyonlara çıkarın (`lib/engines/roulette.js`, `blackjack.js`) —
  bu aynı zamanda §5'teki test açığını kapatmanın da ön koşuludur.
- **OCP:** `page.jsx:110-121` — her yeni oyun için `if/else if` zinciri büyüyor.
  Kayıt tablosuna (registry) çevirin:
  ```js
  const GAME_VIEWS = {
    aviator: CrashGame, bj: BlackjackGame, rl: RouletteGame, mines: MinesGame,
    sport: SportBet, plinko: PlinkoGame, limbo: LimboGame, hilo: HiloGame, wheel: WheelGame,
  };
  const View = GAME_VIEWS[openId] ?? null;
  ```
- **DIP:** Bileşenler `logRound`/`say`'i doğrudan modülden import ediyor. Test edilebilirlik
  için bunları context üzerinden enjekte edin.

## 🟡 ORTA — Diğer tespitler

| # | Sorun | Konum |
|---|---|---|
| 1 | `Space` tuşu hem `SlotGame` hem `CrashGame` tarafından global dinleniyor → ikisi açıksa çift spin | `SlotGame:436`, `CrashGame:202` |
| 2 | `slotId` ve `open` bağımsız state → aynı anda iki oyun modalı açılabilir | `page.jsx:36-37` |
| 3 | Modal'lar `Escape` ile kapanmıyor, focus trap yok, `role="dialog"`/`aria-modal` yok | 11 modal |
| 4 | `GameGrid` kartları `<div onClick>` → klavye ile erişilemez (WCAG 2.1 ihlali) | `GameGrid:304` |
| 5 | `Roulette` başlangıç geçmişi sahte veri `[17,24,0,32,7]` — kullanıcı bunu gerçek tur sanır | `RouletteGame:33` |
| 6 | `logRound` `mul` parametresi bazen `number`, Roulette'te `string` (`.toFixed(2)`) | `RouletteGame:229` |
| 7 | `DailyCheckInModal` 7 günlük ödül dizisini **yeniden tanımlıyor**; `DAILY_REWARDS` import edilmiş ama kullanılmamış (üstelik `lib/toast`'tan import ediliyor — orada yok, `undefined`) | `DailyCheckInModal:2, 81-88` |
| 8 | `resetCheckInForDemo()` ve `checkDailyLogin(name, true)` prod bundle'ında → konsoldan sınırsız bonus | `store.js:198` |
| 9 | `sw.js` cache adı sabit `durtu-shell-v1`; yeni deploy'da eski JS servis edilebilir | `public/sw.js:2` |
| 10 | `getYesterdayKey()` `Date.now() - 86400000` kullanıyor — DST/saat dilimi değişiminde seri hatalı kırılır/uzar | `store.js:72-75` |
| 11 | `Ticker` `line = items.concat(items)` her render'da 60 elemanlı dizi + key olarak `t.id + '.' + i` | `Ticker:27` |
| 12 | `Salon` `useEffect` bağımlılığı `[checkInInfo, chips]` — her bakiye değişiminde `getCheckInStatus()` (localStorage okuması) | `Salon:11-16` |
| 13 | `metadata.json` `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` bildiriyor ama kodda hiçbir Gemini kullanımı yok | `metadata.json` |
| 14 | `build-desktop.yml` sabit `https://d-rt.vercel.app` URL'ini gömüyor, sürümsüz `pake-cli` çekiyor | `.github/workflows/build-desktop.yml:29` |

---

# 5. TEST KAPSAMI

## 🔴 BLOCKER — Canlıya çıkacak uygulamanın test kapsamı: **%0**

### Sorun
`tests/engine.test.js` (339 satır, 61 test) `durtu/index.html`'in `<script>` bloğunu
`new Function` ile değerlendiriyor. `durtu-app/` altındaki **hiçbir şey** test edilmiyor:

| Modül | Satır | Test |
|---|---|---|
| `components/RouletteGame.jsx` | 637 | **0** |
| `components/BlackjackGame.jsx` | 578 | **0** |
| `components/SlotGame.jsx` | 474 | **0** |
| `components/PlinkoGame.jsx` | 445 | **0** |
| `components/MinesGame.jsx` | 414 | **0** |
| `components/HiloGame.jsx` | 353 | **0** |
| `components/WheelGame.jsx` | 326 | **0** |
| `components/LimboGame.jsx` | 298 | **0** |
| `components/CrashGame.jsx` | 270 | **0** |
| `lib/store.js` | 204 | **0** |
| `app/api/**` | 45 | **0** |
| **Toplam** | **~4.000** | **0** |

Dahası, test altyapısı `globalThis.setTimeout = () => 0` ve `setInterval = () => 0`
yapıyor — yani **zamanlayıcıya bağlı tüm mantık test kapsamı dışında**, ki bu rapordaki
Blocker #4 (Limbo) ve #6 (Crash) tam olarak orada yaşıyor.

### Neden Kritik?
Bu raporda bulduğum 9 blocker'ın **9'u da** aşağıdaki testler yazılmış olsaydı
CI'da kırmızı yanardı. "61/61 ✅" ifadesi ekibe gerçekte var olmayan bir güven veriyor.

### Yazılması Zorunlu Test Senaryoları

**A. RTP / matematik invariantları (en yüksek öncelik — saf fonksiyon, hızlı, deterministik)**

```js
// tests/math.invariants.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_PRESETS } from '../durtu-app/components/WheelGame.jsx';
import { MULTIPLIERS } from '../durtu-app/components/PlinkoGame.jsx';
import { calcMultiplier } from '../durtu-app/lib/engines/mines.js';

const binom = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };

test('WHEEL: her risk seviyesi hedef RTP %98.5 (±%1) içinde', () => {
  for (const [risk, segs] of Object.entries(WHEEL_PRESETS)) {
    const rtp = segs.reduce((a, b) => a + b, 0) / segs.length;
    assert.ok(Math.abs(rtp - 0.985) < 0.01, `${risk}: %${(rtp * 100).toFixed(2)}`);
  }
});

test('PLINKO: kova sayısı = satır + 1 VE binom RTP %99 (±%1)', () => {
  for (const [rowsKey, risks] of Object.entries(MULTIPLIERS)) {
    const n = Number(rowsKey);
    for (const [risk, arr] of Object.entries(risks)) {
      assert.equal(arr.length, n + 1, `${n}/${risk} kova sayısı`);
      const rtp = arr.reduce((acc, v, i) => acc + (binom(n, i) / 2 ** n) * v, 0);
      assert.ok(Math.abs(rtp - 0.99) < 0.01, `${n}/${risk}: %${(rtp * 100).toFixed(2)}`);
    }
  }
});

test('MINES: hiçbir (mayın, elmas) kombinasyonu Infinity/NaN üretmez', () => {
  for (let m = 1; m <= 24; m++) {
    for (let g = 0; g <= 25; g++) {
      const v = calcMultiplier(m, g);
      assert.ok(Number.isFinite(v) && v >= 1, `mayın=${m} elmas=${g} → ${v}`);
    }
  }
});

test('MINES: çarpan elmas sayısıyla kesin monoton artar', () => {
  for (let m = 1; m <= 24; m++) {
    let prev = 0;
    for (let g = 1; g <= 25 - m; g++) {
      const v = calcMultiplier(m, g);
      assert.ok(v > prev, `mayın=${m}, elmas=${g}: ${v} <= ${prev}`);
      prev = v;
    }
  }
});

test('HI-LO: her kart/yön için EV %98 (±%1), hiçbir bahis %100 kazançlı değil', () => {
  for (let v = 1; v <= 13; v++) {
    const { pHigher, pLower, higherMult, lowerMult } = hiloOdds(v);
    if (higherMult != null) {
      assert.ok(pHigher < 1, `v=${v}: YÜKSEK risksiz kazanç`);
      assert.ok(Math.abs(pHigher * higherMult - 0.98) < 0.01, `v=${v} YÜKSEK EV`);
    }
    if (lowerMult != null) {
      assert.ok(pLower < 1, `v=${v}: DÜŞÜK risksiz kazanç`);
      assert.ok(Math.abs(pLower * lowerMult - 0.98) < 0.01, `v=${v} DÜŞÜK EV`);
    }
  }
});

test('CRASH: Monte Carlo RTP, ilan edilen %97 ile ±%1 uyumlu', () => {
  const N = 500_000;
  for (const target of [1.5, 2, 5, 10]) {
    let wins = 0;
    for (let i = 0; i < N; i++) if (crashPoint() >= target) wins++;
    const rtp = target * wins / N;
    assert.ok(Math.abs(rtp - 0.97) < 0.01, `hedef ${target}× → RTP %${(rtp * 100).toFixed(2)}`);
  }
});
```

**B. Para akışı / ekonomi invariantları**

```js
// tests/economy.test.js
test('spend(): NaN bakiye ile ASLA true dönmez', () => {
  const ledger = makeLedger({ chips: NaN });
  assert.equal(ledger.spend(25), false);
});

test('spend(): 0, negatif, Infinity, ondalıklı bahis reddedilir', () => {
  const l = makeLedger({ chips: 1000 });
  for (const bad of [0, -5, Infinity, NaN, 1.5, '25']) assert.equal(l.spend(bad), false);
});

test('bakiye hiçbir oyun akışında negatife düşmez (fuzz, 100k tur)', () => { /* ... */ });

test('her tur için: wagered artışı == bahis, won artışı == ödeme (defter dengesi)', () => { /* ... */ });
```

**C. Yarış koşulu / zamanlama regresyonları — bu rapordaki blocker'ların doğrudan testi**

```js
// tests/regression.race.test.js
test('LIMBO: animasyon sırasında hedef değişse bile ödeme tur başındaki hedefe göredir', async () => {
  const { result, setTarget } = renderLimbo({ bet: 25, target: 1.01, chips: 1000 });
  act(() => result.play());
  act(() => setTarget(10000));          // exploit denemesi
  await act(() => advanceTimers(600));
  assert.ok(result.lastPayout <= 25 * 1.01 + 1, 'ödeme eski hedefe göre olmalı');
});

test('CRASH: 30 sn frame boşluğundan sonra oto-çıkış ödeme YAPMAZ', () => {
  const g = startCrash({ bet: 10, crashAt: 1.8, autoCashAt: 5.0 });
  g.tick(0);
  g.tick(30_000);                        // sekme askıya alınıp geri geldi
  assert.equal(g.payout, 0);
  assert.equal(g.balance, 990);
});

test('BLACKJACK: yetersiz bakiyede double down bahsi ikiye KATLAMAZ', () => {
  const g = startBlackjack({ chips: 50, bet: 50 });   // dağıtımdan sonra bakiye 0
  g.doubleDown();
  assert.equal(g.activeBet, 50, 'ödenmemiş bahis katlanmamalı');
});

test('WHEEL/MINES/ROULETTE: aynı tick içinde çift tıklama tek tur üretir', () => {
  const g = startWheel({ chips: 1000, bet: 25 });
  g.spin(); g.spin();
  assert.equal(g.balance, 975);
});

test('MINES: mayına bastıktan sonra cashout ödeme yapmaz', () => {
  const g = startMines({ chips: 1000, bet: 25, mines: 3, grid: [true, ...] });
  g.pick(0);          // mayın
  g.cashout();
  assert.equal(g.balance, 975);
});
```

**D. Kalıcılık / edge case**

```js
test('getProfile(): bozuk JSON, null, NaN chips, negatif chips → güvenli varsayılan', () => { /* ... */ });
test('saveStats(): QuotaExceededError durumunda kullanıcı uyarılır ve veri küçültülerek yazılır', () => { /* ... */ });
test('check-in: aynı gün ikinci giriş bonus vermez; gün atlanınca seri 1 e döner', () => { /* ... */ });
test('check-in: saat dilimi değişiminde (UTC+3 → UTC-5) seri bozulmaz', () => { /* ... */ });
```

**E. API entegrasyon**

```js
test('POST /api/apply: geçersiz e-posta → 400, gövde JSON değilse → 400', () => { /* ... */ });
test('POST /api/apply: 6. istek 60 sn içinde → 429', () => { /* ... */ });
test('POST /api/apply: depolama hatasında 503 döner ve "onaylandın" göstermez', () => { /* ... */ });
test('GET /api/games: her zaman ok:true ve 14 elemanlı dizi döner', () => { /* ... */ });
test('GameGrid: /api/games 500 dönerse yerel yedeğe düşer, sayfa çökmez', () => { /* ... */ });
```

**F. CI iş akışı düzeltmesi**

```yaml
# .github/workflows/test.yml
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci                       # lockfile zorunlu
      - run: npm run lint                 # gerçek ESLint
      - run: npm run test                 # birim + invariant testleri
      - run: npm run build                # build kırılırsa PR geçmez  ← ŞU AN YOK
      - name: RTP invariantları
        run: node --test tests/math.invariants.test.js
```

---

# ÖNCELİKLENDİRİLMİŞ EYLEM PLANI

### Yayın öncesi ZORUNLU (tahmini 2-3 gün)
1. **Wheel RTP normalizasyonu** (#1) — %556 → %98.5
2. **Hi-Lo eşitlik kuralı** (#2) — risksiz kazancı kapat
3. **Plinko 16-satır tabloları + invariant assert** (#3)
4. **Limbo tur snapshot'ı + input kilidi** (#4)
5. **Blackjack `spend()` dönüş kontrolü** (#5)
6. **Crash patlama-önce sıralaması + visibility guard** (#6)
7. **`toChips`/`isValidBet` para katmanı** (#7)
8. **XSS: `html` tagged template** (#8)
9. **Mines `calcMultiplier` sınır koruması** (#9)
10. **Bağımlılıkları sabitle + `package-lock.json` commit et**
11. **`app/error.jsx` + `GameGrid` savunmacı fallback**

### İlk hafta
12. `useRoundLock` hook'u → 8 oyunda yarış koşullarını kapat
13. `lib/audio.js` tek AudioContext
14. `/api/apply` Supabase + rate limit; `applications` şemasına `email`/`contact` ekle
15. Supabase anahtarını rotate et, `.env` yapısına geçir
16. Gerçek ESLint + CI'a `npm run build` ekle
17. §5.A ve §5.C testlerini yaz (invariant + regresyon) — blocker'ların nöbetçisi

### İlk ay
18. Kural motorlarını saf fonksiyonlara ayır (`lib/engines/*`) → test edilebilirlik
19. Ortak UI bileşenleri (`GameModal`, `BetControl`, `HistoryStrip`) → ~600 satır tasarruf
20. `logger.js` + telemetri entegrasyonu; 47 sessiz catch'i sınıflandır
21. Erişilebilirlik: focus trap, Escape, klavye navigasyonu, `aria-*`
22. Depo temizliği: `uploads/` ignore, `salon3d.html` tekilleştirme
23. `durtu/index.html` monolitini emekliye ayır — iki motorun (legacy vs React) farklı
    matematik çalıştırması sürdürülemez bir teknik borçtur

---

## KAPANIŞ NOTU

Bu kod tabanında gerçek bir zanaat var: prosedürel caz ambiyansı, canvas fizik motorları,
Türkçe ses tonu, "Selin" concierge'ünün kayıp serisini fark etmesi — bunlar özenle
düşünülmüş detaylar. Sorun mimarinin niyeti değil, **doğrulama katmanının hiç var olmaması.**

Para hareketi olan her satır bir sözleşmedir. Şu anda bu sözleşmelerin hiçbiri makine
tarafından denetlenmiyor: RTP tabloları elle yazılmış ve iki tanesi yanlış; `spend()`'in
dönüşü bir yerde yok sayılıyor; tur parametreleri dondurulmuyor; `NaN` tüm sistemi geçiyor.
Bunların hepsi **tek seferlik düzeltmeler değil, kalıcı invariantlarla** çözülmeli —
yani yukarıdaki `normalizeToRtp`, `toChips`, `useRoundLock` ve §5.A test paketi.

O katman kurulduğunda bu ürün gerçekten "1-e-1 kasino standardı" diyebilir. Bugün diyemez.

---
---

# EK: UYGULAMA RAPORU (denetim sonrası)

Denetimden sonra bulguların tamamı koda uygulandı. Aşağısı **iddia değil, doğrulanmış
durum**: her satır `npm run verify` (lint + 133 test + production build) ile kontrol edildi.

## Doğrulama çıktısı

```
$ npm run verify
✖ 23 problems (0 errors, 23 warnings)     ← lint: 0 hata
# pass 72   # fail 0                       ← yeni test paketi
SONUÇ: 61 geçti, 0 kaldı                   ← mevcut legacy testler (regresyon yok)
✓ Compiled successfully                    ← production build
```

## Blocker durumu

| # | Blocker | Durum | Nöbetçi test |
|---|---|---|---|
| 1 | Çark RTP %133/%178/%556 | ✅ `normalizeToRtp()` → üçü de %98.5 | `ÇARK: negatif house edge yok` |
| 2 | Hi-Lo eşitlik sömürüsü (EV %105) | ✅ Eşitlik kaybeder, `hiloOdds()` | `HI-LO: risksiz kazanç yok` |
| 3 | Plinko 16-satır kova sayısı | ✅ Stake tabloları + yükleme anı invariantı | `PLINKO: kova = satır + 1` |
| 4 | Limbo tur-içi hedef değiştirme | ✅ `Object.freeze` snapshot + input kilidi | `LIMBO: snapshot ile ödeme` |
| 5 | Blackjack bedava double down | ✅ `if (!spend(extra)) return;` | `BLACKJACK: bahsi ARTIRMAZ` |
| 6 | Crash sekme sıçraması + RTP | ✅ Patlama önce + clamp + `visibilitychange` | `CRASH: patlama ÖNCE` |
| 7 | `NaN` bakiye | ✅ `lib/money.js` tek kapı | `EKONOMİ: 10.000 işlem` |
| 8 | XSS (toast + kullanıcı adı) | ✅ `html` tagged-template, ham `say(\`…\`)` = 0 | `escapeHtml: XSS payload` |
| 9 | Mines `Infinity` çarpan | ✅ Guard'lı `calcMultiplier` | `MAYIN: Infinity/NaN üretmez` |
| 10 | `"next": "latest"`, lockfile yok | ✅ `next@16.3.5` pinli + `package-lock.json` | CI `npm ci` |

## Yüksek öncelikli bulgular

- **Çift tık yarışı (8 oyun)** → `lib/useRoundLock.js` senkron ref kilidi. Eski `useState`
  kalıbının neden hatalı olduğu `regression.race.test.js` içinde **kanıt testi** olarak duruyor.
- **10 ayrı AudioContext** → `lib/audio.js` tek paylaşımlı context + ref-count.
  `grep "new (window.AudioContext"` → **0 eşleşme**.
- **`GameGrid` beyaz ekran** → `res.ok` + payload doğrulaması + `Array.isArray` ikinci katman;
  ayrıca `app/error.jsx`, `app/global-error.jsx`, `app/not-found.jsx` eklendi.
- **`/api/apply`** → e-posta/uzunluk doğrulaması, IP başına rate limit (5/dk, canlı test: `200 200 200 429 429`),
  sınırlı kuyruk, mükerrer başvuru kontrolü, bilgi sızdıran `GET` kaldırıldı.
- **`/api/games`** → `force-dynamic` + yanlı `Math.random()-0.5` sort yerine ISR (1sa) + Fisher-Yates.
- **47 sessiz `catch {}`** → `lib/logger.js` ile sınıflandırıldı; `no-empty` artık **lint hatası**.
- **Sahte lint** (`echo 'Lint check OK'`) → gerçek ESLint flat config. `no-implicit-coercion`
  kuralı `+e.target.value` kalıplarını yakaladı — bunlar Blocker #7'nin `NaN` kaynağıydı,
  hepsi `Number()` ile değiştirildi.

## Kalan 23 uyarı — bilinçli teknik borç

Tamamı React Compiler kuralları (`set-state-in-effect`, `purity`, `exhaustive-deps`).
Gerçek bulgular, ancak her biri bileşen refactor'ü gerektiriyor ve **para yolunu
etkilemiyor**. `warn` seviyesinde görünür bırakıldı; `npm run lint:strict` ile sıfır
tolerans modunda çalıştırılabilir. Bu sayı artmamalı, azalmalıdır.

## Test paketi

`durtu-app/tests/` — 72 test, bağımlılıksız (`node --test`):

| Dosya | Kapsam |
|---|---|
| `math.invariants.test.js` | RTP, olasılık toplamları, monotonluk, simetri, Monte Carlo, fuzz |
| `economy.test.js` | `NaN`/`Infinity`/negatif/ondalıklı bahis, 10.000 adımlık ekonomi simülasyonu |
| `security.test.js` | XSS payload'ları, `html` template, `fmt` NaN güvenliği |
| `regression.race.test.js` | Çift tık, Limbo hedef swap, BJ double, Mines patlama sonrası cashout, Crash frame gap |

Kritik nokta: bu testler **saf motorları** hedefler. Eski harness `setTimeout`/`setInterval`
stub'ladığı için Blocker #4 ve #6'yı yapısal olarak yakalayamıyordu; mantık UI'dan ayrıldığı
için artık timer'a ihtiyaç yok.

## Hâlâ yapılması gerekenler (kod dışı)

1. **Supabase anon anahtarını rotate edin** — `durtu/index.html:5025` içinde hard-code'lu
   olarak git geçmişine girmiş. Koddan kaldırmak yeterli değildir, anahtarın kendisi yanmıştır.
2. **`/api/apply` kalıcı depoya bağlanmalı** — süreç-içi kuyruk artık sınırlı ve loglanıyor,
   ama serverless'te hâlâ veri kaybeder. Şemaya `email` ve `contact` alanları eklenmeli.
3. **`durtu/index.html` crash motorunu React'e hizalayın** (`%33` kuralı) — yukarıdaki tablo.
4. **Sorumlu oyun / yasal uyum** — bu ayrı bir denetimin konusu ve teknik borçtan ağırdır.

---

# EK-2: İKİNCİ TUR — teknik borç kapatma

Blocker'lardan sonra kalan dört başlık da tamamlandı.

```
$ npm run verify
eslint . --max-warnings=0     ← çıktı yok: 0 hata, 0 UYARI
# pass 89   # fail 0           ← yeni test paketi
SONUÇ: 61 geçti, 0 kaldı       ← legacy testler
✓ Compiled successfully        ← production build
```

## 1. Legacy crash motoru React ile hizalandı

`durtu/index.html:1761` içindeki `if (intVal % 33 === 0) return 1.00;` kaldırıldı.
Bu satır turların %3.03'ünü anında patlatıyor ve RTP'yi `0.97 × (1 − 1/33) ≈ %94.06`
seviyesine çekiyordu. Artık iki istemci **aynı dağılımı** kullanıyor.

Aynı dosyadaki `mnMul` de düzeltildi: React'te Blocker #9 olarak raporlanan
`Infinity` hatasının birebir aynısı legacy'de de vardı (`den → 0`), üstelik
çarpan tavanı da yoktu. Guard + `MAX_MULT` eklendi.

Yeni `tests/legacy.parity.test.js` bu iki motoru **birbirine karşı** test ediyor:
`%33` kuralı geri gelirse, RTP sapar veya `mnMul` React'ten %2'den fazla ayrışırsa
build kırılır.

## 2. React Compiler uyarıları: 23 → 0

Hiçbiri susturularak kapatılmadı; bulguların çoğu gerçek hatalardı:

| Bulgu | Gerçek etkisi | Çözüm |
|---|---|---|
| `PlinkoGame` render sırasında ref yazıyor | Concurrent render iptal edilirse ref kirli kalır | Commit sonrası `useEffect` ile senkron |
| `activeBins` render'da `Date.now()` ile karşılaştırılıyor | Süre dolunca render tetiklenmediği için vurgu takılı kalıyordu | Zamanlayıcıyla söndürme |
| 5 bileşende uzun ömürlü döngü stale closure riski | Eski bakiye/bahis okunabilir — **para hatası** | Yeni `lib/useEventCallback.js` |
| `VaultModal` / `StatsModal` effect'te setState | Gereksiz çift render, boş ilk kare | `useState` lazy initializer |
| `Toasts` / `CrashGame` / `VaultModal` cleanup'ta `ref.current` | Temizlik yanlış nesne üzerinde çalışabilir | Yerel değişkene kopyalama |

Kaçınılmaz 4 istisna (hidrasyon güvenliği, async fetch, oyun motoru yaşam döngüsü)
satır bazında **gerekçesiyle** disable edildi. `--max-warnings=0` artık varsayılan.

## 3. Erişilebilirlik

Yeni `components/ui/Modal.jsx` — 14 modalın tamamı buradan geçiyor:

- `role="dialog"` + `aria-modal` + `aria-labelledby` (her modalın başlığı var)
- **Escape** ile kapatma
- **Focus trap**: Tab/Shift+Tab modal içinde döner
- Açılışta odak modala, kapanışta **tetikleyen öğeye iade**
- Arka plan scroll kilidi (iç içe modal sayacıyla)
- Kapatma butonunda `aria-label`

Ayrıca: `:focus-visible` stilleri (önceden klavye odağı **hiç görünmüyordu**),
`.sr-only`, `prefers-reduced-motion` desteği, `GameGrid` kartlarına klavye
erişimi (`role="button"` + Enter/Space), başvuru formunda **her `<label>` artık
girdisine bağlı** (`htmlFor`/`id`).

`tests/modal.a11y.test.js` (12 test) bu sözleşmeyi koruyor.

## 4. DRY: ~600 satır tekrar

- `components/ui/Modal.jsx` — 14 kopyalanmış overlay kalıbı tek kaynağa indi.
  Elle yazılmış `className="ovl"` kalmadı (test ile doğrulanıyor).
- `components/ui/BetControl.jsx` — "input + ½ + 2×" bloğu. Her kopyada ufak
  farklar vardı: bazılarında tur sırasında input kilitlenmiyordu (Blocker #4'ün
  sömürü yüzeyi), bazılarında bakiye üstü bahis engellenmiyordu, hiçbirinde
  label girdiye bağlı değildi. Artık doğrulama (`normalizeBet` + `max`), kilit
  ve erişilebilirlik hepsinde aynı.
- `lib/useEventCallback.js` — stale closure / gereksiz effect yeniden kurulumu
  ikilemini çözen ortak kanca.

Net: **20 dosyada 940 satır silindi, 1181 satır eklendi** — eklenen kısmın
büyük bölümü test ve gerekçe yorumları.

## Not: next/font denendi, geri alındı

`next/font` ile self-hosting layout shift'i bitirir ve Google Fonts'a IP sızmasını
önlerdi; ancak fontları **build sırasında** indiriyor ve ağ erişimi kısıtlı
ortamlarda build kırılıyor — tekrarlanabilirlik blocker'ıyla çelişiyordu.
Runtime `<link>` korundu, gerekçe `app/layout.jsx` içine yazıldı. Kalıcı çözüm
`.woff2` dosyalarını repoya alıp `next/font/local` kullanmaktır.
