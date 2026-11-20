// FPS benchmark of the real game at 1280x720 (Night 3, the heaviest map), real time.
// usage: npm run build && node scripts/bench-fps.mjs [seconds=15] [--headful]
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

const secs = Number(process.argv.find((a) => /^\d+$/.test(a)) || 15);
const headful = process.argv.includes('--headful');
const browserPath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
if (!browserPath) throw new Error('No Chrome/Edge found. Set CHROME_PATH.');

const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: !headful,
  args: ['--window-size=1280,720', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve('dist/web/index.html')).href + '?shot=bench');
await new Promise((r) => setTimeout(r, secs * 1000));
const fps = await page.evaluate(() => window.__fps || []);
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
await browser.close();

const samples = fps.slice(2); // drop warm-up seconds
const avg = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
const min = Math.min(...samples);
const md = [
  '# FPS benchmark (Ticket-02: >= 30 FPS average at 1280x720)',
  '',
  `- Scene: Night 3 (Đảo Chuông, heaviest map), \`?shot=bench\`, ${samples.length} one-second samples after 2 s warm-up`,
  `- Mode: ${headful ? 'headful' : 'headless'} ${browserPath.split(/[\\/]/).pop()}, viewport 1280x720`,
  `- GPU/renderer: ${gpu}`,
  `- Machine: ${os.cpus()[0].model}, ${os.cpus().length} threads, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, ${os.platform()} ${os.release()}`,
  '',
  `**Average: ${avg.toFixed(1)} FPS · minimum 1 s sample: ${min.toFixed(1)} FPS · result: ${avg >= 30 ? 'PASS' : 'NOT MET'}**`,
  '',
  `Samples: ${samples.map((x) => x.toFixed(0)).join(', ')}`,
  '',
].join('\n');
mkdirSync('docs/proof/phase-2', { recursive: true });
writeFileSync('docs/proof/phase-2/fps.md', md);
console.log(md);
