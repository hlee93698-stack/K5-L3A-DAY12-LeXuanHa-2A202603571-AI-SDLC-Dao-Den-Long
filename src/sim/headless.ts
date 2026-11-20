// Headless runner (pure): builds the JSONL lines defined by Test Contract v1.0.
import { Sim } from './sim';
import { defaultInput, type InputFrame, type Scenario } from './types';

export interface HeadlessOptions {
  seed: number;
  ticks: number;
  snapshotEvery: number;
  scenario?: Scenario;
  inputs?: InputFrame[];
}

export function runHeadless(o: HeadlessOptions): { lines: string[]; sim: Sim } {
  const sim = new Sim({ seed: o.seed, scenario: o.scenario });
  const lines: string[] = [];
  const push = (v: unknown) => lines.push(JSON.stringify(v));
  push(sim.snapshot()); // snapshot tick 0: after scenario setup, before any input

  const frames = o.inputs ?? [];
  const cur = defaultInput();
  let fi = 0;
  for (let k = 0; k < o.ticks && sim.state === 'playing'; k++) {
    while (fi < frames.length && frames[fi].tick <= k) {
      const f = frames[fi++];
      if (f.move) cur.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) cur.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) cur.jump = f.jump;
      if (f.interact !== undefined) cur.interact = f.interact;
      if (f.pulse !== undefined) cur.pulse = f.pulse;
      if (f.dash !== undefined) cur.dash = f.dash;
    }
    for (const e of sim.step(cur)) push(e);
    if (sim.tick % o.snapshotEvery === 0) push(sim.snapshot());
  }
  push({ type: 'end', ticks: sim.tick, state: sim.state, score: sim.score });
  return { lines, sim };
}
