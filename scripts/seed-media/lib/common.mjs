/**
 * Shared helpers for the seed-media generators.
 *
 * - `sharp` is borrowed from apps/api (already a dependency there), so nothing new is installed.
 * - Every generator owns one section of apps/api/seed/assets/manifest.json and rewrites only that
 *   section, so the scripts can be re-run in any order.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const ASSETS = join(REPO, 'apps', 'api', 'seed', 'assets');
export const MANIFEST = join(ASSETS, 'manifest.json');

const requireFromApi = createRequire(join(REPO, 'apps', 'api', 'package.json'));
/** @type {import('sharp')} */
export const sharp = requireFromApi('sharp');

export const BRAND = {
  blue: '#3a6dc5',
  red: '#f94141',
  yellow: '#f7bf33',
  green: '#0f8657',
  ink: '#0e1116',
  ink2: '#3b4150',
  ink3: '#6b7280',
  ink4: '#9aa1ad',
  paper: '#ffffff',
  muted: '#f7f7f5',
  line: '#ececea',
  lineStrong: '#d8d8d2',
  graph: '#eef1f6',
  blue50: '#ecf1fa',
  yellow50: '#fef6e0',
  red50: '#fee5e5',
  green50: '#e2f1ea',
  blue600: '#2f5aa6',
  red600: '#d92f2f',
  green600: '#0b6b45',
  yellow600: '#d99e12',
};

/** Shapes normalized to a 46x46 box (copied from packages/shared/src/brand.ts SHAPE_PATHS_46). */
export const SHAPES_46 = {
  circle: 'M23 0 A23 23 0 1 1 22.99 0 Z',
  triangle: 'M19.76 7.2 Q23 1 26.24 7.2L42.76 38.8 Q46 45 39 45L7 45 Q0 45 3.24 38.8 Z',
  square: 'M10 0 H36 Q46 0 46 10 V36 Q46 46 36 46 H10 Q0 46 0 36 V10 Q0 0 10 0 Z',
  arch: 'M0 46 V23 A23 23 0 0 1 46 23 V46 Z',
};
export const SHAPE_COLOR = { circle: BRAND.blue, triangle: BRAND.red, square: BRAND.yellow, arch: BRAND.green };
export const ACCENT_OF_COLOR = { [BRAND.blue]: 'blue', [BRAND.red]: 'red', [BRAND.yellow]: 'yellow', [BRAND.green]: 'green' };

/** Small deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle: (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}

export function rel(p) {
  return relative(ASSETS, p).split('\\').join('/');
}

export function bytes(p) {
  return statSync(p).size;
}

export function ffprobeDuration(p) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p], {
    encoding: 'utf8',
  });
  return Math.round(Number(r.stdout.trim()) * 100) / 100;
}

export function readManifest() {
  if (!existsSync(MANIFEST)) return null;
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    return null;
  }
}

const SECTION_ORDER = ['speakers', 'authors', 'covers', 'pubCovers', 'docs', 'pdfs', 'videos', 'recordings'];

/** Replace one section of the manifest and recompute the totals. */
export function writeSection(name, section) {
  const m = readManifest() ?? {};
  const sections = { ...(m.sections ?? {}), [name]: section };
  const ordered = {};
  for (const k of [...SECTION_ORDER, ...Object.keys(sections)]) if (sections[k] && !ordered[k]) ordered[k] = sections[k];
  let totalBytes = 0;
  let files = 0;
  for (const s of Object.values(ordered)) {
    for (const it of s.items ?? []) {
      totalBytes += it.bytes ?? 0;
      files++;
    }
  }
  const out = {
    version: 1,
    description:
      'Seed media for Zemi. Paths are relative to this folder. Upload them through the normal asset pipeline (POST /admin/assets or the storage service) so variants, lqip and color are generated.',
    generatedBy: 'scripts/seed-media (see scripts/seed-media/README.md)',
    totals: { files, bytes: totalBytes, megabytes: Math.round((totalBytes / 1048576) * 10) / 10 },
    sections: ordered,
  };
  writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + '\n');
  console.log(`manifest: ${name} = ${section.items?.length ?? 0} item(s); total ${out.totals.megabytes} MB`);
}

/** Build a contact sheet PNG from a list of image paths. */
export async function contactSheet(files, out, { cols = 6, cell = 260, aspect = 1.25, gap = 12, bg = '#ffffff' } = {}) {
  const w = cell;
  const h = Math.round(cell * aspect);
  const rows = Math.ceil(files.length / cols);
  const W = cols * w + (cols + 1) * gap;
  const H = rows * h + (rows + 1) * gap;
  const composites = await Promise.all(
    files.map(async (f, i) => ({
      input: await sharp(f).resize(w, h, { fit: 'cover' }).toBuffer(),
      left: gap + (i % cols) * (w + gap),
      top: gap + Math.floor(i / cols) * (h + gap),
    })),
  );
  ensureDir(dirname(out));
  await sharp({ create: { width: W, height: H, channels: 3, background: bg } })
    .composite(composites)
    .png()
    .toFile(out);
  return out;
}

export function scratch(...p) {
  const base = process.env.ZEMI_SCRATCH ?? join(tmpdir(), 'zemi-seed-media');
  return join(base, ...p);
}
