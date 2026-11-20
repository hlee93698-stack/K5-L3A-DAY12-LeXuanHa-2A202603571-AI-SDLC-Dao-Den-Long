// Standard numbers from Ticket-02 (contract v1.1). Single source of truth.
// game.contract.json "tuning" MUST equal TUNING (enforced by tests).

export const TUNING = {
  player_speed: 6,
  carry_capacity: 10,
  lantern_cost: 10,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2,
  pulse_cost: 3,
  pulse_radius: 5,
  night1_duration_s: 240,
  night2_duration_s: 270,
  night3_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 3,
  safe_radius: 6,
  shade_speed: 4,
  shade_hit_radius: 1,
  fall_enabled: true,
  dash_speed: 14,
  dash_duration_s: 0.2,
  dash_cooldown_s: 1.5,
  fuel_max: 100,
  fuel_decay_per_s: 1,
  fuel_per_mote: 10,
  relight_cost: 5,
  win_ratio: 0.6,
  drain_per_s: 5,
  low_fuel_threshold: 30,
  capacity_max: 20,
  score: {
    per_mote: 5, // per mote deposited (light, relight or refuel)
    per_lantern: 100, // first light
    per_stun: 5, // per shade hit by a pulse (+15 total if it was draining)
    per_second_left: 0, // time bonus removed in Ticket-03
    per_flame_left: 50, // on win
  },
};

export type Tuning = typeof TUNING;

// Other standard numbers from Ticket-02 (not part of the tuning block) + documented assumptions (B*).
export const K = {
  relight_score: 40,
  drain_stun_score: 15,
  fuel_units: 60, // fuel stored in integer 1/60 units
  drain_range: 2,
  drain_chase_dist: 6,
  unlit_home_r: 4, // C1

  tick_rate: 60,
  gravity: 20,
  jump_velocity: 7,
  step_up: 0.35, // B4: max step height; higher = wall
  pickup_dy: 1.5, // max height difference for pickup / hit
  charm_speed: 7.2,
  charm_ticks: 600,
  charm_respawn_ticks: 2700,
  pulse_center_dy: 0.8,
  pulse_push_ticks: 15,
  shade_y: 1, // shade center above ground
  shade_detect: 12,
  shade_lose: 18,
  shade_recoil_m: 2,
  shade_recoil_ticks: 60,
  shade_spawning_ticks: 60, // B7
  shade_wander_speed: 2, // B8
  wander_turn_ticks: 120,
  shade_first_spawn_tick: 300,
  shade_spawn_min_dist: 15,
  evict_ticks: 30,
  mote_initial: 20,
  mote_cap: 30,
  mote_spawn_every: 240,
  mote_free_r: 0.5, // B12
  drop_r_min: 1.5,
  drop_r_max: 2.5,
  drop_ttl: 480,
  fall_y: -10,
  respawn_wait: 60,
  drifter_speed: 7,
  drifter_idle_speed: 2,
  drifter_max: 2,
  drifter_spawn_every: 1200,
  drifter_chase_carried: 5,
  drifter_chase_dist: 15,
  drifter_touch: 1.2,
  drifter_steal: 3,
  drifter_flee_ticks: 240,
  drifter_drop_vanish_ticks: 120,
  drifter_y: 1.2,
  wind_every: 1800,
  wind_ticks: 300,
  wind_warn_ticks: 120,
  wind_speed: 2,
};
