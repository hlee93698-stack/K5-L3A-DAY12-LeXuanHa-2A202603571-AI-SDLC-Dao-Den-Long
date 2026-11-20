// Contract v1.3 bench_cmd: node scripts/bench.mjs --seed 42 --duration 30 --out bench.json [--headful]
// Opens dist/web in Chrome/Edge at ?bench=1 (Night 1, 200 shades, 100 motes, 3 lit lanterns, orbit camera),
// waits for 3 s warm-up + duration, writes bench.json. Exit 0 on success, 1 on error.
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

const t0 = Date.now();
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const seed = Number(opt('seed', '42'));
const duration = Number(opt('duration', '30'));
const out = opt('out', 'bench.json');
const headful = argv.includes('--headful');
if (!Number.isInteger(seed) || !(duration > 0)) {
  console.error('usage: node scripts/bench.mjs --seed <int> --duration <s> --out <file.json>');
  process.exit(1);
}
const page_html = resolve('dist/web/index.html');
if (!existsSync(page_html)) {
  console.error('dist/web not found. Run: npm run build');
  process.exit(1);
}
const browserPath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
if (!browserPath) {
  console.error('No Chrome/Edge found. Set CHROME_PATH.');
  process.exit(1);
}

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: !headful,
    args: ['--window-size=1280,720', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  await page.goto(`${pathToFileURL(page_html).href}?bench=1&seed=${seed}&duration=${duration}`);
  await page.waitForFunction(() => window.__benchReady === true, { timeout: 60000, polling: 50 });
  const load_ms = Date.now() - t0;

  // Wait inside the page (one promise, no CDP round-trips while measuring): polling from Node stalls frames.
  await page.evaluate(
    (ms) => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('bench timed out')), ms);
      const check = () => (window.__benchDone ? (clearTimeout(t), res()) : setTimeout(check, 250));
      check();
    }),
    (duration + 60) * 1000,
  );
  const r = await page.evaluate(() => window.__benchResult);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const result = {
    contract_version: '1.3',
    seed,
    duration_s: duration,
    avg_fps: r.avg_fps,
    p1_low_fps: r.p1_low_fps,
    frame_ms_p95: r.frame_ms_p95,
    frames: r.frames,
    load_ms,
    // Ticket-04: peak_mem_mb = process RSS. A web build cannot read the browser's RSS from the page,
    // and sampling it from outside during the run would disturb the measurement -> null (see README).
    peak_mem_mb: null,
    js_heap_peak_mb: r.js_heap_peak_mb,
    vsync_off: true,
    resolution: '1280x720',
    renderer: `Three.js r170 / ${gpu}`,
    browser: browserPath.split(/[\\/]/).pop(),
    os: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
  };
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  const pass = result.avg_fps >= 60 && result.p1_low_fps >= 30 && result.load_ms <= 10000;
  console.log(`bench: avg ${result.avg_fps} FPS, 1% low ${result.p1_low_fps}, p95 ${result.frame_ms_p95} ms, load ${load_ms} ms, JS heap ${result.js_heap_peak_mb} MB — ${pass ? 'PASS' : 'BELOW TARGET'}`);
  await browser.close();
  process.exit(0);
} catch (e) {
  console.error(`bench error: ${e?.stack ?? e}`);
  await browser?.close().catch(() => {});
  process.exit(1);
}
