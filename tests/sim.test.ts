import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Sim } from '../src/sim/sim';
import { TUNING, WORLD } from '../src/sim/tuning';
import { runHeadless } from '../src/sim/headless';
import { defaultInput, type GameEvent, type InputState, type Scenario } from '../src/sim/types';

const T = TUNING;
const empty: Scenario = { random_motes: false, random_shades: false, motes: [], shades: [] };
const sc = (extra: Scenario): Scenario => ({ ...empty, ...extra });
const inp = (o: Partial<InputState> = {}): InputState => ({ ...defaultInput(), ...o });

function run(sim: Sim, n: number, input: InputState = inp()): GameEvent[] {
  const evs: GameEvent[] = [];
  for (let i = 0; i < n; i++) evs.push(...sim.step(input));
  return evs;
}
const names = (evs: GameEvent[]) => evs.map((e) => e.name);
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('contract', () => {
  it('game.contract.json tuning equals the numbers the game uses', () => {
    const c = JSON.parse(readFileSync('game.contract.json', 'utf8'));
    expect(c.contract_version).toBe('1.0');
    expect(c.tuning).toEqual(TUNING);
    expect(c.tuning.lantern_count_night1).toBe(5);
  });
});

describe('movement', () => {
  it('moves player_speed m/s along +Z with move [0,1], yaw 0', () => {
    const s = new Sim({ seed: 1, scenario: empty });
    run(s, 60, inp({ move: [0, 1] }));
    near(s.player.z, T.player_speed);
    near(s.player.x, 0);
  });
  it('rotates move by cam_yaw_deg (90 deg: [0,1] -> +X, [1,0] -> -Z)', () => {
    const a = new Sim({ seed: 1, scenario: empty });
    run(a, 60, inp({ move: [0, 1], cam_yaw_deg: 90 }));
    near(a.player.x, T.player_speed);
    near(a.player.z, 0);
    const b = new Sim({ seed: 1, scenario: empty });
    run(b, 60, inp({ move: [1, 0], cam_yaw_deg: 90 }));
    near(b.player.x, 0);
    near(b.player.z, -T.player_speed);
  });
  it('normalizes vectors longer than 1', () => {
    const s = new Sim({ seed: 1, scenario: empty });
    run(s, 60, inp({ move: [1, 1] }));
    near(Math.hypot(s.player.x, s.player.z), T.player_speed);
  });
  it('does not normalize vectors shorter than 1', () => {
    const s = new Sim({ seed: 1, scenario: empty });
    run(s, 60, inp({ move: [0, 0.5] }));
    near(s.player.z, T.player_speed / 2);
  });
  it('island edge is a wall (fall_enabled=false)', () => {
    const s = new Sim({ seed: 1, scenario: empty });
    const evs = run(s, 60 * 10, inp({ move: [1, 0] }));
    expect(Math.hypot(s.player.x, s.player.z)).toBeLessThanOrEqual(WORLD.island_radius + 1e-9);
    expect(names(evs)).not.toContain('player_hit');
  });
  it('jump is edge-triggered and lands back on Y=0', () => {
    const s = new Sim({ seed: 1, scenario: empty });
    run(s, 20, inp({ jump: true }));
    expect(s.player.y).toBeGreaterThan(0);
    run(s, 60, inp({ jump: true })); // still held: no second jump
    expect(s.player.y).toBe(0);
  });
});

describe('motes and lanterns', () => {
  it('picks up motes within pickup_radius (<=) automatically', () => {
    const s = new Sim({ seed: 1, scenario: sc({ motes: [{ pos: [0, 0, T.pickup_radius] }, { pos: [0, 0, -(T.pickup_radius + 0.1)] }] }) });
    const evs = run(s, 1);
    expect(evs).toEqual([{ type: 'event', tick: 1, name: 'mote_picked', data: { carried: 1 } }]);
    expect(s.motes.length).toBe(1);
    expect(s.score).toBe(T.score.per_mote);
  });
  it('respects carry_capacity', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: T.carry_capacity }, motes: [{ pos: [0, 0, 0] }] }) });
    expect(run(s, 5)).toEqual([]);
    expect(s.player.carried).toBe(T.carry_capacity);
  });
  it('interact deposits into a lantern in interact_radius and lights it at lantern_cost', () => {
    const s = new Sim({
      seed: 1,
      scenario: sc({ player: { carried: T.lantern_cost + 2 }, lanterns: [{ id: 'L1', pos: [0, 0, T.interact_radius] }] }),
    });
    const evs = s.step(inp({ interact: true }));
    expect(evs).toEqual([
      { type: 'event', tick: 1, name: 'deposit', data: { lantern_id: 'L1', amount: T.lantern_cost, deposited: T.lantern_cost } },
      { type: 'event', tick: 1, name: 'lantern_lit', data: { lantern_id: 'L1' } },
    ]);
    expect(s.player.carried).toBe(2);
    expect(s.score).toBe(T.score.per_lantern);
  });
  it('partial deposit, interact is edge-triggered', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }] }) });
    const evs = run(s, 10, inp({ interact: true }));
    expect(names(evs)).toEqual(['deposit']);
    expect(s.lanterns[0].deposited).toBe(2);
    expect(s.lanterns[0].lit).toBe(false);
  });
  it('no deposit outside interact_radius', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, T.interact_radius + 0.01] }] }) });
    expect(s.step(inp({ interact: true }))).toEqual([]);
  });
  it('lighting the last lantern wins with time/flame bonus', () => {
    const s = new Sim({
      seed: 1,
      scenario: sc({
        player: { carried: T.lantern_cost },
        lanterns: [
          { id: 'L1', lit: true },
          { id: 'L2', lit: true },
          { id: 'L3', lit: true },
          { id: 'L4', lit: true },
          { id: 'L5', pos: [0, 0, 1] },
        ],
      }),
    });
    expect(s.score).toBe(0); // setup gives no score
    const evs = s.step(inp({ interact: true }));
    expect(names(evs)).toEqual(['deposit', 'lantern_lit', 'game_over']);
    expect(evs[2].data).toEqual({ result: 'won', reason: 'all_lit' });
    expect(s.state).toBe('won');
    const expected = T.score.per_lantern + Math.floor(T.night1_duration_s - 1 / 60) * T.score.per_second_left + T.flames * T.score.per_flame_left;
    expect(s.score).toBe(expected);
    expect(s.step(inp())).toEqual([]); // finished game does not advance
  });
});

describe('shades and pulse', () => {
  it('shades chase at shade_speed', () => {
    const s = new Sim({ seed: 1, scenario: sc({ shades: [{ pos: [20, 0, 0] }] }) });
    run(s, 60);
    near(s.shades[0].x, 20 - T.shade_speed);
    expect(s.shades[0].state).toBe('chase');
  });
  it('pulse stuns shades within pulse_radius, pushes pulse_push_m, costs pulse_cost', () => {
    const s = new Sim({
      seed: 1,
      scenario: sc({ player: { carried: 3 }, shades: [{ id: 'A', pos: [T.pulse_radius, 0, 0] }, { id: 'B', pos: [0, 0, 20] }] }),
    });
    const evs = s.step(inp({ pulse: true }));
    // A moved 1 tick toward the player before the pulse resolved
    expect(evs).toEqual([{ type: 'event', tick: 1, name: 'pulse', data: { stunned_ids: ['A'] } }]);
    const a = s.shades[0];
    expect(a.state).toBe('stunned');
    near(a.x, T.pulse_radius - T.shade_speed / 60 + T.pulse_push_m);
    expect(s.player.carried).toBe(3 - T.pulse_cost);
    expect(s.score).toBe(T.score.per_stun);
  });
  it('stun lasts pulse_stun_s; stunned shades neither move nor hit', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 1 }, shades: [{ pos: [0.5, 0, 0] }] }) });
    s.step(inp({ pulse: true })); // tick 1: stunned, pushed to ~4.43
    const x = s.shades[0].x;
    const stunTicks = T.pulse_stun_s * 60;
    const evs = run(s, stunTicks - 2);
    expect(s.shades[0].state).toBe('stunned');
    expect(s.shades[0].x).toBe(x);
    expect(names(evs)).not.toContain('player_hit');
    run(s, 1); // tick = stunTicks
    expect(s.shades[0].state).toBe('stunned');
    run(s, 1); // tick = stunTicks + 1: recovered
    expect(s.shades[0].state).toBe('chase');
  });
  it('pulse_cooldown_s blocks re-pulse; pulse needs pulse_cost light', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 5 } }) });
    const press = () => [s.step(inp({ pulse: true })), s.step(inp({ pulse: false }))].flat();
    expect(names(press())).toEqual(['pulse']); // ticks 1-2
    const cd = T.pulse_cooldown_s * 60;
    run(s, cd - 3); // now at tick cd - 1
    expect(names(press())).toEqual([]); // ticks cd, cd+1 ... first press at tick cd (1 step short)
    const s2 = new Sim({ seed: 1, scenario: sc({ player: { carried: 0 } }) });
    expect(s2.step(inp({ pulse: true }))).toEqual([]);
  });
  it('re-pulse allowed exactly pulse_cooldown_s after the last pulse', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 5 } }) });
    s.step(inp({ pulse: true })); // tick 1
    run(s, T.pulse_cooldown_s * 60 - 1, inp({ pulse: false })); // through tick 120
    const evs = s.step(inp({ pulse: true })); // tick 121 = 1 + cooldown
    expect(names(evs)).toEqual(['pulse']);
    expect(evs[0].tick).toBe(1 + T.pulse_cooldown_s * 60);
  });
  it('contact costs a flame, drops floor(carried*hit_drop_ratio), then invuln_s', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { carried: 5 }, shades: [{ pos: [T.shade_hit_radius, 0, 0] }] }) });
    const first = s.step(inp());
    expect(first).toEqual([
      { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: T.flames - 1, dropped: Math.floor(5 * T.hit_drop_ratio) } },
    ]);
    const inv = T.invuln_s * 60;
    const during = run(s, inv - 1);
    expect(names(during)).not.toContain('player_hit');
    const after = s.step(inp());
    expect(after[0]?.name).toBe('player_hit');
    expect(after[0].tick).toBe(1 + inv);
  });
  it('losing all flames ends the game (no_flames)', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { flames: 1 }, shades: [{ pos: [0, 0, 0] }] }) });
    const evs = s.step(inp());
    expect(names(evs)).toEqual(['player_hit', 'game_over']);
    expect(evs[1].data).toEqual({ result: 'lost', reason: 'no_flames' });
  });
  it('shades never enter safe_radius of a LIT lantern (player shelters there)', () => {
    const s = new Sim({
      seed: 1,
      scenario: sc({ player: { pos: [0, 0, 22] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ pos: [0, 0, 10] }, { pos: [3, 0, 30] }] }),
    });
    const evs = run(s, 600);
    for (const sh of s.shades) expect(Math.hypot(sh.x - 0, sh.z - 25)).toBeGreaterThan(T.safe_radius);
    expect(names(evs)).not.toContain('player_hit');
  });
  it('unlit lanterns do not repel shades', () => {
    const s = new Sim({ seed: 1, scenario: sc({ player: { pos: [0, 0, 25] }, shades: [{ pos: [0, 0, 15] }] }) });
    const evs = run(s, 200);
    expect(names(evs)).toContain('player_hit');
  });
});

describe('time, scenario, determinism', () => {
  it('dawn ends the night as lost when time runs out', () => {
    const s = new Sim({ seed: 1, scenario: sc({ time_left_s: 1 }) });
    const evs = run(s, 100);
    expect(evs).toEqual([{ type: 'event', tick: 60, name: 'game_over', data: { result: 'lost', reason: 'dawn' } }]);
    expect(s.tick).toBe(60);
  });
  it('time_left_s = duration - steps/60', () => {
    const s = new Sim({ seed: 1, scenario: empty });
    run(s, 90);
    near(s.timeLeft, T.night1_duration_s - 1.5);
  });
  it('scenario setup emits no events and no score (pre-lit lantern)', () => {
    const { lines } = runHeadless({ seed: 3, ticks: 0, snapshotEvery: 10, scenario: sc({ lanterns: [{ id: 'L1', lit: true }] }) });
    expect(lines.length).toBe(2);
    const snap = JSON.parse(lines[0]);
    expect(snap.score).toBe(0);
    expect(snap.lanterns[0]).toEqual({ id: 'L1', pos: [0, 0, 25], lit: true, deposited: T.lantern_cost });
  });
  it('scenario shade ids are kept; auto ids avoid collisions', () => {
    const s = new Sim({ seed: 1, scenario: sc({ shades: [{ pos: [9, 0, 0] }, { id: 'S1', pos: [10, 0, 0] }] }) });
    expect(s.shades.map((x) => x.id)).toEqual(['S2', 'S1']);
  });
  it('default night: 20 motes, 3 shades, a new shade spawns every 40 s', () => {
    const d = new Sim({ seed: 7 });
    expect(d.motes.length).toBe(WORLD.mote_target);
    expect(d.shades.length).toBe(WORLD.shades_initial);
    const s = new Sim({ seed: 7, scenario: { player: { flames: 1000 } } }); // survive 40 s standing still
    const evs = run(s, WORLD.shade_spawn_interval_s * 60, inp({ move: [0, 0] }));
    const spawned = evs.filter((e) => e.name === 'shade_spawned');
    expect(spawned.map((e) => e.data)).toEqual([{ id: 'S4' }]);
  });
  it('random motes respawn back to the target count', () => {
    const s = new Sim({ seed: 9, scenario: { random_shades: false, shades: [], motes: [{ pos: [0, 0, 0] }] } });
    s.step(inp());
    expect(s.player.carried).toBe(1);
    run(s, 60 * 60);
    expect(s.motes.length).toBe(WORLD.mote_target);
  });
  it('same seed + inputs -> identical output; different seed -> different world', () => {
    const inputs = [{ tick: 0, move: [0.3, 1] as [number, number], cam_yaw_deg: 30 }, { tick: 300, pulse: true }, { tick: 301, pulse: false }];
    const a = runHeadless({ seed: 123, ticks: 3000, snapshotEvery: 7, inputs }).lines.join('\n');
    const b = runHeadless({ seed: 123, ticks: 3000, snapshotEvery: 7, inputs }).lines.join('\n');
    const c = runHeadless({ seed: 124, ticks: 3000, snapshotEvery: 7, inputs }).lines.join('\n');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
