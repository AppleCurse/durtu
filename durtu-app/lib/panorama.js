// 360° lounge görünüm matematiği.
// Bu modül DOM/WebGL'den bağımsızdır; hem React arayüzü hem testler aynı
// açı sarma ve hotspot projeksiyon kurallarını kullanır.

const DEG_TO_RAD = Math.PI / 180;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Her açıyı [-180, 180) aralığına sarar. */
export function wrapDegrees(value) {
  const angle = Number.isFinite(value) ? value : 0;
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

/** "from" açısından "to" açısına en kısa imzalı mesafe. */
export function shortestAngle(from, to) {
  return wrapDegrees(to - from);
}

/**
 * Küresel bir hotspot'u görünüm düzlemine yansıtır.
 *
 * DÜRTÜ panoramasında pozitif yaw görselin soluna, pozitif pitch yukarı bakar.
 * WebGL shader'ı ile aynı yön sözleşmesi korunur. Görüşün arkasında veya
 * ekranın güvenli sınırlarının dışında kalan noktalar null döner.
 */
export function projectHotspot(hotspot, view, aspect = 16 / 9) {
  const safeAspect = clamp(Number(aspect) || 1, 0.35, 4);
  const verticalFov = clamp(Number(view?.fov) || 68, 35, 95) * DEG_TO_RAD;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const yawDelta = shortestAngle(Number(view?.yaw) || 0, Number(hotspot?.yaw) || 0);
  const pitchDelta = (Number(hotspot?.pitch) || 0) - (Number(view?.pitch) || 0);

  // 90° ötesi kameranın arkasındadır; tan() bu bölgede tersine döner.
  if (Math.abs(yawDelta) >= 90 || Math.abs(pitchDelta) >= 90) return null;

  const x = 0.5 - Math.tan(yawDelta * DEG_TO_RAD) / (2 * Math.tan(horizontalFov / 2));
  const y = 0.5 - Math.tan(pitchDelta * DEG_TO_RAD) / (2 * Math.tan(verticalFov / 2));

  // Küçük taşma payı, kenardaki butonun aniden yanıp sönmesini önler.
  if (x < -0.06 || x > 1.06 || y < -0.08 || y > 1.08) return null;

  return { x: x * 100, y: y * 100 };
}
