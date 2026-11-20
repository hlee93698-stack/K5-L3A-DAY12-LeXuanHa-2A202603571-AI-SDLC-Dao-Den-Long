// Single source of truth for gameplay numbers.
// game.contract.json "tuning" MUST equal TUNING (enforced by tests/contract.test.ts).

export const TUNING = {
  player_speed: 6, // m/s
  carry_capacity: 10, // motes
  lantern_cost: 5, // motes needed to light one lantern
  lantern_count_night1: 5,
  pickup_radius: 1.5, // m, automatic pickup
  interact_radius: 3, // m, deposit into lantern on interact
  pulse_cost: 1, // carried motes spent per pulse
  pulse_radius: 6, // m
  night1_duration_s: 300,
  flames: 3, // player health
  invuln_s: 1.5,
  hit_drop_ratio: 0.5, // floor(carried * ratio) motes lost per hit
  pulse_stun_s: 3,
  pulse_push_m: 4,
  pulse_cooldown_s: 2,
  safe_radius: 6, // shades cannot come within this distance of a LIT lantern
  shade_speed: 4, // m/s
  shade_hit_radius: 1, // m
  fall_enabled: false, // island edge is a wall; no falling
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 20,
    per_second_left: 2, // on win: floor(time_left_s) * this
    per_flame_left: 50, // on win: flames * this
  },
};

export type Tuning = typeof TUNING;

// Numbers that are not part of the contract tuning block (documented in README).
export const WORLD = {
  tick_rate: 60,
  island_radius: 40,
  lantern_ring_radius: 25,
  gravity: 20, // m/s^2
  jump_velocity: 7, // m/s -> apex ~1.23 m
  shade_y: 1, // shade center height
  mote_target: 20, // random motes kept on the island
  mote_respawn_s: 2,
  mote_min_r: 3,
  mote_max_r: 37,
  shades_initial: 3,
  shades_max: 6,
  shade_spawn_interval_s: 40,
  shade_spawn_r: 35,
  shade_spawn_min_dist_to_player: 15,
  safe_eps: 0.01, // shades are kept strictly outside safe_radius
};

export const LANTERN_IDS = ['L1', 'L2', 'L3', 'L4', 'L5'];

// Default lantern positions: ring of radius 25, L1 at +Z, 72 deg apart (rounded to 3 dp).
export const DEFAULT_LANTERNS: { id: string; x: number; z: number }[] = LANTERN_IDS.map((id, i) => {
  const a = (i * 2 * Math.PI) / 5;
  const r3 = (v: number) => {
    const o = Math.round(v * 1000) / 1000;
    return o === 0 ? 0 : o;
  };
  return { id, x: r3(WORLD.lantern_ring_radius * Math.sin(a)), z: r3(WORLD.lantern_ring_radius * Math.cos(a)) };
});
