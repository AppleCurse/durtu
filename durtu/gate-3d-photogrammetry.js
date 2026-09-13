/* Three.js Photogrammetric Gate — LiDAR PBR + Damping + Bokeh + Convolution Reverb + Hotspots */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let scene, camera, renderer, composer, bokehPass, pmrem, envMap;
let controls = { targetRotX:0, targetRotY:0, curRotX:0, curRotY:0, damping:0.05, isDragging:false, lastX:0, lastY:0 };
let hotspots=[], raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
let clock=new THREE.Clock();
let doorMesh, floorMesh;
let focusTarget = { x:0, y:0.4, z:-3.2 };
let isZooming=false, zoomStart=0, zoomFrom=null, zoomTo=null;

function makeMarbleTexture(){
  const c=document.createElement('canvas'); c.width=512; c.height=512;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#0e0c08'; ctx.fillRect(0,0,512,512);
  for(let i=0;i<8000;i++){
    const x=Math.random()*512, y=Math.random()*512, r=Math.random()*1.5+0.3;
    const v=180+Math.random()*40; ctx.fillStyle=`rgba(${v},${v-5},${v-20},${0.04+Math.random()*0.06})`;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  ctx.strokeStyle='rgba(212,175,55,0.08)'; ctx.lineWidth=1;
  for(let i=0;i<12;i++){
    ctx.beginPath(); ctx.moveTo(Math.random()*512,0);
    ctx.bezierCurveTo(Math.random()*512,170, Math.random()*512,340, Math.random()*512,512);
    ctx.stroke();
  }
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(2,6); tex.anisotropy=8; return tex;
}
function makeBrassTexture(){
  const c=document.createElement('canvas'); c.width=256; c.height=256;
  const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,256,0);
  g.addColorStop(0,'#8a6a20'); g.addColorStop(0.5,'#f6e27a'); g.addColorStop(1,'#8a6a20');
  ctx.fillStyle=g; ctx.fillRect(0,0,256,256);
  ctx.fillStyle='rgba(0,0,0,0.08)'; for(let i=0;i<256;i+=4){ ctx.fillRect(i,0,2,256); }
  const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; return tex;
}
function createImpulseResponse(ac, duration=2.8, decay=2.0){
  const rate=ac.sampleRate, len=rate*duration;
  const buf=ac.createBuffer(2,len,rate);
  for(let ch=0;ch<2;ch++){
    const data=buf.getChannelData(ch);
    for(let i=0;i<len;i++){
      const t=i/rate;
      const early = (Math.random()*2-1)*Math.pow(1-t/duration, 3.5)*0.5;
      const late = (Math.random()*2-1)*Math.exp(-decay*t)*0.35;
      data[i]=early+late;
    }
  }
  return buf;
}
function attachReverb(){
  try{
    const ac=window.gateAC; if(!ac||window._gateReverbAttached) return;
    if(!window.gateFilter) return;
    const convolver=ac.createConvolver();
    convolver.buffer=createImpulseResponse(ac, 2.9, 1.9);
    // keep existing connections, add convolver in parallel with dry
    try{ window.gateFilter.disconnect(); }catch(e){}
    const dry=ac.createGain(); dry.gain.value=0.62;
    const wet=ac.createGain(); wet.gain.value=0.38;
    window.gateFilter.connect(dry); dry.connect(ac.destination);
    window.gateFilter.connect(convolver); convolver.connect(wet); wet.connect(ac.destination);
    window.gateConvolver=convolver;
    window._gateReverbAttached=true;
    console.log('Convolution reverb attached — hall 2.9s');
  }catch(e){ console.warn('reverb attach fail',e); }
}

export function initThreeGate(){
  const canvas=document.getElementById('gateCanvas');
  if(!canvas) return;
  renderer=new THREE.WebGLRenderer({canvas, antialias:true, alpha:false});
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  renderer.setSize(canvas.clientWidth||window.innerWidth, canvas.clientHeight||window.innerHeight);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;

  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x050505);
  scene.fog=new THREE.Fog(0x050505, 6, 14);

  camera=new THREE.PerspectiveCamera(58, canvas.clientWidth/canvas.clientHeight, 0.1, 100);
  camera.position.set(0,1.15,1.2);

  pmrem=new THREE.PMREMGenerator(renderer);
  const envScene=new RoomEnvironment();
  const envTex=pmrem.fromScene(envScene,0.04).texture;
  envMap=envTex;
  scene.environment=envMap;

  const amb=new THREE.AmbientLight(0xfff6e0,0.18);
  scene.add(amb);
  const key=new THREE.DirectionalLight(0xffe9a8,1.9);
  key.position.set(2.5,4,2); key.castShadow=true; key.shadow.mapSize.set(1024,1024);
  key.shadow.bias=-0.0002;
  scene.add(key);
  const fill=new THREE.PointLight(0xffd27a,0.9,8); fill.position.set(-2,1.8,-1.5); scene.add(fill);
  const brassLight=new THREE.PointLight(0xf6e27a,0.8,6); brassLight.position.set(0,2.2,-3); scene.add(brassLight);
  const rim=new THREE.PointLight(0x8a6a20,0.5,5); rim.position.set(0,0.2,0.5); scene.add(rim);

  const marbleTex=makeMarbleTexture();
  const brassTex=makeBrassTexture();

  const floorGeo=new THREE.PlaneGeometry(14,22);
  const floorMat=new THREE.MeshStandardMaterial({map:marbleTex, roughness:0.32, metalness:0.08, envMapIntensity:0.9});
  floorMesh=new THREE.Mesh(floorGeo,floorMat);
  floorMesh.rotation.x=-Math.PI/2; floorMesh.position.y=-0.9; floorMesh.position.z=-2.5;
  floorMesh.receiveShadow=true;
  scene.add(floorMesh);

  const wallMat=new THREE.MeshStandardMaterial({color:0x0a0907, roughness:0.78, metalness:0.04, envMapIntensity:0.25});
  const wallLeft=new THREE.Mesh(new THREE.PlaneGeometry(12,7), wallMat);
  wallLeft.position.set(-3.2,0.9,-2.5); wallLeft.rotation.y=Math.PI/2.2; scene.add(wallLeft);
  const wallRight=new THREE.Mesh(new THREE.PlaneGeometry(12,7), wallMat);
  wallRight.position.set(3.2,0.9,-2.5); wallRight.rotation.y=-Math.PI/2.2; scene.add(wallRight);

  const trimMat=new THREE.MeshStandardMaterial({map:brassTex, metalness:0.93, roughness:0.22, envMapIntensity:1.25, color:0xffffff});
  for(let i=0;i<7;i++){
    const trim=new THREE.Mesh(new THREE.BoxGeometry(0.025,4.2,0.025), trimMat);
    trim.position.set(-2.6 + i*0.86, 1.2, -0.6 - i*0.03);
    trim.castShadow=true; scene.add(trim);
  }

  const ceilGeo=new THREE.PlaneGeometry(14,12);
  const ceilMat=new THREE.MeshStandardMaterial({color:0x12100c, roughness:0.58, metalness:0.08, envMapIntensity:0.35});
  const ceil=new THREE.Mesh(ceilGeo,ceilMat);
  ceil.rotation.x=Math.PI/2; ceil.position.y=2.7; ceil.position.z=-2.5; scene.add(ceil);

  // Door — PBR with brass spec
  const doorGeo=new THREE.BoxGeometry(1.15,2.15,0.09);
  const doorMat=new THREE.MeshStandardMaterial({color:0x1a1510, metalness:0.18, roughness:0.38, envMapIntensity:0.65});
  doorMesh=new THREE.Mesh(doorGeo,doorMat);
  doorMesh.position.set(0,0.48,-3.35); doorMesh.castShadow=true; doorMesh.receiveShadow=true;
  scene.add(doorMesh);
  const plate=new THREE.Mesh(new THREE.BoxGeometry(0.92,0.15,0.03), trimMat);
  plate.position.set(0,1.28,-3.30); scene.add(plate);

  // Hotspots — 3D glowing seals
  const sealGeo=new THREE.TorusGeometry(0.19,0.028,18,56);
  const sealMat=new THREE.MeshStandardMaterial({color:0xD4AF37, emissive:0xf6e27a, emissiveIntensity:0.95, metalness:0.85, roughness:0.18});
  const sealFloor=new THREE.Mesh(sealGeo,sealMat);
  sealFloor.rotation.x=Math.PI/2; sealFloor.position.set(0,-0.88,-1.5);
  sealFloor.userData={type:'floor', action:'approach', label:'KAPIYA YAKLAŞ'};
  hotspots.push(sealFloor); scene.add(sealFloor);

  const sealDoorMat=sealMat.clone(); sealDoorMat.emissiveIntensity=1.1;
  const sealDoor=new THREE.Mesh(new THREE.TorusGeometry(0.13,0.022,16,36), sealDoorMat);
  sealDoor.position.set(0,0.48,-3.26); sealDoor.userData={type:'door', action:'knock', label:'TOKMAK'};
  hotspots.push(sealDoor); scene.add(sealDoor);

  const sealTableMat=sealMat.clone(); sealTableMat.color.set(0x8a6a20);
  const sealTable=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.025,36), sealTableMat);
  sealTable.position.set(-1.5,-0.42,-2.6); sealTable.userData={type:'table', action:'focus', label:'MASA'};
  hotspots.push(sealTable); scene.add(sealTable);

  // Composer + Bokeh DOF
  composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  bokehPass=new BokehPass(scene,camera,{focus:3.25, aperture:0.00022, maxblur:0.014});
  composer.addPass(bokehPass);

  window.addEventListener('resize', onResize);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', e=>{controls.isDragging=true; controls.lastX=e.clientX; controls.lastY=e.clientY;});
  window.addEventListener('mouseup', ()=>controls.isDragging=false);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchstart', e=>{ if(e.touches[0]){controls.lastX=e.touches[0].clientX; controls.lastY=e.touches[0].clientY;}}, {passive:true});
  canvas.addEventListener('touchmove', e=>{ if(e.touches[0]) onMouseMove({clientX:e.touches[0].clientX, clientY:e.touches[0].clientY}); }, {passive:true});

  if(window.DeviceOrientationEvent){
    window.addEventListener('deviceorientation', ev=>{
      const gamma=ev.gamma||0, beta=ev.beta||0;
      controls.targetRotY=THREE.MathUtils.clamp(gamma/45,-0.9,0.9)*0.6;
      controls.targetRotX=THREE.MathUtils.clamp((beta-45)/45,-0.6,0.6)*0.35;
      if(window.gateAudioListenerUpdate) window.gateAudioListenerUpdate(controls.targetRotY, controls.targetRotX);
    });
  }

  // try attach reverb now and on interval
  attachReverb();
  setInterval(attachReverb, 800);

  animate();
}

function onResize(){
  const canvas=document.getElementById('gateCanvas');
  if(!canvas||!camera||!renderer) return;
  const w=canvas.clientWidth||window.innerWidth, h=canvas.clientHeight||window.innerHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h); composer.setSize(w,h);
}
function onMouseMove(e){
  if(window.gateSealed) return;
  const nx=(e.clientX/window.innerWidth-0.5)*2;
  const ny=(e.clientY/window.innerHeight-0.5)*2;
  controls.targetRotY=nx*0.55;
  controls.targetRotX=-ny*0.28;
  mouse.x=(e.clientX/window.innerWidth)*2-1;
  mouse.y=-(e.clientY/window.innerHeight)*2+1;
  if(window.gateAudioListenerUpdate) window.gateAudioListenerUpdate(controls.targetRotY, controls.targetRotX);
}
function onClick(){
  raycaster.setFromCamera(mouse, camera);
  const inter=raycaster.intersectObjects(hotspots);
  if(inter.length>0){
    const obj=inter[0].object;
    const act=obj.userData.action;
    if(act==='approach'){
      if(window.gateApproach) window.gateApproach();
      smoothZoomTo(new THREE.Vector3(0,0.85,-1.1), new THREE.Vector3(0,0.4,-2.4));
      if(bokehPass) bokehPass.uniforms.focus.value=2.4;
    } else if(act==='knock'){
      if(window.gateKnock) window.gateKnock();
      smoothZoomTo(new THREE.Vector3(0,0.58,-1.9), new THREE.Vector3(0,0.48,-3.35));
      if(bokehPass) bokehPass.uniforms.focus.value=1.9;
      if(window.gateLatchScrape) window.gateLatchScrape();
    } else if(act==='focus'){
      smoothZoomTo(new THREE.Vector3(-0.9,0.25,-1.4), new THREE.Vector3(-1.5,-0.42,-2.6));
      if(bokehPass) bokehPass.uniforms.focus.value=1.55;
    }
  } else {
    if(Math.abs(mouse.x)<0.38 && Math.abs(mouse.y)<0.55){
      if(window.gateKnock) window.gateKnock();
    }
  }
}
function smoothZoomTo(camPos, lookAt){
  if(isZooming) return;
  isZooming=true;
  zoomStart=clock.getElapsedTime();
  zoomFrom={pos:camera.position.clone(), target:{...focusTarget}};
  zoomTo={pos:camPos, target:lookAt};
}
function perlinMicroShake(t){
  const f1=Math.sin(t*0.7)*0.5+Math.sin(t*1.37)*0.3+Math.sin(t*2.11)*0.12;
  const f2=Math.cos(t*0.83)*0.5+Math.cos(t*1.19)*0.28+Math.cos(t*0.41)*0.15;
  const f3=Math.sin(t*0.42)*Math.cos(t*0.63)*0.8;
  return {x:f1*0.002, y:f2*0.002, z:f3*0.0012};
}
function animate(){
  requestAnimationFrame(animate);
  const t=clock.getElapsedTime();
  const dt=clock.getDelta();

  controls.curRotX += (controls.targetRotX - controls.curRotX)*controls.damping;
  controls.curRotY += (controls.targetRotY - controls.curRotY)*controls.damping;

  const shake=perlinMicroShake(t);
  const baseX=controls.curRotX+shake.x;
  const baseY=controls.curRotY+shake.y;

  if(!isZooming){
    camera.rotation.x=baseX;
    camera.rotation.y=baseY;
    camera.rotation.z=shake.z;
  } else {
    const elapsed=t-zoomStart, dur=1.45;
    const k=Math.min(1, elapsed/dur);
    const ease=k<0.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
    camera.position.lerpVectors(zoomFrom.pos, zoomTo.pos, ease);
    focusTarget.x=THREE.MathUtils.lerp(zoomFrom.target.x, zoomTo.target.x, ease);
    focusTarget.y=THREE.MathUtils.lerp(zoomFrom.target.y, zoomTo.target.y, ease);
    focusTarget.z=THREE.MathUtils.lerp(zoomFrom.target.z, zoomTo.target.z, ease);
    if(k>=1) isZooming=false;
  }
  camera.lookAt(focusTarget.x, focusTarget.y, focusTarget.z);

  hotspots.forEach((h,i)=>{
    const s=1+Math.sin(t*1.9+i)*0.13;
    h.scale.set(s,s,s);
    h.rotation.z+=dt*0.55;
    if(h.material.emissiveIntensity) h.material.emissiveIntensity=0.75+Math.sin(t*2.3+i)*0.38;
  });

  if(bokehPass){
    const dist=camera.position.distanceTo(new THREE.Vector3(focusTarget.x, focusTarget.y, focusTarget.z));
    bokehPass.uniforms.focus.value=THREE.MathUtils.lerp(bokehPass.uniforms.focus.value, dist*0.94, 0.03);
  }

  if(window.gateAC && window.gateAC.listener){
    try{
      const l=window.gateAC.listener;
      if(l.positionX){
        l.positionX.setValueAtTime(camera.position.x, window.gateAC.currentTime);
        l.positionY.setValueAtTime(camera.position.y, window.gateAC.currentTime);
        l.positionZ.setValueAtTime(camera.position.z, window.gateAC.currentTime);
        const orient=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
        l.forwardX.setValueAtTime(orient.x, window.gateAC.currentTime);
        l.forwardY.setValueAtTime(orient.y, window.gateAC.currentTime);
        l.forwardZ.setValueAtTime(orient.z, window.gateAC.currentTime);
        l.upX.setValueAtTime(camera.up.x, window.gateAC.currentTime);
        l.upY.setValueAtTime(camera.up.y, window.gateAC.currentTime);
        l.upZ.setValueAtTime(camera.up.z, window.gateAC.currentTime);
      } else {
        l.setPosition(camera.position.x, camera.position.y, camera.position.z);
        const orient=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
        l.setOrientation(orient.x, orient.y, orient.z, camera.up.x, camera.up.y, camera.up.z);
      }
    }catch(e){}
  }

  composer.render();
}
window.initThreeGate=initThreeGate;
