/* Three.js 360° Photogrammetric Virtual Tour Engine — VIP Lounge
 * LiDAR PBR + Inverted Equirectangular Sphere + Inertia Damping + Perlin Breathing + HRTF Spatial Audio + 3D Hotspots
 */
import * as THREE from 'three';

// --- Perlin Noise (Camera breathing) ---
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

// --- Hotspot definitions ---
export const HOTSPOTS = [
  {
    id: 'entrance',
    label: '🚪 VIP Giriş',
    worldPos: new THREE.Vector3(0, -0.4, 4.5),
    targetLook: new THREE.Euler(0, Math.PI, 0),
    color: 0xD4AF37,
    description: 'Dürtü VIP Kapalı Kulüp Girişi — Mühür & Parola'
  },
  {
    id: 'bar',
    label: '🥂 Özel Bar',
    worldPos: new THREE.Vector3(-3.5, -0.5, -4.0),
    targetLook: new THREE.Euler(0, Math.PI * 0.25, 0),
    color: 0xf6e27a,
    description: 'Özel Speakeasy viski ve kokteyl salonu'
  },
  {
    id: 'roulette',
    label: '🎰 Rulet Masası',
    worldPos: new THREE.Vector3(3.5, -0.5, -3.5),
    targetLook: new THREE.Euler(0, -Math.PI * 0.3, 0),
    color: 0x4ade80,
    description: 'Avrupa Ruleti — Canlı VIP Masa'
  },
  {
    id: 'lounge',
    label: '🛋 VIP Salon',
    worldPos: new THREE.Vector3(0, -0.5, -0.2),
    targetLook: new THREE.Euler(-0.08, 0, 0),
    color: 0xc9a84c,
    description: 'Yüksek tavanlı deri ve mermer dinlenme locası'
  }
];

function createProceduralPanorama() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, '#0c0a07');
  g.addColorStop(0.35, '#1e180d');
  g.addColorStop(0.5, '#352714');
  g.addColorStop(0.55, '#1a140c');
  g.addColorStop(1, '#0a0806');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2048, 1024);

  for (let i = 0; i < 8; i++) {
    const x = i * (2048 / 8) + 128;
    const colG = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
    colG.addColorStop(0, 'rgba(212,175,55,0.02)');
    colG.addColorStop(0.5, 'rgba(212,175,55,0.22)');
    colG.addColorStop(1, 'rgba(212,175,55,0.02)');
    ctx.fillStyle = colG;
    ctx.fillRect(x - 30, 280, 60, 460);
  }

  for (let j = 0; j < 4; j++) {
    const cx = j * 512 + 256, cy = 260;
    const rad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 160);
    rad.addColorStop(0, 'rgba(246,226,122,0.75)');
    rad.addColorStop(0.35, 'rgba(212,175,55,0.28)');
    rad.addColorStop(1, 'transparent');
    ctx.fillStyle = rad;
    ctx.beginPath(); ctx.arc(cx, cy, 160, 0, Math.PI * 2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

export class VIPLoungeTour {
  constructor(canvas) {
    this.canvas = canvas;
    this.hotspotMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.targetSpherical = { phi: Math.PI / 2, theta: 0 };
    this.currentSpherical = { phi: Math.PI / 2, theta: 0 };
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.velocity = { phi: 0, theta: 0 };
    this.dampingFactor = 0.055;

    this.clock = new THREE.Clock();
    this.lerpTarget = null;
    this.lerpProgress = 0;
    this.lerpStart = new THREE.Euler();

    this.audioStarted = false;
    this.audioCtx = null;
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
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 0.01);

    const sphereGeo = new THREE.SphereGeometry(50, 96, 48);
    sphereGeo.scale(-1, 1, 1);

    const fallbackTex = createProceduralPanorama();
    const sphereMat = new THREE.MeshBasicMaterial({ map: fallbackTex, side: THREE.FrontSide });
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
        sphereMat.map = tex;
        sphereMat.needsUpdate = true;
        if (this.floorMat) {
          this.floorMat.envMap = tex;
          this.floorMat.needsUpdate = true;
        }
        if (this.brassMat) {
          this.brassMat.envMap = tex;
          this.brassMat.needsUpdate = true;
        }
      }, undefined, () => tryLoad(idx + 1));
    };
    tryLoad(0);

    // Marble floor with reflection
    const floorGeo = new THREE.PlaneGeometry(24, 24, 1, 1);
    this.floorMat = new THREE.MeshStandardMaterial({
      color: 0x14120f,
      metalness: 0.15,
      roughness: 0.22,
      envMap: fallbackTex,
      envMapIntensity: 1.5,
    });
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.65;
    this.scene.add(floor);

    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4a843,
      metalness: 0.92,
      roughness: 0.14,
      envMap: fallbackTex,
      envMapIntensity: 2.0,
    });
    const marbleMat = new THREE.MeshStandardMaterial({
      color: 0xf5f0e8,
      metalness: 0.08,
      roughness: 0.12,
      envMap: fallbackTex,
      envMapIntensity: 1.6,
    });
    const velvetMat = new THREE.MeshStandardMaterial({
      color: 0x182c1a,
      metalness: 0.0,
      roughness: 0.95,
    });

    // Bar counter (left)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.0), marbleMat);
    bar.position.set(-5, -0.9, -4.5);
    this.scene.add(bar);

    for (let i = -1; i <= 1; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.75, 12), this.brassMat);
      leg.position.set(-5 + i * 1.4, -1.28, -4.5);
      this.scene.add(leg);
    }

    // Roulette table (right)
    const rouletteTable = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 1.4), velvetMat);
    rouletteTable.position.set(5, -0.96, -3.8);
    this.scene.add(rouletteTable);

    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.09, 32), this.brassMat);
    wheel.position.set(5.7, -0.88, -3.8);
    this.scene.add(wheel);

    // Columns
    [[-6.5, 2], [6.5, 2], [-6.5, -6], [6.5, -6]].forEach(([px, pz]) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 4.2, 16), marbleMat);
      col.position.set(px, 0.4, pz);
      this.scene.add(col);

      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.18, 16), this.brassMat);
      ring.position.set(px, 2.3, pz);
      this.scene.add(ring);
    });

    // Central Chandelier
    const chBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 12), this.brassMat);
    chBase.position.set(0, 5.8, 0);
    this.scene.add(chBase);

    const chRing = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.03, 8, 36), this.brassMat);
    chRing.position.set(0, 5.4, 0);
    chRing.rotation.x = Math.PI / 2;
    this.scene.add(chRing);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xfff0a0, emissive: 0xffa020, emissiveIntensity: 2.8, roughness: 0.2 })
      );
      bulb.position.set(Math.cos(angle) * 0.65, 5.3, Math.sin(angle) * 0.65);
      this.scene.add(bulb);
    }

    // Lights
    this.scene.add(new THREE.AmbientLight(0xfff5e0, 0.5));

    const chLight = new THREE.PointLight(0xffd580, 2.8, 25);
    chLight.position.set(0, 5.4, 0);
    this.scene.add(chLight);

    const barLight = new THREE.PointLight(0xff9a30, 2.0, 14);
    barLight.position.set(-5, 1.8, -4);
    this.scene.add(barLight);

    const rouletteLight = new THREE.SpotLight(0x40ff70, 2.2, 18, Math.PI / 5, 0.3);
    rouletteLight.position.set(5, 4.5, -3.8);
    rouletteLight.target = rouletteTable;
    this.scene.add(rouletteLight);

    const dirLight = new THREE.DirectionalLight(0xfff0cc, 0.8);
    dirLight.position.set(5, 8, 4);
    this.scene.add(dirLight);
  }

  initHotspots() {
    HOTSPOTS.forEach(hs => {
      const ringGeo = new THREE.TorusGeometry(0.3, 0.038, 12, 36);
      const ringMat = new THREE.MeshStandardMaterial({
        color: hs.color,
        emissive: hs.color,
        emissiveIntensity: 2.5,
        metalness: 0.6,
        roughness: 0.2,
        transparent: true,
        opacity: 0.95
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(hs.worldPos);
      ring.userData = { hotspotId: hs.id, type: 'outer', def: hs };
      this.scene.add(ring);
      this.hotspotMeshes.push(ring);

      const discGeo = new THREE.CircleGeometry(0.2, 28);
      const discMat = new THREE.MeshStandardMaterial({
        color: hs.color,
        emissive: hs.color,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.copy(hs.worldPos);
      disc.position.y += 0.002;
      disc.userData = { hotspotId: hs.id, type: 'inner', def: hs };
      this.scene.add(disc);
      this.hotspotMeshes.push(disc);

      const beamGeo = new THREE.CylinderGeometry(0.012, 0.12, 1.5, 12, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: hs.color,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.copy(hs.worldPos);
      beam.position.y += 0.75;
      this.scene.add(beam);
    });
  }

  bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => {
      this.isDragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.lerpTarget = null;
      this.startAudio();
    });

    window.addEventListener('mousemove', e => {
      if (!this.isDragging) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.checkHover();
        return;
      }
      const dx = (e.clientX - this.lastMouse.x) * 0.0032;
      const dy = (e.clientY - this.lastMouse.y) * 0.0032;
      this.velocity.theta -= dx;
      this.velocity.phi -= dy;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { this.isDragging = false; });

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
      const dx = (e.touches[0].clientX - this.lastMouse.x) * 0.0042;
      const dy = (e.touches[0].clientY - this.lastMouse.y) * 0.0042;
      this.velocity.theta -= dx;
      this.velocity.phi -= dy;
      this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    window.addEventListener('touchend', () => { this.isDragging = false; });

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

    window.addEventListener('deviceorientation', e => {
      if (e.gamma !== null && e.beta !== null && !this.isDragging) {
        const targetX = THREE.MathUtils.clamp(e.gamma / 45, -1, 1) * 0.35;
        const targetY = THREE.MathUtils.clamp((e.beta - 45) / 45, -1, 1) * 0.25;
        this.velocity.theta += (targetX - this.velocity.theta) * 0.02;
        this.velocity.phi += (targetY - this.velocity.phi) * 0.02;
      }
    });

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
        tip.innerHTML = `<b>${hs.label}</b> &mdash; ${hs.description} <small style="color:var(--gold);display:block;margin-top:2px">TIKLAYARAK ODAKLAN</small>`;
        tip.style.opacity = '1';
      }
      document.body.style.cursor = 'pointer';
    } else {
      document.body.style.cursor = this.isDragging ? 'grabbing' : 'grab';
    }
  }

  onHotspotActivated(hs) {
    this.lerpStart = new THREE.Euler(
      this.currentSpherical.phi - Math.PI / 2,
      this.currentSpherical.theta,
      0
    );
    this.lerpTarget = hs.targetLook.clone();
    this.lerpProgress = 0;

    const tip = document.getElementById('gateWhisper');
    if (tip) {
      tip.textContent = `${hs.label} odaklanıldı: ${hs.description}`;
      tip.style.opacity = '1';
      setTimeout(() => { tip.style.opacity = '0'; }, 3600);
    }

    if (hs.id === 'entrance') {
      const form = document.getElementById('gateFormCine');
      if (form) {
        form.style.opacity = '1';
        form.style.pointerEvents = 'auto';
        form.style.transform = 'translateY(0)';
      }
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

      const duration = 2.4, decay = 2.8;
      const length = ctx.sampleRate * duration;
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const t = i / length;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        }
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = impulse;

      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.28;
      convolver.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      this.barPanner = ctx.createPanner();
      this.barPanner.panningModel = 'HRTF';
      this.barPanner.distanceModel = 'inverse';
      if (this.barPanner.positionX) {
        this.barPanner.positionX.value = -4;
        this.barPanner.positionY.value = 0;
        this.barPanner.positionZ.value = -3;
      }
      this.barPanner.connect(convolver);
      this.barPanner.connect(ctx.destination);
      this.initJazzLoop(ctx, this.barPanner);

      this.roulettePanner = ctx.createPanner();
      this.roulettePanner.panningModel = 'HRTF';
      this.roulettePanner.distanceModel = 'inverse';
      if (this.roulettePanner.positionX) {
        this.roulettePanner.positionX.value = 4;
        this.roulettePanner.positionY.value = 0;
        this.roulettePanner.positionZ.value = -3;
      }
      this.roulettePanner.connect(convolver);
      this.roulettePanner.connect(ctx.destination);
      this.initRouletteClicks(ctx, this.roulettePanner);

      const dot = document.getElementById('audioDot');
      const lbl = document.getElementById('audioLabel');
      if (dot) dot.style.background = '#4ade80';
      if (lbl) lbl.textContent = '3D ses açık — kulaklık tak';
    } catch (e) {
      console.warn('Web Audio spatial init fallback:', e);
    }
  }

  initJazzLoop(ctx, dest) {
    const freqs = [261.63, 329.63, 392.0, 493.88, 220.0];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sine';
      osc.frequency.value = freq;
      filter.type = 'lowpass';
      filter.frequency.value = 750 + idx * 90;
      gain.gain.value = 0;

      const period = 2.0 + idx * 0.35;
      for (let t = 0; t < 60; t += period * 2) {
        const start = ctx.currentTime + t + idx * 0.12;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.015, start + 0.15);
        gain.gain.setValueAtTime(0.015, start + period - 0.25);
        gain.gain.linearRampToValueAtTime(0, start + period);
      }
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start();
    });
  }

  initRouletteClicks(ctx, dest) {
    const playClick = (time) => {
      const len = Math.floor(ctx.sampleRate * 0.015);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.2));
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3200;
      const g = ctx.createGain();
      g.gain.value = 0.16;
      src.connect(filter);
      filter.connect(g);
      g.connect(dest);
      src.start(time);
    };

    let t = ctx.currentTime + 0.4;
    for (let i = 0; i < 90; i++) {
      playClick(t);
      t += 0.2 + Math.random() * 0.35;
    }
  }

  updateAudioListener() {
    if (!this.audioCtx || !this.audioCtx.listener) return;
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

    const dt = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    if (!this.isDragging) {
      this.velocity.theta *= (1 - this.dampingFactor);
      this.velocity.phi *= (1 - this.dampingFactor);
    }

    this.targetSpherical.theta += this.velocity.theta;
    this.targetSpherical.phi += this.velocity.phi;
    this.targetSpherical.phi = Math.max(0.18, Math.min(Math.PI - 0.18, this.targetSpherical.phi));

    if (this.lerpTarget) {
      this.lerpProgress += dt * 0.9;
      const t = Math.min(this.lerpProgress, 1.0);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const targetPhi = (this.lerpTarget.x + Math.PI / 2);
      const targetTheta = this.lerpTarget.y;
      this.currentSpherical.phi = lerp(this.lerpStart.x + Math.PI / 2, targetPhi, ease);
      this.currentSpherical.theta = lerp(this.lerpStart.y, targetTheta, ease);
      if (t >= 1.0) {
        this.targetSpherical.phi = this.currentSpherical.phi;
        this.targetSpherical.theta = this.currentSpherical.theta;
        this.lerpTarget = null;
      }
    } else {
      this.currentSpherical.phi += (this.targetSpherical.phi - this.currentSpherical.phi) * 0.12;
      this.currentSpherical.theta += (this.targetSpherical.theta - this.currentSpherical.theta) * 0.12;
    }

    const breathFreq = 0.18;
    const shakeAmt = 0.0018;
    const bPhi = noise3(elapsed * breathFreq, 0, 0) * shakeAmt;
    const bTheta = noise3(0, elapsed * breathFreq * 1.3, 0.5) * shakeAmt * 1.5;
    const bY = noise3(0.5, 0.5, elapsed * breathFreq * 0.7) * 0.003;

    const phi = this.currentSpherical.phi + bPhi;
    const theta = this.currentSpherical.theta + bTheta;

    const lookDir = new THREE.Vector3(
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.cos(theta)
    );

    this.camera.position.set(0, bY, 0.01);
    this.camera.lookAt(lookDir.multiplyScalar(10));

    this.hotspotMeshes.forEach(mesh => {
      if (mesh.userData.type === 'outer') {
        const pulse = 0.86 + 0.14 * Math.sin(elapsed * 2.5);
        mesh.scale.setScalar(pulse);
        mesh.rotation.z += 0.009;
        if (mesh.material && mesh.material.emissiveIntensity) {
          mesh.material.emissiveIntensity = 1.6 + pulse;
        }
      } else if (mesh.userData.type === 'inner' && mesh.material) {
        mesh.material.opacity = 0.55 + 0.25 * Math.sin(elapsed * 3.0);
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
