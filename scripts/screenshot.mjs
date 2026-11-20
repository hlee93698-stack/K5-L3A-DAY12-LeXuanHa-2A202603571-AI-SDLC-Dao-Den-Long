// Visual evidence: render dist/web in headless Chrome/Edge and save PNGs.
// usage: node scripts/screenshot.mjs [outDir=docs/proof/phase-1/screenshots]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) {
  console.error('No Chrome/Edge found. Set CHROME_PATH.');
  process.exit(1);
}
const outDir = resolve(process.argv[2] || 'docs/proof/phase-2/screenshots');
mkdirSync(outDir, { recursive: true });
const page = pathToFileURL(resolve('dist/web/index.html')).href;
const shots = [
  ['menu', ''],
  ['intro-night2', '?shot=intro2'],
  ['night1-hud', '?shot=n1'],
  ['night2-bridge-drifter', '?shot=n2'],
  ['night3-tiers', '?shot=n3'],
  ['pause-menu', '?shot=pause'],
  ['dawn', '?shot=dawn'],
];
for (const [name, q] of shots) {
  const file = join(outDir, `${name}.png`);
  const r = spawnSync(browser, [
    '--headless=new',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    '--window-size=1280,720',
    '--virtual-time-budget=4000',
    `--screenshot=${file}`,
    page + q,
  ], { encoding: 'utf8', timeout: 60000 });
  console.log(`${existsSync(file) ? 'ok  ' : 'FAIL'} ${name} -> ${file}${r.status ? ' (exit ' + r.status + ')' : ''}`);
}
