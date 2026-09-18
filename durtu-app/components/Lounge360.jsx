'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import { fmt, say } from '../lib/toast';
import { log } from '../lib/logger';
import { clamp, projectHotspot, wrapDegrees } from '../lib/panorama';

const PANORAMA_URL = '/lounge/panorama.jpg';
const INITIAL_VIEW = Object.freeze({ yaw: 0, pitch: -2, fov: 68 });

export const LOUNGE_HOTSPOTS = Object.freeze([
  {
    id: 'private-table',
    icon: '♠',
    yaw: 67,
    pitch: -5,
    eyebrow: 'ÖZEL SALON',
    title: 'Boğaz Masası',
    description: 'Sekiz kişilik kapalı masa, kişisel krupiye ve gecenin ritmine göre hazırlanan sakin bir blackjack seansı.',
    actionLabel: 'Masaya otur',
    game: 'bj',
  },
  {
    id: 'bar',
    icon: '◈',
    yaw: 31,
    pitch: -1,
    eyebrow: 'İMZA SERVİSİ',
    title: 'Gece Barı',
    description: 'İsimsiz menü, düşük ışık ve yalnızca bu geceye hazırlanan alkolsüz imza eşleşmesi.',
    actionLabel: 'Servisi çağır',
    message: '<b>Gece Barı:</b> İmza servis notun Selin’e iletildi (konsept demo).',
  },
  {
    id: 'bosphorus',
    icon: '◇',
    yaw: -58,
    pitch: 1,
    eyebrow: 'İSTANBUL · 00:24',
    title: 'Boğaz Penceresi',
    description: 'Köprünün ışıkları, salonun en sessiz köşesi ve oyundan uzaklaşmak için ayrılmış bir nefes alanı.',
    actionLabel: 'Mola moduna geç',
    message: '<b>Mola modu:</b> Pencere köşesi senin için ayrıldı. Limitlerini hatırlamak iyi oyunun parçasıdır.',
  },
  {
    id: 'listening-room',
    icon: '♪',
    yaw: -101,
    pitch: -2,
    eyebrow: 'ANALOG SEÇKİ',
    title: 'Dinleme Köşesi',
    description: 'Gece yarısından sonra caz, plak çıtırtısı ve masalardan uzakta özel bir dinleme ritüeli.',
    actionLabel: 'Seçkiyi hazırla',
    message: '♪ <b>Dinleme Köşesi:</b> Gece seçkisi hazır. Üst menüden salon ambiyansını açabilirsin.',
  },
  {
    id: 'central-lounge',
    icon: '✦',
    yaw: 0,
    pitch: -8,
    eyebrow: 'DÜRTÜ LOUNGE',
    title: 'Merkez Loca',
    description: 'Mekânın kalbi. Masaya geçmeden önce geceyi izle, yönünü seç ve acele etme.',
    actionLabel: 'Locayı ayır',
    message: '<b>Merkez Loca:</b> Bu gece için ayrıldı (konsept demo).',
  },
]);

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

// Tam ekran ışını → küresel yön → equirectangular UV.
// Böylece düz bir arka planı kaydırmak yerine gerçekten 360° küreye bakılır.
const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPanorama;
  uniform float uAspect;
  uniform float uYaw;
  uniform float uPitch;
  uniform float uFov;

  const float PI = 3.141592653589793;

  void main() {
    vec2 screen = vUv * 2.0 - 1.0;
    float lens = tan(uFov * 0.5);
    vec3 direction = normalize(vec3(screen.x * uAspect * lens, screen.y * lens, -1.0));

    float cp = cos(uPitch);
    float sp = sin(uPitch);
    direction = vec3(
      direction.x,
      cp * direction.y - sp * direction.z,
      sp * direction.y + cp * direction.z
    );

    float cy = cos(uYaw);
    float sy = sin(uYaw);
    direction = vec3(
      cy * direction.x + sy * direction.z,
      direction.y,
      -sy * direction.x + cy * direction.z
    );

    float longitude = atan(direction.x, -direction.z);
    float latitude = asin(clamp(direction.y, -1.0, 1.0));
    vec2 panoUv = vec2(fract(0.5 + longitude / (2.0 * PI)), 0.5 + latitude / PI);
    gl_FragColor = texture2D(uPanorama, panoUv);
  }
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader) || 'bilinmeyen shader hatası';
    gl.deleteShader(shader);
    throw new Error(`PANORAMA_SHADER: ${detail}`);
  }
  return shader;
}

function createPanoramaRenderer(canvas, image) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WEBGL_UNAVAILABLE');

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const detail = gl.getProgramInfoLog(program) || 'bilinmeyen program hatası';
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`PANORAMA_LINK: ${detail}`);
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);

  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, 'uPanorama'), 0);

  const uniforms = {
    aspect: gl.getUniformLocation(program, 'uAspect'),
    yaw: gl.getUniformLocation(program, 'uYaw'),
    pitch: gl.getUniformLocation(program, 'uPitch'),
    fov: gl.getUniformLocation(program, 'uFov'),
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    return width / height;
  }

  function render(view) {
    const aspect = resize();
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1f(uniforms.aspect, aspect);
    gl.uniform1f(uniforms.yaw, view.yaw * Math.PI / 180);
    gl.uniform1f(uniforms.pitch, view.pitch * Math.PI / 180);
    gl.uniform1f(uniforms.fov, view.fov * Math.PI / 180);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return aspect;
  }

  function destroy() {
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }

  return { render, resize, destroy };
}

export default function Lounge360({ name, chips, onClose, onPlay }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const rendererRef = useRef(null);
  const dragRef = useRef({ active: false, x: 0, y: 0, moved: false });
  const [view, setView] = useState(INITIAL_VIEW);
  const [viewport, setViewport] = useState({ aspect: 16 / 9 });
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tour, setTour] = useState(() => (
    typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  const selected = LOUNGE_HOTSPOTS.find(hotspot => hotspot.id === selectedId) || null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let disposed = false;
    let renderer = null;
    const image = new Image();
    image.decoding = 'async';

    image.onload = () => {
      if (disposed) return;
      try {
        renderer = createPanoramaRenderer(canvas, image);
        rendererRef.current = renderer;
        const aspect = renderer.render(INITIAL_VIEW);
        setViewport({ aspect });
        setReady(true);
      } catch (err) {
        log.warn('lounge360.webgl', 'WebGL başlatılamadı; görsel yedek kullanılıyor', { err: err?.message });
        setFallback(true);
        setReady(true);
      }
    };
    image.onerror = () => {
      if (disposed) return;
      log.critical('lounge360.image', new Error('PANORAMA_LOAD_FAILED'), { src: PANORAMA_URL });
      setFallback(true);
      setReady(true);
    };
    image.src = PANORAMA_URL;

    const onResize = () => {
      const activeRenderer = rendererRef.current;
      if (activeRenderer) setViewport({ aspect: activeRenderer.resize() });
      else if (stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        setViewport({ aspect: rect.width / Math.max(1, rect.height) });
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      if (rendererRef.current === renderer) rendererRef.current = null;
      renderer?.destroy();
    };
  }, []);

  useEffect(() => {
    const aspect = rendererRef.current?.render(view);
    if (aspect && Math.abs(aspect - viewport.aspect) > 0.02) setViewport({ aspect });
  }, [view, viewport.aspect]);

  useEffect(() => {
    if (!tour) return undefined;
    let frame = 0;
    let previous = performance.now();

    const rotate = now => {
      const elapsed = Math.min(64, now - previous);
      if (elapsed >= 28) {
        setView(current => ({ ...current, yaw: wrapDegrees(current.yaw - elapsed * 0.0019) }));
        previous = now;
      }
      frame = requestAnimationFrame(rotate);
    };
    frame = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(frame);
  }, [tour]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  function stopTour() {
    if (tour) setTour(false);
  }

  function changeView(updater) {
    stopTour();
    setView(current => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      return {
        yaw: wrapDegrees(next.yaw),
        pitch: clamp(next.pitch, -48, 48),
        fov: clamp(next.fov, 42, 88),
      };
    });
  }

  function onPointerDown(event) {
    if (event.target.closest('button')) return;
    stopTour();
    dragRef.current = { active: true, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag.active) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setView(current => ({
      ...current,
      yaw: wrapDegrees(current.yaw - dx * 0.13),
      pitch: clamp(current.pitch + dy * 0.1, -48, 48),
    }));
  }

  function endPointer(event) {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }

  function onWheel(event) {
    changeView(current => ({ ...current, fov: current.fov + event.deltaY * 0.025 }));
  }

  function onKeyDown(event) {
    const steps = {
      ArrowLeft: { yaw: 6, pitch: 0 },
      KeyA: { yaw: 6, pitch: 0 },
      ArrowRight: { yaw: -6, pitch: 0 },
      KeyD: { yaw: -6, pitch: 0 },
      ArrowUp: { yaw: 0, pitch: 4 },
      KeyW: { yaw: 0, pitch: 4 },
      ArrowDown: { yaw: 0, pitch: -4 },
      KeyS: { yaw: 0, pitch: -4 },
    };
    const step = steps[event.code];
    if (step) {
      event.preventDefault();
      changeView(current => ({ ...current, yaw: current.yaw + step.yaw, pitch: current.pitch + step.pitch }));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      changeView(current => ({ ...current, fov: current.fov - 5 }));
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      changeView(current => ({ ...current, fov: current.fov + 5 }));
    } else if (event.key === 'Home') {
      event.preventDefault();
      changeView(INITIAL_VIEW);
    }
  }

  function lookAt(hotspot) {
    stopTour();
    setSelectedId(hotspot.id);
    setView(current => ({ ...current, yaw: hotspot.yaw, pitch: hotspot.pitch, fov: Math.min(current.fov, 62) }));
    stageRef.current?.focus({ preventScroll: true });
  }

  function activateHotspot(hotspot) {
    if (hotspot.game) {
      onClose();
      onPlay?.(hotspot.game);
      return;
    }
    say(hotspot.message);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch (err) {
      log.ignorable('lounge360.fullscreen', err);
      say('Tam ekran bu tarayıcıda kullanılamıyor.');
    }
  }

  const fallbackPosition = `${50 + view.yaw / 3.6}% ${50 - view.pitch * 0.7}%`;

  return (
    <Modal
      onClose={onClose}
      title="DÜRTÜ 360 derece özel lounge"
      className="lounge360-modal"
      initialFocus={stageRef}
      showClose={false}
      zIndex={90}
      style={{ padding: 0, background: '#030302' }}
    >
      <div
        ref={stageRef}
        className={`lounge360-stage${dragging ? ' is-dragging' : ''}`}
        role="region"
        aria-label="360 derece DÜRTÜ lounge panoraması"
        aria-describedby="lounge360-instructions"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <div
          className="lounge360-fallback"
          aria-hidden="true"
          style={{ backgroundImage: `url(${PANORAMA_URL})`, backgroundPosition: fallbackPosition }}
        />
        <canvas
          ref={canvasRef}
          className={`lounge360-canvas${ready && !fallback ? ' is-ready' : ''}`}
          aria-hidden="true"
        />
        <div className="lounge360-grade" aria-hidden="true" />
        <div className="lounge360-noise" aria-hidden="true" />

        {!ready && (
          <div className="lounge360-loader" role="status">
            <span className="lounge360-loader-mark">✦</span>
            <span>Salon ışıkları hazırlanıyor</span>
          </div>
        )}

        <header className="lounge360-head">
          <div className="lounge360-brand">
            <span>✦ DÜRTÜ</span>
            <small>PRIVATE LOUNGE · ISTANBUL</small>
          </div>
          <div className="lounge360-profile">
            <span>{name}</span>
            <b>◈ {fmt(chips)} dürTL</b>
          </div>
          <div className="lounge360-actions">
            <button type="button" onClick={() => setHelpOpen(value => !value)} aria-expanded={helpOpen}>
              ? <span>Yardım</span>
            </button>
            <button type="button" onClick={toggleFullscreen}>
              {fullscreen ? '⊡' : '⛶'} <span>{fullscreen ? 'Küçült' : 'Tam ekran'}</span>
            </button>
            <button type="button" className="lounge360-exit" onClick={onClose}>
              ✕ <span>Salona dön</span>
            </button>
          </div>
        </header>

        {helpOpen && (
          <aside className="lounge360-help">
            <span className="tag">360° Kontroller</span>
            <p>Sürükle veya <b>WASD / ok tuşları</b> ile etrafına bak. Tekerlek ya da <b>+/−</b> ile yaklaş. Parlayan işaretler mekânın canlı noktalarıdır.</p>
          </aside>
        )}

        <div className="lounge360-hotspots" aria-label="Mekân noktaları">
          {LOUNGE_HOTSPOTS.map(hotspot => {
            const point = projectHotspot(hotspot, view, viewport.aspect);
            if (!point) return null;
            return (
              <button
                type="button"
                key={hotspot.id}
                className={`lounge360-hotspot${selectedId === hotspot.id ? ' is-selected' : ''}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                onClick={() => lookAt(hotspot)}
                aria-label={`${hotspot.title} noktasını incele`}
              >
                <span className="lounge360-hotspot-ring">{hotspot.icon}</span>
                <span className="lounge360-hotspot-label">{hotspot.title}</span>
              </button>
            );
          })}
        </div>

        <nav className="lounge360-places" aria-label="Lounge bölümleri">
          {LOUNGE_HOTSPOTS.map((hotspot, index) => (
            <button
              type="button"
              key={hotspot.id}
              className={selectedId === hotspot.id ? 'is-active' : ''}
              onClick={() => lookAt(hotspot)}
            >
              <span>0{index + 1}</span>{hotspot.title}
            </button>
          ))}
        </nav>

        {selected && (
          <aside className="lounge360-card" aria-live="polite">
            <button type="button" className="lounge360-card-close" onClick={() => setSelectedId(null)} aria-label="Bilgi kartını kapat">✕</button>
            <span className="tag">{selected.eyebrow}</span>
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
            <button type="button" className="btn solid" onClick={() => activateHotspot(selected)}>
              {selected.actionLabel}
            </button>
          </aside>
        )}

        <div className="lounge360-bottom">
          <p id="lounge360-instructions">
            <span className="lounge360-live" /> 360° CANLI GÖRÜNÜM
            <small>SÜRÜKLE · WASD · YAKLAŞTIR</small>
          </p>
          <div className="lounge360-zoom">
            <button type="button" onClick={() => changeView(current => ({ ...current, fov: current.fov + 6 }))} aria-label="Uzaklaştır">−</button>
            <input
              type="range"
              min="42"
              max="88"
              value={view.fov}
              onChange={event => changeView(current => ({ ...current, fov: Number(event.target.value) }))}
              aria-label="Görüş açısı"
            />
            <button type="button" onClick={() => changeView(current => ({ ...current, fov: current.fov - 6 }))} aria-label="Yakınlaştır">+</button>
          </div>
          <button
            type="button"
            className={`lounge360-tour${tour ? ' is-active' : ''}`}
            onClick={() => setTour(value => !value)}
            aria-pressed={tour}
          >
            {tour ? 'Ⅱ TURU DURDUR' : '▶ OTOMATİK TUR'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
