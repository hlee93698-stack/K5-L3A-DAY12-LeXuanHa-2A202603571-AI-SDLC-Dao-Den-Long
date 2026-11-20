// Every headless scenario spec of every phase must pass (regression across phases).
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain JS helper shared with scripts/verify.mjs
import { listPhases, loadSpecs, runSpec } from '../scripts/scenario-lib.mjs';

const out = mkdtempSync(join(tmpdir(), 'ddl-spec-'));
for (const phase of listPhases() as string[]) {
  describe(`scenarios ${phase}`, () => {
    for (const spec of loadSpecs(join('tests', 'scenarios', phase))) {
      it(`${spec.id}: ${spec.requirement}`, () => {
        const r = runSpec(spec, join(out, phase));
        const failed = r.checks.filter((c: { pass: boolean }) => !c.pass).map((c: { detail: string }) => c.detail);
        expect(failed).toEqual([]);
      });
    }
  });
}
