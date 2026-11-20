export type Vec3 = [number, number, number];

export interface InputState {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
}

export interface InputFrame extends Partial<InputState> {
  tick: number;
}

export interface Scenario {
  player?: { pos?: Vec3; carried?: number; flames?: number };
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: { id?: string; pos: Vec3 }[];
  shades?: { id?: string; pos: Vec3 }[];
  lanterns?: { id: string; pos?: Vec3; deposited?: number; lit?: boolean }[];
  time_left_s?: number;
}

export type GameState = 'playing' | 'won' | 'lost';
export type ShadeState = 'chase' | 'stunned';

export interface GameEvent {
  type: 'event';
  tick: number;
  name: string;
  data: Record<string, unknown>;
}

export interface Mote {
  id: string;
  x: number;
  z: number;
}

export interface Shade {
  id: string;
  x: number;
  y: number;
  z: number;
  state: ShadeState;
  stun: number; // remaining stun steps
}

export interface Lantern {
  id: string;
  x: number;
  z: number;
  lit: boolean;
  deposited: number;
}

export interface Player {
  x: number;
  y: number;
  z: number;
  vy: number;
  onGround: boolean;
  flames: number;
  carried: number;
  invuln: number; // remaining invulnerable steps
  cooldown: number; // remaining pulse cooldown steps
}

export function defaultInput(): InputState {
  return { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false };
}
