// Standard maps from Ticket-02. Angles: x = r cos(θ), z = r sin(θ) (see docs/notes/phase-2.md B1).
import { TUNING } from './tuning';

export type V3 = [number, number, number];

export interface Pad {
  x: number;
  y: number;
  z: number;
  r: number;
  vy: number;
  vh: number;
  dx: number; // horizontal launch direction (unit)
  dz: number;
}

export interface NightDef {
  night: number;
  name: string;
  duration_s: number;
  start: V3;
  lanterns: { id: string; pos: V3 }[];
  motePoints: V3[];
  shadePoints: V3[]; // also the fog points for drifters
  pads: Pad[];
  charms: { id: string; pos: V3 }[];
  shadeSpeed: number;
  shadeInterval: number; // ticks
  shadeMax: number;
  drifters: boolean;
  wind: boolean;
  centers: [number, number][]; // island centers (drifter homing, rendering)
  /** Walkable surface height at (x, z), or null over the cloud sea. */
  ground(x: number, z: number): number | null;
}

const rad = (d: number) => (d * Math.PI) / 180;
export const polar = (r: number, deg: number, y = 0, cx = 0, cz = 0): V3 => [cx + r * Math.cos(rad(deg)), y, cz + r * Math.sin(rad(deg))];
const ring = (r: number, startDeg: number, stepDeg: number, n: number, y = 0, cx = 0, cz = 0) =>
  Array.from({ length: n }, (_, i) => polar(r, startDeg + i * stepDeg, y, cx, cz));
const ids = (prefix: string, list: V3[]) => list.map((pos, i) => ({ id: `${prefix}${i + 1}`, pos }));

function padToward(x: number, y: number, z: number, vy: number, vh: number, tx: number, tz: number): Pad {
  const d = Math.hypot(tx - x, tz - z);
  return { x, y, z, r: 1, vy, vh, dx: (tx - x) / d, dz: (tz - z) / d };
}

const night1: NightDef = {
  night: 1,
  name: 'Đảo Bến',
  duration_s: TUNING.night1_duration_s,
  start: [0, 0, 0],
  lanterns: ids('L', [
    [0, 0, 25],
    [23.8, 0, 7.7],
    [14.7, 0, -20.2],
    [-14.7, 0, -20.2],
    [-23.8, 0, 7.7],
  ]),
  motePoints: [...ring(12, 0, 45, 8), ...ring(33, 0, 22.5, 16)],
  shadePoints: ring(37, 15, 30, 12),
  pads: [],
  charms: [],
  shadeSpeed: TUNING.shade_speed,
  shadeInterval: 480,
  shadeMax: 6,
  drifters: false,
  wind: false,
  centers: [[0, 0]],
  ground: (x, z) => (Math.hypot(x, z) <= 40 ? 0 : null),
};

const night2: NightDef = {
  night: 2,
  name: 'Đảo Cau',
  duration_s: TUNING.night2_duration_s,
  start: [0, 0, 0],
  lanterns: ids('L', [
    [0, 0, 20],
    [17, 0, -10],
    [-17, 0, -10],
    [70, 0, 20],
    [87, 0, -10],
    [53, 0, -10],
  ]),
  motePoints: [...ring(10, 0, 90, 4), ...ring(22, 0, 45, 8), ...ring(10, 0, 90, 4, 0, 70), ...ring(22, 0, 45, 8, 0, 70)],
  shadePoints: [...ring(26, 22.5, 45, 8), ...ring(26, 22.5, 45, 8, 0, 70)],
  pads: [padToward(20, 0, 18, 14, 24, 70, 0), padToward(50, 0, -18, 14, 24, 0, 0)],
  charms: [{ id: 'C1', pos: [35, 0, 0] }],
  shadeSpeed: TUNING.shade_speed,
  shadeInterval: 420,
  shadeMax: 8,
  drifters: true,
  wind: false,
  centers: [
    [0, 0],
    [70, 0],
  ],
  ground: (x, z) => {
    if (Math.hypot(x, z) <= 28 || Math.hypot(x - 70, z) <= 28) return 0;
    if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0; // bamboo bridge
    return null;
  },
};

const RAMPS = [30, 150].map((d) => [Math.cos(rad(d)), Math.sin(rad(d))] as const);
const night3: NightDef = {
  night: 3,
  name: 'Đảo Chuông',
  duration_s: TUNING.night3_duration_s,
  start: [0, 0, -30],
  lanterns: ids('L', [
    [0, 6, 6],
    [18, 3, 10],
    [-18, 3, 10],
    [35, 0, -10],
    [-35, 0, -10],
    [20, 0, -35],
    [-20, 0, -35],
  ]),
  motePoints: [...ring(34, 0, 20, 18, 0), ...ring(18, 20, 20, 8, 3), ...ring(5, 45, 90, 4, 6)],
  shadePoints: ring(43, 0, 22.5, 16),
  pads: [{ x: 0, y: 3, z: 13, r: 1, vy: 12, vh: 8, dx: 0, dz: -1 }],
  charms: [
    { id: 'C1', pos: [30, 0, 25] },
    { id: 'C2', pos: [-30, 0, 25] },
  ],
  shadeSpeed: 4.5,
  shadeInterval: 360,
  shadeMax: 10,
  drifters: true,
  wind: true,
  centers: [[0, 0]],
  ground: (x, z) => {
    const r = Math.hypot(x, z);
    if (r > 45) return null;
    if (r <= 2) return 14; // bell tower (6 + 8), unclimbable
    if (r <= 8) return 6; // tier 2
    if (z > 0 && r >= 12 && r <= 24) return 3; // tier 1
    for (const [ux, uz] of RAMPS) {
      const along = x * ux + z * uz;
      const perp = Math.abs(-x * uz + z * ux);
      if (along >= 24 && along <= 30 && perp <= 1.5) return (3 * (30 - along)) / 6;
    }
    return 0;
  },
};

export const NIGHTS: Record<number, NightDef> = { 1: night1, 2: night2, 3: night3 };
export function getNight(n: number): NightDef {
  const d = NIGHTS[n];
  if (!d) throw new Error(`unknown night ${n}`);
  return d;
}
