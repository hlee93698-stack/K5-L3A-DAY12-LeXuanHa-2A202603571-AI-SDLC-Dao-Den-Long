// Pure, deterministic game logic (contract v1.1). No DOM, no clock, no Math.random.
// Step order (Ticket-02, mandatory):
//  1 input (pause first)  2 counters  3 player move (jump/dash/pad/wind) + fall check
//  4 pickup motes/charms  5 lantern interact  6 safe zones  7 pulse
//  8 shades + drifters move  9 contacts (drifter steal, then shade hits by id)
//  10 scheduled spawns  11 win/lose  (12 snapshot: done by the runner)
import { TUNING, K, type Tuning } from './tuning';
import { getNight, type NightDef } from './maps';
import { mulberry32, type Rng } from './rng';
import type { DrifterState, GameEvent, GameState, InputState, MoteKind, Scenario, ShadeState } from './types';

export const DT = 1 / K.tick_rate;
const ticks = (s: number) => Math.round(s * K.tick_rate);
const EPS = 1e-6;

export function r1(v: number): number {
  const o = Math.round(v * 10) / 10;
  return o === 0 ? 0 : o;
}

export function r3(v: number): number {
  const o = Math.round(v * 1000) / 1000;
  return o === 0 ? 0 : o;
}

export interface Player {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  fx: number; // facing (unit, XZ)
  fz: number;
  flames: number;
  carried: number;
  invuln: number;
  dashCd: number;
  pulseCd: number;
  charm: number;
  dashLeft: number;
  dashDx: number;
  dashDz: number;
  launch: { vx: number; vz: number } | null;
  fallWait: number;
}

export interface Shade {
  id: string;
  x: number;
  y: number;
  z: number;
  state: ShadeState;
  left: number; // ticks left in spawning / stunned / recoil
  push: number; // remaining push ticks (stunned)
  pdx: number;
  pdz: number;
  evict: number; // remaining eviction ticks (pushed out of a safe zone)
  ex: number; // eviction lantern center
  ez: number;
  wdx: number;
  wdz: number;
  wLeft: number;
  target: string | null; // lantern id (wander toward weak lantern / drain)
  drainT: number; // ticks spent draining (fuel_drain event every 60)
}

export interface Mote {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: MoteKind;
  ttl: number | null;
}

export interface Drifter {
  id: string;
  x: number;
  y: number;
  z: number;
  state: DrifterState;
  stolen: number;
  left: number; // flee ticks left
  wdx: number;
  wdz: number;
  wLeft: number;
}

export interface Charm {
  id: string;
  x: number;
  y: number;
  z: number;
  available: boolean;
  respawn: number;
}

export interface Lantern {
  id: string;
  x: number;
  y: number;
  z: number;
  lit: boolean;
  deposited: number;
  fuel: number; // integer 1/60 units, 0..6000
  everLit: boolean;
  relit: number;
}

export interface SimOptions {
  seed: number;
  night?: number;
  scenario?: Scenario;
  tuning?: Tuning;
}

const idNum = (id: string) => {
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};
const byId = (a: { id: string }, b: { id: string }) => idNum(a.id) - idNum(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const distXZ = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export class Sim {
  readonly t: Tuning;
  readonly map: NightDef;
  readonly night: number;
  tick = 0; // output ticks (incl. paused)
  simTick = 0; // gameplay steps
  state: GameState = 'playing';
  score = 0;
  readonly initialTimeLeft: number;
  player: Player;
  lanterns: Lantern[];
  motes: Mote[] = [];
  shades: Shade[] = [];
  drifters: Drifter[] = [];
  charms: Charm[] = [];
  wind = { active: false, left: 0, dx: 0, dz: 0, deg: 0, warn: false };

  private rng: Rng;
  private randomMotes: boolean;
  private randomShades: boolean;
  private randomDrifters: boolean;
  private windEnabled: boolean;
  private nextMote = 1;
  private nextShade = 1;
  private nextDrifter = 1;
  private prev = { jump: false, interact: false, pulse: false, dash: false, pause: false };
  private events: GameEvent[] = [];
  private readonly dashTicks: number;
  private readonly dashCdTicks: number;
  private readonly invulnTicks: number;
  private readonly stunTicks: number;
  private readonly pulseCdTicks: number;
  nextWindDeg: number | null = null; // read-only for the view (wind warning leaves)

  constructor(opts: SimOptions) {
    this.t = opts.tuning ?? TUNING;
    this.night = opts.night ?? 1;
    this.map = getNight(this.night);
    const sc = opts.scenario ?? {};
    const m = this.map;
    this.rng = mulberry32(opts.seed);
    this.dashTicks = ticks(this.t.dash_duration_s);
    this.dashCdTicks = ticks(this.t.dash_cooldown_s);
    this.invulnTicks = ticks(this.t.invuln_s);
    this.stunTicks = ticks(this.t.pulse_stun_s);
    this.pulseCdTicks = ticks(this.t.pulse_cooldown_s);
    this.randomMotes = sc.random_motes ?? true;
    this.randomShades = sc.random_shades ?? true;
    this.randomDrifters = sc.random_drifters ?? m.drifters;
    this.windEnabled = sc.wind_enabled ?? m.wind;
    this.initialTimeLeft = sc.time_left_s ?? m.duration_s;

    const sp = sc.player ?? {};
    const pos = sp.pos ?? m.start;
    const g = m.ground(pos[0], pos[2]);
    this.player = {
      x: pos[0],
      y: pos[1],
      z: pos[2],
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: g !== null && Math.abs(pos[1] - g) <= EPS,
      fx: 0,
      fz: 1,
      flames: sp.flames ?? this.t.flames,
      carried: sp.carried ?? 0,
      invuln: sp.invuln_ticks ?? 0,
      dashCd: sp.dash_cd_ticks ?? 0,
      pulseCd: sp.pulse_cd_ticks ?? 0,
      charm: sp.charm_ticks ?? 0,
      dashLeft: 0,
      dashDx: 0,
      dashDz: 1,
      launch: null,
      fallWait: 0,
    };

    this.successfulLights = sp.successful_lights ?? 0;
    this.lanterns = m.lanterns.map((l) => ({ id: l.id, x: l.pos[0], y: l.pos[1], z: l.pos[2], lit: false, deposited: 0, fuel: 0, everLit: false, relit: 0 }));
    for (const u of sc.lanterns ?? []) {
      const l = this.lanterns.find((x) => x.id === u.id);
      if (!l) continue;
      if (u.pos) [l.x, l.y, l.z] = u.pos;
      if (u.ever_lit !== undefined) l.everLit = u.ever_lit;
      if (u.deposited !== undefined) l.deposited = Math.min(u.deposited, this.costOf(l));
      if (u.lit === true || (u.lit === undefined && l.deposited >= this.costOf(l))) {
        l.lit = true;
        if (u.deposited === undefined) l.deposited = this.costOf(l);
        l.everLit = u.ever_lit ?? true;
        l.fuel = Math.round((u.fuel ?? this.t.fuel_max) * K.fuel_units);
        if (l.fuel <= 0) (l.lit = false), (l.fuel = 0), (l.deposited = 0);
      }
    }

    if (sc.motes) {
      for (const mo of sc.motes) {
        const kind = mo.kind ?? 'random';
        this.motes.push({
          id: mo.id ?? this.newMoteId(),
          x: mo.pos[0],
          y: mo.pos[1],
          z: mo.pos[2],
          kind,
          ttl: kind === 'dropped' ? mo.ttl_ticks ?? K.drop_ttl : null,
        });
      }
    } else if (this.randomMotes) {
      const idx = m.motePoints.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      for (const i of idx.slice(0, K.mote_initial)) this.addMote(m.motePoints[i], 'random');
    }

    const reserved = new Set((sc.shades ?? []).map((s) => s.id).filter((x): x is string => !!x));
    for (const s of sc.shades ?? []) {
      const id = s.id ?? this.newShadeId(reserved);
      const sh = this.makeShade(id, s.pos[0], s.pos[2], s.pos[1]);
      const d = distXZ(sh.x, sh.z, this.player.x, this.player.z);
      sh.state = s.state ?? (d <= K.shade_detect ? 'chase' : 'wander');
      const defLeft: Partial<Record<ShadeState, number>> = { stunned: this.stunTicks, recoil: K.shade_recoil_ticks, spawning: K.shade_spawning_ticks };
      sh.left = s.state_ticks_left ?? defLeft[sh.state] ?? 0;
      if (sh.state === 'recoil') this.setAway(sh, (dx, dz) => ((sh.pdx = dx), (sh.pdz = dz)));
      sh.target = s.target_lantern_id ?? null;
      this.shades.push(sh);
    }

    const dres = new Set((sc.drifters ?? []).map((s) => s.id).filter((x): x is string => !!x));
    for (const d of sc.drifters ?? []) {
      let id = d.id;
      if (!id) do id = `D${this.nextDrifter++}`;
      while (dres.has(id));
      const dr = this.makeDrifter(id, d.pos[0], d.pos[2]);
      dr.state = d.state ?? 'idle';
      dr.stolen = d.stolen ?? 0;
      dr.left = d.state_ticks_left ?? (dr.state === 'flee' ? K.drifter_flee_ticks : 0);
      this.drifters.push(dr);
    }

    const charmDefs = sc.charms
      ? sc.charms.map((c, i) => ({ id: c.id ?? `C${i + 1}`, pos: c.pos ?? m.charms.find((x) => x.id === c.id)?.pos ?? [0, 0, 0], available: c.available ?? true, respawn: c.respawn_ticks ?? 0 }))
      : m.charms.map((c) => ({ id: c.id, pos: c.pos, available: true, respawn: 0 }));
    for (const c of charmDefs) {
      this.charms.push({ id: c.id, x: c.pos[0], y: c.pos[1], z: c.pos[2], available: c.available, respawn: c.available ? 0 : c.respawn || K.charm_respawn_ticks });
    }
    this.shades.sort(byId);
    this.events = [];
  }

  get timeLeft(): number {
    return this.initialTimeLeft - this.simTick / K.tick_rate;
  }
  get litCount(): number {
    return this.lanterns.filter((l) => l.lit).length;
  }
  successfulLights = 0;
  get capacity(): number {
    return Math.min(this.t.capacity_max, this.t.carry_capacity + 2 * this.successfulLights);
  }
  /** motes needed to (re)light: 10 first time, 5 for a lantern that was lit before */
  costOf(l: Lantern): number {
    return l.everLit ? this.t.relight_cost : this.t.lantern_cost;
  }
  /** safe zone exists only while lit with fuel >= 30 */
  safeActive(l: Lantern): boolean {
    return l.lit && l.fuel >= this.t.low_fuel_threshold * K.fuel_units;
  }
  get winNeed(): number {
    return Math.ceil(this.t.win_ratio * this.lanterns.length - 1e-9);
  }

  /** One output tick. Returns events stamped with the new tick. */
  step(input: InputState): GameEvent[] {
    if (this.state === 'won' || this.state === 'lost') return [];
    this.events = [];
    this.tick += 1;
    const p = this.player;
    const t = this.t;

    // 1. input, pause first
    const edge = (k: keyof typeof this.prev) => input[k] && !this.prev[k];
    const e = { jump: edge('jump'), interact: edge('interact'), pulse: edge('pulse'), dash: edge('dash'), pause: edge('pause') };
    this.prev = { jump: input.jump, interact: input.interact, pulse: input.pulse, dash: input.dash, pause: input.pause };
    if (e.pause) {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.emit('paused', {});
        return this.events;
      }
      this.state = 'playing';
      this.emit('resumed', {});
    }
    if (this.state === 'paused') return this.events;
    this.simTick += 1;

    // 2. counters
    if (p.dashCd > 0) p.dashCd--;
    if (p.pulseCd > 0) p.pulseCd--;
    if (p.invuln > 0) p.invuln--;
    if (p.charm > 0) p.charm--;
    for (const s of this.shades) {
      if (s.state === 'stunned' && s.left > 0 && --s.left === 0) s.state = 'wander'; // Ticket-03: stun ends in wander
    }
    this.motes = this.motes.filter((mo) => mo.ttl === null || --mo.ttl > 0);
    for (const c of this.charms) if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
    // fuel: natural decay 1/s + 5/s per draining shade; then lanterns at <= 0 go out
    for (const l of this.lanterns) {
      if (!l.lit) continue;
      const drainers = this.shades.filter((s) => s.state === 'drain' && s.target === l.id).sort(byId);
      l.fuel -= this.t.fuel_decay_per_s + this.t.drain_per_s * drainers.length; // per tick in 1/60 units
      for (const s of drainers) {
        if (++s.drainT % K.tick_rate === 0) this.emit('fuel_drain', { lantern_id: l.id, shade_id: s.id, fuel: r1(Math.max(0, l.fuel) / K.fuel_units) });
      }
      if (l.fuel <= 0) {
        l.fuel = 0;
        l.lit = false;
        l.deposited = 0;
        this.emit('lantern_out', { lantern_id: l.id });
      }
    }
    this.updateWind();

    // 3. player movement
    this.movePlayer(input, e.jump, e.dash);

    const active = p.fallWait === 0;
    // 4. pickup
    if (active) {
      for (let i = 0; i < this.motes.length && p.carried < this.capacity; ) {
        const mo = this.motes[i];
        if (distXZ(p.x, p.z, mo.x, mo.z) <= t.pickup_radius && Math.abs(p.y - mo.y) <= K.pickup_dy) {
          this.motes.splice(i, 1);
          p.carried++;
          this.emit('mote_picked', { carried: p.carried });
        } else i++;
      }
      for (const c of this.charms) {
        if (c.available && distXZ(p.x, p.z, c.x, c.z) <= t.pickup_radius && Math.abs(p.y - c.y) <= K.pickup_dy) {
          c.available = false;
          c.respawn = K.charm_respawn_ticks;
          p.charm = K.charm_ticks;
          this.emit('charm_picked', { charm_id: c.id, charm_ticks: K.charm_ticks });
        }
      }
    }

    // 5. interact
    if (active && e.interact && p.carried > 0) {
      let best: Lantern | undefined;
      let bestD = Infinity;
      const FU = K.fuel_units;
      const maxU = t.fuel_max * FU;
      for (const l of [...this.lanterns].sort(byId)) {
        if (l.lit && l.fuel >= maxU) continue; // full lantern is not selectable
        const d = distXZ(p.x, p.z, l.x, l.z);
        if (d <= t.interact_radius && d < bestD) (best = l), (bestD = d);
      }
      if (best && best.lit) {
        // refuel: used = min(carried, ceil((100 - fuel) / 10)) computed in integer units
        const per = t.fuel_per_mote * FU;
        const used = Math.min(p.carried, Math.ceil((maxU - best.fuel) / per));
        best.fuel = Math.min(maxU, best.fuel + per * used);
        p.carried -= used;
        this.score += used * t.score.per_mote;
        this.emit('refuel', { lantern_id: best.id, amount: used, fuel: r1(best.fuel / FU) });
      } else if (best) {
        const cost = this.costOf(best);
        const amount = Math.min(p.carried, cost - best.deposited);
        best.deposited += amount;
        p.carried -= amount;
        this.score += amount * t.score.per_mote;
        this.emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
        if (best.deposited >= cost) {
          const relight = best.everLit;
          best.lit = true;
          best.everLit = true;
          best.fuel = maxU;
          if (relight) best.relit++;
          this.successfulLights++;
          this.score += relight ? K.relight_score : t.score.per_lantern;
          this.emit('lantern_lit', { lantern_id: best.id, relight });
        }
      }
    }

    // 6. safe zones: shades inside a lit lantern's radius get evicted over <= 30 ticks
    for (const l of this.lanterns) {
      if (!this.safeActive(l)) continue;
      for (const s of this.shades) {
        if (s.evict === 0 && distXZ(s.x, s.z, l.x, l.z) < t.safe_radius - EPS) {
          s.evict = K.evict_ticks;
          s.ex = l.x;
          s.ez = l.z;
        }
      }
    }

    // 7. pulse
    if (active && e.pulse && p.pulseCd === 0 && p.carried >= t.pulse_cost) {
      p.carried -= t.pulse_cost;
      p.pulseCd = this.pulseCdTicks;
      const cy = p.y + K.pulse_center_dy;
      const hit: string[] = [];
      for (const s of this.shades) {
        if (Math.hypot(s.x - p.x, s.y - cy, s.z - p.z) > t.pulse_radius) continue;
        hit.push(s.id);
        this.score += s.state === 'drain' ? K.drain_stun_score : t.score.per_stun;
        s.state = 'stunned';
        s.target = null;
        s.left = this.stunTicks;
        s.push = K.pulse_push_ticks;
        this.setAway(s, (dx, dz) => ((s.pdx = dx), (s.pdz = dz)));
      }
      for (const d of this.drifters) {
        if (d.state === 'removed' || Math.hypot(d.x - p.x, d.y - cy, d.z - p.z) > t.pulse_radius) continue;
        if (d.state === 'chase') {
          d.state = 'flee';
          d.left = K.drifter_flee_ticks;
        } else if (d.state === 'flee' && d.stolen > 0) {
          const amount = d.stolen;
          for (let i = 0; i < amount; i++) this.addMote([d.x, this.map.ground(d.x, d.z) ?? p.y, d.z], 'dropped');
          d.stolen = 0;
          d.left = K.drifter_drop_vanish_ticks;
          this.emit('drifter_drop', { drifter_id: d.id, amount });
        }
      }
      this.emit('pulse', { stunned_ids: hit });
    }

    // 8. shades + drifters move
    for (const s of this.shades) this.moveShade(s);
    for (const d of this.drifters) this.moveDrifter(d);

    // 9. contacts
    if (active) {
      for (const d of [...this.drifters].sort(byId)) {
        if (d.state !== 'chase' || p.carried <= 0 || distXZ(p.x, p.z, d.x, d.z) > K.drifter_touch) continue;
        const amount = Math.min(K.drifter_steal, p.carried);
        p.carried -= amount;
        d.stolen = amount;
        d.state = 'flee';
        d.left = K.drifter_flee_ticks;
        this.emit('drifter_steal', { drifter_id: d.id, amount, carried: p.carried });
      }
      if (p.invuln === 0) {
        for (const s of this.shades) {
          if (s.state !== 'chase' && s.state !== 'wander') continue;
          if (s.evict > 0) continue;
          if (distXZ(p.x, p.z, s.x, s.z) > t.shade_hit_radius || Math.abs(p.y - s.y) > K.pickup_dy) continue;
          p.flames = Math.max(0, p.flames - 1);
          const dropped = Math.floor(p.carried * t.hit_drop_ratio);
          p.carried -= dropped;
          this.dropAround(dropped);
          p.invuln = this.invulnTicks;
          s.state = 'recoil';
          s.left = K.shade_recoil_ticks;
          this.setAway(s, (dx, dz) => ((s.pdx = dx), (s.pdz = dz)));
          this.emit('player_hit', { by: 'shade', flames: p.flames, dropped });
          break; // at most one flame per tick
        }
      }
    }

    // 10. spawns (new entities interact from the next tick)
    this.spawns();

    // 11. win / lose (after every update of the tick): no flames always loses first; dawn decides by lit count
    if (p.flames <= 0) this.end('lost', 'no_flames');
    else if (this.timeLeft <= EPS) {
      if (this.litCount >= this.winNeed) {
        for (const l of this.lanterns) if (l.lit) this.score += 50 + Math.floor(l.fuel / K.fuel_units + EPS);
        this.score += p.flames * t.score.per_flame_left;
        this.end('won', 'dawn_survived');
      } else this.end('lost', 'dawn');
    }
    return this.events;
  }

  snapshot() {
    const p = this.player;
    const v = (x: number, y: number, z: number) => [r3(x), r3(y), r3(z)];
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: r3(Math.max(0, this.timeLeft)),
      score: this.score,
      wind: { active: this.wind.active, dir_deg: this.wind.active ? r3(this.wind.deg) : null },
      player: {
        pos: v(p.x, p.y, p.z),
        vel: v(p.vx, p.vy, p.vz),
        grounded: p.grounded,
        flames: p.flames,
        carried: p.carried,
        capacity: this.capacity,
        invuln: p.invuln > 0,
        dash_cd_s: r3(p.dashCd / K.tick_rate),
        pulse_cd_s: r3(p.pulseCd / K.tick_rate),
        charm_s: r3(p.charm / K.tick_rate),
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: v(l.x, l.y, l.z),
        lit: l.lit,
        deposited: l.deposited,
        fuel: l.lit ? r1(l.fuel / K.fuel_units) : 0,
        ever_lit: l.everLit,
        relit_count: l.relit,
      })),
      shades: this.shades.map((s) => ({ id: s.id, pos: v(s.x, s.y, s.z), state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((mo) => ({ id: mo.id, pos: v(mo.x, mo.y, mo.z), kind: mo.kind, ttl_s: mo.ttl === null ? null : r3(mo.ttl / K.tick_rate) })),
      drifters: this.drifters.map((d) => ({ id: d.id, pos: v(d.x, d.y, d.z), state: d.state, stolen: d.stolen })),
      charms: this.charms.map((c) => ({ id: c.id, pos: v(c.x, c.y, c.z), available: c.available, respawn_s: c.available ? 0 : r3(c.respawn / K.tick_rate) })),
    };
  }

  // ---------------- player ----------------
  private movePlayer(input: InputState, jumpEdge: boolean, dashEdge: boolean) {
    const p = this.player;
    const g = this.map.ground.bind(this.map);
    if (p.fallWait > 0) {
      p.vx = p.vy = p.vz = 0;
      if (--p.fallWait === 0) {
        [p.x, p.y, p.z] = this.map.start;
        p.grounded = true;
        p.launch = null;
        p.dashLeft = 0;
        p.invuln = this.invulnTicks;
      }
      return;
    }
    const th = (input.cam_yaw_deg * Math.PI) / 180;
    const [mx, mz] = input.move;
    let wx = mx * Math.cos(th) + mz * Math.sin(th);
    let wz = -mx * Math.sin(th) + mz * Math.cos(th);
    const len = Math.hypot(wx, wz);
    if (len > 1) (wx /= len), (wz /= len);
    if (len > 1e-9) (p.fx = wx / len), (p.fz = wz / len);

    if (dashEdge && p.dashLeft === 0 && (p.dashCd === 0 || p.charm > 0)) {
      p.dashLeft = this.dashTicks;
      p.dashDx = len > 1e-9 ? wx / len : p.fx;
      p.dashDz = len > 1e-9 ? wz / len : p.fz;
      p.dashCd = p.charm > 0 ? 0 : this.dashCdTicks;
      this.emit('dash', {});
    }

    let hx: number;
    let hz: number;
    const dashing = p.dashLeft > 0;
    if (dashing) {
      hx = p.dashDx * this.t.dash_speed;
      hz = p.dashDz * this.t.dash_speed;
      p.vy = 0;
    } else if (p.launch) {
      hx = p.launch.vx;
      hz = p.launch.vz;
    } else {
      const sp = p.charm > 0 ? K.charm_speed : this.t.player_speed;
      hx = wx * sp;
      hz = wz * sp;
    }
    if (this.wind.active) {
      hx += this.wind.dx * K.wind_speed;
      hz += this.wind.dz * K.wind_speed;
    }
    if (jumpEdge && p.grounded && !dashing) {
      p.vy = K.jump_velocity;
      p.grounded = false;
    }
    // horizontal, axis-separated, walls = ground higher than feet + step
    const nx = p.x + hx * DT;
    const gx = g(nx, p.z);
    if (gx === null || gx <= p.y + K.step_up) p.x = nx;
    const nz = p.z + hz * DT;
    const gz = g(p.x, nz);
    if (gz === null || gz <= p.y + K.step_up) p.z = nz;

    const here = g(p.x, p.z);
    if (dashing) {
      if (here !== null && Math.abs(here - p.y) <= K.step_up) {
        p.y = here;
        p.grounded = true;
        p.launch = null;
      } else p.grounded = false;
      p.dashLeft--;
    } else {
      if (p.grounded) {
        if (here !== null && here >= p.y - K.step_up) p.y = here;
        else (p.grounded = false), (p.vy = 0);
      }
      if (!p.grounded) {
        p.vy -= K.gravity * DT;
        p.y += p.vy * DT;
        const gg = g(p.x, p.z);
        if (gg !== null && p.y <= gg && p.vy <= 0) {
          p.y = gg;
          p.vy = 0;
          p.grounded = true;
          p.launch = null;
        }
      }
    }
    p.vx = hx;
    p.vz = hz;
    if (p.grounded) p.vy = 0;

    // jump pads (launch velocity used from the next tick)
    if (p.grounded && p.dashLeft === 0) {
      for (const pad of this.map.pads) {
        if (distXZ(p.x, p.z, pad.x, pad.z) <= pad.r && Math.abs(p.y - pad.y) <= K.step_up) {
          p.launch = { vx: pad.dx * pad.vh, vz: pad.dz * pad.vh };
          p.vy = pad.vy;
          p.grounded = false;
        }
      }
    }

    // fall off the island
    if (p.y < K.fall_y) {
      p.flames = Math.max(0, p.flames - 1);
      const lost = p.carried;
      p.carried = 0;
      p.fallWait = K.respawn_wait;
      p.vx = p.vy = p.vz = 0;
      p.launch = null;
      p.dashLeft = 0;
      this.emit('player_hit', { by: 'fall', flames: p.flames, dropped: 0, lost });
    }
  }

  private dropAround(n: number) {
    if (n <= 0) return;
    const p = this.player;
    const base = this.rng() * 2 * Math.PI;
    for (let i = 0; i < n; i++) {
      const a = base + (i * 2 * Math.PI) / n;
      const r = K.drop_r_min + this.rng() * (K.drop_r_max - K.drop_r_min);
      const x = p.x + r * Math.cos(a);
      const z = p.z + r * Math.sin(a);
      this.addMote([x, this.map.ground(x, z) ?? p.y, z], 'dropped');
    }
  }

  // ---------------- shades ----------------
  private makeShade(id: string, x: number, z: number, yGiven = 0): Shade {
    const g = this.map.ground(x, z);
    return { id, x, y: g === null ? yGiven : g + K.shade_y, z, state: 'spawning', left: 0, push: 0, pdx: 1, pdz: 0, evict: 0, ex: 0, ez: 0, wdx: 1, wdz: 0, wLeft: 0, target: null, drainT: 0 };
  }

  private nearestLantern(s: Shade, ok: (l: Lantern) => boolean): Lantern | undefined {
    let best: Lantern | undefined;
    let bestD = Infinity;
    for (const l of [...this.lanterns].sort(byId)) {
      if (!ok(l)) continue;
      const d = distXZ(s.x, s.z, l.x, l.z);
      if (d < bestD) (best = l), (bestD = d);
    }
    return best;
  }

  private awakeState(s: Shade): ShadeState {
    return distXZ(s.x, s.z, this.player.x, this.player.z) <= K.shade_lose ? 'chase' : 'wander';
  }

  private setAway(o: { x: number; z: number }, set: (dx: number, dz: number) => void) {
    const dx = o.x - this.player.x;
    const dz = o.z - this.player.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-9) set(dx / d, dz / d);
    else set(1, 0);
  }

  /** Try to move a shade; returns false if blocked by void, wall or a lit safe zone. */
  private shadeTry(s: Shade, dx: number, dz: number, respectSafe = true): boolean {
    const nx = s.x + dx;
    const nz = s.z + dz;
    const g = this.map.ground(nx, nz);
    if (g === null || g > s.y - K.shade_y + K.step_up) return false;
    if (respectSafe) {
      for (const l of this.lanterns) {
        if (this.safeActive(l) && distXZ(nx, nz, l.x, l.z) < this.t.safe_radius - EPS) return false;
      }
    }
    s.x = nx;
    s.z = nz;
    s.y = g + K.shade_y;
    return true;
  }

  private moveShade(s: Shade) {
    const p = this.player;
    const sp = this.map.shadeSpeed * DT;
    if (s.evict > 0) {
      const d = distXZ(s.x, s.z, s.ex, s.ez);
      const need = Math.max(0, this.t.safe_radius - d);
      const ux = d > 1e-9 ? (s.x - s.ex) / d : 1;
      const uz = d > 1e-9 ? (s.z - s.ez) / d : 0;
      const stepLen = need / s.evict;
      s.x += ux * stepLen;
      s.z += uz * stepLen;
      const g = this.map.ground(s.x, s.z);
      if (g !== null) s.y = g + K.shade_y;
      s.evict--;
      if (s.evict === 0) {
        s.x = s.ex + ux * this.t.safe_radius;
        s.z = s.ez + uz * this.t.safe_radius;
      }
      return;
    }
    const dist = distXZ(s.x, s.z, p.x, p.z);
    switch (s.state) {
      case 'spawning':
        if (--s.left <= 0) s.state = dist <= K.shade_detect ? 'chase' : 'wander';
        return;
      case 'stunned':
        if (s.push > 0) {
          const step = this.t.pulse_push_m / K.pulse_push_ticks;
          if (this.shadeTry(s, s.pdx * step, s.pdz * step)) s.push--;
          else s.push = 0;
        }
        return;
      case 'recoil': {
        const step = K.shade_recoil_m / K.shade_recoil_ticks;
        this.shadeTry(s, s.pdx * step, s.pdz * step);
        if (--s.left <= 0) s.state = this.awakeState(s);
        return;
      }
      case 'drain': {
        const l = this.lanterns.find((x) => x.id === s.target);
        if (dist <= K.drain_chase_dist) s.state = 'chase';
        else if (!l || !l.lit || l.fuel >= this.t.low_fuel_threshold * K.fuel_units || distXZ(s.x, s.z, l.x, l.z) > K.drain_range) s.state = 'wander';
        else return; // stands still and drains (fuel handled in step 2)
        s.drainT = 0;
        if (s.state === 'wander') s.target = null;
        break;
      }
      case 'wander':
        if (dist <= K.shade_detect) s.state = 'chase';
        break;
      case 'chase':
        if (dist > K.shade_lose) s.state = 'wander';
        break;
    }
    if (s.state === 'wander') {
      // Ticket-03: head for the nearest weak lantern (lit, fuel < 30); else toward the nearest unlit one (C1)
      const weak = this.nearestLantern(s, (l) => l.lit && l.fuel < this.t.low_fuel_threshold * K.fuel_units);
      const pinned = s.target ? this.lanterns.find((l) => l.id === s.target && l.lit && l.fuel < this.t.low_fuel_threshold * K.fuel_units) : undefined;
      const goal = pinned ?? weak;
      if (goal) {
        s.target = goal.id;
        const d = distXZ(s.x, s.z, goal.x, goal.z);
        if (d <= K.drain_range) {
          s.state = 'drain';
          s.drainT = 0;
          return;
        }
        const st = Math.min(K.shade_wander_speed * DT, d);
        const ux = (goal.x - s.x) / d;
        const uz = (goal.z - s.z) / d;
        if (!this.shadeTry(s, ux * st, uz * st)) if (!this.shadeTry(s, ux * st, 0)) this.shadeTry(s, 0, uz * st);
        return;
      }
      s.target = null;
      const unlit = this.nearestLantern(s, (l) => !l.lit);
      if (unlit && distXZ(s.x, s.z, unlit.x, unlit.z) > K.unlit_home_r) {
        const d = distXZ(s.x, s.z, unlit.x, unlit.z);
        const st = K.shade_wander_speed * DT;
        const ux = (unlit.x - s.x) / d;
        const uz = (unlit.z - s.z) / d;
        if (!this.shadeTry(s, ux * st, uz * st)) if (!this.shadeTry(s, ux * st, 0)) this.shadeTry(s, 0, uz * st);
        return;
      }
    }
    if (s.state === 'chase') {
      if (dist > 1e-9) {
        const st = Math.min(sp, dist);
        const ux = (p.x - s.x) / dist;
        const uz = (p.z - s.z) / dist;
        if (!this.shadeTry(s, ux * st, uz * st)) {
          if (!this.shadeTry(s, ux * st, 0)) this.shadeTry(s, 0, uz * st);
        }
      }
    } else {
      if (s.wLeft <= 0) {
        const a = this.rng() * 2 * Math.PI;
        s.wdx = Math.cos(a);
        s.wdz = Math.sin(a);
        s.wLeft = K.wander_turn_ticks;
      }
      s.wLeft--;
      const st = K.shade_wander_speed * DT;
      if (!this.shadeTry(s, s.wdx * st, s.wdz * st)) s.wLeft = 0;
    }
  }

  // ---------------- drifters ----------------
  private makeDrifter(id: string, x: number, z: number): Drifter {
    return { id, x, y: (this.map.ground(x, z) ?? 0) + K.drifter_y, z, state: 'idle', stolen: 0, left: 0, wdx: 1, wdz: 0, wLeft: 0 };
  }

  private moveDrifter(d: Drifter) {
    if (d.state === 'removed') return;
    const p = this.player;
    const dist = distXZ(d.x, d.z, p.x, p.z);
    let vx = 0;
    let vz = 0;
    if (d.state === 'flee') {
      const ux = dist > 1e-9 ? (d.x - p.x) / dist : 1;
      const uz = dist > 1e-9 ? (d.z - p.z) / dist : 0;
      vx = ux * K.drifter_speed;
      vz = uz * K.drifter_speed;
      if (--d.left <= 0) d.state = 'removed';
    } else {
      const want = p.fallWait === 0 && p.carried >= K.drifter_chase_carried && dist <= K.drifter_chase_dist;
      d.state = want ? 'chase' : 'idle';
      if (d.state === 'chase') {
        if (dist > 1e-9) {
          const st = Math.min(K.drifter_speed, dist * K.tick_rate);
          vx = ((p.x - d.x) / dist) * st;
          vz = ((p.z - d.z) / dist) * st;
        }
      } else {
        if (d.wLeft <= 0 || this.map.ground(d.x + d.wdx, d.z + d.wdz) === null) {
          const off = this.map.ground(d.x, d.z) === null || this.map.ground(d.x + d.wdx * 2, d.z + d.wdz * 2) === null;
          if (off) {
            let best = this.map.centers[0];
            for (const c of this.map.centers) if (distXZ(d.x, d.z, c[0], c[1]) < distXZ(d.x, d.z, best[0], best[1])) best = c;
            const dd = distXZ(d.x, d.z, best[0], best[1]) || 1;
            d.wdx = (best[0] - d.x) / dd;
            d.wdz = (best[1] - d.z) / dd;
          } else {
            const a = this.rng() * 2 * Math.PI;
            d.wdx = Math.cos(a);
            d.wdz = Math.sin(a);
          }
          d.wLeft = K.wander_turn_ticks;
        }
        d.wLeft--;
        vx = d.wdx * K.drifter_idle_speed;
        vz = d.wdz * K.drifter_idle_speed;
      }
    }
    d.x += vx * DT;
    d.z += vz * DT;
    d.y = (this.map.ground(d.x, d.z) ?? 0) + K.drifter_y;
  }

  // ---------------- schedule ----------------
  private updateWind() {
    const w = this.wind;
    if (!this.windEnabled) return;
    const st = this.simTick;
    if (st % K.wind_every === K.wind_every - K.wind_warn_ticks) {
      this.nextWindDeg = this.rng() * 360; // decided at warning start (2 s before)
    }
    w.warn = this.nextWindDeg !== null && !w.active;
    if (st > 0 && st % K.wind_every === 0) {
      w.deg = this.nextWindDeg ?? this.rng() * 360;
      this.nextWindDeg = null;
      w.dx = Math.cos((w.deg * Math.PI) / 180);
      w.dz = Math.sin((w.deg * Math.PI) / 180);
      w.active = true;
      w.left = K.wind_ticks;
      w.warn = false;
    }
    if (w.active && w.left-- <= 0) w.active = false;
  }

  private spawns() {
    const st = this.simTick;
    const m = this.map;
    if (this.randomMotes && st % K.mote_spawn_every === 0 && this.motes.length < K.mote_cap) {
      const free = m.motePoints.filter((pt) => this.motes.every((mo) => distXZ(mo.x, mo.z, pt[0], pt[2]) > K.mote_free_r));
      if (free.length) this.addMote(free[Math.floor(this.rng() * free.length)], 'random');
    }
    if (this.randomShades && st >= K.shade_first_spawn_tick && (st - K.shade_first_spawn_tick) % m.shadeInterval === 0) {
      const n = st === K.shade_first_spawn_tick ? 2 : 1;
      for (let i = 0; i < n && this.shades.length < m.shadeMax; i++) {
        const p = this.player;
        const ok = m.shadePoints.filter(
          (pt) =>
            distXZ(pt[0], pt[2], p.x, p.z) >= K.shade_spawn_min_dist &&
            this.lanterns.every((l) => !this.safeActive(l) || distXZ(pt[0], pt[2], l.x, l.z) >= this.t.safe_radius) &&
            this.shades.every((s) => distXZ(s.x, s.z, pt[0], pt[2]) > 0.5),
        );
        if (!ok.length) break;
        const pt = ok[Math.floor(this.rng() * ok.length)];
        const s = this.makeShade(this.newShadeId(), pt[0], pt[2]);
        s.left = K.shade_spawning_ticks;
        this.shades.push(s);
        this.emit('shade_spawned', { id: s.id });
      }
      this.shades.sort(byId);
    }
    if (this.randomDrifters && st % K.drifter_spawn_every === 0 && st > 0) {
      const alive = this.drifters.filter((d) => d.state !== 'removed').length;
      if (alive < K.drifter_max && m.shadePoints.length) {
        const pt = m.shadePoints[Math.floor(this.rng() * m.shadePoints.length)];
        let id: string;
        const used = new Set(this.drifters.map((d) => d.id));
        do id = `D${this.nextDrifter++}`;
        while (used.has(id));
        this.drifters.push(this.makeDrifter(id, pt[0], pt[2]));
      }
    }
  }

  // ---------------- helpers ----------------
  private end(result: 'won' | 'lost', reason: string) {
    this.state = result;
    this.emit('game_over', { result, reason });
  }

  private emit(name: string, data: Record<string, unknown>) {
    this.events.push({ type: 'event', tick: this.tick, name, data });
  }

  private addMote(pos: readonly number[], kind: MoteKind) {
    this.motes.push({ id: this.newMoteId(), x: pos[0], y: pos[1], z: pos[2], kind, ttl: kind === 'dropped' ? K.drop_ttl : null });
  }

  private newMoteId(): string {
    return `M${this.nextMote++}`;
  }

  private newShadeId(reserved: Set<string> = new Set()): string {
    const used = new Set([...this.shades.map((s) => s.id), ...reserved]);
    let id: string;
    do id = `S${this.nextShade++}`;
    while (used.has(id));
    return id;
  }
}
