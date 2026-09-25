#!/usr/bin/env node
/**
 * Render the static brand files into apps/web/public/brand (+ apps/web/public/manifest.webmanifest).
 *
 *   uv run --no-project --with fonttools --with uharfbuzz python scripts/brand/outline_text.py   # once, outlines text
 *   pnpm --filter @zemi/shared build                                                           # mark geometry
 *   node scripts/brand/render.mjs [--preview <dir>]
 *
 * Geometry comes from packages/shared/dist/brand.js, text comes from scripts/brand/build/text-paths.json
 * (Recursive outlined to paths), so nothing depends on fonts installed on this machine.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(REPO, 'apps', 'web', 'public', 'brand');
const sharp = createRequire(join(REPO, 'apps', 'api', 'package.json'))('sharp');
const { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46 } = await import(
  pathToFileURL(join(REPO, 'packages', 'shared', 'dist', 'brand.js')).href
);
const { runs } = JSON.parse(readFileSync(join(REPO, 'scripts', 'brand', 'build', 'text-paths.json'), 'utf8'));
const run = (id) => runs.find((r) => r.id === id);
const args = process.argv.slice(2);
const previewDir = args.includes('--preview') ? resolve(args[args.indexOf('--preview') + 1]) : null;

const INK = '#0e1116';
const PAPER = '#ffffff';
const GRAPH = '#eef1f6';
mkdirSync(OUT, { recursive: true });
const written = [];
const save = (name, data) => {
  writeFileSync(join(OUT, name), data);
  written.push(name);
};
const n = (v) => Number(v.toFixed(2));

// ------------------------------------------------------------------ mark

const toneFill = (tone, s) => (tone === 'color' ? SHAPE_COLORS[s] : tone === 'ink' ? INK : PAPER);
/** Mark paths as SVG elements inside a 100x100 box. */
const markGroup = (tone = 'color') => SHAPE_ORDER.map((s) => `<path d="${MARK_PATHS[s]}" fill="${toneFill(tone, s)}"/>`).join('');
const markSvg = (tone, title = 'Zemi') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-label="${title}"><title>${title}</title>${markGroup(tone)}</svg>\n`;

save('mark.svg', markSvg('color'));
save('mark-ink.svg', markSvg('ink'));
save('mark-paper.svg', markSvg('paper'));
save('favicon.svg', markSvg('color'));

// ------------------------------------------------------------------ wordmark "zemı" + idea dot

const wm = run('wordmark');
const dot = wm.ideaDot;
const DOT_D = n(dot.w * 0.82); // the blue circle, a touch smaller than Recursive's casual dot
const dotCx = dot.cx;
const dotCy = n(dot.cy + 14);
const glyphBounds = wm.glyphs.filter((g) => g.bounds).map((g) => g.bounds);
const WM = {
  x0: wm.inkMinX,
  x1: Math.max(wm.inkMaxX, dotCx + DOT_D / 2),
  top: Math.min(-Math.max(...glyphBounds.map((b) => b[3])), dotCy - DOT_D / 2),
  bottom: -Math.min(...glyphBounds.map((b) => b[1])),
};
WM.w = WM.x1 - WM.x0;
WM.h = WM.bottom - WM.top;
const circle46 = SHAPE_PATHS_46.circle;
/** Wordmark as a group in font units (baseline at y=0, origin at run start). */
const wordmarkGroup = (ink = INK, dotColor = SHAPE_COLORS.circle) =>
  `<path d="${wm.d}" fill="${ink}"/>` +
  `<path d="${circle46}" fill="${dotColor}" transform="translate(${n(dotCx - DOT_D / 2)} ${n(dotCy - DOT_D / 2)}) scale(${n(DOT_D / 46)})"/>`;

const wordmarkSvg = (ink, dotColor, title = 'zemi') => {
  const pad = 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(WM.x0 - pad)} ${n(WM.top - pad)} ${n(WM.w + 2 * pad)} ${n(WM.h + 2 * pad)}" width="${n(WM.w / 10)}" height="${n(WM.h / 10)}" role="img" aria-label="${title}"><title>${title}</title>${wordmarkGroup(ink, dotColor)}</svg>\n`;
};
save('wordmark.svg', wordmarkSvg(INK, SHAPE_COLORS.circle));
save('wordmark-paper.svg', wordmarkSvg(PAPER, SHAPE_COLORS.circle));
save('wordmark-currentcolor.svg', wordmarkSvg('currentColor', SHAPE_COLORS.circle));

// ------------------------------------------------------------------ lockup: mark + wordmark

// Mark height matches the wordmark from baseline to the top of the idea dot; gap = 0.3 mark.
const LOCK = (() => {
  const markH = -WM.top; // baseline (0) to top
  const s = markH / 100;
  const gap = markH * 0.3;
  const wx = markH + gap - WM.x0; // wordmark translate
  return { markH, s, gap, wx, w: markH + gap + WM.w, top: WM.top, h: WM.h };
})();
const lockupGroup = (tone = 'color', ink = INK) =>
  `<g transform="translate(0 ${n(LOCK.top)}) scale(${n(LOCK.s)})">${markGroup(tone)}</g>` +
  `<g transform="translate(${n(LOCK.wx)} 0)">${wordmarkGroup(ink, tone === 'paper' ? PAPER : SHAPE_COLORS.circle)}</g>`;
const lockupSvg = (tone, ink) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${n(LOCK.top)} ${n(LOCK.w)} ${n(LOCK.h)}" width="${n(LOCK.w / 10)}" height="${n(LOCK.h / 10)}" role="img" aria-label="Zemi"><title>Zemi</title>${lockupGroup(tone, ink)}</svg>\n`;
save('lockup.svg', lockupSvg('color', INK));
save('lockup-paper.svg', lockupSvg('color', PAPER));

// ------------------------------------------------------------------ raster helpers

const svgDoc = (w, h, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`;
const png = (svg, density = 72) => sharp(Buffer.from(svg), { density }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
/** Supersample (density > 72) for smooth edges, then land on exact pixel dimensions. */
const pngAt = async (svg, w, h, density = 216) =>
  sharp(await png(svg, density)).resize(w, h, { kernel: 'lanczos3' }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
/** Mark of `size` px centered in a `box` px square. */
const markAt = (box, size, tone = 'color') => {
  const o = (box - size) / 2;
  return `<g transform="translate(${n(o)} ${n(o)}) scale(${n(size / 100)})">${markGroup(tone)}</g>`;
};

// favicons (transparent), PWA icons (opaque white), apple touch, maskable
for (const [name, box, size, bg] of [
  ['icon-32.png', 32, 30, null],
  ['icon-192.png', 192, 150, PAPER],
  ['icon-512.png', 512, 400, PAPER],
  ['apple-touch-icon.png', 180, 132, PAPER],
  // maskable: full-bleed white, mark inside the 80% safe circle (side * sqrt2 <= 0.8 * 512)
  ['maskable-512.png', 512, 272, PAPER],
]) {
  let buf = await png(svgDoc(box, box, markAt(box, size), bg), 72 * 4);
  buf = await sharp(buf).resize(box, box).png({ compressionLevel: 9 }).toBuffer();
  save(name, buf);
}

// favicon.ico with 32 and 48 px PNG entries (ICO container written by hand)
{
  const entries = [];
  for (const [box, size] of [
    [32, 30],
    [48, 44],
  ]) {
    const buf = await sharp(await png(svgDoc(box, box, markAt(box, size), null), 72 * 4))
      .resize(box, box)
      .png({ compressionLevel: 9 })
      .toBuffer();
    entries.push({ box, buf });
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.box === 256 ? 0 : e.box, o);
    dir.writeUInt8(e.box === 256 ? 0 : e.box, o + 1);
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(e.buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.buf.length;
  });
  save('favicon.ico', Buffer.concat([header, dir, ...entries.map((e) => e.buf)]));
}

// email logo: lockup on white, 720x160 (displays at 360x80)
{
  const W = 720;
  const H = 160;
  const padY = 34;
  const s = (H - 2 * padY) / LOCK.h;
  const w = LOCK.w * s;
  const x = (W - w) / 2;
  const body = `<g transform="translate(${n(x)} ${n(padY - LOCK.top * s)}) scale(${s.toFixed(5)})">${lockupGroup('color', INK)}</g>`;
  save('email-logo.png', await pngAt(svgDoc(W, H, body, PAPER), W, H));
  save('email-mark.png', await pngAt(svgDoc(96, 96, markAt(96, 76), PAPER), 96, 96));
}

// Open Graph default: white, graph paper, mark, big wordmark, the Friday line
{
  const W = 1200;
  const H = 630;
  const grid = [];
  for (let x = 24; x < W; x += 24) grid.push(`M${x} 0V${H}`);
  for (let y = 24; y < H; y += 24) grid.push(`M0 ${y}H${W}`);
  const text = (id, x, baseline, px, fill) => {
    const r = run(id);
    const s = px / r.upem;
    return `<path d="${r.d}" fill="${fill}" transform="translate(${n(x - r.inkMinX * s)} ${baseline}) scale(${s.toFixed(5)})"/>`;
  };
  const M = 72; // margin, 3 grid cells
  const wmScale = 0.255;
  const wmBaseline = 312;
  const body = [
    `<defs><radialGradient id="fade" cx="0.72" cy="0.38" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.85"/></radialGradient></defs>`,
    `<path d="${grid.join('')}" stroke="${GRAPH}" stroke-width="1.5" fill="none"/>`,
    `<rect width="${W}" height="${H}" fill="url(#fade)"/>`,
    text('og-label', M, 104, 17, '#6b7280'),
    `<g transform="translate(${n(M - WM.x0 * wmScale)} ${wmBaseline}) scale(${wmScale})">${wordmarkGroup(INK, SHAPE_COLORS.circle)}</g>`,
    text('og-line-1', M, 436, 34, '#2f5aa6'),
    text('og-line-2', M, 518, 57, INK),
    `<g transform="translate(${W - M - 264} 96) scale(2.64)">${markGroup('color')}</g>`,
  ].join('');
  save('og-default.png', await pngAt(svgDoc(W, H, body, PAPER), W, H, 144));
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true });
    writeFileSync(join(previewDir, 'og-default.svg'), svgDoc(W, H, body, PAPER));
  }
}

// ------------------------------------------------------------------ web app manifest

const manifest = {
  name: 'Zemi',
  short_name: 'Zemi',
  description: 'Weekly Friday research seminar by MGM Laboratory. Fridays, 13:15 WIB.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/brand/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: '/brand/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
};
writeFileSync(join(REPO, 'apps', 'web', 'public', 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

// ------------------------------------------------------------------ preview sheet
if (previewDir) {
  mkdirSync(previewDir, { recursive: true });
  const tiles = [];
  const add = async (file, w, h, bg = '#ffffff') => {
    const input = await sharp(join(OUT, file), { density: 300 }).resize(w, h, { fit: 'contain', background: bg }).flatten({ background: bg }).png().toBuffer();
    tiles.push({ input, w, h });
  };
  await add('og-default.png', 1200, 630);
  await add('lockup.svg', 600, 150);
  await add('lockup-paper.svg', 600, 150, INK);
  await add('wordmark.svg', 400, 150);
  await add('mark.svg', 150, 150);
  await add('mark-ink.svg', 150, 150);
  await add('mark-paper.svg', 150, 150, INK);
  await add('email-logo.png', 720, 160, '#f7f7f5');
  await add('email-mark.png', 96, 96, '#f7f7f5');
  await add('apple-touch-icon.png', 180, 180, '#d8d8d2');
  await add('maskable-512.png', 256, 256, '#d8d8d2');
  await add('icon-512.png', 256, 256, '#d8d8d2');
  await add('icon-32.png', 32, 32);
  const W = 1240;
  let x = 20;
  let y = 20;
  let rowH = 0;
  const comps = [];
  for (const t of tiles) {
    if (x + t.w > W - 20) {
      x = 20;
      y += rowH + 20;
      rowH = 0;
    }
    comps.push({ input: t.input, left: x, top: y });
    x += t.w + 20;
    rowH = Math.max(rowH, t.h);
  }
  await sharp({ create: { width: W, height: y + rowH + 20, channels: 3, background: '#e9e9e6' } })
    .composite(comps)
    .png()
    .toFile(join(previewDir, 'brand-sheet.png'));
  console.log(`preview: ${join(previewDir, 'brand-sheet.png')}`);
}
console.log(`wrote ${written.length} files to apps/web/public/brand and apps/web/public/manifest.webmanifest`);
