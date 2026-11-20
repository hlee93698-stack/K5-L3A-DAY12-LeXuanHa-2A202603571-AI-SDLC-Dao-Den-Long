# AGENTS.md: Đảo Đèn Lồng

3D lantern game, 3 nights, + headless mode graded by a hidden Test Contract (now **v1.1**). Correct > pretty.

## Commands
- Install/build: `npm ci && npm run build` (outputs `dist/headless.cjs`, `dist/web/`)
- Test (build + typecheck + unit + CLI + all scenario specs of all phases): `npm test`
- Evidence: `npm run verify` → regenerates `docs/proof/phase-N/` (commit the result)
- Specs are generated: edit `tests/scenarios/gen-specs.mjs`, then `node tests/scenarios/gen-specs.mjs`
- Headless: `node dist/headless.cjs --seed 1 --night <1|2|3> --ticks 600 --out out.jsonl [--scenario f] [--inputs f] [--snapshot-every N]`
- Visual evidence: `node scripts/screenshot.mjs`; FPS: `npm run bench`; play: `npm start`

## Layout
- `src/sim/`: ALL gameplay rules. Pure + deterministic: no `Math.random`, no `Date`, no DOM. RNG = `mulberry32(seed)`.
  - `tuning.ts`: standard numbers (Ticket-02). `game.contract.json` tuning must match (test enforces).
  - `maps.ts`: the 3 standard maps. Angles: `x = r cos θ, z = r sin θ`.
  - `sim.ts`: the mandatory 12-step tick order (header comment). Changing order changes event ticks.
- `src/web/`: Three.js view only (`world.ts`, `main.ts`, `sfx.ts`). Never changes rules; extras live here so headless output stays unchanged.
- `tests/scenarios/phase-N/*.json`: headless specs; specs of earlier phases keep running (regression).

## Rules
- Ticket text is the spec; assumptions go in `docs/notes/phase-N.md` BEFORE code. Do not invent rules.
- Expected values in tests/specs are hand-derived from tuning + the rule, never copied from program output.
  Watch for map side effects in specs (e.g. Night 2 charm C1 sits on the bridge at (35,0,0)).
- Never hand-edit `docs/proof/**` (hook blocks it). Regenerate with `npm run verify`.
- A ticket that changes an old rule: update the old spec WITH a `changed` reason (and a row in the notes). Never skip silently.
- Do not run `python -` or other commands that wait on stdin (they hang the shell).
- Small commits, one concern each. Do not commit `.env` or keys. Do not push or tag unless the human asks.
