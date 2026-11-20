// Runs headless scenario specs (tests/scenarios/phase-N/*.json) through the REAL headless_cmd
// from game.contract.json and evaluates their expectations. Used by verify.mjs and vitest.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const contract = JSON.parse(readFileSync('game.contract.json', 'utf8'));

export function listPhases(root = 'tests/scenarios') {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((d) => /^phase-\d+$/.test(d)).sort();
}

export function loadSpecs(phaseDir) {
  return readdirSync(phaseDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: join(phaseDir, f), ...JSON.parse(readFileSync(join(phaseDir, f), 'utf8')) }));
}

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const subset = (obj, sub) => obj != null && Object.entries(sub).every(([k, v]) => JSON.stringify(obj[k]) === JSON.stringify(v));

function check(exp, run) {
  const { lines, code } = run;
  const events = lines.filter((l) => l.type === 'event');
  const snaps = lines.filter((l) => l.type === 'snapshot');
  const end = lines[lines.length - 1];
  if ('exit' in exp) return [code === exp.exit, `exit code ${code} (want ${exp.exit})`];
  if ('event' in exp) {
    const m = events.filter((e) => e.name === exp.event && (exp.tick === undefined || e.tick === exp.tick) && (!exp.data || subset(e.data, exp.data)));
    if ('count' in exp) return [m.length === exp.count, `${m.length} x ${exp.event}${exp.tick !== undefined ? '@' + exp.tick : ''} (want ${exp.count})`];
    return [m.length > 0, m.length ? `found ${JSON.stringify(m[0])}` : `no ${exp.event} matching ${JSON.stringify({ tick: exp.tick, data: exp.data })}`];
  }
  if ('no_event' in exp) {
    const m = events.filter((e) => e.name === exp.no_event);
    return [m.length === 0, m.length ? `unexpected ${JSON.stringify(m[0])}` : `no ${exp.no_event} events`];
  }
  if ('end' in exp) return [end?.type === 'end' && subset(end, exp.end), `end line ${JSON.stringify(end)}`];
  if ('snapshot' in exp) {
    const s = snaps.find((x) => x.tick === exp.snapshot);
    if (!s) return [false, `no snapshot at tick ${exp.snapshot}`];
    const v = get(s, exp.path);
    const desc = `snapshot@${exp.snapshot} ${exp.path} = ${JSON.stringify(v)}`;
    if ('equals' in exp) return [JSON.stringify(v) === JSON.stringify(exp.equals), `${desc} (want ${JSON.stringify(exp.equals)})`];
    if ('gt' in exp) return [v > exp.gt, `${desc} (want > ${exp.gt})`];
    if ('lt' in exp) return [v < exp.lt, `${desc} (want < ${exp.lt})`];
  }
  if ('shade_clear_of' in exp) {
    // shades stay at/outside r (output is rounded to 3 dp -> 0.002 tolerance)
    const [px, pz] = exp.shade_clear_of;
    const from = exp.from_tick ?? 0;
    let min = Infinity;
    const used = snaps.filter((s) => s.tick >= from);
    for (const s of used) for (const sh of s.shades) min = Math.min(min, Math.hypot(sh.pos[0] - px, sh.pos[2] - pz));
    return [min >= exp.r - 0.002, `min shade distance to (${px}, ${pz}) over ${used.length} snapshots from tick ${from} = ${min.toFixed(3)} (want >= ${exp.r})`];
  }
  if ('moved' in exp) {
    const [a, b] = exp.moved.map((t) => snaps.find((s) => s.tick === t));
    if (!a || !b) return [false, `missing snapshot ${exp.moved}`];
    const d = Math.hypot(b.player.pos[0] - a.player.pos[0], b.player.pos[2] - a.player.pos[2]);
    return [Math.abs(d - exp.approx) <= (exp.tol ?? 0.01), `player XZ displacement ticks ${exp.moved.join('->')} = ${d.toFixed(3)} (want ${exp.approx} ± ${exp.tol ?? 0.01})`];
  }
  if ('dist_range' in exp) {
    const s = snaps.find((x) => x.tick === exp.dist_range);
    if (!s) return [false, `no snapshot at tick ${exp.dist_range}`];
    const p = s.player.pos;
    const items = s[exp.list].filter((it) => !exp.kind || it.kind === exp.kind);
    const ds = items.map((it) => Math.hypot(it.pos[0] - p[0], it.pos[2] - p[2]));
    const ok = ds.length > 0 && ds.every((d) => d >= exp.min - 0.002 && d <= exp.max + 0.002);
    return [ok, `snapshot@${exp.dist_range} ${items.length} ${exp.list}${exp.kind ? ' (' + exp.kind + ')' : ''} at distances [${ds.map((d) => d.toFixed(2)).join(', ')}] from player (want ${exp.min}..${exp.max})`];
  }
  return [false, `unknown expectation ${JSON.stringify(exp)}`];
}

/** Run one spec; files are written under outDir so the exact command can be re-run by hand. */
export function runSpec(spec, outDir) {
  const inDir = join(outDir, 'inputs');
  const runDir = join(outDir, 'runs');
  mkdirSync(inDir, { recursive: true });
  mkdirSync(runDir, { recursive: true });
  const args = ['--seed', String(spec.seed ?? 1), '--night', String(spec.night ?? 1)];
  const writeIn = (kind, v) => {
    const p = join(inDir, `${spec.id}.${kind}.json`).replace(/\\/g, '/');
    writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n');
    return p;
  };
  if (spec.scenario !== undefined) args.push('--scenario', writeIn('scenario', spec.scenario));
  if (spec.inputs !== undefined) args.push('--inputs', writeIn('inputs', spec.inputs));
  const out = join(runDir, `${spec.id}.jsonl`).replace(/\\/g, '/');
  args.push('--ticks', String(spec.ticks ?? 60), '--out', out, '--snapshot-every', String(spec.snapshot_every ?? 10));

  const [cmd, ...base] = contract.headless_cmd.split(' ');
  const exec = () => {
    const r = spawnSync(cmd, [...base, ...args], { encoding: 'utf8' });
    const text = r.status === 0 && existsSync(out) ? readFileSync(out, 'utf8') : '';
    return { code: r.status, stderr: r.stderr.trim(), text };
  };
  const a = exec();
  const b = exec(); // second run: determinism
  if (a.code !== 0) writeFileSync(out, `# exit ${a.code}\n# stderr: ${a.stderr}\n`);
  const lines = a.text ? a.text.trim().split('\n').map((l) => JSON.parse(l)) : [];
  const run = { lines, code: a.code };
  const checks = (spec.expect ?? []).map((e) => {
    const [pass, detail] = check(e, run);
    return { pass, detail };
  });
  const deterministic = a.text === b.text && a.code === b.code;
  checks.push({ pass: deterministic, detail: deterministic ? 'run twice: identical output' : 'run twice: OUTPUT DIFFERS' });
  return {
    id: spec.id,
    requirement: spec.requirement,
    command: `${contract.headless_cmd} ${args.join(' ')}`,
    sha256: createHash('sha256').update(a.text).digest('hex').slice(0, 16),
    pass: checks.every((c) => c.pass),
    checks,
  };
}
