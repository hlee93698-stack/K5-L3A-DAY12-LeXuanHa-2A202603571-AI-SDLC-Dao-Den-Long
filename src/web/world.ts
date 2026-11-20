// 3D view of one night: terrain from the standard map + entity meshes synced from the Sim.
// Display only. Colors follow the Ticket-02 palette.
import * as THREE from 'three';
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
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.5, 8), std(0x5a2a22));
    roof.position.y = 15.2;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(PAL.gold, { metalness: 0.6, roughness: 0.4 }));
    bell.position.y = 13.4;
    g.add(tower, roof, bell);
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
  for (const [cx, cz] of map.centers) {
    const R = map.night === 1 ? 40 : map.night === 2 ? 28 : 45;
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2;
      const r = R - 2.5 - rng() * 1.5;
      const x = cx + r * Math.cos(a);
      const z = cz + r * Math.sin(a);
      if (map.ground(x, z) !== 0) continue;
      if (map.night === 2 && Math.abs(z) < 4 && x > 20 && x < 50) continue; // keep bridge ends clear
      const h = 2 + rng() * 2;
      const tr = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), trunkMat);
      trunk.position.y = 0.5;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9, h, 7), treeMat);
      crown.position.y = 1 + h / 2;
      tr.add(trunk, crown);
      tr.position.set(x, 0, z);
      g.add(tr);
    }
  }
  return g;
}

export function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.55, 4, 12), std(PAL.shirt));
  body.position.y = 0.62;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.08, 8, 20), std(PAL.scarf));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), std(0xf3d2b3));
  head.position.y = 1.32;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.38, 28), std(PAL.sand));
  hat.position.y = 1.67;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: PAL.lampCore }));
  lamp.position.set(0.6, 1.12, 0.15);
  const light = new THREE.PointLight(PAL.lampOn, 6, 12, 1.4);
  light.position.copy(lamp.position);
  g.add(body, scarf, head, hat, lamp, light);
  return { g, light };
}

export interface LanternView {
  g: THREE.Group;
  lampMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  ring: THREE.Mesh;
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
  g.add(post, lamp, roof, light, ring);
  return { g, lampMat, light, ring };
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
export function makeShade(): ShadeView {
  const g = new THREE.Group();
  const body = std(PAL.shadeBody, { roughness: 0.5 });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 14), body);
  blob.scale.set(1, 1.15, 1);
  const rim = new THREE.MeshBasicMaterial({ color: PAL.shadeRim, side: THREE.BackSide });
  const outline = new THREE.Mesh(new THREE.SphereGeometry(0.88, 20, 14), rim);
  outline.scale.set(1, 1.15, 1);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe8d8ff });
  for (const sx of [-0.28, 0.28]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeMat);
    eye.position.set(sx, 0.25, 0.7);
    g.add(eye);
  }
  g.add(blob, outline);
  return { g, body, rim };
}

export function makeDrifter() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: PAL.drifter, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.6), mat);
    strip.position.set(0, 0, -i * 0.55);
    strip.rotation.x = Math.PI / 2;
    g.add(strip);
  }
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
