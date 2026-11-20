---
name: verify-phase
description: Verify a lab phase end-to-end and refresh evidence before tagging phase-N. Use when asked to "verify", "check phase", "make evidence", or before `git tag phase-N`.
---

# Verify a phase

1. Read the ticket requirements in `docs/notes/phase-N.md` (acceptance criteria table). Every row needs a check.
2. For each new/changed rule, make sure there is a spec in `tests/scenarios/phase-N/` (headless, through the real CLI)
   or a unit test in `tests/`. Expected values must be derived from `src/sim/tuning.ts` + the written rule, not from output.
3. Run `npm test`. All green, including scenario specs of earlier phases (regression).
   If an old spec is invalid because the ticket replaced a rule: edit/remove it AND log the reason in `docs/notes/phase-N.md`.
4. Run `npm run verify`. It regenerates `docs/proof/phase-*/report.md`, `inputs/`, `runs/`. Never edit these by hand.
5. Visual evidence (things only visible in the game): build, then
   `node scripts/screenshot.mjs` → `docs/proof/phase-N/screenshots/` and describe what each image proves in the notes.
6. Update the acceptance table in `docs/notes/phase-N.md` (PASS / NOT MET + reason) and `docs/notes/ai-log.md` (token estimate, AI mistakes).
7. Commit (`git add -A && git commit`), then the human tags: `git tag phase-N && git push origin main phase-N`.
