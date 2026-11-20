// CLI: <headless_cmd> --seed <int> --night 1 [--scenario f.json] [--inputs f.json]
//                     --ticks <int> --out f.jsonl [--snapshot-every <int, default 10>]
// Exit 0 ok; 2 malformed inputs/scenario; 1 any other error (bad args, IO).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runHeadless } from '../sim/headless';
import { InputError, parseInputs, parseScenario } from '../sim/validate';
import { seedToUint32 } from '../sim/rng';

class UsageError extends Error {}

const USAGE =
  'usage: headless --seed <int> --night 1 [--scenario <file.json>] [--inputs <file.json>] --ticks <int> --out <file.jsonl> [--snapshot-every <int>]';

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
  if (night !== 1) throw new UsageError(`night ${night} is not available (only night 1)`);
  if (!a.out) throw new UsageError('--out <file.jsonl> is required');
  return {
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

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const scenario = args.scenarioPath ? parseScenario(readJson(args.scenarioPath, 'scenario')) : undefined;
    const inputs = args.inputsPath ? parseInputs(readJson(args.inputsPath, 'inputs')) : undefined;
    const { lines } = runHeadless({ seed: args.seed, ticks: args.ticks, snapshotEvery: args.snapshotEvery, scenario, inputs });
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
