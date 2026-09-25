#!/usr/bin/env node
/**
 * Download speaker portraits and manual-author avatars from randomuser.me.
 *
 *   node scripts/seed-media/fetch-portraits.mjs
 *
 * randomuser portraits are 128x128. The asset pipeline never upscales, so we store a 512x512
 * lanczos upscale (mild sharpen, JPEG q88) next to nothing else: seeds get usable 320/480 variants.
 * Indices are fixed so reruns give the same faces. Existing files are kept unless they duplicate
 * another face (randomuser serves some photos under several indices), then the next free index is used.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS, bytes, ensureDir, readManifest, rel, sharp, writeSection } from './lib/common.mjs';

const SPEAKERS = 40;
const AUTHORS = 12;
// Two disjoint index lists so authors never share a face with speakers.
const speakerIdx = Array.from({ length: SPEAKERS / 2 }, (_, i) => (i * 7 + 3) % 100); // 20 per gender
const authorIdx = Array.from({ length: AUTHORS / 2 }, (_, i) => (i * 7 + 3 + 50) % 100).filter(
  (n) => !speakerIdx.includes(n),
);
while (authorIdx.length < AUTHORS / 2) {
  const n = (authorIdx.at(-1) + 1) % 100;
  if (!speakerIdx.includes(n) && !authorIdx.includes(n)) authorIdx.push(n);
  else authorIdx.push((n + 1) % 100);
}

const used = { women: new Set(), men: new Set() };

// Kept files may have come from a fallback index (a duplicate was skipped), so remember the index
// each file was really downloaded from instead of reporting the planned one.
const prior = new Map();
for (const sec of ['speakers', 'authors']) {
  for (const it of readManifest()?.sections?.[sec]?.items ?? []) {
    const m = /\/portraits\/(women|men)\/(\d+)\.jpg$/.exec(it.source ?? '');
    if (m) prior.set(it.id, { gender: m[1], n: Number(m[2]) });
  }
}
const sigs = [];

/** 16x16 grayscale signature; randomuser serves the same photo under a few different indices. */
async function signature(buf) {
  return sharp(buf).resize(16, 16, { fit: 'fill' }).greyscale().raw().toBuffer();
}
function isDuplicate(sig) {
  return sigs.some((o) => {
    let d = 0;
    for (let k = 0; k < 256; k++) d += Math.abs(o[k] - sig[k]);
    return d / 256 < 12;
  });
}

async function download(gender, n) {
  const url = `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt === 4) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

/** Fetch index n (or the next free one if it duplicates a face we already have). Returns the index used. */
async function fetchOne(gender, n, out, id) {
  if (existsSync(out)) {
    const sig = await signature(readFileSync(out));
    if (!isDuplicate(sig)) {
      const had = prior.get(id);
      const idx = had?.gender === gender ? had.n : n;
      sigs.push(sig);
      used[gender].add(idx);
      return idx;
    }
    rmSync(out);
  }
  let idx = n;
  for (let guard = 0; guard < 100; guard++, idx = (idx + 1) % 100) {
    if (used[gender].has(idx) && idx !== n) continue;
    const raw = await download(gender, idx);
    const sig = await signature(raw);
    if (isDuplicate(sig)) continue;
    sigs.push(sig);
    used[gender].add(idx);
    const img = await sharp(raw).resize(512, 512, { kernel: 'lanczos3' }).sharpen({ sigma: 0.6 }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    writeFileSync(out, img);
    return idx;
  }
  throw new Error(`no unique ${gender} portrait left`);
}

async function batch(kind, idx, count) {
  const dir = ensureDir(join(ASSETS, kind));
  const items = [];
  for (let i = 0; i < count; i++) {
    const gender = i % 2 === 0 ? 'women' : 'men';
    const planned = idx[Math.floor(i / 2)];
    const id = `${kind === 'speakers' ? 'speaker' : 'author'}-${String(i + 1).padStart(2, '0')}`;
    const file = join(dir, `${id}.jpg`);
    const n = await fetchOne(gender, planned, file, id);
    items.push({
      id,
      path: rel(file),
      type: 'image',
      mime: 'image/jpeg',
      width: 512,
      height: 512,
      bytes: bytes(file),
      gender: gender === 'women' ? 'female' : 'male',
      source: `https://randomuser.me/api/portraits/${gender}/${n}.jpg`,
      credit: 'randomuser.me',
      usage: kind === 'speakers' ? 'speaker avatar (speakers.avatarAssetId)' : 'manual publication author avatar (publication_authors.avatarAssetId)',
    });
  }
  return items;
}

const speakers = await batch('speakers', speakerIdx, SPEAKERS);
writeSection('speakers', {
  purpose: 'speaker-avatar',
  note: 'Square portraits. Upscaled 4x from 128px randomuser.me originals, so keep display size under ~256 CSS px. Alternate female/male; pick names that match `gender`.',
  credit: 'Portraits from randomuser.me (free for placeholder use).',
  items: speakers,
});
const authors = await batch('authors', authorIdx, AUTHORS);
writeSection('authors', {
  purpose: 'author-avatar',
  note: 'Avatars for manual (non-speaker) publication authors. Disjoint from speakers.',
  credit: 'Portraits from randomuser.me (free for placeholder use).',
  items: authors,
});
