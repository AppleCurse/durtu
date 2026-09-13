/* Three.js 360° Photogrammetric Virtual Tour Engine — VIP Lounge
 * 100% Unobstructed Equirectangular Sphere + Smooth Inertia Damping + Perlin Handheld Breathing + Zoom + HRTF Spatial Audio + 3D Hotspots
 */
import * as THREE from 'three';

// --- Perlin Noise for Handheld Camera Breathing ---
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }
function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
const perm = new Uint8Array(512);
const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
for (let i = 0; i < 256; i++) perm[i] = perm[i + 256] = p[i];

function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
         lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
         lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}

// --- 3D Hotspot definitions matched to features in the panorama ---
export const HOTSPOTS = [
  {
    id: 'bar',
    label: '🥂 Özel Bar',
    // In equirect panorama: Bar is on the left (~ -80 deg)
    worldPos: new THREE.Vector3(-14, -1.8, -4),
    targetLook: { phi: Math.PI / 2 - 0.05, theta: -Math.PI * 0.42 },
    targetFov: 62,
    color: 0xf6e27a,
    description: 'Özel Speakeasy viski ve kokteyl barı'
  },
  {
    id: 'roulette',
    label: '🎰 Rulet Masası',
    // In equirect panorama: Roulette is on the right (~ +75 deg)
    worldPos: new THREE.Vector3(14, -2.4, -4),
    targetLook: { phi: Math.PI / 2 + 0.12, theta: Math.PI * 0.38 },
    targetFov: 60,
    color: 0x4ade80,
    description: 'Canlı VIP Fransız Ruleti & Fildişi Top'
  },
  {
    id: 'lounge',
    label: '🛋 VIP Salon',
    // In equirect panorama: Center tables and Persian carpet
    worldPos: new THREE.Vector3(0, -2.8, -14),
    targetLook: { phi: Math.PI / 2 + 0.08, theta: 0 },
    targetFov: 66,
    color: 0xc9a84c,
    description: 'Merkez locada deri koltuklar ve şamdan masaları'
  },
  {
    id: 'entrance',
    label: '🚪 VIP Giriş',
    // Entrance door behind
    worldPos: new THREE.Vector3(0, 0.2, 14),
    targetLook: { phi: Math.PI / 2, theta: Math.PI },
    targetFov: 68,
    color: 0xD4AF37,
    description: 'Dürtü VIP Kapalı Kulüp Girişi — Mühür & Parola'
  }
];

export class VIPLoungeTour {
  constructor(canvas) {
    this.canvas = canvas;
    // Initial view: looking towards center lounge
    this.targetSpherical = { phi: Math.PI / 2, theta: 0 };
    this.currentSpherical = { phi: Math.PI / 2, theta: 0 };
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.velocity = { phi: 0, theta: 0 };
    this.dampingFactor = 0.06;

    // Zoom
    this.targetFov = 72;
    this.currentFov = 72;
    this.minFov = 48;
    this.maxFov = 88;

    // Lerp transition
    this.lerpTarget = null;
    this.lerpStart = null;
    this.lerpProgress = 0;

    this.clock = new THREE.Clock();
    this.hotspotMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Audio
    this.audioCtx = null;
    this.audioStarted = false;
    this.barPanner = null;
    this.roulettePanner = null;

    this.initRenderer();
    this.initScene();
    this.initHotspots();
    this.bindEvents();
    this.animate();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.currentFov, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 0, 0);

    // 100% Seamless 360° Photogrammetric Equirectangular Sphere
    // ZERO blocking geometry — the entire panorama from ceiling to floor rug is fully visible!
    const sphereGeo = new THREE.SphereGeometry(60, 96, 48);
    sphereGeo.scale(-1, 1, 1);

    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x0a0806,
      side: THREE.FrontSide
    });
    this.sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.scene.add(this.sphereMesh);

    const loader = new THREE.TextureLoader();
    const urls = [
      '/images/vip_lounge_equirect.jpg',
      './images/vip_lounge_equirect.jpg',
      '/assets/vip_lounge_equirect.jpg',
      './assets/vip_lounge_equirect.jpg'
    ];

    const tryLoad = (idx) => {
      if (idx >= urls.length) return;
      loader.load(urls[idx], (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        sphereMat.map = tex;
        sphereMat.color.setHex(0xffffff);
        sphereMat.needsUpdate = true;
      }, undefined, () => tryLoad(idx + 1));
    };
    tryLoad(0);

    // Dynamic Chandelier Specular Point Light (subtle moving glint)
    this.chandelierLight = new THREE.PointLight(0xffdf99, 2.0, 30);
    this.chandelierLight.position.set(0, 8, 0);
    this.scene.add(this.chandelierLight);
  }

  initHotspots() {
    HOTSPOTS.forEach(hs => {
      const group = new THREE.Group();
      group.position.copy(hs.worldPos);
      // Billboard group to always face camera
      group.lookAt(0, 0, 0);

      // 1. Glowing outer pulse ring
      const ringGeo = new THREE.RingGeometry(0.55, 0.72, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: hs.color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.userData = { type: 'outer', def: hs };
      group.add(ring);
      this.hotspotMeshes.push(ring);

      // 2. Inner glowing core disc
      const coreGeo = new THREE.CircleGeometry(0.38, 28);
      const coreMat = new THREE.MeshBasicMaterial({
        color: hs.color,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.userData = { type: 'inner', def: hs };
      group.add(core);
      this.hotspotMeshes.push(core);

      // 3. Central diamond icon
      const diamondGeo = new THREE.RingGeometry(0.08, 0.18, 4);
      diamondGeo.rotateZ(Math.PI / 4);
      const diamondMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      });
      const diamond = new THREE.Mesh(diamondGeo, diamondMat);
      group.add(diamond);

      group.userData = { def: hs, group: true };
      this.scene.add(group);
    });
  }

  bindEvents() {
    const c = this.canvas;

    // Mouse drag
    c.addEventListener('mousedown', e => {
      this.isDragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.lerpTarget = null;
      this.startAudio();
    });

    window.addEventListener('mousemove', e => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (!this.isDragging) {
        this.checkHover();
        return;
      }
      const dx = (e.clientX - this.lastMouse.x) * 0.0022;
      const dy = (e.clientY - this.lastMouse.y) * 0.0022;
      this.targetSpherical.theta -= dx;
      this.targetSpherical.phi -= dy;
      this.targetSpherical.phi = THREE.MathUtils.clamp(this.targetSpherical.phi, 0.92, 2.18);
      this.velocity.theta = -dx * 0.35;
      this.velocity.phi = -dy * 0.35;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { this.isDragging = false; });

    // Touch drag
    c.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.lerpTarget = null;
        this.startAudio();
      }
    }, { passive: true });

    window.addEventListener('touchmove', e => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const dx = (e.touches[0].clientX - this.lastMouse.x) * 0.0028;
      const dy = (e.touches[0].clientY - this.lastMouse.y) * 0.0028;
      this.targetSpherical.theta -= dx;
      this.targetSpherical.phi -= dy;
      this.targetSpherical.phi = THREE.MathUtils.clamp(this.targetSpherical.phi, 0.92, 2.18);
      this.velocity.theta = -dx * 0.35;
      this.velocity.phi = -dy * 0.35;
      this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    window.addEventListener('touchend', () => { this.isDragging = false; });

    // Mouse wheel zoom
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.targetFov = THREE.MathUtils.clamp(this.targetFov + e.deltaY * 0.04, this.minFov, this.maxFov);
    }, { passive: false });

    // Click hotspot
    c.addEventListener('click', e => {
      const m = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      this.raycaster.setFromCamera(m, this.camera);
      const hits = this.raycaster.intersectObjects(this.hotspotMeshes);
      if (hits.length > 0) {
        const hs = hits[0].object.userData.def;
        if (hs) this.onHotspotActivated(hs);
      }
      this.startAudio();
    });

    // Resize
    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  checkHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.hotspotMeshes);
    const tip = document.getElementById('gateHintCine');
    if (hits.length > 0) {
      const hs = hits[0].object.userData.def;
      if (hs && tip) {
        tip.innerHTML = `<b>${hs.label}</b> &mdash; ${hs.description} <small style="color:var(--gold);display:block;margin-top:2px">TIKLAYARAK ORAYA DÖN</small>`;
        tip.style.opacity = '1';
      }
      document.body.style.cursor = 'pointer';
    } else {
      document.body.style.cursor = this.isDragging ? 'grabbing' : 'grab';
    }
  }

  // Smooth cinematic look-at & zoom to hotspot
  onHotspotActivated(hs) {
    this.lerpStart = {
      phi: this.currentSpherical.phi,
      theta: this.currentSpherical.theta,
      fov: this.currentFov
    };
    this.lerpTarget = {
      phi: hs.targetLook.phi,
      theta: hs.targetLook.theta,
      fov: hs.targetFov || 64
    };
    this.lerpProgress = 0;

    const tip = document.getElementById('gateWhisper');
    if (tip) {
      tip.textContent = `✦ ${hs.label} odaklanıldı: ${hs.description}`;
      tip.style.opacity = '1';
      setTimeout(() => { tip.style.opacity = '0'; }, 3200);
    }
  }

  startAudio() {
    if (this.audioStarted) return;
    this.audioStarted = true;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioCtx = window.gateAC || new AudioContext();
      window.gateAC = this.audioCtx;
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      // Convolution Reverb (2.5s luxury hall reverb)
      const duration = 2.5, decay = 2.8;
      const length = ctx.sampleRate * duration;
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const t = i / length;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 + 0.3 * Math.sin(t * 14));
        }
      }
      const conv = ctx.createConvolver();
      conv.buffer = impulse;
      const rGain = ctx.createGain();
      rGain.gain.value = 0.35;
      conv.connect(rGain);
      rGain.connect(ctx.destination);

      // Left Bar: Jazz Chords (HRTF positional panner)
      this.barPanner = ctx.createPanner();
      this.barPanner.panningModel = 'HRTF';
      this.barPanner.positionX.value = -6;
      this.barPanner.positionY.value = 0;
      this.barPanner.positionZ.value = -1;
      this.barPanner.connect(conv);
      this.barPanner.connect(ctx.destination);
      this.initBarJazz(ctx, this.barPanner);

      // Right Roulette: Ivory Ball clicks (HRTF positional panner)
      this.roulettePanner = ctx.createPanner();
      this.roulettePanner.panningModel = 'HRTF';
      this.roulettePanner.positionX.value = 6;
      this.roulettePanner.positionY.value = 0;
      this.roulettePanner.positionZ.value = -1;
      this.roulettePanner.connect(conv);
      this.roulettePanner.connect(ctx.destination);
      this.initRouletteClicks(ctx, this.roulettePanner);

      const dot = document.getElementById('audioDot');
      const lbl = document.getElementById('audioLabel');
      if (dot) dot.style.background = '#4ade80';
      if (lbl) lbl.textContent = '3D uzamsal HRTF ses devrede';
    } catch (e) {
      console.warn('Web Audio spatial init fallback:', e);
    }
  }

  initBarJazz(ctx, destination) {
    const freqs = [220, 261.63, 329.63, 392, 493.88];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const flt = ctx.createBiquadFilter();
      osc.type = 'triangle';
      osc.frequency.value = f;
      flt.type = 'lowpass';
      flt.frequency.value = 700 + i * 80;
      g.gain.setValueAtTime(0.001, ctx.currentTime);

      const beat = 2.2 + i * 0.35;
      for (let t = 0; t < 120; t += beat * 2) {
        const start = ctx.currentTime + t + i * 0.2;
        g.gain.setValueAtTime(0.001, start);
        g.gain.linearRampToValueAtTime(0.022, start + 0.1);
        g.gain.setValueAtTime(0.022, start + beat - 0.2);
        g.gain.linearRampToValueAtTime(0.001, start + beat);
      }
      osc.connect(flt);
      flt.connect(g);
      g.connect(destination);
      osc.start();
    });
  }

  initRouletteClicks(ctx, destination) {
    const playClick = (time) => {
      const len = Math.floor(ctx.sampleRate * 0.018);
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = b.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.2));
      }
      const src = ctx.createBufferSource();
      src.buffer = b;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3400;
      f.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      src.connect(f);
      f.connect(g);
      g.connect(destination);
      src.start(time);
    };

    let t = ctx.currentTime + 0.5;
    for (let i = 0; i < 280; i++) {
      playClick(t);
      t += 0.25 + (Math.sin(i * 0.1) * 0.09) + Math.random() * 0.06;
    }
  }

  updateAudioListener() {
    if (!this.audioCtx) return;
    const l = this.audioCtx.listener;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (l.forwardX) {
      l.forwardX.setValueAtTime(dir.x, this.audioCtx.currentTime);
      l.forwardY.setValueAtTime(dir.y, this.audioCtx.currentTime);
      l.forwardZ.setValueAtTime(dir.z, this.audioCtx.currentTime);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    // Friction & Velocity Damping (only active on flick/release)
    if (!this.isDragging) {
      this.targetSpherical.theta += this.velocity.theta;
      this.targetSpherical.phi += this.velocity.phi;
      this.velocity.theta *= 0.88;
      this.velocity.phi *= 0.88;
    }
    // Limit pitch so user cannot get stuck looking straight at ceiling or floor
    this.targetSpherical.phi = THREE.MathUtils.clamp(this.targetSpherical.phi, 0.92, 2.18);

    // Smooth Lerp Transition to Hotspot
    if (this.lerpTarget) {
      this.lerpProgress += dt * 0.85;
      const p = Math.min(this.lerpProgress, 1.0);
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

      this.currentSpherical.phi = lerp(this.lerpStart.phi, this.lerpTarget.phi, ease);
      this.currentSpherical.theta = lerp(this.lerpStart.theta, this.lerpTarget.theta, ease);
      this.currentFov = lerp(this.lerpStart.fov, this.lerpTarget.fov, ease);
      this.targetFov = this.currentFov;

      if (p >= 1.0) {
        this.targetSpherical.phi = this.currentSpherical.phi;
        this.targetSpherical.theta = this.currentSpherical.theta;
        this.lerpTarget = null;
      }
    } else {
      this.currentSpherical.phi += (this.targetSpherical.phi - this.currentSpherical.phi) * 0.12;
      this.currentSpherical.theta += (this.targetSpherical.theta - this.currentSpherical.theta) * 0.12;
      this.currentFov += (this.targetFov - this.currentFov) * 0.1;
    }

    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    // Human Camera Breathing (Perlin Micro-Shake)
    const breathFreq = 0.16;
    const shakeAmt = 0.0016;
    const bPhi = noise3(elapsed * breathFreq, 0, 0) * shakeAmt;
    const bTheta = noise3(0, elapsed * breathFreq * 1.3, 0.5) * shakeAmt * 1.4;
    const bY = noise3(0.5, 0.5, elapsed * breathFreq * 0.7) * 0.003;

    const phi = this.currentSpherical.phi + bPhi;
    const theta = this.currentSpherical.theta + bTheta;

    // Subtle positional parallax translation based on view angle and mouse position
    const parallaxX = Math.sin(theta) * 0.2 + (this.mouse.x * 0.15);
    const parallaxZ = Math.cos(theta) * 0.2 + (this.mouse.y * 0.12);

    this.camera.position.set(parallaxX, bY, parallaxZ);

    const lookDir = new THREE.Vector3(
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.cos(theta)
    );

    const targetLook = this.camera.position.clone().add(lookDir.multiplyScalar(20));
    this.camera.lookAt(targetLook);

    // Pulse Hotspot Rings
    this.hotspotMeshes.forEach(mesh => {
      if (mesh.userData.type === 'outer') {
        const pulse = 0.88 + 0.12 * Math.sin(elapsed * 2.8);
        mesh.scale.setScalar(pulse);
        mesh.rotation.z += 0.008;
      } else if (mesh.userData.type === 'inner') {
        mesh.material.opacity = 0.4 + 0.2 * Math.sin(elapsed * 3.2);
      }
    });

    this.updateAudioListener();
    this.renderer.render(this.scene, this.camera);
  }
}

export function initThreeGate() {
  const canvas = document.getElementById('gateCanvas');
  if (!canvas) {
    console.warn('gateCanvas not found in DOM');
    return;
  }
  if (window._tourInstance) return window._tourInstance;
  window._tourInstance = new VIPLoungeTour(canvas);
  return window._tourInstance;
}

window.initThreeGate = initThreeGate;
window.VIPLoungeTour = VIPLoungeTour;
window.HOTSPOTS = HOTSPOTS;
