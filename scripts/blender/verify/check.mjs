#!/usr/bin/env node
/**
 * Load every GLB in apps/web/public/models with three.js GLTFLoader + MeshoptDecoder in headless
 * Chromium, pose the clock at 13:15, and save a screenshot grid. Also prints origin/bbox checks.
 *
 *   node scripts/blender/verify/check.mjs [out.png]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = resolve(process.argv[2] ?? join(tmpdir(), 'zemi-models-check.png'));
const { chromium } = createRequire(join(REPO, 'package.json'))('@playwright/test');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = url === '/' ? join(REPO, 'scripts/blender/verify/index.html') : join(REPO, url);
  if (!file.startsWith(REPO) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1110, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${port}/`);
await page.waitForSelector('body[data-done="1"]', { timeout: 120000 });
const report = await page.evaluate(() => window.__report);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
server.close();
let bad = errors.length > 0;
for (const r of report) {
  const ok = Math.abs(r.minY) < 1e-3 && Math.abs(r.cx) < 2e-3 && Math.abs(r.cz) < 2e-3 && r.hasAll;
  if (!ok) bad = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.id.padEnd(14)} minY=${r.minY.toFixed(4)} center=(${r.cx.toFixed(4)}, ${r.cz.toFixed(4)}) size=${r.size.map((v) => v.toFixed(3)).join('x')} nodes=${r.hasAll ? 'all' : 'MISSING'}`);
}
if (errors.length) console.error(errors.join('\n'));
console.log(`screenshot: ${out}`);
process.exit(bad ? 1 : 0);
