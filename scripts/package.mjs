// Builds the GitHub Release asset for v1.0.0 (Ticket-04 §5):
//   release/dao-den-long-v1.0.0/            web/ (static game), headless.cjs, serve.mjs, game.contract.json, CHAY-GAME.txt
//   release/dao-den-long-v1.0.0.zip         (or .tar.gz if this system's tar cannot write zip)
// usage: npm run package   (runs the build first)
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const name = `dao-den-long-v${version}`;
const relDir = join(root, 'release');
const out = join(relDir, name);

if (!existsSync(join(root, 'dist/web/index.html')) || !existsSync(join(root, 'dist/headless.cjs'))) {
  console.error('dist/ missing: run `npm run build` first');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'dist/web'), join(out, 'web'), { recursive: true });
cpSync(join(root, 'dist/headless.cjs'), join(out, 'headless.cjs'));
cpSync(join(root, 'game.contract.json'), join(out, 'game.contract.json'));
for (const f of ['LICENSE', 'CREDITS.md', 'CHANGELOG.md']) cpSync(join(root, f), join(out, f));
writeFileSync(
  join(out, 'CHAY-GAME.txt'),
  `Đảo Đèn Lồng v${version}

Chơi ngay (không cần cài gì): mở web/index.html bằng Chrome, Edge hoặc Firefox.
  Bảng xếp hạng khi đó lưu trong trình duyệt (localStorage).

Chơi với bảng xếp hạng lưu ra đĩa (data/leaderboard.json): cần Node.js >= 18, rồi clone repo và chạy
  npm ci && npm run build && npm start

Chế độ headless (Node.js >= 18):
  node headless.cjs --seed 1 --night 1 --ticks 600 --out out.jsonl
  node --no-opt --max-semi-space-size=1 headless.cjs --soak --seed 7 --nights 10 --out soak.json
`,
);

// Archive: bsdtar (Windows 10+, macOS) writes zip with -a; GNU tar (Linux) falls back to .tar.gz.
const zip = spawnSync('tar', ['-a', '-cf', `${name}.zip`, name], { cwd: relDir });
let archive = `${name}.zip`;
if (zip.status !== 0) {
  rmSync(join(relDir, `${name}.zip`), { force: true });
  const tgz = spawnSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: relDir });
  archive = tgz.status === 0 ? `${name}.tar.gz` : null;
}
console.log(`release folder: release/${name}/`);
console.log(archive ? `archive: release/${archive} (attach to GitHub Release v${version})` : 'archive: tar not available, zip the folder manually');
