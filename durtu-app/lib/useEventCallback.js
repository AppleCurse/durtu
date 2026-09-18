'use client';
// DÜRTÜ — kimliği sabit, gövdesi her zaman güncel callback.
//
// Sorun: oyun döngüleri (rAF/interval) bir kez kurulup uzun süre yaşıyor ama
// içeriden `win`, `spend`, `dropBall` gibi her render'da yeniden oluşan
// fonksiyonları çağırıyorlar. İki kötü seçenek vardı:
//   1) deps'e eklemek → döngü her render'da yeniden kuruluyor (animasyon sıfırlanır),
//   2) deps'ten çıkarmak → stale closure; eski bakiye/eski bahis okunur (para hatası).
//
// Çözüm: referansı sabit bir sarmalayıcı döndür, gövdeyi commit sonrası tazele.
// React'in useEffectEvent RFC'siyle aynı semantik.

import { useCallback, useInsertionEffect, useRef } from 'react';

export function useEventCallback(fn) {
  const ref = useRef(fn);

  // Render sırasında değil, DOM mutasyonlarından önce tazele.
  useInsertionEffect(() => {
    ref.current = fn;
  }, [fn]);

  return useCallback((...args) => ref.current?.(...args), []);
}
