// Claude Code PreToolUse hook (Edit|Write|MultiEdit): evidence under docs/proof/ is generated
// by `npm run verify` and must never be edited by hand (lab RULES section 5).
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let p = {};
  try {
    p = JSON.parse(input || '{}');
  } catch {}
  const file = String(p.tool_input?.file_path ?? '').replace(/\\/g, '/');
  if (/(^|\/)docs\/proof\//.test(file)) {
    process.stderr.write(`Blocked: ${file} is generated evidence. Change code/specs and run \`npm run verify\` instead.\n`);
    process.exit(2);
  }
  process.exit(0);
});
