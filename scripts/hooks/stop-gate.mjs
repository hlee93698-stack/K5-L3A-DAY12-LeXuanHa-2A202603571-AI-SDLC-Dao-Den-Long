// Claude Code Stop hook: the agent may not finish its turn while `npm test` is red.
// Exit 2 + stderr -> Claude Code feeds the failure back to the agent and keeps it working.
import { spawnSync } from 'node:child_process';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let payload = {};
  try {
    payload = JSON.parse(input || '{}');
  } catch {}
  if (payload.stop_hook_active) process.exit(0); // already retried once: avoid infinite loop

  const r = spawnSync('npm', ['test', '--silent'], { encoding: 'utf8', shell: true, cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd() });
  if (r.status === 0) process.exit(0);
  const out = (r.stdout + '\n' + r.stderr).split('\n').filter((l) => /FAIL|Error|error|✗|×|expected/i.test(l)).slice(0, 25).join('\n');
  process.stderr.write(`npm test is failing. Fix it before stopping (or explain why in docs/notes).\n${out}\n`);
  process.exit(2);
});
