// Unit tests for contract v1.1 rules not already covered by headless scenario specs.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Sim } from '../src/sim/sim';
import { TUNING, K } from '../src/sim/tuning';
import { NIGHTS } from '../src/sim/maps';
import { runHeadless } from '../src/sim/headless';
import { defaultInput, type GameEvent, type InputState, type Scenario } from '../src/sim/types';

const T = TUNING;
const empty: Scenario = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [] };
const sc = (extra: Scenario): Scenario => ({ ...empty, ...extra });
const inp = (o: Partial<InputState> = {}): InputState => ({ ...defaultInput(), ...o });
function run(sim: Sim, n: number, input: InputState = inp()): GameEvent[] {
  const evs: GameEvent[] = [];
  for (let i = 0; i < n; i++) evs.push(...sim.step(input));
  return evs;
}
const names = (evs: GameEvent[]) => evs.map((e) => e.name);
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('contract v1.3', () => {
  it('game.contract.json tuning equals the standard numbers the game uses', () => {
    const c = JSON.parse(readFileSync('game.contract.json', 'utf8'));
    expect(c.contract_version).toBe('1.3'); // Ticket-04 (changed from 1.2: adds bench_cmd, soak_cmd)
    expect(c.bench_cmd).toBe('node scripts/bench.mjs');
    expect(c.soak_cmd).toBe('node dist/headless.cjs --soak');
    expect(c.tuning).toEqual(TUNING);
  });
  it('standard numbers from Ticket-02', () => {
    expect([T.player_speed, T.carry_capacity, T.lantern_cost, T.pickup_radius, T.interact_radius]).toEqual([6, 10, 10, 1, 2]);
    expect([T.pulse_cost, T.pulse_radius, T.pulse_cooldown_s, T.pulse_stun_s * 60, T.pulse_push_m]).toEqual([3, 5, 3, 120, 4]);
    expect([T.dash_speed, T.dash_duration_s, T.dash_cooldown_s]).toEqual([14, 0.2, 1.5]);
    // Ticket-03 [THAY THẾ]: nights 240/270/300 s, new score, fuel numbers
    expect([T.night1_duration_s, T.night2_duration_s, T.night3_duration_s]).toEqual([240, 270, 300]);
    expect(T.score).toEqual({ per_mote: 5, per_lantern: 100, per_stun: 5, per_second_left: 0, per_flame_left: 50 });
    expect([T.fuel_max, T.fuel_decay_per_s, T.fuel_per_mote, T.relight_cost, T.win_ratio, T.drain_per_s, T.low_fuel_threshold, T.capacity_max]).toEqual([100, 1, 10, 5, 0.6, 5, 30, 20]);
  });
  it('standard maps: lantern counts, spawn point counts, start positions', () => {
    expect(NIGHTS[1].lanterns.length).toBe(5);
    expect(NIGHTS[2].lanterns.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
    expect(NIGHTS[3].lanterns.length).toBe(7);
    expect([NIGHTS[1].motePoints.length, NIGHTS[2].motePoints.length, NIGHTS[3].motePoints.length]).toEqual([24, 24, 30]);
    expect([NIGHTS[1].shadePoints.length, NIGHTS[2].shadePoints.length, NIGHTS[3].shadePoints.length]).toEqual([12, 16, 16]);
    for (const n of [1, 2, 3]) {
      const m = NIGHTS[n];
      expect(m.ground(m.start[0], m.start[2])).toBe(m.start[1]);
      for (const p of m.motePoints) expect(m.ground(p[0], p[2])).toBeCloseTo(p[1], 6); // every mote point is on its tier
      for (const l of m.lanterns) expect(m.ground(l.pos[0], l.pos[2])).toBe(l.pos[1]);
    }
  });
  it('night 3 geometry: tower unclimbable, tier 1 only on z > 0, ramp mid-height 1.5', () => {
    const g = NIGHTS[3].ground;
    expect(g(0, 0)).toBe(14);
    expect(g(0, 5)).toBe(6);
    expect(g(0, 18)).toBe(3);
    expect(g(0, -18)).toBe(0);
    expect(g(27 * Math.cos(Math.PI / 6), 27 * Math.sin(Math.PI / 6))).toBeCloseTo(1.5, 6);
    expect(g(46, 0)).toBeNull();
  });
});

describe('movement and dash', () => {
  it('cannot jump up a 3 m tier wall; walks up the ramp instead', () => {
    const s = new Sim({ seed: 1, night: 3, scenario: sc({ player: { pos: [0, 0, 10] } }) }); // tier 0 gap r 8..12 under tier 1
    run(s, 60, inp({ move: [0, 1], jump: true }));
    expect(s.player.z).toBeLessThan(12.01);
  });
  it('dash direction falls back to facing (+Z at start)', () => {
    const s = new Sim({ seed: 1, scenario: empty });
    expect(names(s.step(inp({ dash: true })))).toEqual(['dash']);
    near(s.player.z, T.dash_speed / 60);
  });
});

describe('pulse', () => {
  it('uses a 3D sphere from feet + 0.8 m: a shade 5 m away horizontally but 1 m lower is out of range', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 3 }, shades: [{ id: 'A', pos: [5, 0, 0] }] }) });
    // feet y=0 -> center y=0.8; shade center y=1 -> dist sqrt(25 + 0.04) > 5
    expect(s.step(inp({ pulse: true }))[0].data).toEqual({ stunned_ids: [] });
  });
  it('re-pulse refreshes stun and push, and scores +5 again on an already stunned shade', () => {
    // already stunned with 30 ticks left; a pulse resets it to 120 and pushes 4 m again
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 3 }, shades: [{ id: 'A', pos: [2, 0, 0], state: 'stunned', state_ticks_left: 30 }] }) });
    expect(s.step(inp({ pulse: true }))[0].data).toEqual({ stunned_ids: ['A'] });
    expect(s.score).toBe(T.score.per_stun);
    run(s, 100);
    expect(s.shades[0].state).toBe('stunned'); // would have woken at tick 30 without the refresh
    near(s.shades[0].x, 2 + T.pulse_push_m);
    run(s, 19); // tick 120
    expect(s.shades[0].state).toBe('stunned');
    run(s, 1); // tick 121 = pulse tick + 120
    expect(s.shades[0].state).not.toBe('stunned');
  });
  it('not enough light (< 3) -> no pulse', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 2 } }) });
    expect(s.step(inp({ pulse: true }))).toEqual([]);
  });
});

describe('lanterns, hits, schedule', () => {
  it('equal distance: lower lantern id wins', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 3 }, lanterns: [{ id: 'L2', pos: [1, 0, 0] }, { id: 'L1', pos: [-1, 0, 0] }] }) });
    expect(s.step(inp({ interact: true }))[0].data).toEqual({ lantern_id: 'L1', amount: 3, deposited: 3 });
  });
  it('at most one flame lost per tick, lowest shade id hits first', () => {
    const s = new Sim({ seed: 1, scenario: sc({ shades: [{ id: 'S2', pos: [0.5, 0, 0] }, { id: 'S1', pos: [-0.5, 0, 0] }] }) });
    const evs = s.step(inp());
    expect(names(evs)).toEqual(['player_hit']);
    expect(s.shades.find((x) => x.id === 'S1')!.state).toBe('recoil');
    expect(s.shades.find((x) => x.id === 'S2')!.state).toBe('chase');
  });
  it('invulnerable player: shade contact does nothing', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { invuln_ticks: 50 }, shades: [{ pos: [0.5, 0, 0] }] }) });
    expect(run(s, 40)).toEqual([]);
  });
  it('shades spawn >= 15 m from the player; max 6 on night 1', () => {
    const s = new Sim({ seed: 5, scenario: { random_motes: false, player: { flames: 10000, pos: [0, 0, 0] } } });
    const evs = run(s, 300 + 480 * 8);
    expect(evs.filter((e) => e.name === 'shade_spawned').length).toBe(6);
    expect(s.shades.length).toBe(6);
  });
  it('mote cap 30 counts all motes; spawns only on free standard points', () => {
    const pts = NIGHTS[3].motePoints;
    const s = new Sim({ seed: 2, night: 3, scenario: { random_shades: false, random_drifters: false, wind_enabled: false, player: { pos: [0, 0, -30] }, motes: pts.slice(0, 29).map((p) => ({ pos: p })) } });
    run(s, 240);
    expect(s.motes.length).toBe(30);
    const last = s.motes[29];
    expect([last.x, last.y, last.z]).toEqual(pts[29]); // only free point left
    run(s, 240);
    expect(s.motes.length).toBe(30);
  });
  it('drifters: none on night 1; on night 2 they spawn at tick 1200 with id D1, max 2', () => {
    const n1 = new Sim({ seed: 1, scenario: { random_shades: false, player: { flames: 99 } } });
    run(n1, 1300);
    expect(n1.drifters.length).toBe(0);
    const n2 = new Sim({ seed: 1, night: 2, scenario: { random_shades: false, player: { flames: 99 } } });
    run(n2, 1199);
    expect(n2.drifters.length).toBe(0);
    run(n2, 1);
    expect(n2.drifters.map((d) => d.id)).toEqual(['D1']);
    run(n2, 2400);
    expect(n2.drifters.filter((d) => d.state !== 'removed').length).toBeLessThanOrEqual(K.drifter_max);
  });
  it('flames reset per night: every night starts with 3', () => {
    for (const night of [1, 2, 3]) expect(new Sim({ seed: 1, night }).player.flames).toBe(3);
  });
});

describe('fuel (Ticket-03)', () => {
  it('fuel is integer 1/60 units: exactly 6000 ticks from 100 to out, no float drift', () => {
    const s = new Sim({ seed: 1, scenario: sc({ lanterns: [{ id: 'L1', lit: true }] }) });
    run(s, 5999);
    expect(s.lanterns[0].lit).toBe(true);
    expect(names(s.step(inp()))).toEqual(['lantern_out']);
  });
  it('a full lantern is not selectable: interact picks the next eligible one', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [1, 0, 0], lit: true, fuel: 100 }, { id: 'L2', pos: [-1.5, 0, 0] }] }) });
    // after step-2 decay L1 is 99.983 -> still eligible (used = 1)
    expect(s.step(inp({ interact: true }))[0]).toMatchObject({ name: 'refuel', data: { lantern_id: 'L1', amount: 1 } });
  });
  it('win needs ceil(0.6 n): 3/5, 4/6, 5/7', () => {
    expect([1, 2, 3].map((n) => new Sim({ seed: 1, night: n }).winNeed)).toEqual([3, 4, 5]);
  });
  it('no flames at the dawn tick loses no_flames even with enough lanterns lit', () => {
    const lit = ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true }));
    const s = new Sim({ seed: 1, scenario: sc({ time_left_s: 1 / 60, player: { flames: 1 }, lanterns: lit, shades: [{ pos: [0.5, 0, 0] }] }) });
    expect(s.step(inp()).find((e) => e.name === 'game_over')!.data).toEqual({ result: 'lost', reason: 'no_flames' });
  });
});

describe('determinism', () => {
  it('same seed + inputs -> identical output on every night; different seed differs', () => {
    const inputs = [{ tick: 0, move: [0.3, 1] as [number, number], cam_yaw_deg: 30 }, { tick: 300, pulse: true, dash: true }, { tick: 301, pulse: false, dash: false }];
    for (const night of [1, 2, 3]) {
      const a = runHeadless({ seed: 123, night, ticks: 4000, snapshotEvery: 7, inputs }).lines.join('\n');
      const b = runHeadless({ seed: 123, night, ticks: 4000, snapshotEvery: 7, inputs }).lines.join('\n');
      const c = runHeadless({ seed: 124, night, ticks: 4000, snapshotEvery: 7, inputs }).lines.join('\n');
      expect(a).toBe(b);
      expect(a).not.toBe(c);
    }
  });
});
