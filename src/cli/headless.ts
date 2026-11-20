// CLI: <headless_cmd> --seed <int> --night <1|2|3> [--scenario f.json] [--inputs f.json]
//                     --ticks <int> --out f.jsonl [--snapshot-every <int, default 10>]
//       <headless_cmd> --soak --seed <int> --nights <int> --out f.json
// Exit 0 ok; 2 malformed inputs/scenario; 1 any other error (bad args, IO).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runHeadless } from '../sim/headless';
import { InputError, parseInputs, parseScenario } from '../sim/validate';
import { seedToUint32, mulberry32 } from '../sim/rng';
import { Sim } from '../sim/sim';
import { defaultInput } from '../sim/types';
import { K } from '../sim/tuning';
import { getNight } from '../sim/maps';

class UsageError extends Error {}

const USAGE =
  'usage: headless --seed <int> --night <1|2|3> [--scenario <file.json>] [--inputs <file.json>] --ticks <int> --out <file.jsonl> [--snapshot-every <int>]';

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new UsageError(`unexpected argument: ${k}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`missing value for ${k}`);
    a[k.slice(2)] = v;
    i++;
  }
  const int = (name: string, min: number): number => {
    const s = a[name];
    if (s === undefined) throw new UsageError(`missing --${name}`);
    if (!/^-?\d+$/.test(s)) throw new UsageError(`--${name} must be an integer`);
    const n = Number(s);
    if (n < min) throw new UsageError(`--${name} must be >= ${min}`);
    return n;
  };
  if (a.seed === undefined || !/^-?\d+$/.test(a.seed)) throw new UsageError('--seed <int> is required');
  const night = int('night', 1);
  if (night > 3) throw new UsageError(`night ${night} is not available (1, 2 or 3)`);
  if (!a.out) throw new UsageError('--out <file.jsonl> is required');
  return {
    night,
    seed: seedToUint32(a.seed),
    ticks: int('ticks', 0),
    snapshotEvery: a['snapshot-every'] === undefined ? 10 : int('snapshot-every', 1),
    scenarioPath: a.scenario,
    inputsPath: a.inputs,
    out: a.out,
  };
}

function readJson(file: string, what: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new InputError(`${what}: cannot read ${file}: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new InputError(`${what}: invalid JSON in ${file}: ${(e as Error).message}`);
  }
}

// ---------- soak test ----------
function runOneSoakNight(nightSeed: number, nightNum: 1 | 2 | 3): 'won' | 'lost' {
  const map = getNight(nightNum);
  const maxTicks = map.duration_s * K.tick_rate + K.tick_rate * 10;
  const sim = new Sim({ seed: nightSeed, night: nightNum });
  const rng = mulberry32(nightSeed ^ 0xdeadbeef);
  const inp = defaultInput();
  let dirTimer = 0;
  for (let k = 0; k < maxTicks; k++) {
    if (--dirTimer <= 0) {
      const a = rng() * Math.PI * 2;
      inp.move = [Math.sin(a), Math.cos(a)];
      dirTimer = 30;
    }
    inp.jump = rng() < 0.05;
    inp.dash = rng() < 0.03;
    inp.pulse = rng() < 0.02;
    inp.interact = rng() < 0.10;
    inp.pause = false;
    sim.step(inp);
    if (sim.state !== 'playing' && sim.state !== 'paused') break;
  }
  return sim.state === 'won' ? 'won' : 'lost';
}

function runSoak(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      a[argv[i].slice(2)] = argv[i + 1]; i++;
    }
  }
  const seed = Number(a.seed ?? '7');
  const nights = Number(a.nights ?? '10');
  const out = a.out ?? 'soak.json';
  if (isNaN(seed) || isNaN(nights) || nights < 1) {
    process.stderr.write('usage: headless --soak --seed <int> --nights <int> --out <file.json>\n');
    process.exitCode = 1; return;
  }
  let memStart = 0;
  let crashes = 0;
  const results: string[] = [];
  for (let i = 0; i < nights; i++) {
    const nightNum = ((i % 3) + 1) as 1 | 2 | 3;
    const nightSeed = seedToUint32(String(seed + i));
    try {
      const r = runOneSoakNight(nightSeed, nightNum);
      results.push(r);
    } catch {
      crashes++;
      results.push('crash');
    }
    if (i === 0) memStart = process.memoryUsage().rss / 1024 / 1024;
  }
  const memEnd = process.memoryUsage().rss / 1024 / 1024;
  const r3 = (n: number) => Math.round(n * 10) / 10;
  const data = { nights, crashes, results, mem_start_mb: r3(memStart), mem_end_mb: r3(memEnd) };
  const dir = path.dirname(path.resolve(out));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  const ok = crashes === 0 && memEnd <= 1.2 * memStart;
  process.stdout.write(`soak: ${nights} nights, ${crashes} crashes, mem ${r3(memStart)}→${r3(memEnd)} MB — ${ok ? 'PASS' : 'FAIL'}\n`);
  process.exitCode = ok ? 0 : 1;
}

// ---------- main ----------
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--soak')) { runSoak(argv.filter((a) => a !== '--soak')); return; }
  try {
    const args = parseArgs(argv);
    const scenario = args.scenarioPath ? parseScenario(readJson(args.scenarioPath, 'scenario'), args.night) : undefined;
    const inputs = args.inputsPath ? parseInputs(readJson(args.inputsPath, 'inputs')) : undefined;
    const { lines } = runHeadless({ seed: args.seed, night: args.night, ticks: args.ticks, snapshotEvery: args.snapshotEvery, scenario, inputs });
    const dir = path.dirname(path.resolve(args.out));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(args.out, lines.join('\n') + '\n');
    process.exitCode = 0;
  } catch (e) {
    if (e instanceof InputError) {
      process.stderr.write(`error: ${e.message}\n`);
      process.exitCode = 2;
    } else if (e instanceof UsageError) {
      process.stderr.write(`error: ${e.message}\n${USAGE}\n`);
      process.exitCode = 1;
    } else {
      process.stderr.write(`error: ${(e as Error)?.stack ?? String(e)}\n`);
      process.exitCode = 1;
    }
  }
}

main();
