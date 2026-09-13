/* ═══════════════════════════════════════════════════════════════════════════════════════
   DÜRTÜ · LOUNGE BRIDGE  —  360° VIP salonunu kulübün GERÇEK katmanına bağlar
   ───────────────────────────────────────────────────────────────────────────────────────
   Bu modül gate-3d-photogrammetry.js'e DOKUNMAZ; tur ayakta ise üstüne biner:

   1) HOTSPOT → GERÇEK İŞLEV : kapı (mühür), bar (günlük ritüel), rulet (gerçek masa,
      gerçek bakiye), salon (kasa/VIP). Kamera seyahati bitince aksiyon tetiklenir.
   2) SALON İÇİ CANLI HUD   : bakiye · VIP kademesi · mühür durumu · kademe ilerlemesi.
   3) KAPI SERTLEŞTİRME     : art arda hatalı mühür → süreli kilit (brute-force kapısı).
   4) KADEME → 3D SAHNE     : hotspot halkaları VIP kademesinin rengini alır.
   5) GÖRSEL HAT            : ACES + OutputPass + SMAA + PMREM ortam + anizotropi
                              + raycaster odaklı Bokeh (DOF) + havada toz zerreleri.

   Tüm adımlar try/catch içinde: bir adım patlarsa tur çalışmaya devam eder.
   ═════════════════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { BokehPass }    from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass }   from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass }     from 'three/addons/postprocessing/SMAAPass.js';

/* ── Ayarlar ───────────────────────────────────────────────────────────────────────── */
const CFG = {
  storeKey: 'durtu_lounge',
  travelMs: 1450,          // motorun kamera LERP'i bitince aksiyon tetiklenir
  maxAttempts: 5,          // kapı: üst üste hatalı mühür
  lockMs: 90000,           // kilit süresi
  minTableChips: 25,       // masaya oturmak için asgari bakiye
  focusDefault: 8.0,       // bokeh: boşluğa bakarken odak (m)
  focusLerp: 0.15
};

/* VIP kademesi → sahnedeki hotspot rengi */
const TIER_COLORS = {
  bronz: 0xcd7f32, gumus: 0xd6dade, altin: 0xf6c445, platin: 0xbfe9ff, elmas: 0xd9b3ff
};

/* ── Kulüp global'leriyle güvenli konuşma (klasik script'teki const/let/function) ── */
const safe = (fn, fallback) => { try { const v = fn(); return (v === undefined ? fallback : v); } catch (e) { return fallback; } };
const chips      = () => safe(() => state.chips, 0);
const entered    = () => safe(() => !!state.entered, false);
const wagered    = () => safe(() => (state.stats && state.stats.wagered) || 0, 0);
const streak     = () => safe(() => state.streakDays || 1, 1);
const nameOf     = () => safe(() => state.name || 'Misafir', 'Misafir');
const tierInfo   = () => safe(() => getVipInfo(wagered()), null);

/* ── Kalıcı salon durumu ────────────────────────────────────────────────────────────── */
const LOUNGE = {
  ready: false,
  data: { sealOk: false, attempts: 0, lockedUntil: 0, visited: {}, lastHotspot: null, dust: true },
  _navOnly: false,
  _actionTimer: null,
  _inst: null
};

function load() {
  try {
    const raw = localStorage.getItem(CFG.storeKey);
    if (raw) Object.assign(LOUNGE.data, JSON.parse(raw));
  } catch (e) {}
  if (!LOUNGE.data.visited) LOUNGE.data.visited = {};
}
function save() {
  try { localStorage.setItem(CFG.storeKey, JSON.stringify(LOUNGE.data)); } catch (e) {}
}

/* ── Küçük UI yardımcıları ──────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

function whisper(text, ms) {
  const el = $('gateWhisper');
  if (!el) return;
  el.textContent = text;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  clearTimeout(whisper._t);
  if (ms !== 0) whisper._t = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, ms || 4200);
}
const toastSafe = (html) => { try { toast(html); } catch (e) {} };

function openVaultPanel(tab) {
  try {
    if (typeof openVault === 'function') {
      if (tab && typeof switchVaultTab === 'function') switchVaultTab(tab);
      openVault();
      return true;
    }
  } catch (e) {}
  return false;
}

/* ── HOTSPOT → GERÇEK AKSİYON ───────────────────────────────────────────────────────── */
const ACTIONS = {
  /* 🚪 Kapı: mühür doğrulanmadıysa input'a odaklan, doğrulandıysa kasayı aç */
  entrance: {
    whisper: 'Tokmak soğuk. Mührü fısılda — kapı ancak o zaman tanır.',
    note: 'Kapı · mühür bekliyor',
    run() {
      if (LOUNGE.data.sealOk || entered()) {
        const t = tierInfo();
        openVaultPanel('chips');
        toastSafe('🚪 <b>Mühür geçerli.</b> Hoş geldin ' + nameOf() + (t ? ' · ' + t.tier.icon + ' ' + t.tier.name + ' kademe' : ''));
      } else {
        const inp = $('gateNameCine');
        if (inp) {
          inp.focus();
          inp.style.borderColor = 'rgba(246,226,122,.85)';
          inp.style.boxShadow = '0 0 0 3px rgba(212,175,55,.18)';
          setTimeout(() => { inp.style.borderColor = ''; inp.style.boxShadow = ''; }, 2600);
        }
        whisper('Geçerli mühürler: DURTU-VIP · SELIN-2026 · SPEAKEASY-77 · KARA-KUZGUN · GECE-00', 6000);
        toastSafe('✦ <b>Kapı kulak kesildi.</b> Mührünü yaz, içeri süzül.');
      }
    }
  },

  /* 🥂 Bar: gerçek günlük ritüel (bakiye + seri) */
  bar: {
    whisper: 'Barmen seni tanıdı — günlük ritüel tezgahta duruyor.',
    note: 'Bar · günlük ritüel',
    run() {
      try {
        if (typeof claimDailyBonus === 'function') claimDailyBonus();
        else toastSafe('🥂 Bar bu gece kapalı.');
      } catch (e) { toastSafe('🥂 Ritüel şu an alınamadı.'); }
      setTimeout(() => { const t = tierInfo(); if (t) whisper('Seri: ' + streak() + ' gün · bakiye ◈ ' + Math.round(chips()).toLocaleString('tr-TR') + ' dürTL', 3600); }, 900);
    }
  },

  /* 🎰 Rulet: gerçek masa, gerçek bakiye (yetmezse kasa) */
  roulette: {
    whisper: 'Fildişi top tıkırdıyor. Masa boş — krupiye sadece seni bekliyor.',
    note: 'Rulet · gerçek masa',
    run() {
      const bal = chips();
      if (bal < CFG.minTableChips) {
        whisper('Masa sıcak ama cüzdan ince. Kasa şu tarafta.', 4200);
        toastSafe('💸 <b>Masa için en az ◈ ' + CFG.minTableChips + ' dürTL gerekir.</b> Kasa açılıyor…');
        openVaultPanel('chips');
        return;
      }
      try {
        if (typeof openTable === 'function') { openTable('rl'); toastSafe('🎡 <b>Masa senin.</b> Bakiye ◈ ' + Math.round(bal).toLocaleString('tr-TR') + ' dürTL — krupiye hazır.'); }
        else openVaultPanel('chips');
      } catch (e) { toastSafe('🎰 Masa şu an kurulamadı.'); }
    }
  },

  /* 🛋 VIP Salon: kasa + VIP defteri */
  lounge: {
    whisper: 'Deri koltuklar sıcak. Kasa, çevrim ve VIP defteri burada.',
    note: 'VIP Salon · kasa',
    run() {
      const t = tierInfo();
      openVaultPanel('chips');
      if (t) toastSafe('🛋 <b>' + t.tier.icon + ' ' + t.tier.name + ' kademe</b>' + (t.next ? ' · sonraki kademeye ◈ ' + Math.round(t.remaining).toLocaleString('tr-TR') : ' · zirvedesin'));
    }
  }
};

/* ── Salon içi canlı HUD ────────────────────────────────────────────────────────────── */
function injectHud() {
  if ($('loungeHud')) return;
  const css = document.createElement('style');
  css.textContent = `
    #loungeHud{position:absolute;left:clamp(1rem,3vw,1.8rem);bottom:clamp(5.2rem,10vh,7.2rem);z-index:6;
      pointer-events:none;min-width:210px;padding:.75rem .9rem;border-radius:3px;
      background:linear-gradient(180deg,rgba(12,10,7,.82),rgba(8,7,5,.72));
      border:1px solid rgba(212,175,55,.28);backdrop-filter:blur(10px);
      box-shadow:0 14px 40px rgba(0,0,0,.7),inset 0 1px 0 rgba(246,226,122,.10);
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;opacity:0;transform:translateY(10px);
      transition:opacity .7s ease,transform .7s ease}
    #loungeHud.on{opacity:1;transform:translateY(0)}
    #loungeHud .lh-row{display:flex;justify-content:space-between;gap:1rem;font-size:9px;letter-spacing:.18em;
      text-transform:uppercase;color:rgba(244,236,224,.45);line-height:2}
    #loungeHud .lh-v{color:var(--gold,#d8b45f);letter-spacing:.10em}
    #loungeHud .lh-bar{height:2px;background:rgba(212,175,55,.14);margin-top:.45rem;overflow:hidden}
    #loungeHud .lh-bar i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#8a6d1f,#f6e27a);
      transition:width .8s ease;box-shadow:0 0 10px rgba(246,226,122,.5)}
    #loungeHud .lh-note{margin-top:.5rem;font-size:8.5px;letter-spacing:.14em;color:rgba(244,236,224,.35);
      text-transform:uppercase;border-top:1px solid rgba(212,175,55,.14);padding-top:.45rem}
    #loungeHud .lh-note b{color:#f6e27a;font-weight:400}
    @media (max-width:720px){#loungeHud{display:none}}
  `;
  document.head.appendChild(css);

  const hud = document.createElement('div');
  hud.id = 'loungeHud';
  hud.innerHTML = `
    <div class="lh-row"><span>bakiye</span><span class="lh-v" id="lhChips">◈ 0</span></div>
    <div class="lh-row"><span>kademe</span><span class="lh-v" id="lhTier">🥉 Bronz</span></div>
    <div class="lh-row"><span>mühür</span><span class="lh-v" id="lhSeal">bekleniyor</span></div>
    <div class="lh-bar"><i id="lhProg"></i></div>
    <div class="lh-note" id="lhNote">Salonda 4 odak noktası var</div>`;
  const gate = $('gate') || document.body;
  gate.appendChild(hud);
}

function updateHud() {
  const hud = $('loungeHud');
  if (!hud) return;
  const gate = $('gate');
  const visible = !!(gate && !gate.classList.contains('leaving') && gate.offsetParent !== null && !entered());
  hud.classList.toggle('on', visible);
  if (!visible) return;

  const t = tierInfo();
  const elC = $('lhChips'), elT = $('lhTier'), elS = $('lhSeal'), elP = $('lhProg'), elN = $('lhNote');
  if (elC) elC.textContent = '◈ ' + Math.round(chips()).toLocaleString('tr-TR');
  if (t) {
    if (elT) elT.textContent = t.tier.icon + ' ' + t.tier.name;
    if (elP) elP.style.width = t.pct + '%';
  }
  const now = Date.now();
  if (elS) {
    if (LOUNGE.data.lockedUntil > now) {
      elS.textContent = 'kilitli ' + Math.ceil((LOUNGE.data.lockedUntil - now) / 1000) + 's';
      elS.style.color = '#fca5a5';
    } else if (LOUNGE.data.sealOk || entered()) {
      elS.textContent = 'doğrulandı';
      elS.style.color = '#4ade80';
    } else {
      elS.textContent = 'bekleniyor';
      elS.style.color = '';
    }
  }
  if (elN) {
    const n = Object.keys(LOUNGE.data.visited || {}).length;
    elN.innerHTML = 'Salonda <b>' + n + '/4</b> odak gezildi' + (LOUNGE.data.lastHotspot ? ' · son: <b>' + LOUNGE.data.lastHotspot + '</b>' : '');
  }
}

/* ── Kapı sertleştirme: üst üste hatalı mühür → süreli kilit ─────────────────────────── */
function installGateGuard() {
  /* Hedef elementin kendi dinleyicisinden ÖNCE yakalamak için document'te capture. */
  document.addEventListener('click', (e) => {
    LOUNGE._navOnly = !!(e.target && e.target.closest && e.target.closest('#gateHsBar'));
    if (e.target && e.target.id === 'gateSubmitCine') sealAttempt(e);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.id === 'gateNameCine') sealAttempt(e);
  }, true);
}

function sealAttempt(e) {
  const now = Date.now();
  if (LOUNGE.data.lockedUntil > now) {
    e.preventDefault();
    e.stopPropagation();
    const s = Math.ceil((LOUNGE.data.lockedUntil - now) / 1000);
    whisper('Kapıcı deftere not aldı — ' + s + ' saniye nefeslen.', 0);
    const inp = $('gateNameCine');
    if (inp) { inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 500); }
    toastSafe('🔒 <b>Çok fazla yabancı mühür.</b> Kapı ' + s + ' sn kilitli.');
    updateHud();
    return;
  }
  LOUNGE.data.attempts = (LOUNGE.data.attempts || 0) + 1;
  if (LOUNGE.data.attempts >= CFG.maxAttempts) {
    LOUNGE.data.lockedUntil = now + CFG.lockMs;
    LOUNGE.data.attempts = 0;
    whisper('Beş yabancı mühür. Kapı 90 saniye dinlenecek.', 0);
  }
  save();
}

/* ── VIP kademesini 3D sahneye yansıt (hotspot halkaları) ─────────────────────────────── */
function paintHotspots() {
  const inst = LOUNGE._inst;
  const info = tierInfo();
  if (!inst || !inst.hotspotMeshes || !info) return;
  const c = new THREE.Color(TIER_COLORS[info.tier.id] || 0xd4af37);
  inst.hotspotMeshes.forEach(m => {
    const mat = m.material;
    if (!mat) return;
    if (m.userData && m.userData.type === 'outer') {
      if (mat.color) mat.color.copy(c);
      if (mat.emissive) mat.emissive.copy(c);
      mat.needsUpdate = true;
    }
  });
}

/* ── Görsel hat: doğru renk yönetimi + ortam yansıması + DOF + toz ───────────────────── */
function upgradeVisuals(inst) {
  const r = inst.renderer, sc = inst.scene, cam = inst.camera;

  /* 0) Ana kamera katman 1'i de görsün (toz zerreleri orada) */
  cam.layers.enable(1);

  /* 1) Ton eşleme + renk uzayı */
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.12;
  r.outputColorSpace = THREE.SRGBColorSpace;

  /* 2) Panorama dokusunda tam anizotropi */
  const pano = panoTexture(inst);
  if (pano) {
    pano.anisotropy = r.capabilities.getMaxAnisotropy();
    pano.needsUpdate = true;
  }

  /* 3) PMREM: panoramadan ön-filtrelenmiş ortam → mermer/pirinç gerçek yansıma */
  bakeEnvironment(inst);

  /* 4) Toz zerreleri — havada süzülen gerçeklik katmanı */
  if (LOUNGE.data.dust !== false) addDust(inst);

  /* 5) Çıktı zinciri: Bokeh (raycaster odak) → SMAA → OutputPass */
  const comp = inst.composer;
  if (comp) {
    try {
      const depthCam = cam.clone();
      depthCam.layers.set(0);                    // toz ve parlamalar derinlikten muaf
      const bokeh = new BokehPass(sc, depthCam, {
        focus: CFG.focusDefault, aperture: 0.0008, maxblur: 0.012
      });
      const origBokeh = bokeh.render.bind(bokeh);
      bokeh.render = (renderer, writeBuffer, readBuffer, dt, mask) => {
        /* derinlik kamerasını her kare ana kamerayla eşitle */
        depthCam.position.copy(cam.position);
        depthCam.quaternion.copy(cam.quaternion);
        depthCam.fov = cam.fov; depthCam.aspect = cam.aspect;
        depthCam.near = cam.near; depthCam.far = cam.far;
        depthCam.updateProjectionMatrix();
        depthCam.updateMatrixWorld(true);
        if (bokeh.uniforms['aspect']) bokeh.uniforms['aspect'].value = cam.aspect;
        origBokeh(renderer, writeBuffer, readBuffer, dt, mask);
      };
      comp.insertPass ? comp.insertPass(bokeh, 1) : comp.addPass(bokeh);
      LOUNGE.bokeh = bokeh;
    } catch (e) { console.warn('[lounge] bokeh atlandı:', e); }

    try {
      const smaa = new SMAAPass(window.innerWidth * r.getPixelRatio(), window.innerHeight * r.getPixelRatio());
      comp.addPass(smaa);
      LOUNGE.smaa = smaa;
    } catch (e) { console.warn('[lounge] smaa atlandı:', e); }

    try { comp.addPass(new OutputPass()); } catch (e) { console.warn('[lounge] outputpass atlandı:', e); }
  }
}

/* Panorama dokusu + PMREM ortamı (doku geç yüklenirse yeniden pişirilir) */
function panoTexture(inst) {
  const m = inst.sphereMesh && inst.sphereMesh.material;
  return (m && m.map) ? m.map : null;
}

function bakeEnvironment(inst) {
  const pano = panoTexture(inst);
  if (!pano || pano.mapping !== THREE.EquirectangularReflectionMapping) return false;
  const r = inst.renderer;
  try {
    const pmrem = new THREE.PMREMGenerator(r);
    const rt = pmrem.fromEquirectangular(pano);
    if (LOUNGE._envRT) { try { LOUNGE._envRT.dispose(); } catch (e) {} }
    LOUNGE._envRT = rt;
    inst.scene.environment = rt.texture;
    const map = { floorMat: 1.35, brassMat: 1.9 };
    Object.keys(map).forEach(k => {
      const m = inst[k];
      if (!m) return;
      m.envMap = rt.texture;
      m.envMapIntensity = map[k];
      if ('clearcoat' in m) m.clearcoat = Math.max(m.clearcoat || 0, 0.45);
      m.needsUpdate = true;
    });
    if (inst.floorMat) inst.floorMat.roughness = Math.min(inst.floorMat.roughness, 0.18);
    pmrem.dispose();
    LOUNGE._panoRef = pano;
    return true;
  } catch (e) {
    LOUNGE._panoRef = pano;   // tekrar tekrar denemeyi önle
    console.warn('[lounge] PMREM atlandı:', e);
    return false;
  }
}

/* Toz bulutu: shader ile süzülen additive Points */
function addDust(inst, count = 620) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 15;
    pos[i * 3 + 1] = -1.4 + Math.random() * 3.9;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 15;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: 34 }, uColor: { value: new THREE.Color(0xffe6bd) }, uOpacity: { value: 0.30 } },
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime; uniform float uSize;
      varying float vA;
      void main(){
        vec3 p = position;
        float s = aSeed * 62.83;
        p.x += sin(uTime * 0.11 + s) * 0.40;
        p.y += sin(uTime * 0.07 + s * 1.7) * 0.24;
        p.z += cos(uTime * 0.09 + s * 1.3) * 0.40;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (1.0 / max(-mv.z, 0.1));
        gl_Position = projectionMatrix * mv;
        vA = 0.22 + 0.78 * abs(sin(uTime * 0.6 + s));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA * uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  });

  const pts = new THREE.Points(geo, mat);
  pts.layers.set(1);
  pts.frustumCulled = false;
  inst.scene.add(pts);
  LOUNGE.dust = pts;
}

/* Odak: raycaster ile bakılan nokta, boşluksa 8 m — 0.15 damping ile yumuşar */
const _ray = new THREE.Raycaster();
const _ctr = new THREE.Vector2(0, 0);
let _focus = CFG.focusDefault;

function updateFocus(inst) {
  if (!LOUNGE.bokeh) return;
  _ray.setFromCamera((inst.mouse && inst.mouse.lengthSq() > 0) ? inst.mouse : _ctr, inst.camera);
  const targets = [];
  inst.scene.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    if (o === inst.sphereMesh) return;                       // kabuk: panorama
    if (o.isPoints) return;
    if (o.userData && o.userData.hotspotId) return;
    targets.push(o);
  });
  const hits = _ray.intersectObjects(targets, false);
  const target = (hits.length && hits[0].distance > 0.2) ? hits[0].distance : CFG.focusDefault;
  _focus += (target - _focus) * CFG.focusLerp;
  LOUNGE.bokeh.uniforms['focus'].value = _focus;
}

/* ── Tur örneğini yakala ve aksiyonları bağla ───────────────────────────────────────── */
function bindTour(inst) {
  LOUNGE._inst = inst;
  const orig = inst.onHotspotActivated ? inst.onHotspotActivated.bind(inst) : null;

  inst.onHotspotActivated = (hs) => {
    try { if (orig) orig(hs); } catch (e) {}
    if (!hs || !hs.id) return;
    LOUNGE.data.lastHotspot = hs.label || hs.id;
    LOUNGE.data.visited[hs.id] = (LOUNGE.data.visited[hs.id] || 0) + 1;
    save();

    const act = ACTIONS[hs.id];
    if (!act) return;
    whisper(act.whisper, 4600);

    /* Alt gezinti çubuğundan geliyorsa sadece bakış — aksiyon tetikleme */
    if (LOUNGE._navOnly) { LOUNGE._navOnly = false; return; }

    clearTimeout(LOUNGE._actionTimer);
    LOUNGE._actionTimer = setTimeout(() => {
      try { act.run(); } catch (e) { console.warn('[lounge] aksiyon:', e); }
      updateHud();
    }, CFG.travelMs);
  };

  /* Görsel yükseltme */
  try { upgradeVisuals(inst); } catch (e) { console.warn('[lounge] görsel yükseltme:', e); }
  try { paintHotspots(); } catch (e) {}
}

/* ── Ana döngü: HUD tick + toz zamanı + odak + kademe değişimi ──────────────────────── */
let _lastTier = null;
let _lastChips = null;
function tick(t) {
  requestAnimationFrame(tick);
  const inst = LOUNGE._inst;
  const time = t * 0.001;

  if (LOUNGE.dust) LOUNGE.dust.material.uniforms.uTime.value = time;
  if (inst) {
    if ((inst.frameCount = (inst.frameCount || 0) + 1) % 4 === 0) {
      try { updateFocus(inst); } catch (e) {}
    }
  }
  if (!window.__lhLast || t - window.__lhLast > 500) {
    window.__lhLast = t;
    try {
      /* panorama sonradan yüklendiyse ortamı bir kez yeniden pişir */
      if (inst && panoTexture(inst) !== LOUNGE._panoRef) bakeEnvironment(inst);
      updateHud();
      const info = tierInfo();
      const id = info ? info.tier.id : null;
      if (id && id !== _lastTier) { _lastTier = id; paintHotspots(); }
      /* büyük kazanç: salon seni fark etsin */
      const c = chips();
      if (_lastChips !== null && c - _lastChips >= 500) {
        whisper('＋ ◈ ' + Math.round(c - _lastChips).toLocaleString('tr-TR') + ' — salon seni fark etti.', 4200);
      }
      _lastChips = c;
      /* başarılı girişte mühür sayacını sıfırla */
      if (entered() && !LOUNGE.data.sealOk) { LOUNGE.data.sealOk = true; LOUNGE.data.attempts = 0; LOUNGE.data.lockedUntil = 0; save(); }
    } catch (e) {}
  }
}

/* ── Açılış ─────────────────────────────────────────────────────────────────────────── */
export function initLoungeBridge() {
  if (LOUNGE.ready) return LOUNGE;
  LOUNGE.ready = true;
  load();

  try { injectHud(); } catch (e) { console.warn('[lounge] hud:', e); }
  try { installGateGuard(); } catch (e) { console.warn('[lounge] kapı koruması:', e); }

  /* Tur örneği 300 ms sonra kuruluyor — hazır olunca bağlan */
  let tries = 0;
  const wait = setInterval(() => {
    tries++;
    const inst = window._tourInstance;
    if (inst && inst.scene && inst.camera) {
      clearInterval(wait);
      try { bindTour(inst); } catch (e) { console.warn('[lounge] bağlanma:', e); }
      console.log('%c DÜRTÜ · LOUNGE BRIDGE aktif ' + '%c hotspotlar gerçek kulübe bağlandı',
        'background:#d4af37;color:#0b0a08;font-weight:700', 'color:#d4af37');
    } else if (tries > 60) {
      clearInterval(wait);
      console.warn('[lounge] tur örneği bulunamadı — köprü beklemede.');
    }
  }, 250);

  requestAnimationFrame(tick);
  window.LOUNGE = LOUNGE;
  return LOUNGE;
}

window.initLoungeBridge = initLoungeBridge;
export default LOUNGE;
