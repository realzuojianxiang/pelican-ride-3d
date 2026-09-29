import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Bicycle } from './bicycle.js';
import { Pelican } from './pelican.js';
import { World, ROAD_LEN } from './world.js';
import { Audio } from './audio.js';
import { Effects } from './effects.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

/* ============================================================
   0. 渲染器 / 场景 / 相机
   ============================================================ */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 900);
camera.position.set(-4.2, 2.2, 4.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.6;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 1.0, 0);

/* ============================================================
   1. 世界 / 自行车 / 鹈鹕
   ============================================================ */
const world = new World(scene);
const bike = new Bicycle();
const rig = new THREE.Group();          // 车+鸟 的整体（沿 +Z 前进，模型朝 -Z，故整体转向）
const rider = new THREE.Group();        // 鹈鹕（独立做呼吸/俯仰）
rig.add(bike.group);
rig.add(rider);
scene.add(rig);

const pelican = new Pelican();
rider.add(pelican.root);

// 鹈鹕坐上鞍座：身体中心略高于鞍座
const SEAT = new THREE.Vector3(-0.20, 0.92, 0);
pelican.root.position.copy(SEAT).add(new THREE.Vector3(-0.02, 0.20, 0));
pelican.root.scale.setScalar(1.02);

const fx = new Effects(scene);

/* ============================================================
   2. 物理与运动学状态
   ============================================================ */
const state = {
  speed: 0,          // m/s
  targetSpeed: 0,
  boost: false,
  brake: false,
  crank: 0,          // 曲柄相位
  travel: 0,         // 累计里程 (m)
  lean: 0,           // 侧倾
  bob: 0,
  camMode: 0,
  autoSpin: false,
  bloom: true,
  shadows: true,
  sfx: true,
  paused: false,
};
const TMPQ = new THREE.Quaternion();
const CAM_NAMES = ['追车', '环绕', '低机位', '鹈鹕视角', '俯瞰'];

const audio = new Audio();
const WHEEL_R = bike.wheelRadius;
const CRANK_R = bike.crankRadius;
const GEAR = bike.gearRatio;

/* ============================================================
   3. 后期处理（Bloom）
   ============================================================ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.72, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ============================================================
   4. 载入进度
   ============================================================ */
let loadStep = 0;
const loadTexts = ['正在装配自行车…', '正在给鹈鹕梳羽毛…', '正在铺沥青公路…', '正在调音…', '出发！'];
function tickLoader() {
  loadStep = Math.min(loadStep + 1, loadTexts.length - 1);
  $('bar').style.width = `${((loadStep + 1) / loadTexts.length) * 100}%`;
  $('loadtxt').textContent = loadTexts[loadStep];
}
tickLoader(); tickLoader(); tickLoader(); tickLoader();
requestAnimationFrame(() => {
  $('loader').classList.add('hide');
  toast('空格加速 · 拖拽转视角 · 点击鹈鹕听它叫', 3200);
});

/* ============================================================
   5. UI 交互
   ============================================================ */
let toastTimer;
function toast(msg, ms = 1800) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function squawkBubble(text = '嘎——！') {
  const s = $('squawk');
  s.textContent = text;
  s.classList.add('show');
  setTimeout(() => s.classList.remove('show'), 1100);
}

const btn = (id, fn) => $(id).addEventListener('click', () => { audio.resume(); audio.blip(760); fn(); });
btn('btnCam', () => setCam((state.camMode + 1) % CAM_NAMES.length));
btn('btnBoost', () => { state.boost = true; setTimeout(() => (state.boost = false), 1600); });
btn('btnBell', ringBell);
btn('btnSquawk', () => doSquawk());
btn('btnSfx', () => {
  state.sfx = !state.sfx;
  audio.setEnabled(state.sfx);
  $('btnSfx').classList.toggle('on', state.sfx);
  toast(state.sfx ? '音效已开启' : '音效已静音');
});
btn('btnMusic', () => {
  audio.resume();
  if (audio.musicOn) { audio.stopMusic(); $('btnMusic').classList.remove('on'); toast('音乐已停止'); }
  else { audio.startMusic(); $('btnMusic').classList.add('on'); toast('轻快 BGM 播放中'); }
});
btn('btnBloom', () => {
  state.bloom = !state.bloom;
  bloom.enabled = state.bloom;
  $('btnBloom').classList.toggle('on', state.bloom);
  toast(state.bloom ? '辉光开启' : '辉光关闭');
});
btn('btnShadow', () => {
  state.shadows = !state.shadows;
  renderer.shadowMap.enabled = state.shadows;
  world.setShadows(state.shadows);
  scene.traverse((o) => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
  $('btnShadow').classList.toggle('on', state.shadows);
  toast(state.shadows ? '阴影开启' : '阴影关闭（性能模式）');
});
btn('btnSpin', () => {
  state.autoSpin = !state.autoSpin;
  $('btnSpin').classList.toggle('on', state.autoSpin);
  toast(state.autoSpin ? '自动环绕开启' : '自动环绕关闭');
});
btn('btnShot', screenshot);

function setCam(i) {
  state.camMode = i;
  $('btnCam').textContent = `视角：${CAM_NAMES[i]}`;
  $('cam').textContent = CAM_NAMES[i];
  toast(`视角 → ${CAM_NAMES[i]}`);
}

function ringBell() {
  audio.resume();
  audio.bell();
  bike.bell.scale.setScalar(1.5);
  setTimeout(() => bike.bell.scale.setScalar(1), 220);
  fx.ring(bike.bell.getWorldPosition(new THREE.Vector3()));
}

const SQUAWKS = ['嘎——！', '嘎嘎！', '哇啊——', '咯咯咯！', '今天天气不错！'];
function doSquawk() {
  audio.resume();
  audio.squawk(0.9 + Math.random() * 0.3);
  squawkBubble(SQUAWKS[Math.floor(Math.random() * SQUAWKS.length)]);
  pelican.pouch.scale.set(1.7, 1.25, 1.2);
  pelican.lowerBeak.position.y = -0.075;
  setTimeout(() => {
    pelican.pouch.scale.set(1.35, 0.85, 0.9);
    pelican.lowerBeak.position.y = -0.028;
  }, 380);
}

function screenshot() {
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `pelican-ride-${Date.now()}.png`;
  a.click();
  toast('已保存截图');
}

/* ---------- 键盘 ---------- */
const keys = new Set();
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (keys.has(k)) return;
  keys.add(k);
  audio.resume();
  if (k === ' ' || k === 'arrowup') toast('加速冲刺！', 900);
  if (k === 'b') ringBell();
  if (k === 'c') setCam((state.camMode + 1) % CAM_NAMES.length);
  if (k === 'p') { state.paused = !state.paused; toast(state.paused ? '已暂停' : '继续'); }
  if (k === 't') doSquawk();
  if ('12345'.includes(k)) setCam(parseInt(k, 10) - 1);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

/* ---------- 鼠标拾取：点鹈鹕就叫 ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 6) return;                       // 拖拽视角，不算点击
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(pelican.root, true);
  if (hits.length) { doSquawk(); return; }
  const bikeHit = ray.intersectObject(bike.group, true);
  if (bikeHit.length) ringBell();
});

/* ---------- 窗口 ---------- */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

/* ============================================================
   6. 主循环
   ============================================================ */
const clock = new THREE.Clock();
let t = 0;
let fpsAcc = 0, fpsFrames = 0, fpsTimer = 0;
const camPos = new THREE.Vector3();
const camAim = new THREE.Vector3();
const footTarget = new THREE.Vector3();
const headAim = new THREE.Vector3();

// 鹈鹕手部（翅尖）抓住车把的位置（bike 局部坐标）
const HANDLE_L = new THREE.Vector3(0.42, 0.98, -0.30);
const HANDLE_R = new THREE.Vector3(0.42, 0.98, +0.30);
const pedalWorld = [new THREE.Vector3(), new THREE.Vector3()];

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (state.paused) { composer.render(); return; }
  t += dt;

  /* --- 输入 → 速度 --- */
  const up = keys.has(' ') || keys.has('arrowup') || keys.has('w');
  const down = keys.has('arrowdown') || keys.has('s');
  const left = keys.has('arrowleft') || keys.has('a');
  const right = keys.has('arrowright') || keys.has('d');
  state.boost = up || state.boostingUI;
  state.brake = down;

  const cruise = 6.4;
  const vmax = state.boost ? 15.5 : cruise;
  const accel = state.boost ? 5.2 : 2.4;
  if (state.brake) state.speed = lerp(state.speed, 0.6, dt * 2.4);
  else state.speed = lerp(state.speed, vmax, dt * (state.speed < vmax ? accel * 0.28 : 1.2));
  state.speed = clamp(state.speed, 0, 17);

  /* --- 位移与转向 --- */
  const steerTarget = (right ? 1 : 0) - (left ? 1 : 0);
  state.lean = lerp(state.lean, steerTarget * clamp(state.speed / 12, 0.15, 1), dt * 4);
  const dz = state.speed * dt;
  state.travel += dz;
  rig.position.z -= dz;                                  // 模型朝 -Z，故沿 -Z 前进
  rig.position.x = clamp(rig.position.x - steerTarget * state.speed * dt * 0.55, -4.6, 4.6);
  rig.rotation.z = -state.lean * 0.20;                    // 过弯侧倾
  rig.rotation.y = state.lean * 0.06;

  /* --- 曲柄：由速度反推踏频 --- */
  const wheelOmega = state.speed / WHEEL_R;               // rad/s
  const crankOmega = wheelOmega / GEAR;
  state.crank -= crankOmega * dt;                         // 与轮子反向视觉一致
  bike.update(state.crank, dt);

  /* --- 车身颠簸 & 车头微摆 --- */
  const roadBump = Math.sin(rig.position.z * 3.1) * 0.006 + Math.sin(rig.position.z * 11.3) * 0.0022;
  const pedalPulse = Math.sin(state.crank * 2) * 0.012 * clamp(state.speed / 8, 0, 1);
  rig.position.y = roadBump + pedalPulse;
  bike.bar.rotation.y = state.lean * 0.22 + Math.sin(t * 1.3) * 0.012;
  bike.frontWheel.rotation.y = state.lean * 0.16;
  bike.fish.rotation.z = Math.sin(t * 3) * 0.08;
  bike.tailLight.material.color.setHSL(0, 0.85, state.brake ? 0.62 : 0.42 + Math.sin(t * 2) * 0.04);

  /* --- 鹈鹕：踩踏板（IK）+ 身体律动 + 头部稳定 + 翅膀 --- */
  for (let i = 0; i < 2; i++) {
    bike.pedals[i].pedal.getWorldPosition(pedalWorld[i]);
  }
  // 踏板世界坐标 → pelican.root 局部
  const lp0 = pelican.root.worldToLocal(pedalWorld[0].clone());
  const lp1 = pelican.root.worldToLocal(pedalWorld[1].clone());
  pelican.solveLeg(pelican.legs[0], lp1);   // 左腿踩右踏板（交叉更自然）
  pelican.solveLeg(pelican.legs[1], lp0);

  const cad = (crankOmega / (Math.PI * 2)) * 60;          // rpm
  const breath = Math.sin(t * 1.6) * 0.012;
  const bobAmp = 0.014 * clamp(state.speed / 7, 0, 1.6);
  rider.position.y = Math.sin(state.crank * 2) * bobAmp + breath;
  rider.rotation.x = lerp(rider.rotation.x, 0.30 + clamp(state.speed / 50, 0, 0.22) - (state.boost ? 0.12 : 0), dt * 5);
  rider.rotation.z = state.lean * 0.10;
  pelican.body.scale.y = 0.92 + breath * 1.4;
  pelican.body.scale.x = 1.05 - breath * 1.0;

  // 颈部 S 形：随速度前倾，随颠簸波动
  const neckLean = 0.12 + clamp(state.speed / 26, 0, 0.22);
  for (let i = 0; i < pelican.neckSegs.length; i++) {
    const s = pelican.neckSegs[i];
    const k = i / (pelican.neckSegs.length - 1);
    s.rotation.x = -neckLean * (0.4 + k) + Math.sin(t * 2.2 - i * 0.5) * 0.022;
    s.rotation.z = Math.sin(t * 1.4 - i * 0.35) * 0.015;
  }
  // 头部反向补偿 → 视线始终朝前
  pelican.head.rotation.x = neckLean * 1.1 + Math.sin(t * 1.8) * 0.03;
  pelican.head.rotation.y = -state.lean * 0.22 + Math.sin(t * 0.7) * 0.05;
  pelican.head.position.y = 0.10 + Math.sin(t * 2.2) * 0.004;

  // 翅膀：随速度半展/扇动，冲刺时张开滑翔
  const flap = Math.sin(t * (2.2 + state.speed * 0.35)) * (state.boost ? 0.55 : 0.16);
  const open = state.boost ? 1.15 : 0.30 + clamp(state.speed / 22, 0, 0.5);
  for (const w of pelican.wings) {
    w.group.rotation.x = w.side * (0.75 - open * 0.55) + w.side * flap * 0.5;
    w.group.rotation.y = flap * 0.35;
    w.group.rotation.z = -0.15 * open + Math.sin(t * 1.1 + w.side) * 0.04;
  }
  // 尾羽随速度翘起
  pelican.tail.rotation.z = -0.25 - clamp(state.speed / 60, 0, 0.2) + Math.sin(t * 3) * 0.03;

  // 围巾飘动：向后飘 + 正弦波
  for (let i = 0; i < pelican.scarf.length; i++) {
    const seg = pelican.scarf[i];
    const k = i + 1;
    seg.rotation.z = 0.5 + Math.sin(t * 6 - i * 0.8) * 0.22 * (0.4 + clamp(state.speed / 10, 0, 1));
    seg.rotation.y = Math.sin(t * 4 - i * 0.6) * 0.18;
    seg.position.y = -0.02 - k * 0.006;
  }

  // 眨眼
  const blink = (t % 4.6) < 0.14;
  for (const e of pelican.eyes) e.userData.lid.visible = blink;

  /* --- 特效 --- */
  fx.update(dt, t, rig.position, state.speed, state.boost, WHEEL_R, state.lean);
  world.update(dt, t, state.travel, rig.position, state.speed);
  world.sun.position.set(rig.position.x + 14, 22, rig.position.z - 20);
  world.sun.target.position.set(rig.position.x, 0, rig.position.z - 4);
  world.sun.target.updateMatrixWorld();

  /* --- 音频 --- */
  audio.update(dt, state.speed, cad);

  /* --- 相机 --- */
  updateCamera(dt);

  /* --- HUD --- */
  const kmh = state.speed * 3.6;
  $('speed').textContent = kmh.toFixed(0);
  $('dist').textContent = `${(state.travel / 1000).toFixed(2)} km`;
  $('cad').textContent = `${cad.toFixed(0)} rpm`;
  $('pow').style.width = `${clamp((state.speed / 16) * 100, 0, 100)}%`;
  fpsAcc += dt; fpsFrames++; fpsTimer += dt;
  if (fpsTimer > 0.4) {
    $('fps').textContent = (fpsFrames / fpsAcc).toFixed(0);
    fpsAcc = 0; fpsFrames = 0; fpsTimer = 0;
  }

  controls.update();
  composer.render();
}

/* ============================================================
   7. 相机模式
   ============================================================ */
function updateCamera(dt) {
  const p = rig.position;
  const mode = state.camMode;
  const k = 1 - Math.pow(0.0016, dt);   // 帧率无关阻尼

  if (mode === 0) {          // 追车
    camPos.set(p.x - 0.4 + state.lean * -1.2, p.y + 1.85 + state.speed * 0.02, p.z + 4.3 + state.speed * 0.09);
    camAim.set(p.x + state.lean * 0.6, p.y + 1.05, p.z - 1.2);
    camera.fov = lerp(camera.fov, 52 + clamp(state.speed * 0.9, 0, 12), dt * 2);
  } else if (mode === 1) {   // 环绕
    const a = t * 0.35 + (state.autoSpin ? 0 : 0);
    const r = 5.2;
    camPos.set(p.x + Math.sin(a) * r, p.y + 2.3, p.z + Math.cos(a) * r);
    camAim.set(p.x, p.y + 1.0, p.z);
    camera.fov = lerp(camera.fov, 50, dt * 2);
  } else if (mode === 2) {   // 低机位（贴地跟拍）
    camPos.set(p.x - 2.4, p.y + 0.42, p.z + 1.1);
    camAim.set(p.x, p.y + 0.75, p.z - 6);
    camera.fov = lerp(camera.fov, 62, dt * 2);
  } else if (mode === 3) {   // 鹈鹕第一人称
    pelican.head.getWorldPosition(headAim);
    camPos.copy(headAim).add(new THREE.Vector3(0.12, 0.06, 0).applyQuaternion(pelican.head.getWorldQuaternion(TMPQ)));
    camAim.copy(camPos).add(new THREE.Vector3(1.6, -0.35, -state.lean * 1.2).applyQuaternion(rig.quaternion));
    camera.fov = lerp(camera.fov, 68 - clamp(state.speed * 0.6, 0, 10), dt * 2);
  } else {                   // 俯瞰
    camPos.set(p.x + 0.5, p.y + 9.5, p.z + 6.5);
    camAim.set(p.x, p.y + 0.6, p.z - 6);
    camera.fov = lerp(camera.fov, 46, dt * 2);
  }
  camera.updateProjectionMatrix();

  camera.position.lerp(camPos, mode === 3 ? 1 : k * (mode === 1 ? 0.06 : 0.14));  controls.target.lerp(camAim, mode === 3 ? 1 : k * 0.16);
  if (state.autoSpin && mode !== 1) controls.autoRotate = true;
  controls.autoRotate = state.autoSpin;
  controls.autoRotateSpeed = 1.1;
}

/* ============================================================
   8. 启动
   ============================================================ */
addEventListener('pointerdown', () => audio.resume(), { once: true });
addEventListener('keydown', () => audio.resume(), { once: true });
setCam(0);
animate();

// 到 1km 时给个鼓励
setInterval(() => {
  if (state.travel > 1000 && !window.__cheered) {
    window.__cheered = true;
    toast('已骑行 1 公里！鹈鹕表示还能再战 🚴', 3000);
    doSquawk();
  }
}, 1000);
