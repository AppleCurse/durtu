// DÜRTÜ 360° lounge — küresel projeksiyon ve etkileşim sözleşmesi.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { clamp, projectHotspot, shortestAngle, wrapDegrees } from '../lib/panorama.js';

const COMPONENT_SRC = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'components', 'Lounge360.jsx'),
  'utf8'
);
const WALKTHROUGH_SRC = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'public', 'salon3d.html'),
  'utf8'
);

const close = (actual, expected, epsilon = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≠ ${expected}`);
};

test('PANORAMA: clamp görüş sınırlarını korur', () => {
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp(6, 0, 10), 6);
});

test('PANORAMA: yaw her tam turda aynı açıya sarılır', () => {
  assert.equal(wrapDegrees(0), 0);
  assert.equal(wrapDegrees(360), 0);
  assert.equal(wrapDegrees(-360), 0);
  assert.equal(wrapDegrees(540), -180);
  assert.equal(wrapDegrees(Number.NaN), 0);
});

test('PANORAMA: dikiş çizgisinde en kısa açı kullanılır', () => {
  assert.equal(shortestAngle(179, -179), 2);
  assert.equal(shortestAngle(-179, 179), -2);
  assert.equal(shortestAngle(10, 350), -20);
});

test('PANORAMA: kameranın baktığı hotspot ekran merkezine düşer', () => {
  const point = projectHotspot(
    { yaw: 24, pitch: -7 },
    { yaw: 24, pitch: -7, fov: 68 },
    16 / 9
  );
  close(point.x, 50);
  close(point.y, 50);
});

test('PANORAMA: dikişin öte yanındaki hotspot görünür kalır', () => {
  const point = projectHotspot(
    { yaw: -179, pitch: 0 },
    { yaw: 179, pitch: 0, fov: 68 },
    16 / 9
  );
  assert.ok(point, 'dikişteki nokta kayboldu');
  assert.ok(point.x < 50, 'pozitif yaw farkı görselin solunda olmalı');
});

test('PANORAMA: kameranın arkasındaki hotspot render edilmez', () => {
  assert.equal(
    projectHotspot({ yaw: 180, pitch: 0 }, { yaw: 0, pitch: 0, fov: 68 }, 16 / 9),
    null
  );
});

test('PANORAMA: zoom arttıkça hotspot merkezden daha uzağa yansır', () => {
  const narrow = projectHotspot({ yaw: 20, pitch: 0 }, { yaw: 0, pitch: 0, fov: 45 }, 1);
  const wide = projectHotspot({ yaw: 20, pitch: 0 }, { yaw: 0, pitch: 0, fov: 85 }, 1);
  assert.ok(Math.abs(narrow.x - 50) > Math.abs(wide.x - 50));
});

test('PANORAMA: WebGL küre ve çoklu giriş yöntemleri kaynakta korunur', () => {
  assert.match(COMPONENT_SRC, /atan\(direction\.x, -direction\.z\)/, 'equirectangular longitude yok');
  assert.match(COMPONENT_SRC, /asin\(clamp\(direction\.y/, 'equirectangular latitude yok');
  assert.match(COMPONENT_SRC, /onPointerMove=/, 'sürükleme kontrolü yok');
  assert.match(COMPONENT_SRC, /onWheel=/, 'zoom kontrolü yok');
  assert.match(COMPONENT_SRC, /onKeyDown=/, 'klavye kontrolü yok');
  assert.match(COMPONENT_SRC, /aria-describedby="lounge360-instructions"/, 'kontrol talimatı erişilebilir değil');
});

test('PANORAMA: mekânsal noktalar ana oyun motoruna bağlanır', () => {
  assert.match(COMPONENT_SRC, /game: 'bj'/, 'özel masa blackjack motoruna bağlı değil');
  assert.match(COMPONENT_SRC, /onPlay\?\.\(hotspot\.game\)/, 'hotspot oyun yönlendirmesi yok');
  assert.match(COMPONENT_SRC, /LOUNGE_HOTSPOTS\.map/, 'mekân noktaları veriden üretilmiyor');
  assert.doesNotMatch(WALKTHROUGH_SRC, /location\.href = 'index\.html/, 'eski 3D salon silinen monolite gidiyor');
});
