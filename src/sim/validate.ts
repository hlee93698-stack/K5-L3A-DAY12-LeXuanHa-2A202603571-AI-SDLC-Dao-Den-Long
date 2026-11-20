import type { InputFrame, Scenario, Vec3 } from './types';
import { LANTERN_IDS } from './tuning';

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
    for (const k of ['jump', 'interact', 'pulse', 'dash'] as const) {
      if (f[k] !== undefined) frame[k] = bool(f[k], `${w}.${k}`);
    }
    out.push(frame);
  });
  return out;
}

export function parseScenario(raw: unknown): Scenario {
  if (!isObj(raw)) fail('scenario: expected a JSON object');
  const s: Scenario = {};
  if (raw.player !== undefined) {
    const p = raw.player;
    if (!isObj(p)) fail('scenario.player: expected object');
    s.player = {};
    if (p.pos !== undefined) s.player.pos = vec3(p.pos, 'scenario.player.pos');
    if (p.carried !== undefined) s.player.carried = nonNegInt(p.carried, 'scenario.player.carried');
    if (p.flames !== undefined) s.player.flames = nonNegInt(p.flames, 'scenario.player.flames');
  }
  if (raw.random_motes !== undefined) s.random_motes = bool(raw.random_motes, 'scenario.random_motes');
  if (raw.random_shades !== undefined) s.random_shades = bool(raw.random_shades, 'scenario.random_shades');
  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) fail('scenario.motes: expected array');
    s.motes = raw.motes.map((m, i) => {
      const w = `scenario.motes[${i}]`;
      if (Array.isArray(m)) return { pos: vec3(m, w) };
      if (isObj(m)) return { id: optId(m.id, `${w}.id`), pos: vec3(m.pos, `${w}.pos`) };
      return fail(`${w}: expected [x, y, z] or {"pos": [x, y, z]}`);
    });
  }
  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) fail('scenario.shades: expected array');
    s.shades = raw.shades.map((m, i) => {
      const w = `scenario.shades[${i}]`;
      if (!isObj(m)) fail(`${w}: expected {"pos": [x, y, z]}`);
      return { id: optId(m.id, `${w}.id`), pos: vec3(m.pos, `${w}.pos`) };
    });
    const ids = s.shades.map((x) => x.id).filter((x): x is string => !!x);
    if (new Set(ids).size !== ids.length) fail('scenario.shades: duplicate id');
  }
  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) fail('scenario.lanterns: expected array');
    s.lanterns = raw.lanterns.map((l, i) => {
      const w = `scenario.lanterns[${i}]`;
      if (!isObj(l)) fail(`${w}: expected object`);
      if (typeof l.id !== 'string' || !LANTERN_IDS.includes(l.id)) fail(`${w}.id: expected one of ${LANTERN_IDS.join(', ')}`);
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
