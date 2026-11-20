// Runs the BUILT headless command exactly as the grader would (npm test builds first).
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const contract = JSON.parse(readFileSync('game.contract.json', 'utf8'));
const [cmd, ...baseArgs] = contract.headless_cmd.split(' ');
const dir = mkdtempSync(join(tmpdir(), 'ddl-'));

function run(args: string[]) {
  const r = spawnSync(cmd, [...baseArgs, ...args], { encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr };
}
function file(name: string, content: unknown) {
  const p = join(dir, name);
  writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
}
const lines = (p: string) => readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

describe('headless CLI', () => {
  it('runs exactly --ticks steps, snapshots every N from tick 0, ends with an end line', () => {
    const out = join(dir, 'basic.jsonl');
    expect(run(['--seed', '5', '--night', '1', '--ticks', '100', '--out', out]).code).toBe(0);
    const ls = lines(out);
    const snaps = ls.filter((l) => l.type === 'snapshot');
    expect(snaps.map((s) => s.tick)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(snaps.every((s) => s.sim_tick === s.tick)).toBe(true);
    expect(ls[ls.length - 1]).toEqual({ type: 'end', ticks: 100, state: 'playing', score: 0 });
    expect(ls[0]).toMatchObject({ type: 'snapshot', tick: 0 });
    expect(ls[1]).toEqual({ type: 'event', tick: 0, name: 'night_start', data: { night: 1 } });
    expect(snaps[0].player).toEqual({
      pos: [0, 0, 0], vel: [0, 0, 0], grounded: true, flames: 3, carried: 0, capacity: 10 /* Ticket-03 */, invuln: false, dash_cd_s: 0, pulse_cd_s: 0, charm_s: 0,
    });
    expect(Object.keys(snaps[0])).toEqual(
      ['type', 'tick', 'sim_tick', 'night', 'state', 'time_left_s', 'score', 'wind', 'player', 'lanterns', 'shades', 'motes_active', 'motes', 'drifters', 'charms'],
    );
    expect(snaps[0].motes[0]).toMatchObject({ kind: 'random', ttl_s: null });
  });
  it.each([1, 2, 3])('night %i: a full night (up to 21600 ticks) runs headless in <= 30 s', (night) => {
    const s = file(`full${night}.json`, { player: { flames: 100000 } });
    const out = join(dir, `full${night}.jsonl`);
    const t0 = Date.now();
    expect(run(['--seed', '3', '--night', String(night), '--scenario', s, '--ticks', '21600', '--out', out, '--snapshot-every', '60']).code).toBe(0);
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(30000);
    const ls = lines(out);
    expect(ls[ls.length - 1]).toMatchObject({ type: 'end', ticks: night === 1 ? 14400 : night === 2 ? 16200 : 18000 }); // Ticket-03 night lengths 240/270/300 s
  });
  it('is deterministic across two process runs (incl. generated ids)', () => {
    const inputs = file('det-in.json', { frames: [{ tick: 0, move: [1, 1], cam_yaw_deg: 45 }, { tick: 200, pulse: true }] });
    const a = join(dir, 'a.jsonl');
    const b = join(dir, 'b.jsonl');
    for (const o of [a, b]) run(['--seed', '99', '--night', '1', '--inputs', inputs, '--ticks', '2000', '--out', o, '--snapshot-every', '1']);
    expect(readFileSync(a, 'utf8')).toBe(readFileSync(b, 'utf8'));
  });
  it('stops early when the game ends', () => {
    const s = file('dawn.json', { time_left_s: 0.5, random_shades: false });
    const out = join(dir, 'dawn.jsonl');
    expect(run(['--seed', '1', '--night', '1', '--scenario', s, '--ticks', '1000', '--out', out]).code).toBe(0);
    const ls = lines(out);
    // order within the final tick: events, then the tick-30 snapshot (30 % 10 == 0), then end
    expect(ls[ls.length - 3]).toEqual({ type: 'event', tick: 30, name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
    expect(ls[ls.length - 2]).toMatchObject({ type: 'snapshot', tick: 30, state: 'lost', time_left_s: 0 });
    expect(ls[ls.length - 1]).toEqual({ type: 'end', ticks: 30, state: 'lost', score: 0 });
  });
  it.each([
    ['not json', '{oops'],
    ['frames missing', { foo: [] }],
    ['ticks not increasing', { frames: [{ tick: 5 }, { tick: 5 }] }],
    ['move out of range', { frames: [{ tick: 0, move: [2, 0] }] }],
    ['bad button type', { frames: [{ tick: 0, pulse: 'yes' }] }],
  ])('malformed inputs (%s) -> exit 2 with stderr', (_n, content) => {
    const p = file('bad-in.json', content);
    const r = run(['--seed', '1', '--night', '1', '--inputs', p, '--ticks', '10', '--out', join(dir, 'x.jsonl')]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/error/);
  });
  it.each([
    ['not object', '[1,2]'],
    ['bad lantern id', { lanterns: [{ id: 'L9' }] }],
    ['bad mote', { motes: [[0, 0]] }],
    ['bad player', { player: { carried: -1 } }],
  ])('malformed scenario (%s) -> exit 2', (_n, content) => {
    const p = file('bad-sc.json', content);
    expect(run(['--seed', '1', '--night', '1', '--scenario', p, '--ticks', '10', '--out', join(dir, 'y.jsonl')]).code).toBe(2);
  });
  it('missing file -> exit 2; missing required arg -> non-zero', () => {
    expect(run(['--seed', '1', '--night', '1', '--inputs', join(dir, 'nope.json'), '--ticks', '1', '--out', join(dir, 'z.jsonl')]).code).toBe(2);
    expect(run(['--seed', '1', '--night', '1', '--ticks', '1']).code).not.toBe(0);
    expect(run(['--seed', '1', '--night', '4', '--ticks', '1', '--out', join(dir, 'z.jsonl')]).code).not.toBe(0);
  });
});

describe('soak_cmd (Ticket-04)', () => {
  it('runs N nights in one process and writes nights, crashes, results, mem_start_mb, mem_end_mb, duration_s', () => {
    const [scmd, ...sargs] = contract.soak_cmd.split(' ');
    const out = join(dir, 'soak.json');
    const r = spawnSync(scmd, [...sargs, '--seed', '7', '--nights', '3', '--out', out], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const s = JSON.parse(readFileSync(out, 'utf8'));
    expect(Object.keys(s)).toEqual(['nights', 'crashes', 'results', 'mem_start_mb', 'mem_end_mb', 'duration_s']);
    expect(s.duration_s).toBeGreaterThan(0);
    expect(s.nights).toBe(3);
    expect(s.crashes).toBe(0);
    expect(s.results).toHaveLength(3);
    expect(s.results.every((x: string) => x === 'won' || x === 'lost')).toBe(true);
    expect(s.mem_end_mb).toBeLessThanOrEqual(1.2 * s.mem_start_mb);
  }, 60000);
});
