# DÜRTÜ — Durum Raporu (18 Eylül 2026 · Birleştirme tamam)

## Tek kod tabanı
Repo'da artık **tek uygulama** var: `durtu-app/` (Next.js 16.3.5 + React 19).
Legacy monolit `durtu/index.html` ve çoğaltılmış `salon3d.html` kopyaları **silindi**;
kendi kendine yeten iki 3D sahne statik sayfa olarak korundu:

- `durtu-app/public/salon3d.html` — WASD ile yürünen 3D VIP salon
- `durtu-app/public/gate-3d.html` — sinematik 3D kapı (ikisi de Salon'dan bağlandı)

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
- `npm test` → **105/105** (72 sertleştirme + 12 modal/a11y sözleşmesi + 9 store/check-in/favori portu)
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

## Port bekleyenler (monolitte vardı, React'te yeniden yazılacak)
1. Kulüp katmanı: VIP kademeleri, promo kuponları, %10 cashback, gece yakıtı
2. 360° fotogrametrik lounge (panoramalar gitmedi; sahne yeniden kurulacak)
3. Şans Melekleri (TTS) + Selin'in proaktif sesleri
4. Turnuva + canlı liderlik tablosu; davet sistemi (3 tek kullanımlık hak)
5. Supabase bulut hesabı (`supabase/schema.sql` hazır; anahtarlar env'e)
6. Backoffice (gerçek auth'lu panel)

dürTL — demo para. Gerçek para yok. 18+ · Sorumlu oyun.
