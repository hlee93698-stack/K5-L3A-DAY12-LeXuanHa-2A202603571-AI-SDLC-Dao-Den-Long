// Browser client: renders the SAME Sim used by headless. Gameplay rules live only in src/sim.
// Flow: menu -> night intro -> play (pause) -> result -> next night ... -> dawn screen.
import * as THREE from 'three';
import { Sim } from '../sim/sim';
import { TUNING, K } from '../sim/tuning';
import { getNight } from '../sim/maps';
import { mulberry32 } from '../sim/rng';
import { defaultInput, type GameEvent, type InputState, type Scenario } from '../sim/types';
import { Sfx } from './sfx';
import { PAL, buildTerrain, makePlayer, makeLantern, makeMote, makeShade, makeDrifter, makeCharm, Leaves, type LanternView, type ShadeView } from './world';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const sfx = new Sfx();

// ---------- settings (persisted) ----------
interface Settings { volume: number; sens: number }
const SETTINGS_KEY = 'ddl-settings';
function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { volume: typeof s.volume === 'number' ? s.volume : 0.7, sens: typeof s.sens === 'number' ? s.sens : 1 };
  } catch {
    return { volume: 0.7, sens: 1 };
  }
}
const settings = loadSettings();
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
  sfx.setVolume(settings.volume);
}
sfx.setVolume(settings.volume);

// ---------- renderer ----------
const canvas = $('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.Fog(PAL.fog, 30, 110);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
const ambient = new THREE.AmbientLight(0xffffff, 0.15);
const moon = new THREE.DirectionalLight(0xa8b0ff, 0.35);
moon.position.set(-30, 60, -20);
scene.add(ambient, moon);
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- per-night view state ----------
const player = makePlayer();
scene.add(player.g);
let terrain: THREE.Group | null = null;
const lanternViews = new Map<string, LanternView>();
const moteViews = new Map<string, THREE.Group>();
const shadeViews = new Map<string, ShadeView>();
const driftViews = new Map<string, THREE.Group>();
const charmViews = new Map<string, THREE.Group>();
const leaves = new Leaves();
scene.add(leaves.g);
const fxRng = mulberry32(99);
const pulseRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1, 64),
  new THREE.MeshBasicMaterial({ color: PAL.lampCore, transparent: true, opacity: 0, side: THREE.DoubleSide }),
);
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseAnim = -1;

function clearMap<T>(m: Map<string, T>, obj: (v: T) => THREE.Object3D) {
  for (const v of m.values()) scene.remove(obj(v));
  m.clear();
}

// ---------- game flow ----------
type Phase = 'menu' | 'intro' | 'play' | 'paused' | 'result' | 'dawn';
let phase: Phase = 'menu';
let night = 1;
let sim = new Sim({ seed: 1 });
let totalScore = 0;
let camYaw = 0;
let facing = 0;
let lastCountdown = -1;

const INTRO: Record<number, string> = {
  1: '“Đảo Bến là nơi ánh sáng bắt đầu. Gom đom đóm thật khéo, Mây ạ, và đừng để Bóng Mực chạm vào ngọn lửa của con.”',
  2: '“Đảo Cau có hai nửa, nối bằng cây cầu tre. Bục nhảy sẽ đưa con qua biển mây. Coi chừng Gió Lạc, chúng thích cướp đom đóm lắm.”',
  3: '“Đảo Chuông cao ba tầng. Leo dốc mà lên, nghe tiếng gió mà né. Thắp xong bảy ngọn đèn, bình minh sẽ về.”',
};

function loadNight(n: number, scenario?: Scenario, seed?: number) {
  night = n;
  sim = new Sim({ seed: seed ?? (Date.now() >>> 0) % 1000000, night: n, scenario });
  if (terrain) scene.remove(terrain);
  terrain = buildTerrain(sim.map);
  scene.add(terrain);
  clearMap(lanternViews, (v) => v.g);
  clearMap(moteViews, (v) => v);
  clearMap(shadeViews, (v) => v.g);
  clearMap(driftViews, (v) => v);
  clearMap(charmViews, (v) => v);
  camYaw = 0;
  lastCountdown = -1;
  const p = sim.player;
  camera.position.set(p.x, p.y + 6, p.z - 10);
}

function show(html: string) {
  $('card').innerHTML = html;
  $('overlay').style.display = 'flex';
  const first = $('card').querySelector('button') as HTMLButtonElement | null;
  first?.focus();
}
function hide() {
  $('overlay').style.display = 'none';
}
function bind(id: string, fn: () => void) {
  const el = document.getElementById(id);
  if (el) el.onclick = () => (sfx.unlock(), fn());
}

function showMenu() {
  phase = 'menu';
  sfx.stopMusic();
  totalScore = 0;
  show(`<h1>Đảo Đèn Lồng</h1>
    <div>Giúp <b>Mây</b>, người giữ đèn nhỏ tuổi, thắp lại Đèn Lồng Lớn trên ba hòn đảo trước khi trời sáng.</div>
    <table>
      <tr><td><kbd>WASD</kbd></td><td>đi theo hướng camera</td></tr>
      <tr><td><kbd>Space</kbd> / <kbd>Shift</kbd></td><td>nhảy / lướt</td></tr>
      <tr><td><kbd>E</kbd></td><td>nạp ánh sáng vào đèn (${TUNING.lantern_cost} đom đóm / đèn)</td></tr>
      <tr><td><kbd>F</kbd></td><td>Tỏa Sáng: tốn ${TUNING.pulse_cost}, choáng Bóng Mực trong ${TUNING.pulse_radius} m</td></tr>
      <tr><td>kéo chuột / <kbd>←</kbd><kbd>→</kbd></td><td>xoay camera</td></tr>
      <tr><td><kbd>Esc</kbd> / <kbd>P</kbd></td><td>tạm dừng</td></tr>
    </table>
    <div class="btns"><button id="bStart">Bắt đầu (Enter)</button><button id="bSet">Cài đặt</button></div>`);
  bind('bStart', () => showIntro(1));
  bind('bSet', () => showSettings(showMenu));
}

function showIntro(n: number, scenario?: Scenario, seed?: number) {
  loadNight(n, scenario, seed);
  phase = 'intro';
  show(`<h2>Đêm ${n}</h2><h1>${sim.map.name}</h1>
    <div>${sim.lanterns.length} Đèn Lồng Lớn · ${Math.round(sim.map.duration_s / 60 * 10) / 10} phút trước bình minh</div>
    <div class="quote">${INTRO[n]}<br>— Ông Đăng</div>
    <div class="btns"><button id="bGo">Vào đêm (Enter)</button></div>`);
  bind('bGo', startPlay);
}

function startPlay() {
  hide();
  phase = 'play';
  sfx.startMusic(night);
}

function showPause() {
  phase = 'paused';
  sfx.stopMusic();
  show(`<h1>Tạm dừng</h1><div>Đêm ${night} – ${sim.map.name}</div>
    <div class="btns"><button id="bResume">Tiếp tục (Esc)</button><button id="bRetry">Chơi lại Đêm</button>
    <button id="bSet">Cài đặt</button><button id="bMenu">Về menu</button></div>`);
  bind('bResume', startPlay);
  bind('bRetry', () => showIntro(night));
  bind('bSet', () => showSettings(showPause));
  bind('bMenu', showMenu);
}

function showSettings(back: () => void) {
  const prev = phase;
  show(`<h1>Cài đặt</h1>
    <label>Âm lượng: <span id="vV">${Math.round(settings.volume * 100)}%</span></label><input id="vol" type="range" min="0" max="1" step="0.05" value="${settings.volume}">
    <label>Độ nhạy chuột: <span id="sV">${settings.sens.toFixed(2)}</span></label><input id="sens" type="range" min="0.2" max="3" step="0.1" value="${settings.sens}">
    <div style="font-size:13px;opacity:.75;margin-top:6px">Lưu tự động, giữ cho lần mở sau.</div>
    <div class="btns"><button id="bBack">Quay lại</button></div>`);
  const vol = $('vol') as HTMLInputElement;
  const sens = $('sens') as HTMLInputElement;
  vol.oninput = () => {
    settings.volume = Number(vol.value);
    $('vV').textContent = `${Math.round(settings.volume * 100)}%`;
    saveSettings();
    sfx.unlock();
    sfx.deposit();
  };
  sens.oninput = () => {
    settings.sens = Number(sens.value);
    $('sV').textContent = settings.sens.toFixed(2);
    saveSettings();
  };
  bind('bBack', back);
  phase = prev;
}

function showResult() {
  phase = 'result';
  sfx.stopMusic();
  const won = sim.state === 'won';
  if (won) totalScore += sim.score;
  const why = sim.player.flames <= 0 ? 'Mây đã hết Ngọn Lửa.' : 'Trời đã sáng trước khi kịp thắp hết đèn.';
  if (won && night === 3) return showDawn();
  show(`<h2>Đêm ${night} – ${sim.map.name}</h2><h1>${won ? 'Đảo đã sáng lại!' : 'Mây cần nghỉ một chút…'}</h1>
    <div>${won ? 'Tất cả Đèn Lồng Lớn đã được thắp.' : why}</div>
    <div class="big">Điểm đêm: ${sim.score} · Tổng: ${totalScore}</div>
    <div class="btns">${won ? `<button id="bNext">Đêm ${night + 1} (Enter)</button>` : '<button id="bRetry">Chơi lại Đêm (Enter)</button>'}
    <button id="bMenu">Về menu</button></div>`);
  bind('bNext', () => showIntro(night + 1));
  bind('bRetry', () => showIntro(night));
  bind('bMenu', showMenu);
}

function showDawn() {
  phase = 'dawn';
  scene.background = new THREE.Color(0xffc98a);
  show(`<h1>Bình Minh</h1><div>Ba hòn đảo đã sáng rực. Ông Đăng mỉm cười: “Giỏi lắm, Mây.”</div>
    <div class="big">Tổng điểm: ${totalScore}</div><div class="btns"><button id="bMenu">Về menu (Enter)</button></div>`);
  bind('bMenu', () => {
    scene.background = new THREE.Color(PAL.sky);
    showMenu();
  });
}

// ---------- input ----------
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (phase === 'play') return showPause();
    if (phase === 'paused') return startPlay();
  }
  if (e.code === 'Enter' && phase !== 'play') {
    const b = $('card').querySelector('button') as HTMLButtonElement | null;
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.click();
    else b?.click();
    e.preventDefault();
    return;
  }
  if (e.code === 'F3') {
    const f = $('fps');
    f.style.display = f.style.display === 'block' ? 'none' : 'block';
  }
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  if (phase === 'play') showPause();
});
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
  camYaw -= (e.clientX - lastX) * 0.006 * settings.sens;
  lastX = e.clientX;
});

function readInput(dt: number): InputState {
  if (keys.has('ArrowLeft')) camYaw += 2 * dt * settings.sens;
  if (keys.has('ArrowRight')) camYaw -= 2 * dt * settings.sens;
  const inp = defaultInput();
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  inp.move = [-right, fwd]; // camera looks along +Z at yaw 0, so screen-right is world -X
  inp.cam_yaw_deg = (camYaw * 180) / Math.PI;
  inp.jump = keys.has('Space');
  inp.interact = keys.has('KeyE');
  inp.pulse = keys.has('KeyF');
  inp.dash = keys.has('ShiftLeft') || keys.has('ShiftRight');
  return inp;
}

function handleEvents(evs: GameEvent[]) {
  for (const e of evs) {
    switch (e.name) {
      case 'mote_picked': sfx.pickup(e.data.carried as number); break;
      case 'deposit': sfx.deposit(); break;
      case 'lantern_lit': sfx.lanternLit(); break;
      case 'pulse': sfx.pulse(); pulseAnim = 0; break;
      case 'dash': sfx.dash(); break;
      case 'shade_spawned': sfx.shadeSpawn(); break;
      case 'drifter_steal': sfx.steal(); break;
      case 'charm_picked': sfx.charm(); break;
      case 'player_hit':
        sfx.hit();
        $('flash').style.opacity = '1';
        setTimeout(() => ($('flash').style.opacity = '0'), 160);
        break;
      case 'game_over': if (e.data.result === 'won') sfx.win(); else sfx.lose(); break;
    }
  }
}

// ---------- sync ----------
const tmpV = new THREE.Vector3();
function syncMap<T, V>(items: T[], views: Map<string, V>, idOf: (t: T) => string, make: () => V, obj: (v: V) => THREE.Object3D, upd: (v: V, t: T) => void) {
  const seen = new Set<string>();
  for (const it of items) {
    const id = idOf(it);
    seen.add(id);
    let v = views.get(id);
    if (!v) {
      v = make();
      views.set(id, v);
      scene.add(obj(v));
    }
    upd(v, it);
  }
  for (const [id, v] of views) if (!seen.has(id)) (scene.remove(obj(v)), views.delete(id));
}

function sync(time: number, dt: number) {
  const p = sim.player;
  const prev = player.g.position.clone();
  player.g.position.set(p.x, p.y, p.z);
  if ((p.x - prev.x) ** 2 + (p.z - prev.z) ** 2 > 1e-6) facing = Math.atan2(p.x - prev.x, p.z - prev.z);
  player.g.rotation.y = facing;
  player.light.intensity = 3 + p.carried * 0.6;
  player.g.visible = p.fallWait === 0 && !(p.invuln > 0 && Math.floor(time * 12) % 2 === 0);

  syncMap(sim.lanterns, lanternViews, (l) => l.id, makeLantern, (v) => v.g, (v, l) => {
    v.g.position.set(l.x, l.y, l.z);
    const frac = l.deposited / TUNING.lantern_cost;
    v.lampMat.color.set(l.lit ? PAL.lampCore : PAL.lampOff);
    v.lampMat.emissiveIntensity = l.lit ? 1.6 : frac * 0.6;
    v.light.intensity = l.lit ? 40 : frac * 4;
    (v.ring.material as THREE.MeshBasicMaterial).opacity = l.lit ? 0.35 : 0;
  });
  syncMap(sim.motes, moteViews, (m) => m.id, makeMote, (v) => v, (v, m) => {
    const ph = (m.x * 7.1 + m.z * 3.3) % 6.28;
    v.position.set(m.x, m.y + 0.7 + Math.sin(time * 2 + ph) * 0.2, m.z);
    v.visible = !(m.kind === 'dropped' && m.ttl !== null && m.ttl < 120 && Math.floor(time * 8) % 2 === 0);
  });
  syncMap(sim.shades, shadeViews, (s) => s.id, makeShade, (v) => v.g, (v, s) => {
    v.g.position.set(s.x, s.y + Math.sin(time * 3 + s.x) * 0.1, s.z);
    v.g.lookAt(p.x, s.y, p.z);
    const st = s.state;
    v.body.color.set(st === 'stunned' ? PAL.shadeStun : PAL.shadeBody);
    v.rim.color.set(st === 'stunned' ? PAL.shadeStun : PAL.shadeRim);
    const sc = st === 'spawning' ? Math.max(0.15, 1 - s.left / K.shade_spawning_ticks) : 1;
    v.g.scale.setScalar(sc);
    if (st === 'stunned') v.g.rotation.z = Math.sin(time * 14) * 0.25;
  });
  syncMap(sim.drifters.filter((d) => d.state !== 'removed'), driftViews, (d) => d.id, makeDrifter, (v) => v, (v, d) => {
    v.position.set(d.x, d.y + Math.sin(time * 5) * 0.2, d.z);
    v.lookAt(d.state === 'flee' ? 2 * d.x - p.x : p.x, d.y, d.state === 'flee' ? 2 * d.z - p.z : p.z);
    v.children.forEach((c, i) => (c.position.y = Math.sin(time * 8 + i) * 0.15));
  });
  syncMap(sim.charms, charmViews, (c) => c.id, makeCharm, (v) => v, (v, c) => {
    v.visible = c.available;
    v.position.set(c.x, c.y + 1 + Math.sin(time * 2) * 0.15, c.z);
    v.rotation.y = time * 1.5;
  });
  if (sim.map.wind) leaves.update(dt, sim, p.x, p.y, p.z, fxRng);

  if (pulseAnim >= 0) {
    pulseAnim += dt / 0.35;
    const k = Math.min(1, pulseAnim);
    const s = 0.5 + k * TUNING.pulse_radius;
    pulseRing.scale.set(s, s, s);
    pulseRing.position.set(p.x, p.y + 0.1, p.z);
    (pulseRing.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    if (pulseAnim >= 1) pulseAnim = -1;
  }

  // ambient light grows with progress: 0.15 + 0.55 * lit/total (Ticket-02)
  ambient.intensity = 0.15 + 0.55 * (sim.litCount / sim.lanterns.length);

  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  const want = tmpV.set(p.x - fx * 9, p.y + 5.5, p.z - fz * 9);
  camera.position.lerp(want, 1 - Math.exp(-dt * 8));
  camera.lookAt(p.x, p.y + 1.3, p.z);

  updateHud(time);
}

function updateHud(time: number) {
  const p = sim.player;
  $('flames').innerHTML = '🔥'.repeat(p.flames) + `<span class="off">${'🔥'.repeat(Math.max(0, TUNING.flames - p.flames))}</span>`;
  const tl = Math.max(0, Math.ceil(sim.timeLeft));
  const clock = $('clock');
  clock.textContent = `${String(Math.floor(tl / 60)).padStart(2, '0')}:${String(tl % 60).padStart(2, '0')}`;
  clock.classList.toggle('danger', sim.timeLeft <= 30);
  if (phase === 'play' && tl <= 10 && tl > 0 && tl !== lastCountdown) {
    lastCountdown = tl;
    sfx.countdown(tl);
  }
  $('lamps').textContent = `${sim.litCount}/${sim.lanterns.length}`;
  $('score').textContent = String(totalScore + sim.score);
  const bar = $('motebar');
  if (bar.children.length !== TUNING.carry_capacity) bar.innerHTML = '<i></i>'.repeat(TUNING.carry_capacity);
  Array.from(bar.children).forEach((c, i) => c.classList.toggle('on', i < p.carried));
  const cd = (id: string, left: number, total: number, ready: boolean) => {
    const el = $(id);
    (el.querySelector('.fill') as HTMLElement).style.height = `${Math.min(100, (left / total) * 100)}%`;
    el.classList.toggle('off', !ready);
  };
  cd('cdDash', p.charm > 0 ? 0 : p.dashCd, TUNING.dash_cooldown_s * 60, p.charm > 0 || p.dashCd === 0);
  cd('cdPulse', p.pulseCd, TUNING.pulse_cooldown_s * 60, p.pulseCd === 0 && p.carried >= TUNING.pulse_cost);
  $('charm').style.display = p.charm > 0 ? 'block' : 'none';
  $('charmS').textContent = `${Math.ceil(p.charm / 60)}s`;

  // hint near an unlit lantern
  let hint = '';
  for (const l of sim.lanterns) {
    if (!l.lit && Math.hypot(l.x - p.x, l.z - p.z) <= TUNING.interact_radius) hint = `E — Nạp ánh sáng (${l.deposited}/${TUNING.lantern_cost})`;
  }
  const h = $('hint');
  h.textContent = hint;
  h.style.display = hint && phase === 'play' ? 'block' : 'none';

  // off-screen arrow to the nearest unlit lantern
  let target: { x: number; y: number; z: number } | undefined;
  let best = Infinity;
  for (const l of sim.lanterns) {
    const d = Math.hypot(l.x - p.x, l.z - p.z);
    if (!l.lit && d < best) (best = d), (target = l);
  }
  const arrow = $('arrow');
  arrow.style.display = 'none';
  if (target && phase === 'play') {
    const v = tmpV.set(target.x, target.y + 3.4, target.z).project(camera);
    const behind = v.z > 1;
    const on = !behind && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    if (!on) {
      let ax = behind ? -v.x : v.x;
      let ay = behind ? -v.y : v.y;
      const m = Math.max(Math.abs(ax), Math.abs(ay)) || 1;
      ax /= m;
      ay /= m;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const sx = W / 2 + ax * (W / 2 - 50);
      const sy = H / 2 - ay * (H / 2 - 50);
      arrow.style.display = 'block';
      arrow.style.left = `${sx - 14}px`;
      arrow.style.top = `${sy - 14}px`;
      arrow.style.transform = `rotate(${Math.atan2(ax, ay)}rad)`;
    }
  }
}

// ---------- loop ----------
const STEP = 1 / K.tick_rate;
let acc = 0;
let last = performance.now();
let frames = 0;
let fpsT = 0;
const fpsLog: number[] = [];
let windWarned = false;
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (phase === 'play') {
    acc += dt;
    const inp = readInput(dt);
    while (acc >= STEP) {
      acc -= STEP;
      const wasGrounded = sim.player.grounded;
      handleEvents(sim.step(inp));
      // jump sound: left the ground with jump velocity (pads launch faster) - view-only detection, no sim event
      if (wasGrounded && !sim.player.grounded && sim.player.vy > 0 && sim.player.vy <= K.jump_velocity) sfx.jump();
      if (sim.state === 'won' || sim.state === 'lost') {
        acc = 0;
        setTimeout(showResult, 600);
        phase = 'result';
        break;
      }
    }
    const warn = sim.nextWindDeg !== null && !sim.wind.active;
    if (warn && !windWarned) sfx.windWarn();
    windWarned = warn;
  }
  sync(now / 1000, dt);
  renderer.render(scene, camera);
  frames++;
  fpsT += dt;
  if (fpsT >= 1) {
    const fps = frames / fpsT;
    fpsLog.push(fps);
    $('fps').textContent = `${fps.toFixed(0)} FPS · ${window.innerWidth}×${window.innerHeight}`;
    (window as unknown as { __fps: number[] }).__fps = fpsLog;
    frames = 0;
    fpsT = 0;
  }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
// ?shot=<name> starts a fixed scenario for automated screenshots / FPS measurement (scripts/screenshot.mjs).
const params = new URLSearchParams(location.search);
const SHOTS: Record<string, () => void> = {
  intro2: () => showIntro(2, undefined, 42),
  n1: () => {
    showIntro(1, { player: { pos: [1.5, 0, 17], carried: 6 }, lanterns: [{ id: 'L1', lit: true }, { id: 'L2', deposited: 4 }], random_shades: false, shades: [{ pos: [5, 0, 12] }, { pos: [-6, 0, 10], state: 'stunned' }] }, 42);
    startPlay();
  },
  n2: () => {
    showIntro(2, { player: { pos: [22, 0, 4], carried: 7 }, random_shades: false, shades: [], drifters: [{ id: 'D1', pos: [28, 0, 8] }] }, 42);
    camYaw = Math.PI / 2;
    startPlay();
  },
  n3: () => {
    showIntro(3, { player: { pos: [0, 0, -16], carried: 3 }, lanterns: [{ id: 'L1', lit: true }], random_shades: false, shades: [{ pos: [12, 0, -20] }] }, 42);
    startPlay();
  },
  pause: () => {
    SHOTS.n1();
    showPause();
  },
  dawn: () => {
    loadNight(3, undefined, 42);
    totalScore = 2870;
    showDawn();
  },
  bench: () => {
    showIntro(3, { player: { flames: 1000 } }, 7);
    startPlay();
    $('fps').style.display = 'block';
  },
};
const shot = params.get('shot');
if (shot && SHOTS[shot]) SHOTS[shot]();
else showMenu();
if (params.has('fps')) $('fps').style.display = 'block';
requestAnimationFrame(frame);
