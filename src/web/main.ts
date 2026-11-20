// Browser client: renders the SAME Sim used by headless. All gameplay lives in src/sim;
// this file only maps keyboard -> InputState, steps the sim at a fixed 60 Hz, and draws.
import * as THREE from 'three';
import { Sim } from '../sim/sim';
import { TUNING, WORLD } from '../sim/tuning';
import { mulberry32 } from '../sim/rng';
import { defaultInput, type GameEvent, type InputState } from '../sim/types';
import { Sfx } from './sfx';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const sfx = new Sfx();

// ---------- renderer / scene ----------
const canvas = $('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const NIGHT = new THREE.Color(0x150c28);
const WARM = new THREE.Color(0x3b2440);
scene.background = NIGHT.clone();
scene.fog = new THREE.Fog(NIGHT.clone(), 20, 75);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

const hemi = new THREE.HemisphereLight(0x9a8ad0, 0x1a1028, 0.5);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xa8b0ff, 0.45);
moon.position.set(-30, 50, -20);
scene.add(moon);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- static world (decor only, not part of gameplay) ----------
const R = WORLD.island_radius;
const island = new THREE.Mesh(
  new THREE.CylinderGeometry(R, R - 7, 6, 80),
  new THREE.MeshStandardMaterial({ color: 0x2d4636, roughness: 1 }),
);
island.position.y = -3;
scene.add(island);
const rim = new THREE.Mesh(
  new THREE.TorusGeometry(R, 0.35, 8, 120),
  new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 1 }),
);
rim.rotation.x = Math.PI / 2;
rim.position.y = 0.1;
scene.add(rim);

const decoRng = mulberry32(20260);
const cloudMat = new THREE.MeshStandardMaterial({ color: 0x4a3d6e, roughness: 1 });
for (let i = 0; i < 70; i++) {
  const a = decoRng() * Math.PI * 2;
  const r = R + 6 + decoRng() * 40;
  const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + decoRng() * 6, 12, 10), cloudMat);
  puff.position.set(r * Math.sin(a), -6 + decoRng() * 3, r * Math.cos(a));
  puff.scale.y = 0.45;
  scene.add(puff);
}
const treeMat = new THREE.MeshStandardMaterial({ color: 0x1f3a2c, roughness: 1 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3e2c22, roughness: 1 });
for (let i = 0; i < 45; i++) {
  const a = decoRng() * Math.PI * 2;
  const r = 8 + decoRng() * (R - 10);
  const x = r * Math.sin(a);
  const z = r * Math.cos(a);
  if (Math.abs(r - WORLD.lantern_ring_radius) < 4) continue; // keep lantern ring clear
  const h = 2 + decoRng() * 2.5;
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1, 6), trunkMat);
  trunk.position.y = 0.5;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9 + decoRng() * 0.5, h, 7), treeMat);
  crown.position.y = 1 + h / 2;
  tree.add(trunk, crown);
  tree.position.set(x, 0, z);
  scene.add(tree);
}

// ---------- dynamic visuals ----------
function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.55, 4, 12), new THREE.MeshStandardMaterial({ color: 0x6f9fd8 }));
  body.position.y = 0.62;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf3d2b3 }));
  head.position.y = 1.32;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.38, 28), new THREE.MeshStandardMaterial({ color: 0xe3c27a }));
  hat.position.y = 1.68; // nón lá
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  string.position.set(0.6, 1.38, 0.15);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffc266 }));
  lamp.position.set(0.6, 1.12, 0.15);
  const light = new THREE.PointLight(0xffb347, 6, 12, 1.4);
  light.position.copy(lamp.position);
  g.add(body, head, hat, string, lamp, light);
  return { g, light };
}
const player = makePlayer();
scene.add(player.g);

// "Đom đóm dẫn đường" arrow (creative, display only)
const guide = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 10), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85 }));
guide.rotation.x = Math.PI / 2;
const guidePivot = new THREE.Group();
guide.position.z = 1.3;
guidePivot.add(guide);
scene.add(guidePivot);

interface LanternView { lampMat: THREE.MeshStandardMaterial; light: THREE.PointLight; ring: THREE.Mesh; g: THREE.Group }
const lanternViews = new Map<string, LanternView>();
function makeLantern(id: string): LanternView {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 3, 8), new THREE.MeshStandardMaterial({ color: 0x4a3426 }));
  post.position.y = 1.5;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a2a4a, emissive: new THREE.Color(0xff9a2e), emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 1.1, 8), lampMat);
  lamp.position.y = 3.4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x5a2a22 }));
  roof.position.y = 4.2;
  const light = new THREE.PointLight(0xffa040, 0, 26, 1.1);
  light.position.y = 3.4;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(TUNING.safe_radius - 0.12, TUNING.safe_radius, 72),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(post, lamp, roof, light, ring);
  g.name = id;
  scene.add(g);
  return { lampMat, light, ring, g };
}

const moteGeo = new THREE.SphereGeometry(0.16, 10, 8);
const moteMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
const moteViews = new Map<string, THREE.Mesh>();

interface ShadeView { g: THREE.Group; mat: THREE.MeshStandardMaterial }
const shadeViews = new Map<string, ShadeView>();
function makeShade(): ShadeView {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a0828, emissive: new THREE.Color(0x4a1280), emissiveIntensity: 0.7, roughness: 0.6 });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 14), mat);
  blob.scale.set(1, 1.15, 1);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe8d8ff });
  for (const sx of [-0.28, 0.28]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), eyeMat);
    eye.position.set(sx, 0.25, 0.68);
    g.add(eye);
  }
  g.add(blob);
  scene.add(g);
  return { g, mat };
}

const pulseRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1, 64),
  new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide }),
);
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseAnim = -1;

// ---------- input ----------
const keys = new Set<string>();
let camYaw = 0; // radians; sim gets degrees
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Enter' && phase === 'menu') startGame();
  if (e.code === 'KeyR' && phase === 'over') startGame();
  if (e.code === 'KeyM') sfx.muted = !sfx.muted;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
let dragging = false;
let lastX = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  sfx.unlock();
});
window.addEventListener('pointerup', () => (dragging = false));
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastX) * 0.006;
  lastX = e.clientX;
});

function readInput(dt: number): InputState {
  if (keys.has('ArrowLeft')) camYaw += 2 * dt;
  if (keys.has('ArrowRight')) camYaw -= 2 * dt;
  const inp = defaultInput();
  // Contract: move [x, z], x -> +X at yaw 0. Camera looks along +Z at yaw 0, so screen-right is world -X.
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  inp.move = [-right, fwd];
  inp.cam_yaw_deg = (camYaw * 180) / Math.PI;
  inp.jump = keys.has('Space');
  inp.interact = keys.has('KeyE');
  inp.pulse = keys.has('KeyF');
  return inp;
}

// ---------- game flow ----------
type Phase = 'menu' | 'play' | 'over';
let phase: Phase = 'menu';
let sim = new Sim({ seed: 1 });
let seed = 1;
let facing = 0;

function startGame() {
  seed = (Date.now() >>> 0) % 1000000;
  sim = new Sim({ seed });
  for (const v of moteViews.values()) scene.remove(v);
  moteViews.clear();
  for (const v of shadeViews.values()) scene.remove(v.g);
  shadeViews.clear();
  for (const v of lanternViews.values()) scene.remove(v.g);
  lanternViews.clear();
  camYaw = 0;
  phase = 'play';
  $('overlay').style.display = 'none';
}

function showMenu() {
  $('card').innerHTML = `
    <h1>Đảo Đèn Lồng</h1>
    <div>Đêm 1 – Đảo Bến. Sương đen đã nuốt ánh sáng của đảo. Hãy giúp <b>Mây</b> gom đom đóm và thắp lại
    ${TUNING.lantern_count_night1} Đèn Lồng Lớn trước khi trời sáng. Cẩn thận Bóng Mực tím đen!</div>
    <table>
      <tr><td><kbd>W A S D</kbd></td><td>đi (theo hướng camera)</td></tr>
      <tr><td><kbd>Space</kbd></td><td>nhảy</td></tr>
      <tr><td><kbd>E</kbd></td><td>nạp đom đóm vào đèn gần nhất (cần ${TUNING.lantern_cost} để thắp)</td></tr>
      <tr><td><kbd>F</kbd></td><td>tỏa sáng: tốn ${TUNING.pulse_cost} đom đóm, làm choáng và đẩy Bóng Mực</td></tr>
      <tr><td>kéo chuột / <kbd>←</kbd> <kbd>→</kbd></td><td>xoay camera</td></tr>
    </table>
    <div class="big">Nhấn <kbd>Enter</kbd> để bắt đầu</div>`;
  $('overlay').style.display = 'flex';
}

function showGameOver() {
  const won = sim.state === 'won';
  $('card').innerHTML = `
    <h1>${won ? 'Đảo đã sáng lại!' : 'Mây cần nghỉ một chút…'}</h1>
    <div>${won ? 'Tất cả Đèn Lồng Lớn đã được thắp.' : sim.player.flames <= 0 ? 'Bóng Mực đã dập hết ngọn lửa của Mây.' : 'Trời đã sáng trước khi kịp thắp hết đèn.'}</div>
    <div class="big">Điểm: ${sim.score} · Đèn: ${sim.litCount}/${sim.lanterns.length}</div>
    <div style="margin-top:10px">Nhấn <kbd>R</kbd> để chơi lại</div>`;
  $('overlay').style.display = 'flex';
}

function handleEvents(evs: GameEvent[]) {
  for (const e of evs) {
    switch (e.name) {
      case 'mote_picked':
        sfx.pickup(e.data.carried as number);
        break;
      case 'deposit':
        sfx.deposit();
        break;
      case 'lantern_lit':
        sfx.lanternLit();
        break;
      case 'pulse':
        sfx.pulse();
        pulseAnim = 0;
        break;
      case 'player_hit':
        sfx.hit();
        $('flash').style.opacity = '1';
        setTimeout(() => ($('flash').style.opacity = '0'), 160);
        break;
      case 'game_over':
        if (e.data.result === 'won') sfx.win();
        else sfx.lose();
        break;
    }
  }
}

// ---------- sync visuals with sim state ----------
const tmpColor = new THREE.Color();
function sync(time: number, frameDt: number) {
  const p = sim.player;
  // player
  const prevPos = player.g.position.clone();
  player.g.position.set(p.x, p.y, p.z);
  const mdx = p.x - prevPos.x;
  const mdz = p.z - prevPos.z;
  if (mdx * mdx + mdz * mdz > 1e-6) facing = Math.atan2(mdx, mdz);
  player.g.rotation.y = facing;
  player.light.intensity = 3 + p.carried * 0.6;
  player.g.visible = !(p.invuln > 0 && Math.floor(time * 12) % 2 === 0);

  // lanterns
  for (const l of sim.lanterns) {
    let v = lanternViews.get(l.id);
    if (!v) lanternViews.set(l.id, (v = makeLantern(l.id)));
    v.g.position.set(l.x, 0, l.z);
    const frac = l.deposited / TUNING.lantern_cost;
    v.lampMat.emissiveIntensity = l.lit ? 2.2 : frac * 0.5;
    v.light.intensity = l.lit ? 40 : frac * 3;
    (v.ring.material as THREE.MeshBasicMaterial).opacity = l.lit ? 0.35 : 0;
  }

  // motes
  const seen = new Set<string>();
  for (const m of sim.motes) {
    seen.add(m.id);
    let v = moteViews.get(m.id);
    if (!v) {
      v = new THREE.Mesh(moteGeo, moteMat);
      moteViews.set(m.id, v);
      scene.add(v);
    }
    const ph = (m.x * 7.1 + m.z * 3.3) % 6.28;
    v.position.set(m.x + Math.sin(time * 1.3 + ph) * 0.12, 0.7 + Math.sin(time * 2 + ph) * 0.25, m.z + Math.cos(time * 1.1 + ph) * 0.12);
  }
  for (const [id, v] of moteViews) if (!seen.has(id)) (scene.remove(v), moteViews.delete(id));

  // shades
  const seenS = new Set<string>();
  for (const s of sim.shades) {
    seenS.add(s.id);
    let v = shadeViews.get(s.id);
    if (!v) shadeViews.set(s.id, (v = makeShade()));
    const stunned = s.state === 'stunned';
    v.g.position.set(s.x, s.y + Math.sin(time * 3 + s.x) * 0.12, s.z);
    v.g.lookAt(p.x, s.y, p.z);
    if (stunned) v.g.rotation.z = Math.sin(time * 14) * 0.25;
    v.mat.emissive.copy(tmpColor.set(stunned ? 0x6a86b0 : 0x4a1280));
  }
  for (const [id, v] of shadeViews) if (!seenS.has(id)) (scene.remove(v.g), shadeViews.delete(id));

  // pulse ring animation
  if (pulseAnim >= 0) {
    pulseAnim += frameDt / 0.35;
    const k = Math.min(1, pulseAnim);
    const s = 0.5 + k * TUNING.pulse_radius;
    pulseRing.scale.set(s, s, s);
    pulseRing.position.set(p.x, 0.1, p.z);
    (pulseRing.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    if (pulseAnim >= 1) pulseAnim = -1;
  }

  // guide arrow to nearest unlit lantern while carrying light
  let target: { x: number; z: number } | undefined;
  let best = Infinity;
  for (const l of sim.lanterns) {
    if (l.lit) continue;
    const d = Math.hypot(l.x - p.x, l.z - p.z);
    if (d < best) (best = d), (target = l);
  }
  guidePivot.visible = !!target && p.carried > 0 && best > TUNING.interact_radius;
  if (target) {
    guidePivot.position.set(p.x, p.y + 2.3, p.z);
    guidePivot.rotation.y = Math.atan2(target.x - p.x, target.z - p.z);
  }

  // island brightens as lanterns are lit
  const lit = sim.litCount / sim.lanterns.length;
  hemi.intensity = 0.45 + lit * 1.1;
  (scene.background as THREE.Color).copy(NIGHT).lerp(WARM, lit);
  const fog = scene.fog as THREE.Fog;
  fog.color.copy(scene.background as THREE.Color);
  fog.far = 75 + lit * 60;

  // camera
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  const want = new THREE.Vector3(p.x - fx * 9, 5.5 + p.y * 0.5, p.z - fz * 9);
  camera.position.lerp(want, 1 - Math.exp(-frameDt * 8));
  camera.lookAt(p.x, 1.3 + p.y * 0.5, p.z);

  // HUD
  $('flames').textContent = '●'.repeat(p.flames) + '○'.repeat(Math.max(0, TUNING.flames - p.flames));
  $('carried').textContent = String(p.carried);
  $('cap').textContent = String(TUNING.carry_capacity);
  $('lit').textContent = String(sim.litCount);
  $('lcount').textContent = String(sim.lanterns.length);
  const tl = Math.max(0, Math.ceil(sim.timeLeft));
  $('time').textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
  $('score').textContent = String(sim.score);
  $('pulse').textContent =
    p.cooldown > 0 ? `hồi ${(p.cooldown / 60).toFixed(1)}s` : p.carried < TUNING.pulse_cost ? 'cần đom đóm' : 'sẵn sàng (F)';
  let hint = '';
  for (const l of sim.lanterns) {
    if (!l.lit && Math.hypot(l.x - p.x, l.z - p.z) <= TUNING.interact_radius) {
      hint = p.carried > 0 ? `Nhấn E để nạp đèn ${l.id} (${l.deposited}/${TUNING.lantern_cost})` : `Đèn ${l.id} cần ${TUNING.lantern_cost - l.deposited} đom đóm nữa`;
    }
  }
  if (!hint && p.carried >= TUNING.carry_capacity) hint = 'Đã mang đầy đom đóm, hãy về nạp đèn!';
  $('hint').textContent = hint;
  $('hint').style.display = hint && phase === 'play' ? 'block' : 'none';
}

// ---------- fixed-step loop ----------
const STEP = 1 / WORLD.tick_rate;
let acc = 0;
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (phase === 'play') {
    acc += dt;
    const inp = readInput(dt);
    while (acc >= STEP) {
      acc -= STEP;
      handleEvents(sim.step(inp));
      if (sim.state !== 'playing') {
        phase = 'over';
        showGameOver();
        acc = 0;
        break;
      }
    }
  }
  sync(now / 1000, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

showMenu();
// Debug hook for automated screenshots: ?autostart=1
if (new URLSearchParams(location.search).has('autostart')) startGame();
requestAnimationFrame(frame);
