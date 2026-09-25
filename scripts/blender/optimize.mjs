#!/usr/bin/env node
/**
 * Compress the raw Blender GLBs into apps/web/public/models and write models/manifest.json.
 *
 *   node scripts/blender/optimize.mjs --raw <raw_dir> [--previews <png_dir>] [--out apps/web/public/models]
 *
 * With --previews, the Blender preview PNGs are also published as models/previews/<id>.webp
 * (white background, soft contact shadow): use them as the no-WebGL / reduced-motion still.
 *
 * gltf-transform optimize runs with meshopt compression but WITHOUT join/flatten/instance/palette,
 * so every named mesh and the pivot empties (clock hands, laptop hinge) survive. After compressing
 * we parse the GLB JSON chunk and fail loudly if a pivot moved or a named node disappeared.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const raw = resolve(arg('raw', ''));
const out = resolve(arg('out', join(REPO, 'apps', 'web', 'public', 'models')));
const GLTF_TRANSFORM = '@gltf-transform/cli@4.5.0';
const LIMIT = 300 * 1024;
const previews = arg('previews', '') ? resolve(arg('previews', '')) : null;
const sharp = createRequire(join(REPO, 'apps', 'api', 'package.json'))('sharp');

if (!raw || !existsSync(raw)) {
  console.error('usage: optimize.mjs --raw <dir with *.glb and *.meta.json>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

/** Read the JSON chunk of a GLB. */
export function readGlbJson(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const len = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${file}: first chunk is not JSON`);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

function nodeInfo(json) {
  const parents = new Map();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parents.set(c, i)));
  return json.nodes.map((n, i) => ({
    index: i,
    name: n.name,
    mesh: n.mesh,
    parent: parents.has(i) ? json.nodes[parents.get(i)].name : null,
    translation: n.translation ?? [0, 0, 0],
    rotation: n.rotation ?? [0, 0, 0, 1],
    scale: n.scale ?? [1, 1, 1],
    matrix: n.matrix,
  }));
}

const close = (a, b, eps = 2e-4) => a.every((v, i) => Math.abs(v - b[i]) <= eps);

const models = [];
let failed = false;
for (const file of readdirSync(raw).filter((f) => f.endsWith('.glb')).sort()) {
  const name = file.replace(/\.glb$/, '');
  const src = join(raw, file);
  const dst = join(out, file);
  const meta = JSON.parse(readFileSync(join(raw, `${name}.meta.json`), 'utf8'));
  const r = spawnSync(
    'npx',
    [
      '--yes', GLTF_TRANSFORM, 'optimize', src, dst,
      '--compress', 'meshopt', '--meshopt-level', 'high',
      '--flatten', 'false', '--join', 'false', '--instance', 'false', '--palette', 'false',
      '--simplify', 'false', '--texture-compress', 'false',
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`gltf-transform failed for ${name}`);
  }
  const json = readGlbJson(dst);
  const before = nodeInfo(readGlbJson(src));
  const after = nodeInfo(json);
  const problems = [];
  // every named node must survive with the same parent
  for (const b of before) {
    const a = after.find((n) => n.name === b.name);
    if (!a) problems.push(`node "${b.name}" disappeared`);
    else if (a.parent !== b.parent) problems.push(`node "${b.name}" parent ${b.parent} -> ${a.parent}`);
  }
  // pivot empties must keep their exact transform (they are what the web rotates)
  for (const pivot of Object.keys(meta.pivots ?? {})) {
    const a = after.find((n) => n.name === pivot);
    const b = before.find((n) => n.name === pivot);
    if (!a || !b) continue;
    if (a.mesh !== undefined) problems.push(`pivot "${pivot}" gained a mesh`);
    if (!close(a.translation, b.translation) || !close(a.rotation, b.rotation) || !close(a.scale, b.scale))
      problems.push(`pivot "${pivot}" transform changed`);
  }
  let preview;
  if (previews && existsSync(join(previews, `${name}.png`))) {
    mkdirSync(join(out, 'previews'), { recursive: true });
    await sharp(join(previews, `${name}.png`)).resize(800, 800).webp({ quality: 84 }).toFile(join(out, 'previews', `${name}.webp`));
    preview = `/models/previews/${name}.webp`;
  } else if (existsSync(join(out, 'previews', `${name}.webp`))) {
    preview = `/models/previews/${name}.webp`;
  }
  const bytes = statSync(dst).size;
  if (bytes > LIMIT) problems.push(`${Math.round(bytes / 1024)} KB is over the 300 KB budget`);
  if (problems.length) {
    failed = true;
    console.error(`FAIL ${name}: ${problems.join('; ')}`);
  }
  const meshNodes = after.filter((n) => n.mesh !== undefined).map((n) => n.name).sort();
  const pivots = Object.fromEntries(
    Object.entries(meta.pivots ?? {}).map(([k, v]) => {
      const a = after.find((n) => n.name === k);
      return [k, { position: v.position, rotation: a?.rotation ?? [0, 0, 0, 1], parent: a?.parent ?? null }];
    }),
  );
  models.push({
    id: name,
    title: meta.title,
    file: `/models/${file}`,
    preview,
    bytes,
    kilobytes: Math.round((bytes / 1024) * 10) / 10,
    rawBytes: statSync(src).size,
    triangles: meta.triangles,
    rootNode: before.find((n) => n.parent === null)?.name,
    meshes: meshNodes,
    gltfMeshNames: (json.meshes ?? []).map((m) => m.name).sort(),
    nodes: after.map((n) => n.name).sort(),
    materials: (json.materials ?? []).map((m) => m.name).sort(),
    pivots,
    bbox: meta.bbox,
    extensionsRequired: json.extensionsRequired ?? [],
    extensionsUsed: json.extensionsUsed ?? [],
    notes: meta.notes,
    ...(meta.hands ? { hands: meta.hands } : {}),
    ...(meta.hinge ? { hinge: meta.hinge } : {}),
  });
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name.padEnd(14)} ${String(Math.round(bytes / 1024)).padStart(4)} KB  (raw ${Math.round(statSync(src).size / 1024)} KB)  ${meshNodes.length} meshes`);
}

// Merge with an existing manifest so rebuilding one model keeps the others.
const manifestPath = join(out, 'manifest.json');
let previous = [];
if (existsSync(manifestPath)) {
  try {
    previous = JSON.parse(readFileSync(manifestPath, 'utf8')).models ?? [];
  } catch {
    previous = [];
  }
}
const merged = [...previous.filter((p) => !models.some((m) => m.id === p.id)), ...models].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      version: 1,
      description:
        'Zemi 3D props ("soft toy clay on white"). glTF 2.0 binary, +Y up, 1 unit = 1 m, origin at the bottom center of each model, front faces +Z. Meshopt compressed: load with a MeshoptDecoder (drei useGLTF does this by default).',
      units: 'meters',
      up: '+Y',
      front: '+Z',
      compression: 'EXT_meshopt_compression + KHR_mesh_quantization',
      palette: { clay: '#f4f4f2', paper: '#fbfbf8', ink: '#0e1116', blue: '#3a6dc5', red: '#f94141', yellow: '#f7bf33', green: '#0f8657' },
      generatedBy: 'scripts/blender/build.py + scripts/blender/optimize.mjs',
      models: merged,
    },
    null,
    2,
  ) + '\n',
);
console.log(`wrote ${manifestPath}`);
process.exit(failed ? 1 : 0);
