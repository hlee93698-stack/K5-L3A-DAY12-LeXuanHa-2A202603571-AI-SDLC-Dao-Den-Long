---
name: verify-phase
description: Verify a lab phase end-to-end and refresh evidence before tagging phase-N. Use when asked to "verify", "check phase", "make evidence", or before `git tag phase-N`.
---

# Verify a phase

1. Read the acceptance table in `docs/notes/phase-N.md`. Every row needs a check.
2. For each new/changed rule there must be a headless spec in `tests/scenarios/gen-specs.mjs` (phase-N block)
   or a unit test in `tests/`. Derive expected values from `src/sim/tuning.ts`, `src/sim/maps.ts` and the written rule.
   Before running, re-check map side effects (charms, pads, island edges) near the scenario's path.
3. `node tests/scenarios/gen-specs.mjs` then `npm test`. All green, including earlier phases (regression).
   If an old spec is invalid because the ticket replaced a rule: edit it, add a `changed` reason, add a row to the notes table.
4. `npm run verify` regenerates `docs/proof/phase-*/report.md`, `inputs/`, `runs/`. Never edit these by hand.
5. Visual evidence: `node scripts/screenshot.mjs` → `docs/proof/phase-N/screenshots/`. Look at every image.
6. Measured requirements (FPS, headless time): `npm run bench`; headless timing is asserted in `tests/cli.test.ts`.
7. Update the result column in `docs/notes/phase-N.md` (PASS / NOT MET + reason) and `docs/notes/ai-log.md`.
8. Commit. The human decides when to push and tag (`git tag phase-N && git push origin main phase-N`).
