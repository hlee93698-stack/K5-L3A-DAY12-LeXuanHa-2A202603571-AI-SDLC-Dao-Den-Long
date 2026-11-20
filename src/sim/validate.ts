import type { InputFrame, Scenario, Vec3 } from './types';
import { getNight } from './maps';

/** Malformed inputs/scenario file -> headless exits with code 2. */
export class InputError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fail(msg: string): never {
  throw new InputError(msg);
}
function vec3(v: unknown, where: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) fail(`${where}: expected [x, y, z] of numbers`);
  return [v[0], v[1], v[2]];
}
function nonNegInt(v: unknown, where: string): number {
  if (!isNum(v) || !Number.isInteger(v) || v < 0) fail(`${where}: expected a non-negative integer`);
  return v;
}
function bool(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') fail(`${where}: expected boolean`);
  return v;
}
function optId(v: unknown, where: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.length === 0) fail(`${where}: expected non-empty string id`);
  return v;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string): T | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) fail(`${where}: expected one of ${allowed.join(', ')}`);
  return v as T;
}
function optInt(o: Obj, k: string, where: string): number | undefined {
  return o[k] === undefined ? undefined : nonNegInt(o[k], `${where}.${k}`);
}
function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(`${where}: expected array`);
  return v;
}
function uniqueIds(list: { id?: string }[], where: string) {
  const ids = list.map((x) => x.id).filter((x): x is string => !!x);
  if (new Set(ids).size !== ids.length) fail(`${where}: duplicate id`);
}

export function parseInputs(raw: unknown): InputFrame[] {
  if (!isObj(raw) || !Array.isArray(raw.frames)) fail('inputs: expected {"frames": [...]}');
  const out: InputFrame[] = [];
  let lastTick = -1;
  raw.frames.forEach((f, i) => {
    const w = `inputs.frames[${i}]`;
    if (!isObj(f)) fail(`${w}: expected object`);
    const tick = nonNegInt(f.tick, `${w}.tick`);
    if (tick <= lastTick) fail(`${w}.tick: ticks must be strictly increasing (got ${tick} after ${lastTick})`);
    lastTick = tick;
    const frame: InputFrame = { tick };
    if (f.move !== undefined) {
      const m = f.move;
      if (!Array.isArray(m) || m.length !== 2 || !m.every(isNum)) fail(`${w}.move: expected [x, z] of numbers`);
      if (m.some((c) => c < -1 || c > 1)) fail(`${w}.move: components must be in [-1, 1]`);
      frame.move = [m[0], m[1]];
    }
    if (f.cam_yaw_deg !== undefined) {
      if (!isNum(f.cam_yaw_deg)) fail(`${w}.cam_yaw_deg: expected number`);
      frame.cam_yaw_deg = f.cam_yaw_deg;
    }
    for (const k of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) {
      if (f[k] !== undefined) frame[k] = bool(f[k], `${w}.${k}`);
    }
    out.push(frame);
  });
  return out;
}

export function parseScenario(raw: unknown, night = 1): Scenario {
  if (!isObj(raw)) fail('scenario: expected a JSON object');
  const lanternIds = getNight(night).lanterns.map((l) => l.id);
  const s: Scenario = {};
  if (raw.player !== undefined) {
    const p = raw.player;
    if (!isObj(p)) fail('scenario.player: expected object');
    s.player = {};
    if (p.pos !== undefined) s.player.pos = vec3(p.pos, 'scenario.player.pos');
    for (const k of ['carried', 'flames', 'invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks'] as const) {
      const v = optInt(p, k, 'scenario.player');
      if (v !== undefined) s.player[k] = v;
    }
  }
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled'] as const) {
    if (raw[k] !== undefined) s[k] = bool(raw[k], `scenario.${k}`);
  }
  if (raw.motes !== undefined) {
    s.motes = arr(raw.motes, 'scenario.motes').map((m, i) => {
      const w = `scenario.motes[${i}]`;
      if (Array.isArray(m)) return { pos: vec3(m, w) };
      if (!isObj(m)) return fail(`${w}: expected [x, y, z] or {"pos": [x, y, z]}`);
      return {
        id: optId(m.id, `${w}.id`),
        pos: vec3(m.pos, `${w}.pos`),
        kind: oneOf(m.kind, ['random', 'dropped'] as const, `${w}.kind`),
        ttl_ticks: optInt(m, 'ttl_ticks', w),
      };
    });
    uniqueIds(s.motes, 'scenario.motes');
  }
  if (raw.shades !== undefined) {
    s.shades = arr(raw.shades, 'scenario.shades').map((m, i) => {
      const w = `scenario.shades[${i}]`;
      if (!isObj(m)) return fail(`${w}: expected {"pos": [x, y, z]}`);
      return {
        id: optId(m.id, `${w}.id`),
        pos: vec3(m.pos, `${w}.pos`),
        state: oneOf(m.state, ['spawning', 'wander', 'chase', 'recoil', 'stunned'] as const, `${w}.state`),
        state_ticks_left: optInt(m, 'state_ticks_left', w),
      };
    });
    uniqueIds(s.shades, 'scenario.shades');
  }
  if (raw.drifters !== undefined) {
    s.drifters = arr(raw.drifters, 'scenario.drifters').map((m, i) => {
      const w = `scenario.drifters[${i}]`;
      if (!isObj(m)) return fail(`${w}: expected {"pos": [x, y, z]}`);
      return {
        id: optId(m.id, `${w}.id`),
        pos: vec3(m.pos, `${w}.pos`),
        state: oneOf(m.state, ['idle', 'chase', 'flee', 'removed'] as const, `${w}.state`),
        stolen: optInt(m, 'stolen', w),
        state_ticks_left: optInt(m, 'state_ticks_left', w),
      };
    });
    uniqueIds(s.drifters, 'scenario.drifters');
  }
  if (raw.charms !== undefined) {
    s.charms = arr(raw.charms, 'scenario.charms').map((m, i) => {
      const w = `scenario.charms[${i}]`;
      if (!isObj(m)) return fail(`${w}: expected object`);
      return {
        id: optId(m.id, `${w}.id`),
        pos: m.pos === undefined ? undefined : vec3(m.pos, `${w}.pos`),
        available: m.available === undefined ? undefined : bool(m.available, `${w}.available`),
        respawn_ticks: optInt(m, 'respawn_ticks', w),
      };
    });
    uniqueIds(s.charms, 'scenario.charms');
  }
  if (raw.lanterns !== undefined) {
    s.lanterns = arr(raw.lanterns, 'scenario.lanterns').map((l, i) => {
      const w = `scenario.lanterns[${i}]`;
      if (!isObj(l)) return fail(`${w}: expected object`);
      if (typeof l.id !== 'string' || !lanternIds.includes(l.id)) fail(`${w}.id: expected one of ${lanternIds.join(', ')}`);
      const out: NonNullable<Scenario['lanterns']>[number] = { id: l.id };
      if (l.pos !== undefined) out.pos = vec3(l.pos, `${w}.pos`);
      if (l.deposited !== undefined) out.deposited = nonNegInt(l.deposited, `${w}.deposited`);
      if (l.lit !== undefined) out.lit = bool(l.lit, `${w}.lit`);
      return out;
    });
  }
  if (raw.time_left_s !== undefined) {
    if (!isNum(raw.time_left_s) || raw.time_left_s <= 0) fail('scenario.time_left_s: expected a positive number');
    s.time_left_s = raw.time_left_s;
  }
  return s;
}
