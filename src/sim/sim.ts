// Pure, deterministic game logic for Dao Den Long. No DOM, no clock, no Math.random.
// Order of one step (documented in docs/notes/phase-1.md):
//   1 input edges  2 player move/jump  3 pickup  4 interact/deposit (may win)
//   5 shades (stun countdown, chase, keep out of lit lanterns)  6 pulse
//   7 shade hits (may lose)  8 spawning  9 clock (dawn -> lose)
import { TUNING, WORLD, DEFAULT_LANTERNS, type Tuning } from './tuning';
import { mulberry32, type Rng } from './rng';
import type { GameEvent, GameState, InputState, Lantern, Mote, Player, Scenario, Shade } from './types';

export const DT = 1 / WORLD.tick_rate;

export function r3(v: number): number {
  const o = Math.round(v * 1000) / 1000;
  return o === 0 ? 0 : o; // no "-0" in output
}

const secToTicks = (s: number) => Math.round(s * WORLD.tick_rate);

export interface SimOptions {
  seed: number; // uint32
  scenario?: Scenario;
  tuning?: Tuning;
}

export class Sim {
  readonly t: Tuning;
  tick = 0;
  state: GameState = 'playing';
  score = 0;
  readonly initialTimeLeft: number;
  player: Player;
  lanterns: Lantern[];
  motes: Mote[] = [];
  shades: Shade[] = [];

  private rng: Rng;
  private randomMotes: boolean;
  private randomShades: boolean;
  private nextMote = 1;
  private nextShade = 1;
  private moteTimer = 0;
  private shadeTimer = 0;
  private prev = { jump: false, interact: false, pulse: false };
  private events: GameEvent[] = [];
  private readonly stunTicks: number;
  private readonly invulnTicks: number;
  private readonly cooldownTicks: number;

  constructor(opts: SimOptions) {
    this.t = opts.tuning ?? TUNING;
    const sc = opts.scenario ?? {};
    this.rng = mulberry32(opts.seed);
    this.stunTicks = secToTicks(this.t.pulse_stun_s);
    this.invulnTicks = secToTicks(this.t.invuln_s);
    this.cooldownTicks = secToTicks(this.t.pulse_cooldown_s);
    this.randomMotes = sc.random_motes ?? true;
    this.randomShades = sc.random_shades ?? true;
    this.initialTimeLeft = sc.time_left_s ?? this.t.night1_duration_s;

    // Player
    const pp = sc.player?.pos ?? [0, 0, 0];
    this.player = {
      x: pp[0],
      y: Math.max(0, pp[1]),
      z: pp[2],
      vy: 0,
      onGround: pp[1] <= 0,
      flames: sc.player?.flames ?? this.t.flames,
      carried: sc.player?.carried ?? 0,
      invuln: 0,
      cooldown: 0,
    };

    // Lanterns: defaults, then updated by id
    this.lanterns = DEFAULT_LANTERNS.slice(0, this.t.lantern_count_night1).map((l) => ({
      id: l.id,
      x: l.x,
      z: l.z,
      lit: false,
      deposited: 0,
    }));
    for (const u of sc.lanterns ?? []) {
      const l = this.lanterns.find((x) => x.id === u.id);
      if (!l) continue;
      if (u.pos) {
        l.x = u.pos[0];
        l.z = u.pos[2];
      }
      if (u.deposited !== undefined) l.deposited = Math.min(u.deposited, this.t.lantern_cost);
      if (u.lit === true) {
        l.lit = true;
        if (u.deposited === undefined) l.deposited = this.t.lantern_cost;
      } else if (u.lit === false) {
        l.lit = false;
      }
      if (l.deposited >= this.t.lantern_cost) l.lit = true;
    }

    // Motes: scenario list replaces defaults
    if (sc.motes) {
      for (const m of sc.motes) this.motes.push({ id: m.id ?? this.newMoteId(), x: m.pos[0], z: m.pos[2] });
    } else if (this.randomMotes) {
      for (let i = 0; i < WORLD.mote_target; i++) this.spawnMote();
    }

    // Shades: scenario list replaces defaults
    if (sc.shades) {
      const reserved = new Set(sc.shades.map((s) => s.id).filter(Boolean));
      for (const s of sc.shades) {
        const id = s.id ?? this.newShadeId(reserved);
        this.shades.push({ id, x: s.pos[0], y: WORLD.shade_y, z: s.pos[2], state: 'chase', stun: 0 });
      }
    } else if (this.randomShades) {
      for (let i = 0; i < WORLD.shades_initial; i++) this.spawnShade(false);
    }
    // setup emits no events, awards no score
    this.events = [];
  }

  get timeLeft(): number {
    return this.initialTimeLeft - this.tick / WORLD.tick_rate;
  }

  get litCount(): number {
    return this.lanterns.filter((l) => l.lit).length;
  }

  /** Advance one tick. Returns the events produced by this step (stamped tick = k+1). */
  step(input: InputState): GameEvent[] {
    if (this.state !== 'playing') return [];
    this.events = [];
    this.tick += 1;
    const t = this.t;
    const p = this.player;

    // 1. edges
    const jumpEdge = input.jump && !this.prev.jump;
    const interactEdge = input.interact && !this.prev.interact;
    const pulseEdge = input.pulse && !this.prev.pulse;
    this.prev = { jump: input.jump, interact: input.interact, pulse: input.pulse };

    // 2. movement (camera-relative), jump
    const th = (input.cam_yaw_deg * Math.PI) / 180;
    const [mx, mz] = input.move;
    let wx = mx * Math.cos(th) + mz * Math.sin(th);
    let wz = -mx * Math.sin(th) + mz * Math.cos(th);
    const len = Math.hypot(wx, wz);
    if (len > 1) {
      wx /= len;
      wz /= len;
    }
    p.x += wx * t.player_speed * DT;
    p.z += wz * t.player_speed * DT;
    this.clampToIsland(p);
    if (jumpEdge && p.onGround) {
      p.vy = WORLD.jump_velocity;
      p.onGround = false;
    }
    if (!p.onGround) {
      p.vy -= WORLD.gravity * DT;
      p.y += p.vy * DT;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.onGround = true;
      }
    }

    // 3. pickup (automatic)
    for (let i = 0; i < this.motes.length && p.carried < t.carry_capacity; ) {
      const m = this.motes[i];
      if (dist(p.x, p.z, m.x, m.z) <= t.pickup_radius) {
        this.motes.splice(i, 1);
        p.carried += 1;
        this.score += t.score.per_mote;
        this.emit('mote_picked', { carried: p.carried });
      } else i++;
    }

    // 4. interact -> deposit into nearest unlit lantern in range
    if (interactEdge && p.carried > 0) {
      let best: Lantern | undefined;
      let bestD = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = dist(p.x, p.z, l.x, l.z);
        if (d <= t.interact_radius && d < bestD) {
          best = l;
          bestD = d;
        }
      }
      if (best) {
        const amount = Math.min(p.carried, t.lantern_cost - best.deposited);
        if (amount > 0) {
          best.deposited += amount;
          p.carried -= amount;
          this.emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
          if (best.deposited >= t.lantern_cost) {
            best.lit = true;
            this.score += t.score.per_lantern;
            this.emit('lantern_lit', { lantern_id: best.id });
            if (this.lanterns.every((l) => l.lit)) {
              this.score += Math.floor(Math.max(0, this.timeLeft)) * t.score.per_second_left;
              this.score += p.flames * t.score.per_flame_left;
              return this.end('won', 'all_lit');
            }
          }
        }
      }
    }

    // 5. shades
    for (const s of this.shades) {
      if (s.stun > 0) {
        s.stun -= 1;
        if (s.stun === 0) s.state = 'chase';
      } else {
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-9) {
          const stepLen = Math.min(t.shade_speed * DT, d);
          s.x += (dx / d) * stepLen;
          s.z += (dz / d) * stepLen;
        }
      }
      this.clampToIsland(s);
      this.keepOutOfLight(s);
    }

    // 6. pulse
    if (p.cooldown > 0) p.cooldown -= 1;
    if (pulseEdge && p.cooldown === 0 && p.carried >= t.pulse_cost) {
      p.carried -= t.pulse_cost;
      p.cooldown = this.cooldownTicks;
      const ids: string[] = [];
      for (const s of this.shades) {
        const dx = s.x - p.x;
        const dz = s.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > t.pulse_radius) continue;
        ids.push(s.id);
        s.state = 'stunned';
        s.stun = this.stunTicks;
        const ux = d > 1e-9 ? dx / d : 1;
        const uz = d > 1e-9 ? dz / d : 0;
        s.x += ux * t.pulse_push_m;
        s.z += uz * t.pulse_push_m;
        this.clampToIsland(s);
        this.keepOutOfLight(s);
      }
      this.score += ids.length * t.score.per_stun;
      this.emit('pulse', { stunned_ids: ids });
    }

    // 7. shade hits
    if (p.invuln > 0) p.invuln -= 1;
    if (p.invuln === 0) {
      const hitter = this.shades.find((s) => s.state !== 'stunned' && dist(p.x, p.z, s.x, s.z) <= t.shade_hit_radius);
      if (hitter) {
        p.flames = Math.max(0, p.flames - 1);
        const dropped = Math.floor(p.carried * t.hit_drop_ratio);
        p.carried -= dropped;
        p.invuln = this.invulnTicks;
        this.emit('player_hit', { by: 'shade', flames: p.flames, dropped });
        if (p.flames <= 0) return this.end('lost', 'no_flames');
      }
    }

    // 8. spawning
    if (this.randomMotes && this.motes.length < WORLD.mote_target) {
      this.moteTimer += 1;
      if (this.moteTimer >= secToTicks(WORLD.mote_respawn_s)) {
        this.moteTimer = 0;
        this.spawnMote();
      }
    } else this.moteTimer = 0;
    if (this.randomShades && this.shades.length < WORLD.shades_max) {
      this.shadeTimer += 1;
      if (this.shadeTimer >= secToTicks(WORLD.shade_spawn_interval_s)) {
        this.shadeTimer = 0;
        this.spawnShade(true);
      }
    }

    // 9. clock
    if (this.timeLeft <= 1e-9) {
      return this.end('lost', 'dawn');
    }
    return this.events;
  }

  snapshot() {
    const p = this.player;
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.tick,
      state: this.state,
      time_left_s: r3(Math.max(0, this.timeLeft)),
      score: this.score,
      player: { pos: [r3(p.x), r3(p.y), r3(p.z)], flames: p.flames, carried: p.carried },
      lanterns: this.lanterns.map((l) => ({ id: l.id, pos: [r3(l.x), 0, r3(l.z)], lit: l.lit, deposited: l.deposited })),
      shades: this.shades.map((s) => ({ id: s.id, pos: [r3(s.x), r3(s.y), r3(s.z)], state: s.state })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({ id: m.id, pos: [r3(m.x), 0, r3(m.z)] })),
    };
  }

  // ---------- helpers ----------
  private end(result: 'won' | 'lost', reason: string): GameEvent[] {
    this.state = result;
    this.emit('game_over', { result, reason });
    return this.events;
  }

  private emit(name: string, data: Record<string, unknown>) {
    this.events.push({ type: 'event', tick: this.tick, name, data });
  }

  private clampToIsland(o: { x: number; z: number }) {
    const d = Math.hypot(o.x, o.z);
    if (d > WORLD.island_radius) {
      o.x = (o.x / d) * WORLD.island_radius;
      o.z = (o.z / d) * WORLD.island_radius;
    }
  }

  private keepOutOfLight(s: Shade) {
    const minD = this.t.safe_radius + WORLD.safe_eps;
    for (let pass = 0; pass < 2; pass++) {
      for (const l of this.lanterns) {
        if (!l.lit) continue;
        const dx = s.x - l.x;
        const dz = s.z - l.z;
        const d = Math.hypot(dx, dz);
        if (d < minD) {
          const ux = d > 1e-9 ? dx / d : 1;
          const uz = d > 1e-9 ? dz / d : 0;
          s.x = l.x + ux * minD;
          s.z = l.z + uz * minD;
        }
      }
    }
  }

  private newMoteId(): string {
    return `M${this.nextMote++}`;
  }

  private newShadeId(reserved: Set<string | undefined> = new Set()): string {
    const used = new Set([...this.shades.map((s) => s.id), ...reserved]);
    let id: string;
    do id = `S${this.nextShade++}`;
    while (used.has(id));
    return id;
  }

  private spawnMote() {
    const r = Math.sqrt(this.rng() * (WORLD.mote_max_r ** 2 - WORLD.mote_min_r ** 2) + WORLD.mote_min_r ** 2);
    const a = this.rng() * 2 * Math.PI;
    this.motes.push({ id: this.newMoteId(), x: r3(r * Math.sin(a)), z: r3(r * Math.cos(a)) });
  }

  private spawnShade(emitEvent: boolean) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 8; tries++) {
      const a = this.rng() * 2 * Math.PI;
      x = r3(WORLD.shade_spawn_r * Math.sin(a));
      z = r3(WORLD.shade_spawn_r * Math.cos(a));
      if (dist(x, z, this.player.x, this.player.z) >= WORLD.shade_spawn_min_dist_to_player) break;
    }
    const s: Shade = { id: this.newShadeId(), x, y: WORLD.shade_y, z, state: 'chase', stun: 0 };
    this.keepOutOfLight(s);
    this.shades.push(s);
    if (emitEvent) this.emit('shade_spawned', { id: s.id });
  }
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
