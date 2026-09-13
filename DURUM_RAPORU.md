# DÜRTÜ — Oyun Denetim Raporu (13 Eylül 2026 — Merge)

## Özet
- **origin/main (57b130d)** ile birleştirildi: Plinko, Limbo, HiLo, Wheel, Daily Check-in, Provably Fair SHA-256, VIP tier, Promo kod, Favoriler, Başvuru e-posta doğrulama
- **Bizim dal (38738bd)** ile birleştirildi: 6 slot gerçek motor (scatter 6x5 tumble mult birikir, hold&win, VS, blood), Spor gerçek settlement
- **Merge commit:** 26441a6 — test 61/61 ✅, build ✅
- **Para birimi:** dürTL demo

**Sahte oyun: 0** — 11 ana + 4 yeni orijinal = 15 gerçek oyun + spor

## Yeni Gelenler (origin/main)
- Plinko Original 99% RTP 1000×
- Limbo Rocket 10.000×
- Hi-Lo 98% seri
- Wheel 50× çark
- Daily Check-in 7 gün seri +250
- Provably Fair: SHA-256 deterministik crash/mines
- VIP: Bronz/Gümüş/Altın sandık
- Promo: DURTU2026 500, VIP-KULUP 1000

## Bizim Gerçek Motorlar (korundu)
- Gates/Starlight/Sweet 6×5 scatter 8+ tumble mult 2-500 birikir
- MT4 Hold&Win 5×4 3 can
- WDW VS expanding wild
- BS blood pick
- Spor: 3 maç UCL+SL 1X2 implied prob settlement

## Merge Notu
- `durtu/index.html` slotSpin turbo + scatter/holdwin/vs/blood birleşti
- `durtu-app/app/page.jsx` SportBet + Plinko/Limbo/HiLo/Wheel + DailyCheckIn hepsi import
- `Salon.jsx` 4 pick: Zeus, Spor Gerçek, Plinko, VIP Blackjack + günlük ritüel banner
- `tests/engine.test.js` 61 test (crash, bj, rulet, hist, sport 5, mines 4, promo 4, provably fair 6, VIP 6, favori 3, başvuru 3, check-in 5)

## Sonraki Adım
- `git push origin main` — senin local'inden
