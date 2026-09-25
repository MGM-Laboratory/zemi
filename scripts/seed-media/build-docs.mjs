#!/usr/bin/env node
/**
 * Turn the raw AI documentation photos into seed JPEGs + manifest entries.
 *
 *   node scripts/seed-media/build-docs.mjs [--raw <dir>] [--sheet <png>]
 *
 * Raw PNGs come from gen-docs-photos.mjs (default dir: $TMPDIR/zemi-seed-media/docs-raw).
 * Output: apps/api/seed/assets/docs/doc-XX.jpg (native 1536x1024, mozjpeg q84, sRGB, no metadata).
 */
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, bytes, contactSheet, ensureDir, rel, sharp, writeSection } from './lib/common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const raw = arg('raw', join(tmpdir(), 'zemi-seed-media', 'docs-raw'));
const sheet = arg('sheet', join(raw, 'contact-sheet.png'));
const { shots } = JSON.parse(readFileSync(join(here, 'docs-prompts.json'), 'utf8'));
const out = ensureDir(join(ASSETS, 'docs'));

const items = [];
const missing = [];
for (const s of shots) {
  const src = join(raw, `${s.id}.png`);
  const dst = join(out, `${s.id}.jpg`);
  if (!existsSync(src)) {
    if (!existsSync(dst)) missing.push(s.id);
  } else {
    await sharp(src).toColourspace('srgb').jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: '4:2:0' }).toFile(dst);
  }
  if (!existsSync(dst)) continue;
  const meta = await sharp(dst).metadata();
  items.push({
    id: s.id,
    path: rel(dst),
    type: 'image',
    mime: 'image/jpeg',
    width: meta.width,
    height: meta.height,
    bytes: bytes(dst),
    scene: s.scene,
    alt: s.alt,
    usage: 'event documentation (event_media), about page, home story beats',
    credit: 'AI-generated with the codex CLI image tool (not a real event)',
  });
}
if (missing.length) console.warn(`missing raw photos: ${missing.join(', ')} (run gen-docs-photos.mjs)`);
writeSection('docs', {
  purpose: 'documentation',
  note: 'Candid 3:2 photos of made-up Zemi sessions. AI-generated, so never present them as a specific real event. `alt` is ready to use as the asset alt text.',
  credit: 'AI-generated (codex CLI built-in image generation, ChatGPT account).',
  items,
});
await contactSheet(
  items.map((i) => join(ASSETS, i.path)),
  sheet,
  { cols: 6, cell: 300, aspect: 2 / 3 },
);
console.log(`contact sheet: ${sheet}`);
