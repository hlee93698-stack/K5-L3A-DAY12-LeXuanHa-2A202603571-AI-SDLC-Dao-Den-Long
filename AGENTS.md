# AGENTS.md: Đảo Đèn Lồng

3D lantern game + headless mode graded by a hidden Test Contract. Correct > pretty.

## Commands
- Install/build: `npm ci && npm run build` (outputs `dist/headless.cjs`, `dist/web/`)
- Test (build + typecheck + unit + CLI + all scenario specs): `npm test`
- Evidence: `npm run verify` → regenerates `docs/proof/phase-N/` (commit the result)
- Headless: `node dist/headless.cjs --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario f] [--inputs f] [--snapshot-every N]`
- Play: `npm start` (http://localhost:5173)

## Layout
- `src/sim/`: ALL gameplay rules. Pure + deterministic: no `Math.random`, no `Date`, no DOM. RNG = `mulberry32(seed)`.
- `src/sim/tuning.ts`: the only place for gameplay numbers. `game.contract.json` tuning must match (test enforces).
- `src/web/`: Three.js view only. Reads sim state, never changes rules. Visual/audio extras live here so headless output stays unchanged.
- `tests/scenarios/phase-N/*.json`: headless specs with expectations; specs of earlier phases keep running.

## Rules
- Contract spec lives in the lab board (quoted in `docs/notes/phase-*.md`). Do not invent rules: if ambiguous, write the assumption in `docs/notes/phase-N.md` first.
- Expected values in tests/specs are derived from tuning + the rule, never copied from program output.
- Never hand-edit `docs/proof/**` (hook blocks it). Regenerate with `npm run verify`.
- A new ticket that changes an old rule: update or remove the old test WITH a reason in `docs/notes/phase-N.md`. Never skip silently.
- Step order inside one tick is part of the spec (see `src/sim/sim.ts` header). Changing it changes event ticks → update notes.
- Small commits, one concern each. Do not commit `.env` or keys.
