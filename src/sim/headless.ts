// Headless runner (pure): builds the JSONL lines defined by Test Contract v1.1.
import { Sim } from './sim';
import { defaultInput, type InputFrame, type Scenario } from './types';

export interface HeadlessOptions {
  seed: number;
  night?: number;
  ticks: number;
  snapshotEvery: number;
  scenario?: Scenario;
  inputs?: InputFrame[];
}

export function runHeadless(o: HeadlessOptions): { lines: string[]; sim: Sim } {
  const night = o.night ?? 1;
  const sim = new Sim({ seed: o.seed, night, scenario: o.scenario });
  const lines: string[] = [];
  const push = (v: unknown) => lines.push(JSON.stringify(v));
  push(sim.snapshot()); // tick 0: after scenario setup, before any input
  push({ type: 'event', tick: 0, name: 'night_start', data: { night } });

  const frames = o.inputs ?? [];
  const cur = defaultInput();
  let fi = 0;
  const live = () => sim.state === 'playing' || sim.state === 'paused';
  for (let k = 0; k < o.ticks && live(); k++) {
    while (fi < frames.length && frames[fi].tick <= k) {
      const f = frames[fi++];
      if (f.move) cur.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) cur.cam_yaw_deg = f.cam_yaw_deg;
      for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) if (f[b] !== undefined) cur[b] = f[b];
    }
    for (const e of sim.step(cur)) push(e);
    if (sim.tick % o.snapshotEvery === 0) push(sim.snapshot());
  }
  push({ type: 'end', ticks: sim.tick, state: sim.state, score: sim.score });
  return { lines, sim };
}
