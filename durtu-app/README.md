# DÜRTÜ — Tek Kod Tabanı (Next.js)

> Kapalı kulüp konseptinin **tek ve resmî** uygulaması.
> Konsept demosu · Gerçek para kullanılmaz (dürTL) · 18+
> Canlı: https://durtu-app.vercel.app

Legacy monolit (`durtu/index.html`) 18 Eylül 2026 birleştirmesiyle emekliye ayrıldı;
kendi kendine yeten iki 3D sahne statik sayfa olarak `public/` altında korundu
(`salon3d.html`, `gate-3d.html`).

## Çalıştırma

```bash
npm install          # kökten (workspace)
npm run dev          # http://localhost:3000
npm run verify       # lint (0 tolerans) + test + production build
```

Node 20.11+ ve 22+ desteklenir (test koşucusu sürüm farklarını normalize eder).

## Mimari

```
durtu-app/
├── app/
│   ├── page.jsx            # 'use client' — kapı/salon, cüzdan, modal yönlendirme (GAME_MODALS)
│   ├── layout.jsx          # metadata + fontlar
│   ├── globals.css         # tasarım token'ları + bileşen stilleri
│   └── api/
│       ├── games/route.js  # GET  — küratör seçkisi (ISR 1s + Fisher-Yates)
│       └── entry/route.js  # POST — giriş kartı (doğrulama + rate limit + bal küpü + Resend mail)
├── components/             # oyunlar + salon + kapı + modaller
│   ├── Lounge360.jsx       # WebGL equirectangular lounge + mekânsal hotspotlar
│   └── ui/
│       ├── Modal.jsx       # erişilebilir modal primitifi (focus trap, Escape, aria, scroll kilidi)
│       └── BetControl.jsx  # ortak bahis bileşeni (½ · 2× · MAX · çipler)
├── lib/
│   ├── games.js            # tek doğruluk kaynağı: katalog + kategoriler (15 oyun)
│   ├── store.js            # profil, bakiye, check-in, favoriler, defter (localStorage)
│   ├── money.js            # TEK para doğrulama kapısı (NaN/Infinity/negatif girmez)
│   ├── engines/            # saf oyun matematiği: crash, hilo, mines, plinko, wheel, rtp
│   ├── audio.js            # paylaşımlı AudioContext + ref-count
│   ├── logger.js           # sessiz catch yasağı; seviyeli log
│   ├── shuffle.js          # Fisher-Yates
│   ├── useRoundLock.js     # senkron tur kilidi (çift-tıklama yarışı)
│   ├── useEventCallback.js # useEvent deseni (effect deps yarışları)
│   ├── panorama.js         # açı sarma + küresel hotspot projeksiyonu
│   └── toast.js            # event-bus + XSS-güvenli html tagged-template
├── public/
│   ├── lounge/
│   │   └── panorama.jpg    # 2:1 equirectangular İstanbul lounge sahnesi
│   ├── salon3d.html        # 3D VIP salon (WASD) — monolitten taşındı
│   ├── gate-3d.html        # sinematik 3D kapı — monolitten taşındı
│   └── sw.js               # service worker (PWA)
├── scripts/
│   └── run-tests.mjs       # sürümden bağımsız test koşucusu
└── tests/                  # 114 test: invariant · ekonomi · güvenlik · yarış · store · a11y · fair · panorama
```

## Testler

```bash
npm test               # 114 test (Node 20.11+ ve 22+ aynı komut)
```

- `math.invariants.test.js` — RTP/olasılık invariantları (Çark %98.5, Plinko kova
  tabloları, Mines Infinity guard, Hi-Lo eşitlik, Crash eğrisi)
- `economy.test.js` — `lib/money.js` kapısı: NaN/negatif/ondalık/taşma
- `security.test.js` — toast XSS, escape, API doğrulama
- `regression.race.test.js` — tur kilidi / çift-tıklama regresyonları
- `store.test.js` — günlük check-in ritüeli + favoriler (legacy kapsamanın portu)
- `modal.a11y.test.js` — Modal sözleşmesi + "hiçbir bileşen kendi overlay'ini yazamaz"
- `provablyFair.test.js` — SHA-256 vektörleri, commit/reveal determinizmi, RTP bandı
- `panorama.test.js` — 360° açı sarma, dikiş çizgisi, hotspot projeksiyonu ve giriş sözleşmesi

## 360° lounge (components/Lounge360.jsx)

- 2:1 equirectangular sahne, bağımlılıksız WebGL shader ile gerçek küresel projeksiyon
- Kesintisiz 360° açı sarma; sürükleme, dokunma, WASD/ok tuşları ve tekerlek zoom
- Beş mekânsal hotspot; özel masa doğrudan ortak React blackjack motoruna bağlanır
- Otomatik tur, tam ekran, azaltılmış hareket tercihi ve WebGL yoksa görsel yedek

## Slot motoru (components/SlotGame.jsx)

- Reel-strip mimarisi: makara başına ağırlıklı ~29 sembollük şerit
- Fizik: sabit hız → ease-out yavaşlama → sönümlü sekme · motion blur
- 6×5 scatter/tumble/hold&win/VS/blood gerçek motorlar (katalog notlarına bkz.)
- WebAudio sentezi + `navigator.vibrate` + DPR keskin canvas

## Üretim notları (dürüst liste)

- Gerçek para oyunları **lisanslı sağlayıcı entegrasyonu** gerektirir.
- `/api/entry` iletimi: Resend (`RESEND_API_KEY` + `ENTRY_MAIL_TO` env);
  anahtarsızsa kart sunucu log'una yapılandırılmış JSON olarak düşer.
  Kalıcı depo + admin onay akışı backlog.
- Kimlik doğrulama: giriş kartı (ad soyad + e-posta); NextAuth (backlog).
- Provably Fair **canlı**: crash/mines her turu SHA-256 ile önceden kilitler
  (nav → 🛡️ ADİLLİK paneli + kendini doğrula aracı)
- Kulüp katmanı (VIP/promo/cashback), turnuvalar, melekler ve Supabase bulut
  senkronu **port bekliyor** — bkz. kök `DURUM_RAPORU.md`.
