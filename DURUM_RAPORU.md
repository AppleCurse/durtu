# DÜRTÜ — Durum Raporu (22 Eylül 2026 · Kulüp katmanı eklendi)

## Tek kod tabanı
Repo'da artık **tek uygulama** var: `durtu-app/` (Next.js 16.3.5 + React 19).
Legacy monolit `durtu/index.html` ve çoğaltılmış `salon3d.html` kopyaları **silindi**;
kendi kendine yeten iki 3D sahne statik sayfa olarak korundu:

- `durtu-app/public/salon3d.html` — WASD ile yürünen 3D VIP salon
- `durtu-app/public/gate-3d.html` — sinematik 3D kapı
- `durtu-app/public/lounge/panorama.jpg` — React 360° lounge için 2:1 equirectangular sahne

Silinenler (git geçmişinde): `durtu/` (index.html, admin.html, brand.html, assets/,
images/, sw.js, manifest), kök `salon3d.html`, kök `public/`,
`tests/engine.test.js` ve `durtu-app/tests/legacy.parity.test.js`
(parite testinin öbür tarafı monolitti; kapsam `store.test.js`'e port edildi).

## Tarihçe (neden iki kez yazıldı?)
- `0858c5b` — 9 release blocker + 72 test (kıdemli mimar denetimi, bkz. CODE_REVIEW_RELEASE_BLOCKERS.md)
- PR #2 (`b9a9e90` + `0be3f6f`, main'e merge) — legacy RTP hizalaması, `ui/Modal` +
  `ui/BetControl` a11y/DRY katmanı, sıfır lint uyarısı, CI test koşucusu düzeltmesi
- PR #1 (bu dal) — **birleştirme**: monolit emekliliği, 3D sahnelerin taşınması,
  favoriler + lobi arama, `sport` kartı (ölü kod), `store.test.js`,
  sürümden bağımsız `scripts/run-tests.mjs`, Pake/CI URL güncellemesi

İki oturum aynı kayıp paketi paralel yeniden yazdığı için main'de çift çizgi
oluştu; bu commit serisi çizgiyi teke indirir (main'in bileşen/API seçimleri korunur).

## Doğrulama (Node 20.20.2 ve 22.22.3)
- `npm test` → **114/114** (önceki 105 + 9 panorama/projeksiyon/etkileşim testi)
- `npm run lint` → **0 hata, 0 uyarı** (`--max-warnings=0`, CI'da zorunlu)
- `npm run build` → ✅ Next 16.3.5
- Test koşucusu: `durtu-app/scripts/run-tests.mjs` (Node 20 glob desteklemez,
  Node 22 düz dizini çalıştırmaz, kabuk glob'u Windows'ta kırılır → liste kodda)

## Canlı yayın
- **Tek site: `durtu-app.vercel.app`.** `d-rt` Vercel projesi monoliti derlemeye
  çalıştığı için CI'da kırmızı görünür; panelden silinmeli veya yönlendirilmeli
  (repo dışı işlem).
- `AppleCurse/DURTL` **özel** Kotlin deposu; Arena bağlantısında yetki yok (404).
  Erişim verilirse içeriği ayrıca değerlendirilecek.

## Sende kalan iki iş
1. **Supabase anon anahtarını rotate et** (eski monolitte gömülüydü; git geçmişinde).
2. **`/api/apply` kalıcılık kararı:** Supabase tablosu (email/contact kolonları) /
   e-posta bildirimi / demo olarak kalması — bilinçli seçim.

## Bu seride eklendi: Provably Fair katmanı (backlog #1 tamam)
- `lib/engines/provablyFair.js`: saf JS SHA-256, sayaç-modu tohum rng'si,
  commit/reveal sözleşmesi, `verifyRound` (panel + testlerin ortak kapısı)
- `lib/fairRound.js`: `beginCrashRound` / `beginMinesRound` — tur BAŞLAMADAN kilit
- Crash + Mines panellerinde `ui/FairBadge` (kilitli hash → açığa çıkan anahtar)
- `ProvablyFairModal`: son tur paketi + "KENDİN HESAPLA & DOĞRULA" aracı
- Nav'da 🛡️ ADİLLİK düğmesi; 12 yeni test (SHA-256 vektörleri, determinizm,
  RTP(t)=t·P(crash≥t) bandı, mines sayımı, verify pozitif/negatif)

## Bu seride eklendi: 360° lounge (backlog #2 tamam)
- `components/Lounge360.jsx`: bağımlılıksız WebGL shader ile gerçek küresel
  equirectangular projeksiyon; düz arka plan kaydırma değil
- 2:1 İstanbul/Boğaz gece sahnesi; WebGL yoksa çalışan görsel yedek
- Sürükleme/dokunma, WASD/ok tuşları, zoom, otomatik tur ve tam ekran
- Beş mekânsal hotspot; özel masa ortak React blackjack motoruna bağlanır
- Paylaşılan erişilebilir `Modal`, görünür klavye odağı, azaltılmış hareket desteği
- `lib/panorama.js` ve 9 test: açı sarma, 360° dikiş çizgisi, FOV projeksiyonu

## Bu seride eklendi: Kulüp katmanı — kayıp iadesi + gece yakıtı (backlog #1 kısmi)
Sahadaki sadakat dili "kaybettiğimde bana ne veriyorsun?" sorusudur; repo'da bu
sorunun cevabı **hiç yoktu** (tek grep bile `cashback|discount|telafi` döndürmüyordu).

- `lib/club.js` — tek doğruluk kaynağı. 5 kademe (Misafir %10 → Boğaz Özel %25),
  **net kayıptan** tahakkuk eden iade (brüt bahisten değil), kademe bazlı günlük
  tavan, günde bir kez ve yalnızca kasa sıfırken verilen **gece yakıtı**
  (asgari ömür boyu çevrim şartıyla — sıfır oyunla bedava para yok).
  Tüm tutarlar `lib/money.js` kapısından geçer; önbellek + debounce yazım
  deseni `store.js` ile aynı (tur başına senkron localStorage yazımı yok).
- `lib/calendar.js` — gün anahtarları buraya taşındı; `store → club → store`
  import döngüsünü kesiyor. `store.js` aynı API'yi yeniden dışa açıyor.
- `store.logRound()` tek dokunuş noktası: her oyun zaten bunu çağırıyor,
  dolayısıyla 15 oyunun tamamı iadeyi otomatik besliyor.
- `components/ClubModal.jsx` + nav'da **💎 KULÜP** rozeti (çekilebilir iade
  tutarı + yeşil nokta). Bakiye sıfırlanınca Selin devreye girip yakıtı haber veriyor.
- `lib/audio.js`: `heartbeat()` (lub-dub) ve `coinRain()` (altın dökülmesi).
  Aviator'da nabız çarpanla birlikte 760 ms → 330 ms'ye hızlanıyor; ≥5× çıkışta
  ve her iade/yakıt ödemesinde altın dökülüyor. Zamanlayıcı rAF karesinde,
  sızan `setInterval` yok.
- `components/Gate.jsx`: **⚡ Hızlı Geçiş Kartı** — davetiye beklemeden tek tıkla
  1,5 sn'de açılan kapı (kapının gizemi kalıyor, sürtünme kalkıyor).
- 27 yeni test (`tests/club.test.js`): kademe sınırları, net kayıp matematiği,
  tavan bağlayıcılığı, gün dönüşü, `logRound` entegrasyonu, yakıt anti-abuse
  kuralları, çoklu sekme senkronu. `modal.a11y.test.js` listesine `ClubModal` eklendi.

### Doğrulama
- `npm run verify` → lint **0 hata/0 uyarı** · test **141/141** · build ✅ (6 rota)
- `ClubModal` ayrıca dev sunucuda SSR ile render edilip çıktı denetlendi
  (kademe merdiveni, `role="dialog"`, devre dışı iade düğmesi, yakıt gerekçesi).

## Bu seride eklendi: Sorumlu oyun katmanı (iade/yakıt mekaniklerinin karşı ağırlığı)
Kulüp katmanı bir **elde tutma** mekaniğidir; "18+ · sorumlu oyun" yazısı tek
başına karşı ağırlık değildir. Gerçek karşı ağırlık, oyuncunun koyduğu ve
sistemin **aşamadığı** sınırlardır.

- `lib/limits.js` — tek kapı. Oturum kayıp limiti, gerçeklik molası aralığı,
  kendini men (cool-off).
  - **Sıkılaştırma anında**, **gevşetme 24 saat sonra** yürürlüğe girer
    (kızgınlık anında limiti açma refleksi kırılır).
  - Mola süresi dolmadan **erken çıkış yok**.
  - Limit **net kayıp** (bahis − kazanç) üzerinden; brüt bahisten değil.
  - Mola aktifken `takeRescue` da reddedilir — elde tutma kancası devre dışı.
- Bahis kapısı `page.spend()` içinde `gateBet()`: bakiyeden **ÖNCE** denetlenir,
  dolayısıyla 15 oyunun hiçbir yolu bunu bypass edemez.
- `components/LimitsModal.jsx` + nav'da **🧭 LİMİT/MOLA** düğmesi; gerçeklik
  molası açık oyunun ÜSTÜNE biner (oyunu kapatmaz).
- **Yakalanan hata:** zaman damgaları başta `toChips` ile normalize ediliyordu.
  `toChips` bir PARA kapısıdır ve `MAX_BALANCE = 1e12` ile kırpılır; gerçek epoch
  milisaniyesi (~1.79e12) o sınırın üstündedir → her mola anında "bitmiş"
  görünürdü. Test yakaladı, `int()` yardımcısıyla düzeltildi.
- 22 yeni test (`tests/limits.test.js`): asimetri, kapı, mola, erken çıkış yasağı,
  gerçeklik molası, `logRound`/`club` entegrasyonu.

### Doğrulama
- `npm run verify` → lint **0 hata/0 uyarı** · test **163/163** · build ✅ (6 rota)
- `LimitsModal` dev sunucuda SSR ile render edilip çıktı denetlendi (HTTP 200).

## Repo yönetimi — bilinen borç
- **0 tag / 0 release**, 44 commit, 5 branch. `v1.0.0` etiketi + GitHub release
  açılmadı (tek komut, ama main'e merge kararı gerektirir).
- **İki Vercel projesi:** `durtu-app.vercel.app` (bu kod tabanı) ve `d-rt.vercel.app`
  (emekli monoliti derlemeye çalışıyor, CI'da kırmızı). Panelden silinmeli — repo dışı işlem.
- `public/gate-3d.html` ve `public/salon3d.html` **three.js bundle'ı içerir**
  (ağır, mobilde pahalı). React uygulaması three.js KULLANMAZ
  (`package.json` deps: next, react, react-dom) — `Lounge360.jsx` bağımlılıksız
  WebGL shader'dır. İki sayfa yalnızca `Salon.jsx`'teki isteğe bağlı butonlardan açılır.
- **Provably Fair'in gerçek sınırı:** server seed `crypto.getRandomValues` ile
  TARAYICIDA üretiliyor (`lib/fairRound.js`). İstemci-taraflı bir demoda protokol
  doğru çalışır ama operatöre karşı garanti vermez — operatör zaten istemcidir.
  Gerçek teminat için seed üretimi sunucuya (Supabase) taşınmalı.

## Port bekleyenler (monolitte vardı, React'te yeniden yazılacak)
1. Kulüp katmanı: ~~VIP kademeleri~~, ~~%10-25 kayıp iadesi~~, ~~gece yakıtı~~ ✅ ·
   **kalan:** promo kuponları, davet sistemiyle bağlı kademe atlama
2. Şans Melekleri (TTS) + Selin'in proaktif sesleri *(kısmi: Selin artık sıfır
   bakiyede ve iade/yakıt ödemesinde konuşuyor)*
3. Turnuva + canlı liderlik tablosu; davet sistemi (3 tek kullanımlık hak)
4. Supabase bulut hesabı (`supabase/schema.sql` hazır; anahtarlar env'e)
5. Backoffice (gerçek auth'lu panel)
7. **Sorumlu oyun:** kalıcı kendini men + hesap kapatma, harcama geçmişi grafiği,
   limit aşımında otomatik cool-off önerisi
6. **Kasa yerelleştirme:** Papara / Payfix / Anında Havale / USDT-TRC20 seçimi,
   yöntem bazlı limit ve simüle dekont akışı (şu an tek "Kulüp Kasası" hattı var)


dürTL — demo para. Gerçek para yok. 18+ · Sorumlu oyun.
