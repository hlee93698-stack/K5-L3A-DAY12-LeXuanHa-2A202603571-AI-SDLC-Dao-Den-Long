// Build: headless CLI (node, single file) + web game (static folder, opens from file:// too).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/web', { recursive: true });

await build({
  entryPoints: ['src/cli/headless.ts'],
  outfile: 'dist/headless.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  logLevel: 'warning',
});

await build({
  entryPoints: ['src/web/main.ts'],
  outfile: 'dist/web/main.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  minify: true,
  logLevel: 'warning',
});
copyFileSync('src/web/index.html', 'dist/web/index.html');
console.log('built dist/headless.cjs and dist/web/');
