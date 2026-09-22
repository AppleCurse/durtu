// DÜRTÜ — takvim yardımcıları (bağımlılıksız).
//
// Neden ayrı modül? `store.js` kulüp katmanını (`club.js`) besliyor, kulüp
// katmanı da gün anahtarına ihtiyaç duyuyor. Gün anahtarı store'da kalsaydı
// store → club → store döngüsü oluşurdu ve `store.js`'in modül seviyesindeki
// `pagehide` dinleyicisi ikinci kez çalışırdı. Saf tarih matematiği burada.
//
// DST NOTU: gün anahtarı her zaman takvim gününden hesaplanır.
// `Date.now() - 86400000` yaklaşımı yaz saati geçişlerinde aynı güne veya
// iki gün öncesine düşüyordu (bkz. store.js'in eski getYesterdayKey düzeltmesi).

/** Bugünün `YYYY-AA-GG` anahtarı. */
export function getTodayKey(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Dünün `YYYY-AA-GG` anahtarı — takvim günü üzerinden. */
export function getYesterdayKey(d = new Date()) {
  const y = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  y.setDate(y.getDate() - 1);
  return getTodayKey(y);
}
