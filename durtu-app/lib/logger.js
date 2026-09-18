// DÜRTÜ — hata sınıflandırma katmanı.
// Sessiz catch(e){} yasaktır. Her hata bir sınıfa aittir:
//   ignorable → ürün akışını etkilemez (titreşim, ses)
//   critical  → kullanıcı verisini/parasını etkiler, mutlaka görünür olur

const isProd = process.env.NODE_ENV === 'production';

export const log = {
  /**
   * Yoksayılabilir hata: ses, titreşim, kozmetik efektler.
   * Prod'da sessiz, geliştirmede görünür.
   */
  ignorable(scope, err) {
    if (!isProd) console.debug(`[DURTU:${scope}]`, err?.message || err);
  },

  /**
   * Kullanıcı verisini veya bakiyesini etkileyen hata. Her ortamda raporlanır.
   */
  critical(scope, err, context = {}) {
    console.error(`[DURTU:${scope}]`, err?.message || err, context);
    if (typeof window !== 'undefined' && window.__DURTU_TELEMETRY__) {
      try {
        window.__DURTU_TELEMETRY__.captureException(err, {
          tags: { scope },
          extra: context,
        });
      } catch {
        /* telemetri kendi hatasını yaymaz */
      }
    }
  },

  /**
   * Beklenen ama dikkat gerektiren durum (fallback'e düşme, kota uyarısı).
   */
  warn(scope, message, context = {}) {
    console.warn(`[DURTU:${scope}] ${message}`, context);
  },
};
