// 3D view of one night: terrain from the standard map + entity meshes synced from the Sim.
// Display only. Colors follow the Ticket-02 palette.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { NightDef } from '../sim/maps';
import type { Sim } from '../sim/sim';
import { TUNING } from '../sim/tuning';
import { mulberry32 } from '../sim/rng';

export const PAL = {
  sky: 0x0e1430,
  fog: 0x1b2350,
  grass: 0x2f5d50,
  sand: 0xc9b48a,
  wood: 0x6b4a2f,
  sea: 0x12384a,
  lampOn: 0xffb347,
  lampCore: 0xffe9b0,
  lampOff: 0x5b5f6e,
  moteCore: 0xfff6c2,
  moteHalo: 0xffe58a,
  shadeBody: 0x120a1a,
  shadeRim: 0x7a3cff,
  shadeStun: 0x3a3450,
  shirt: 0xe8e2d0,
  scarf: 0xc8102e,
  gold: 0xf2c14e,
  drifter: 0x8fa3b8,
};

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

function addIslandDisk(g: THREE.Group, cx: number, cz: number, r: number, h = 6) {
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r - 5, h, 72), std(PAL.grass));
  top.position.set(cx, -h / 2, cz);
  const rim = new THREE.Mesh(new THREE.RingGeometry(r - 1.6, r, 72), std(PAL.sand, { side: THREE.DoubleSide }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(cx, 0.02, cz);
  g.add(top, rim);
}

function addPad(g: THREE.Group, x: number, y: number, z: number) {
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 24), std(PAL.gold, { emissive: new THREE.Color(PAL.gold), emissiveIntensity: 0.35 }));
  pad.position.set(x, y + 0.06, z);
  g.add(pad);
}

export function buildTerrain(map: NightDef): THREE.Group {
  const g = new THREE.Group();
  const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshLambertMaterial({ color: PAL.sea }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -12;
  g.add(sea);
  const rng = mulberry32(map.night * 101);
  const puffMat = new THREE.MeshLambertMaterial({ color: PAL.sea, emissive: new THREE.Color(0x0a2030) });
  for (let i = 0; i < 50; i++) {
    const a = rng() * Math.PI * 2;
    const r = 60 + rng() * 80;
    const [cx, cz] = map.centers[0];
    const puff = new THREE.Mesh(new THREE.SphereGeometry(5 + rng() * 7, 10, 8), puffMat);
    puff.position.set(cx + r * Math.cos(a), -10 + rng() * 3, cz + r * Math.sin(a));
    puff.scale.y = 0.4;
    g.add(puff);
  }

  if (map.night === 1) addIslandDisk(g, 0, 0, 40);
  if (map.night === 2) {
    addIslandDisk(g, 0, 0, 28);
    addIslandDisk(g, 70, 0, 28);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), std(PAL.wood));
    bridge.position.set(35, -0.15, 0);
    g.add(bridge);
    for (let x = 26.5; x <= 43.5; x += 1) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 4), std(0x8a6a45));
      slat.position.set(x, 0.01, 0);
      g.add(slat);
    }
    // Bamboo handrails on both sides
    for (const sz of [-2.1, 2.1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 18, 6), std(0x9ab870));
      rail.rotation.z = Math.PI / 2;
      rail.position.set(35, 0.65, sz);
      g.add(rail);
      for (let x = 27; x <= 43; x += 2.5) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.7, 6), std(0x9ab870));
        post.position.set(x, 0.35, sz);
        g.add(post);
      }
    }
  }
  if (map.night === 3) {
    addIslandDisk(g, 0, 0, 45);
    // tier 1: half annulus r 12..24 on z > 0, top at y=3
    const sh = new THREE.Shape();
    sh.absarc(0, 0, 24, Math.PI, 2 * Math.PI, false);
    sh.absarc(0, 0, 12, 2 * Math.PI, Math.PI, true);
    const t1 = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false, curveSegments: 48 }), std(0x356a5b));
    t1.rotation.x = -Math.PI / 2; // shape y<0 -> world z>0, extrude depth -> +Y
    g.add(t1);
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 48), std(0x3b7565));
    t2.position.y = 3;
    g.add(t2);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 24), std(PAL.wood));
    tower.position.y = 10;
    // Red accent ring near tower top
    const towerRing = new THREE.Mesh(new THREE.CylinderGeometry(2.08, 2.08, 0.18, 24), std(0xb82020));
    towerRing.position.y = 13.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.5, 8), std(0x5a2a22));
    roof.position.y = 15.2;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(PAL.gold, { metalness: 0.6, roughness: 0.4 }));
    bell.position.y = 13.4;
    // 4 small hanging lanterns under roof eaves
    for (let i = 0; i < 4; i++) {
      const ea = (i / 4) * Math.PI * 2;
      const hLamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), std(PAL.lampOn, { emissive: new THREE.Color(PAL.lampOn), emissiveIntensity: 0.9 }));
      hLamp.position.set(Math.cos(ea) * 2.4, 14.6, Math.sin(ea) * 2.4);
      const hString = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4), std(PAL.wood));
      hString.position.set(Math.cos(ea) * 2.4, 14.9, Math.sin(ea) * 2.4);
      g.add(hLamp, hString);
    }
    g.add(tower, towerRing, roof, bell);
    for (const deg of [30, 150]) {
      const prof = new THREE.Shape();
      prof.moveTo(0, 0);
      prof.lineTo(6, 0);
      prof.lineTo(0, 3);
      prof.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(prof, { depth: 3, bevelEnabled: false });
      geo.translate(0, 0, -1.5);
      const ramp = new THREE.Mesh(geo, std(PAL.sand));
      const th = (deg * Math.PI) / 180;
      ramp.position.set(24 * Math.cos(th), 0, 24 * Math.sin(th));
      ramp.rotation.y = -th; // local +X -> radial direction
      g.add(ramp);
    }
  }
  for (const p of map.pads) addPad(g, p.x, p.y, p.z);

  // decorative trees near shores (never on the play paths)
  const treeMat = std(0x1f4a3c);
  const trunkMat = std(PAL.wood);
  const palmFrondMat = new THREE.MeshLambertMaterial({ color: 0x3a7a4a, side: THREE.DoubleSide });
  for (const [cx, cz] of map.centers) {
    const R = map.night === 1 ? 40 : map.night === 2 ? 28 : 45;
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2;
      const r = R - 2.5 - rng() * 1.5;
      const x = cx + r * Math.cos(a);
      const z = cz + r * Math.sin(a);
      if (map.ground(x, z) !== 0) continue;
      if (map.night === 2 && Math.abs(z) < 4 && x > 20 && x < 50) continue; // keep bridge ends clear
      const tr = new THREE.Group();
      if (rng() < 0.45) {
        // Coconut palm: 3 angled trunk segments + frond fan
        const lean = (rng() - 0.5) * 0.25;
        for (let s = 0; s < 3; s++) {
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.0, 6), trunkMat);
          seg.position.set(s * lean * 0.4, 0.5 + s, 0);
          seg.rotation.z = lean;
          tr.add(seg);
        }
        // 5 flat fronds radiating from crown
        for (let f = 0; f < 5; f++) {
          const fa = (f / 5) * Math.PI * 2;
          const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 1.5), palmFrondMat);
          frond.position.set(Math.cos(fa) * 0.28 + lean * 1.2, 3.1, Math.sin(fa) * 0.28);
          frond.rotation.y = -fa;
          frond.rotation.z = -0.65;
          tr.add(frond);
        }
      } else {
        // Conifer / pine (original style, slightly varied)
        const h = 2 + rng() * 2;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), trunkMat);
        trunk.position.y = 0.5;
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9, h, 7), treeMat);
        crown.position.y = 1 + h / 2;
        tr.add(trunk, crown);
      }
      tr.position.set(x, 0, z);
      g.add(tr);
    }
  }
  return g;
}

export function makePlayer() {
  const g = new THREE.Group();
  // Gojo Satoru chibi: dark high-collar uniform, white spiky hair, blindfold
  const DARK = 0x141828;
  const NAVY = 0x1c2240;
  // Body — dark jacket, slightly wider chibi proportions
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.68, 4, 12), std(NAVY));
  body.position.y = 0.64;
  // Outer coat (slightly wider layer for depth)
  const coat = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.52, 4, 12), std(DARK));
  coat.scale.z = 1.08;
  coat.position.y = 0.58;
  // High collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.26, 12), std(DARK));
  collar.position.y = 1.12;
  // Head (pale chibi face — larger relative to body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), std(0xf5e8d8));
  head.position.y = 1.5;
  // Blindfold (white strip, Gojo's most iconic look)
  const blindfold = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.11, 0.1), std(0xe8eaf0, { roughness: 0.2 }));
  blindfold.position.set(0, 1.55, 0.3);
  // Hair base (white/silver sphere, shifted back/up)
  const hairBase = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), std(0xdde0ea, { roughness: 0.55 }));
  hairBase.position.set(0, 1.68, -0.06);
  // Spiky hair strands pointing outward in various directions
  const hairMat = std(0xe4e7f0, { roughness: 0.45 });
  const spikeData: [number, number, number, number, number, number][] = [
    [0, 2.1, 0.06, 0.15, 0, 0],
    [0.2, 2.05, 0.02, 0.1, 0, -0.45],
    [-0.2, 2.05, 0.02, 0.1, 0, 0.45],
    [0.08, 2.0, -0.18, -0.28, 0.25, -0.1],
    [-0.08, 2.0, -0.18, -0.28, -0.25, 0.1],
    [0.32, 1.9, -0.08, 0.05, 0, -0.9],
    [-0.32, 1.9, -0.08, 0.05, 0, 0.9],
    [0.14, 1.95, -0.28, -0.5, 0.2, -0.15],
    [-0.14, 1.95, -0.28, -0.5, -0.2, 0.15],
  ];
  for (const [px, py, pz, rx, ry, rz] of spikeData) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.44, 5), hairMat);
    spike.position.set(px, py, pz);
    spike.rotation.set(rx, ry, rz);
    g.add(spike);
  }
  // Arms — dark sleeves
  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 8), std(DARK));
  armR.position.set(0.4, 0.9, 0.1);
  armR.rotation.z = -0.5;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 8), std(DARK));
  armL.position.set(-0.38, 0.88, 0);
  armL.rotation.z = 0.42;
  // Lantern carried in hand (Gojo holds it as his guiding light in this world)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: PAL.lampCore }));
  lamp.position.set(0.62, 1.0, 0.2);
  const light = new THREE.PointLight(PAL.lampOn, 6, 12, 1.4);
  light.position.copy(lamp.position);
  g.add(body, coat, collar, head, blindfold, hairBase, armR, armL, lamp, light);
  return { g, light };
}

export interface LanternView {
  g: THREE.Group;
  lampMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  ring: THREE.Mesh;
  lamp: THREE.Mesh;
  fuelBar: THREE.Sprite;
  fuelBg: THREE.Sprite;
  tear: THREE.Mesh;
}
export function makeLantern(): LanternView {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 3, 8), std(PAL.wood));
  post.position.y = 1.5;
  const lampMat = std(PAL.lampOff, { emissive: new THREE.Color(PAL.lampOn), emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 1.1, 8), lampMat);
  lamp.position.y = 3.4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 8), std(0x5a2a22));
  roof.position.y = 4.2;
  const light = new THREE.PointLight(PAL.lampOn, 0, 26, 1.1);
  light.position.y = 3.4;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(TUNING.safe_radius - 0.12, TUNING.safe_radius, 72),
    new THREE.MeshBasicMaterial({ color: PAL.lampOn, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  // fuel bar (Ticket-03) + torn paper mark for unlit lanterns (readable without color)
  const fuelBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x000000, depthTest: false }));
  fuelBg.scale.set(1.7, 0.26, 1);
  fuelBg.position.y = 4.9;
  fuelBg.renderOrder = 10;
  const fuelBar = new THREE.Sprite(new THREE.SpriteMaterial({ color: PAL.lampOn, depthTest: false }));
  fuelBar.position.set(0, 4.9, 0);
  fuelBar.renderOrder = 11;
  const tear = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.7), new THREE.MeshBasicMaterial({ color: 0x0e1430, side: THREE.DoubleSide }));
  tear.position.set(0.1, 3.4, 0.5);
  tear.rotation.z = 0.4;
  g.add(post, lamp, roof, light, ring, fuelBg, fuelBar, tear);
  return { g, lampMat, light, ring, lamp, fuelBar, fuelBg, tear };
}

const moteCoreGeo = new THREE.SphereGeometry(0.12, 8, 6);
const moteHaloGeo = new THREE.SphereGeometry(0.28, 8, 6);
const moteCoreMat = new THREE.MeshBasicMaterial({ color: PAL.moteCore });
const moteHaloMat = new THREE.MeshBasicMaterial({ color: PAL.moteHalo, transparent: true, opacity: 0.35 });
export function makeMote() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moteCoreGeo, moteCoreMat), new THREE.Mesh(moteHaloGeo, moteHaloMat));
  return g;
}

export interface ShadeView {
  g: THREE.Group;
  body: THREE.MeshStandardMaterial;
  rim: THREE.MeshBasicMaterial;
}
// Shade parts are baked into 3 shared geometries (body+wisps, outline, eyes): 3 draw calls per shade instead of 7,
// which matters with 200 shades in the Ticket-04 bench scene.
const shadeBodyGeo = mergeGeometries([
  new THREE.SphereGeometry(0.75, 20, 14).scale(1, 1.4, 1).translate(0, 0.1, 0),
  ...[0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    return new THREE.ConeGeometry(0.08, 0.55, 5).rotateZ(Math.PI).translate(Math.cos(a) * 0.3, -0.62, Math.sin(a) * 0.3);
  }),
].map((geo) => geo.toNonIndexed()))!;
const shadeOutlineGeo = new THREE.SphereGeometry(0.83, 20, 14).scale(1, 1.4, 1).translate(0, 0.1, 0);
const shadeEyeGeo = mergeGeometries(
  ([[-0.27, 0.35], [0.27, -0.35]] as [number, number][]).map(([sx, rz]) => new THREE.SphereGeometry(0.1, 8, 6).rotateZ(rz).translate(sx, 0.35, 0.68)),
)!;
const shadeEyeMat = new THREE.MeshBasicMaterial({ color: 0xe8d8ff });
export function makeShade(): ShadeView {
  const g = new THREE.Group();
  const body = std(PAL.shadeBody, { roughness: 0.5 });
  const rim = new THREE.MeshBasicMaterial({ color: PAL.shadeRim, side: THREE.BackSide });
  g.add(new THREE.Mesh(shadeBodyGeo, body), new THREE.Mesh(shadeOutlineGeo, rim), new THREE.Mesh(shadeEyeGeo, shadeEyeMat));
  return { g, body, rim };
}

export function makeDrifter() {
  const g = new THREE.Group();
  // Wind-vortex form: stacked torus rings with shrinking radius = whirlwind silhouette
  const mat = new THREE.MeshBasicMaterial({ color: PAL.drifter, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const r = 0.52 - i * 0.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.055, 6, 18), mat);
    ring.position.y = i * 0.38;
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = (i * Math.PI) / 3; // stagger for spiral look
    g.add(ring);
  }
  // Thin central core
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), mat);
  core.position.y = 0.5;
  g.add(core);
  return g;
}

export function makeCharm() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.04), std(PAL.scarf, { emissive: new THREE.Color(PAL.scarf), emissiveIntensity: 0.3 }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.54, 0.84, 0.06)), new THREE.LineBasicMaterial({ color: PAL.gold }));
  g.add(paper, edge);
  return g;
}

/** Simple leaf particles for the night-3 wind warning/gust. */
export class Leaves {
  readonly g = new THREE.Group();
  private items: { m: THREE.Mesh; life: number }[] = [];
  private mat = new THREE.MeshBasicMaterial({ color: 0x9bbf6a, side: THREE.DoubleSide });
  private geo = new THREE.PlaneGeometry(0.18, 0.1);
  update(dt: number, sim: Sim, px: number, py: number, pz: number, rng: () => number) {
    const deg = sim.wind.active ? sim.wind.deg : sim.nextWindDeg;
    if (deg !== null && this.items.length < 60) {
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(this.geo, this.mat);
        m.position.set(px + (rng() - 0.5) * 24, py + 0.5 + rng() * 4, pz + (rng() - 0.5) * 24);
        this.g.add(m);
        this.items.push({ m, life: 2 });
      }
    }
    const th = ((deg ?? 0) * Math.PI) / 180;
    const sp = sim.wind.active ? 9 : 4;
    this.items = this.items.filter((it) => {
      it.life -= dt;
      it.m.position.x += Math.cos(th) * sp * dt;
      it.m.position.z += Math.sin(th) * sp * dt;
      it.m.rotation.x += dt * 6;
      it.m.rotation.y += dt * 4;
      if (it.life <= 0) this.g.remove(it.m);
      return it.life > 0;
    });
  }
}
