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
interface Settings { volume: number; sens: number; cb: boolean; reduceMotion: boolean; largeText: boolean }
const SETTINGS_KEY = 'ddl-settings';
function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      volume: typeof s.volume === 'number' ? s.volume : 0.7,
      sens: typeof s.sens === 'number' ? s.sens : 1,
      cb: s.cb === true,
      reduceMotion: s.reduceMotion === true,
      largeText: s.largeText === true,
    };
  } catch {
    return { volume: 0.7, sens: 1, cb: false, reduceMotion: false, largeText: false };
  }
}
const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  sfx.setVolume(settings.volume);
  document.body.classList.toggle('large', settings.largeText);
}
sfx.setVolume(settings.volume);
document.body.classList.toggle('large', settings.largeText);

// ---------- key bindings ----------
interface Bindings { forward: string; back: string; left: string; right: string; jump: string; dash: string; interact: string; pulse: string; pause: string }
const DEFAULT_BINDINGS: Bindings = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyF', pause: 'Escape' };
const BINDINGS_KEY = 'ddl-bindings';
function loadBindings(): Bindings {
  try { return { ...DEFAULT_BINDINGS, ...JSON.parse(localStorage.getItem(BINDINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_BINDINGS }; }
}
let bindings = loadBindings();
function saveBindings() { try { localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings)); } catch {} }
function bindingLabel(code: string): string {
  const MAP: Record<string, string> = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (MAP[code]) return MAP[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

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
let nightsWon = 0;
let runSeed = 0;
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
  const s = seed ?? (Date.now() >>> 0) % 1000000;
  if (n === 1) runSeed = s;
  sim = new Sim({ seed: s, night: n, scenario });
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
  nightsWon = 0;
  const k = (a: keyof Bindings) => `<kbd>${bindingLabel(bindings[a])}</kbd>`;
  show(`<h1>Đảo Đèn Lồng</h1>
    <div>Giúp <b>Mây</b>, người giữ đèn nhỏ tuổi, thắp lại Đèn Lồng Lớn trên ba hòn đảo trước khi trời sáng.</div>
    <table>
      <tr><td>${k('forward')}${k('left')}${k('back')}${k('right')}</td><td>đi theo hướng camera</td></tr>
      <tr><td>${k('jump')} / ${k('dash')}</td><td>nhảy / lướt</td></tr>
      <tr><td>${k('interact')}</td><td>nạp ánh sáng vào đèn (${TUNING.lantern_cost} đom đóm / đèn)</td></tr>
      <tr><td>${k('pulse')}</td><td>Tỏa Sáng: tốn ${TUNING.pulse_cost}, choáng Bóng Mực trong ${TUNING.pulse_radius} m</td></tr>
      <tr><td>kéo chuột / <kbd>←</kbd><kbd>→</kbd></td><td>xoay camera</td></tr>
      <tr><td>${k('pause')} / <kbd>P</kbd></td><td>tạm dừng</td></tr>
    </table>
    <div class="btns"><button id="bStart">Bắt đầu (Enter)</button><button id="bLb">Bảng xếp hạng</button><button id="bSet">Cài đặt</button></div>`);
  bind('bStart', () => showIntro(1));
  bind('bLb', () => showLeaderboard(showMenu));
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
    <label><input id="cb" type="checkbox" ${settings.cb ? "checked" : ""}> Bảng màu dễ phân biệt (mù màu)</label>
    <label><input id="rm" type="checkbox" ${settings.reduceMotion ? "checked" : ""}> Giảm chuyển động (tắt chớp màn hình)</label>
    <label><input id="lt" type="checkbox" ${settings.largeText ? "checked" : ""}> Chữ lớn (×1.25)</label>
    <div style="opacity:.75;margin-top:6px">Lưu tự động, giữ cho lần mở sau.</div>
    <div class="btns"><button id="bKeys">Phím điều khiển…</button><button id="bBack">Quay lại</button></div>`);
  const rm = $('rm') as HTMLInputElement;
  rm.onchange = () => { settings.reduceMotion = rm.checked; saveSettings(); };
  const lt = $('lt') as HTMLInputElement;
  lt.onchange = () => { settings.largeText = lt.checked; saveSettings(); };
  bind('bKeys', () => showKeyBindings(() => showSettings(back)));
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
  const cb = $('cb') as HTMLInputElement;
  cb.onchange = () => {
    settings.cb = cb.checked;
    saveSettings();
  };
  bind('bBack', back);
  phase = prev;
}

function showResult() {
  phase = 'result';
  sfx.stopMusic();
  const won = sim.state === 'won';
  if (won) { totalScore += sim.score; nightsWon++; }
  const why = sim.player.flames <= 0 ? 'Mây đã hết Ngọn Lửa.' : 'Trời đã sáng trước khi kịp thắp hết đèn.';
  if (won && night === 3) return showDawn();
  const lossScore = totalScore + sim.score;
  show(`<h2>Đêm ${night} – ${sim.map.name}</h2><h1>${won ? 'Đảo đã sáng lại!' : 'Mây cần nghỉ một chút…'}</h1>
    <div>${won ? 'Tất cả Đèn Lồng Lớn đã được thắp.' : why}</div>
    <div class="big">Điểm đêm: ${sim.score} · Tổng: ${totalScore}</div>
    <div class="btns">${won ? `<button id="bNext">Đêm ${night + 1} (Enter)</button>` : '<button id="bRetry">Chơi lại Đêm (Enter)</button>'}
    ${won ? '' : '<button id="bSaveLb">Lưu vào bảng xếp hạng</button>'}<button id="bMenu">Về menu</button></div>`);
  bind('bNext', () => showIntro(night + 1));
  bind('bRetry', () => showIntro(night));
  bind('bSaveLb', () => showNameEntry(lossScore, nightsWon, runSeed, showMenu));
  bind('bMenu', showMenu);
}

function showDawn() {
  phase = 'dawn';
  scene.background = new THREE.Color(0xffc98a);
  show(`<h1>Bình Minh</h1><div>Ba hòn đảo đã sáng rực. Ông Đăng mỉm cười: “Giỏi lắm, Mây.”</div>
    <div class="big">Tổng điểm: ${totalScore}</div><div class="btns"><button id="bSaveLb">Lưu vào bảng xếp hạng (Enter)</button><button id="bMenu">Về menu</button></div>`);
  const toMenu = () => {
    scene.background = new THREE.Color(PAL.sky);
    showMenu();
  };
  bind('bSaveLb', () => showNameEntry(totalScore, nightsWon, runSeed, toMenu));
  bind('bMenu', toMenu);
}

// ---------- input ----------
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (rebindingAction) { finishRebind(e.code); e.preventDefault(); return; }
  sfx.unlock();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === bindings.pause || e.code === 'KeyP') {
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
  const fwd = (keys.has(bindings.forward) || keys.has('ArrowUp') ? 1 : 0) - (keys.has(bindings.back) || keys.has('ArrowDown') ? 1 : 0);
  const right = (keys.has(bindings.right) ? 1 : 0) - (keys.has(bindings.left) ? 1 : 0);
  inp.move = [-right, fwd];
  inp.cam_yaw_deg = (camYaw * 180) / Math.PI;
  inp.jump = keys.has(bindings.jump);
  inp.interact = keys.has(bindings.interact);
  inp.pulse = keys.has(bindings.pulse);
  inp.dash = keys.has(bindings.dash) || keys.has('ShiftRight');
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
      case 'shade_spawned': {
        sfx.shadeSpawn();
        const sh = sim.shades.find((s) => s.id === e.data.id);
        if (sh) triggerShadeArrow(sh.x, sh.z);
        break;
      }
      case 'drifter_steal': sfx.steal(); break;
      case 'charm_picked': sfx.charm(); break;
      case 'player_hit':
        sfx.hit();
        if (!settings.reduceMotion) {
          $('flash').style.opacity = '1';
          setTimeout(() => ($('flash').style.opacity = '0'), 160);
        }
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
    const safe = sim.safeActive(l);
    (v.ring.material as THREE.MeshBasicMaterial).opacity = safe ? 0.35 : 0;
    const fuel = l.fuel / K.fuel_units;
    const low = l.lit && fuel < TUNING.low_fuel_threshold;
    const blinkOff = low && Math.floor(time) % 2 === 1; // 1 Hz slow blink
    v.fuelBar.visible = v.fuelBg.visible = l.lit && !blinkOff;
    const fw = Math.max(0.001, 1.5 * (fuel / TUNING.fuel_max));
    v.fuelBar.scale.set(fw, 0.14, 1);
    v.fuelBar.position.x = -0.75 + fw / 2; // left-aligned inside the 1.5 m track
    if (blinkOff) (v.lampMat.emissiveIntensity = 0.2), (v.light.intensity = 8);
    v.lamp.scale.setScalar(l.lit ? 1 : 0.8); // unlit lantern deflated 20%
    v.tear.visible = !l.lit;
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
    v.rim.color.set(st === 'stunned' ? PAL.shadeStun : settings.cb ? 0x00b3ff : PAL.shadeRim);
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
  const danger = sim.timeLeft <= 30;
  clock.classList.toggle('danger', danger && !settings.cb);
  clock.classList.toggle('dangerCb', danger && settings.cb);
  if (danger && settings.cb) clock.textContent = '⚠ ' + clock.textContent;
  if (phase === 'play' && tl <= 10 && tl > 0 && tl !== lastCountdown) {
    lastCountdown = tl;
    sfx.countdown(tl);
  }
  $('lamps').textContent = `${sim.litCount}/${sim.lanterns.length} (cần ${sim.winNeed})`;
  $('cap').textContent = `${p.carried}/${sim.capacity}`;
  $('score').textContent = String(totalScore + sim.score);
  const bar = $('motebar');
  if (bar.children.length !== sim.capacity) bar.innerHTML = '<i></i>'.repeat(sim.capacity);
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
    if (l.lit && l.fuel < TUNING.fuel_max * K.fuel_units && Math.hypot(l.x - p.x, l.z - p.z) <= TUNING.interact_radius) hint = `E — Châm dầu (${Math.round(l.fuel / K.fuel_units)}/100)`;
    if (!l.lit && Math.hypot(l.x - p.x, l.z - p.z) <= TUNING.interact_radius) hint = `E — Nạp ánh sáng (${l.deposited}/${sim.costOf(l)})`;
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
  updateShadeArrow(phase === 'play' ? dt : 0);
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

// ---------- shade-spawn arrow ----------
let shadeArrowT = 0;
let shadeArrowDir = 0; // angle in radians
function triggerShadeArrow(sx: number, sz: number) {
  const p = sim.player;
  shadeArrowDir = Math.atan2(sx - p.x, sz - p.z);
  shadeArrowT = 2;
}
function updateShadeArrow(dt: number) {
  const el = $('shadeArrow');
  if (!el) return;
  if (shadeArrowT > 0) {
    shadeArrowT -= dt;
    const W = window.innerWidth, H = window.innerHeight;
    const ax = Math.sin(shadeArrowDir), ay = Math.cos(shadeArrowDir);
    const sx = W / 2 + ax * (W / 2 - 60);
    const sy = H / 2 - ay * (H / 2 - 60);
    el.style.display = 'block';
    el.style.left = `${sx - 14}px`;
    el.style.top = `${sy - 14}px`;
    el.style.transform = `rotate(${shadeArrowDir}rad)`;
    el.style.opacity = String(Math.min(1, shadeArrowT));
  } else {
    el.style.display = 'none';
  }
}

// ---------- leaderboard ----------
interface LBEntry { name: string; score: number; nights_won: number; achieved_at: string; seed: number }
const LB_API = '/api/leaderboard';
const LB_LOCAL_KEY = 'ddl-leaderboard';

async function getLBEntries(): Promise<LBEntry[]> {
  try {
    const r = await fetch(LB_API); if (r.ok) { const d = await r.json(); return d.entries ?? []; }
  } catch {}
  try { return JSON.parse(localStorage.getItem(LB_LOCAL_KEY) || '[]'); } catch { return []; }
}

async function saveLBEntry(entry: LBEntry) {
  const entries = await getLBEntries();
  entries.push(entry);
  entries.sort((a, b) => b.score - a.score || new Date(a.achieved_at).getTime() - new Date(b.achieved_at).getTime());
  entries.splice(10);
  const data = { entries };
  try {
    await fetch(LB_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  } catch {}
  try { localStorage.setItem(LB_LOCAL_KEY, JSON.stringify(entries)); } catch {}
}

function showNameEntry(score: number, nightsWon: number, seed: number, onDone: () => void) {
  show(`<h2>Lưu kết quả</h2><h1>${nightsWon === 3 ? '🌅 Bình Minh!' : 'Hết lửa…'}</h1>
    <div>Tổng điểm: <b style="color:var(--gold)">${score}</b> · ${nightsWon}/3 đêm thắng</div>
    <label>Tên (3–12 ký tự A–Z 0–9 _):</label>
    <input id="nameIn" type="text" maxlength="12" placeholder="Mây" style="width:100%;padding:8px;font:inherit;background:#1a2050;border:1px solid var(--gold);border-radius:6px;color:var(--text)">
    <div id="nameErr" style="color:var(--danger);font-size:13px;min-height:18px"></div>
    <div class="btns"><button id="bSaveName">Lưu &amp; xem bảng xếp hạng</button><button id="bSkipName">Bỏ qua</button></div>`);
  const inp = $('nameIn') as HTMLInputElement;
  inp.focus();
  bind('bSkipName', onDone);
  bind('bSaveName', async () => {
    const name = inp.value.trim();
    if (!/^[A-Za-z0-9_]{3,12}$/.test(name)) { $('nameErr').textContent = 'Tên phải 3–12 ký tự, chỉ dùng A-Z 0-9 _'; return; }
    const entry: LBEntry = { name, score, nights_won: nightsWon, achieved_at: new Date().toISOString(), seed };
    await saveLBEntry(entry);
    showLeaderboard(onDone);
  });
}

async function showLeaderboard(back: () => void) {
  const entries = await getLBEntries();
  const rows = entries.length ? entries.map((e, i) => `<tr><td>${i + 1}</td><td>${String(e.name).replace(/[^A-Za-z0-9_]/g, "")}</td><td style="color:var(--gold)">${e.score}</td><td>${e.nights_won}/3</td><td style="opacity:.7">${e.achieved_at.slice(0, 10)}</td></tr>`).join('') : '<tr><td colspan="5" style="opacity:.6">Chưa có kết quả nào.</td></tr>';
  show(`<h1>Bảng xếp hạng</h1>
    <table style="width:100%;min-width:420px;border-collapse:collapse">
      <thead><tr style="color:var(--amber)"><th>#</th><th>Tên</th><th>Điểm</th><th>Đêm</th><th>Ngày</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="btns" style="margin-top:14px"><button id="bLbBack">Quay lại</button></div>`);
  bind('bLbBack', back);
}

// ---------- key rebinding ----------
let rebindingAction: keyof Bindings | null = null;
let rebindEl: HTMLElement | null = null;

const ACTION_LABELS: Record<keyof Bindings, string> = { forward: 'Tiến', back: 'Lùi', left: 'Trái', right: 'Phải', jump: 'Nhảy', dash: 'Lướt', interact: 'Nạp đèn', pulse: 'Tỏa Sáng', pause: 'Tạm dừng' };

// A key already used by another action is swapped: that action takes over the old key, so no key ends up doing two things.
function finishRebind(code: string) {
  if (!rebindingAction || !rebindEl) return;
  const action = rebindingAction;
  const old = bindings[action];
  const conflict = (Object.keys(bindings) as (keyof Bindings)[]).find((k) => k !== action && bindings[k] === code);
  const warn = $('rebindWarn');
  if (conflict) {
    bindings[conflict] = old;
    const other = document.getElementById(`rb_${conflict}`);
    if (other) other.textContent = bindingLabel(old);
    warn.textContent = `⚠ Phím "${bindingLabel(code)}" đang dùng cho "${ACTION_LABELS[conflict]}". Đã đổi chỗ: "${ACTION_LABELS[conflict]}" giờ là "${bindingLabel(old)}".`;
  } else warn.textContent = '';
  bindings[action] = code;
  saveBindings();
  rebindEl.textContent = bindingLabel(code);
  rebindingAction = null; rebindEl = null;
  document.querySelectorAll('.rebind-btn').forEach((b) => b.classList.remove('waiting'));
}

function showKeyBindings(back: () => void) {
  const rows = (Object.keys(bindings) as (keyof Bindings)[]).map((k) =>
    `<tr><td style="padding:4px 10px 4px 0">${ACTION_LABELS[k]}</td><td><button class="rebind-btn" id="rb_${k}">${bindingLabel(bindings[k])}</button></td></tr>`).join('');
  show(`<h1>Phím tùy chỉnh</h1>
    <div id="rebindWarn" style="color:var(--amber);font-size:13px;min-height:18px"></div>
    <table style="width:100%"><tbody>${rows}</tbody></table>
    <div class="btns" style="margin-top:12px"><button id="bRbReset">Khôi phục mặc định</button><button id="bRbBack">Quay lại</button></div>`);
  (Object.keys(bindings) as (keyof Bindings)[]).forEach((k) => {
    const btn = document.getElementById(`rb_${k}`);
    if (!btn) return;
    btn.onclick = () => {
      if (rebindingAction) { document.getElementById(`rb_${rebindingAction}`)?.classList.remove('waiting'); }
      rebindingAction = k; rebindEl = btn;
      document.querySelectorAll('.rebind-btn').forEach((b) => b.classList.remove('waiting'));
      btn.classList.add('waiting'); btn.textContent = '…';
    };
  });
  bind('bRbReset', () => { bindings = { ...DEFAULT_BINDINGS }; saveBindings(); showKeyBindings(back); });
  bind('bRbBack', () => { rebindingAction = null; back(); });
}

// ---------- bench mode ----------
function runBenchMode(seed: number, durationS: number) {
  // Build Night 1 scene
  loadNight(1, { player: { flames: 999 }, lanterns: [{ id: 'L1', lit: true, fuel: 100 }, { id: 'L2', lit: true, fuel: 100 }, { id: 'L3', lit: true, fuel: 100 }], random_shades: false, shades: [], random_motes: false, motes: [] }, seed);
  sync(0, 0);
  player.g.visible = false;
  // Hide all HUD
  document.body.classList.add('bench');
  $('fps').style.display = 'block';

  // 100 bench motes (visual only)
  const benchRng = mulberry32(seed);
  for (let i = 0; i < 100; i++) {
    const a = benchRng() * Math.PI * 2;
    const r = 4 + benchRng() * 32;
    const mg = makeMote();
    mg.position.set(r * Math.cos(a), 0.7, r * Math.sin(a));
    scene.add(mg);
  }

  // 200 bench shades (visual only, simplified wander)
  const K_SHADE_Y = K.shade_y;
  const WANDER_S = K.shade_wander_speed;
  const benchShades: { g: ReturnType<typeof makeShade>; x: number; z: number; tx: number; tz: number; timer: number }[] = [];
  for (let i = 0; i < 200; i++) {
    const a = benchRng() * Math.PI * 2;
    const r = 2 + benchRng() * 36;
    const x = r * Math.cos(a); const z = r * Math.sin(a);
    const sv = makeShade();
    sv.g.position.set(x, K_SHADE_Y, z);
    scene.add(sv.g);
    benchShades.push({ g: sv, x, z, tx: x + (benchRng() - 0.5) * 10, tz: z + (benchRng() - 0.5) * 10, timer: benchRng() * 2 });
  }

  let benchT = 0; let warmupDone = false;
  const dts: number[] = [];
  let frames = 0; let fpsT = 0; let peakHeap = 0;
  let last2 = performance.now();

  function benchFrame(now: number) {
    const dt = Math.min(0.1, (now - last2) / 1000);
    last2 = now;
    benchT += dt;
    if (!warmupDone && benchT >= 3) { warmupDone = true; }

    sync(benchT, dt);
    player.g.visible = false;
    // Orbit camera: CCW from above, period 15 s
    const theta = (benchT / 15) * Math.PI * 2;
    camera.position.set(30 * Math.cos(theta), 15, 30 * Math.sin(theta));
    camera.lookAt(0, 0, 0);

    // Update bench shades (simplified wander at 2 m/s)
    for (const s of benchShades) {
      s.timer -= dt;
      if (s.timer <= 0) {
        const a2 = benchRng() * Math.PI * 2; const r2 = 2 + benchRng() * 36;
        s.tx = r2 * Math.cos(a2); s.tz = r2 * Math.sin(a2); s.timer = 1 + benchRng() * 2;
      }
      const dx = s.tx - s.x; const dz = s.tz - s.z; const dist = Math.hypot(dx, dz);
      if (dist > 0.05) { const spd = Math.min(WANDER_S * dt, dist); s.x += (dx / dist) * spd; s.z += (dz / dist) * spd; }
      s.g.g.position.set(s.x, K_SHADE_Y + Math.sin(benchT * 3 + s.x) * 0.1, s.z);
    }
    renderer.render(scene, camera);
    frames++; fpsT += dt;
    if (fpsT >= 1) {
      $('fps').textContent = `${(frames / fpsT).toFixed(0)} FPS (bench)`;
      frames = 0; fpsT = 0;
      peakHeap = Math.max(peakHeap, (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
    }
    if (warmupDone) dts.push(dt * 1000);

    if (warmupDone && benchT >= 3 + durationS) {
      const N = dts.length;
      const avg = 1000 * N / dts.reduce((a, b) => a + b, 0);
      const k = Math.max(1, Math.ceil(0.01 * N));
      const sorted = [...dts].sort((a, b) => b - a);
      const p1low = 1000 / (sorted.slice(0, k).reduce((a, b) => a + b, 0) / k);
      const p95 = sorted[Math.floor(0.05 * N)];
      (window as unknown as Record<string, unknown>).__benchResult = {
        avg_fps: Math.round(avg * 10) / 10, p1_low_fps: Math.round(p1low * 10) / 10,
        frame_ms_p95: Math.round(p95 * 100) / 100, frames: N,
        peak_mem_mb: peakHeap ? Math.round((peakHeap / 1024 / 1024) * 10) / 10 : null,
      };
      (window as unknown as Record<string, unknown>).__benchDone = true;
      return;
    }
    if (!warmupDone) (window as unknown as Record<string, unknown>).__benchReady = true;
    requestAnimationFrame(benchFrame);
  }
  last = performance.now();
  requestAnimationFrame(benchFrame);
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
  settings: () => {
    loadNight(1, undefined, 42);
    showSettings(showMenu);
  },
  keys: () => {
    loadNight(1, undefined, 42);
    showKeyBindings(showMenu);
  },
  lbentry: () => {
    loadNight(3, undefined, 42);
    showNameEntry(2870, 3, 42, showMenu);
  },
  bench: () => {
    showIntro(3, { player: { flames: 1000 } }, 7);
    startPlay();
    $('fps').style.display = 'block';
  },
};
const shot = params.get('shot');
if (params.get('bench') === '1') {
  runBenchMode(Number(params.get('seed') ?? 42), Number(params.get('duration') ?? 30));
} else {
  if (shot && SHOTS[shot]) SHOTS[shot]();
  else showMenu();
  if (params.has('fps')) $('fps').style.display = 'block';
  requestAnimationFrame(frame);
}
