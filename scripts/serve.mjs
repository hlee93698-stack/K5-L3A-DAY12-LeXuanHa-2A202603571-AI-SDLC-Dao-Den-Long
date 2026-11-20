// `npm start`: serve dist/web on http://localhost:5173 (no dependencies) and try to open a browser.
// Leaderboard: GET/POST /api/leaderboard <-> data/leaderboard.json.
// `npm start -- --export-leaderboard out.json` writes {"entries":[...]} and exits.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { exec } from 'node:child_process';

const LB_FILE = join(process.cwd(), 'data', 'leaderboard.json');
const NAME_RE = /^[A-Za-z0-9_]{3,12}$/;

function readLB() {
  try {
    const d = JSON.parse(readFileSync(LB_FILE, 'utf8'));
    return Array.isArray(d.entries) ? d.entries : [];
  } catch {
    return [];
  }
}
function cleanEntries(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') return null;
    const { name, score, nights_won, achieved_at, seed } = e;
    if (typeof name !== 'string' || !NAME_RE.test(name)) return null;
    if (!Number.isInteger(score) || score < 0) return null;
    if (!Number.isInteger(nights_won) || nights_won < 0 || nights_won > 3) return null;
    if (typeof achieved_at !== 'string' || Number.isNaN(Date.parse(achieved_at))) return null;
    if (!Number.isInteger(seed)) return null;
    out.push({ name, score, nights_won, achieved_at, seed });
  }
  out.sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at));
  return out.slice(0, 10);
}
function writeLB(entries) {
  mkdirSync(dirname(LB_FILE), { recursive: true });
  writeFileSync(LB_FILE, JSON.stringify({ entries }, null, 2) + '\n');
}

const exportIdx = process.argv.indexOf('--export-leaderboard');
if (exportIdx >= 0) {
  const out = process.argv[exportIdx + 1];
  if (!out) {
    console.error('usage: npm start -- --export-leaderboard <out.json>');
    process.exit(1);
  }
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify({ entries: readLB() }, null, 2) + '\n');
  console.log(`leaderboard exported to ${out}`);
  process.exit(0);
}

const root = join(process.cwd(), 'dist', 'web');
if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/web not found. Run: npm run build');
  process.exit(1);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const port = Number(process.env.PORT) || 5173;

createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/api/leaderboard') {
    const json = (code, body) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    if (req.method === 'GET') return json(200, { entries: readLB() });
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 16384) req.destroy();
      });
      req.on('end', () => {
        let entries = null;
        try { entries = cleanEntries(JSON.parse(body).entries); } catch {}
        if (!entries) return json(400, { error: 'invalid leaderboard' });
        writeLB(entries);
        json(200, { entries });
      });
      return;
    }
    return res.writeHead(405).end();
  }
  const file = normalize(join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`Dao Den Long running at ${url}  (Ctrl+C to stop)`);
  if (process.env.NO_OPEN) return;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${cmd} ${url}`, () => {});
});
