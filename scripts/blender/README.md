# 3D props (Blender)

"Soft toy clay on white" props for the public site (DESIGN.md section 9). Output lives in
`apps/web/public/models/` (GLB + `manifest.json` + `previews/*.webp`).

| file | what |
|---|---|
| `zemi3d.py` | helpers: brand materials, lathe, rounded boxes, capsules, torus, 2D extrude, text, export + metadata, EEVEE preview render |
| `models.py` | one builder per model (`MODELS` map) |
| `build.py` | CLI entry: build, export raw GLB + `<id>.meta.json`, render preview PNG |
| `optimize.mjs` | gltf-transform (meshopt) into `apps/web/public/models`, checks names/pivots/size, writes `manifest.json`, publishes previews |
| `verify/check.mjs` | loads every GLB with three.js GLTFLoader + MeshoptDecoder in headless Chromium, poses the clock at 13:15, screenshots, checks origin/bbox |

## Rebuild

```sh
RAW=$TMPDIR/zemi-models/raw; PREV=$TMPDIR/zemi-models/preview
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python scripts/blender/build.py -- --out $RAW --preview $PREV            # all models (about 1 min)
# or a subset: ... -- --out $RAW --preview $PREV wall-clock laptop
node scripts/blender/optimize.mjs --raw $RAW --previews $PREV              # compress + manifest
node scripts/blender/verify/check.mjs $TMPDIR/zemi-models/check.png        # optional three.js check
```

Needs Blender 5.x (tested 5.2.2), Node 24, network for the first `npx @gltf-transform/cli@4.5.0`,
and the Recursive display instance from `scripts/brand/outline_text.py` (the idea bubble's "?").

## Conventions

- Blender Z up, front faces -Y. Exported glTF: +Y up, front +Z, 1 unit = 1 m.
- `normalize()` puts every model's bbox on y=0 and centers it in x/z, so the glTF origin is the bottom center.
- Materials are Principled BSDF with coat + sheen, exported as `KHR_materials_clearcoat` / `KHR_materials_sheen`.
  Material names are the palette names (`clay`, `ink`, `blue`, ...), so the web can swap them by name.
- Anything the web animates is a transform-only pivot empty with the mesh as a child
  (`hour_hand` / `hour_hand_mesh`, `minute_hand` / `minute_hand_mesh`, `lid_hinge`, `mic_head`, `plane_body`).
  Meshopt quantization may fold a dequantization offset into mesh nodes, never into these pivots.
  `optimize.mjs` fails if a pivot's TRS changes or a named node disappears.
- `optimize` runs with `--join false --flatten false --instance false --palette false --simplify false`
  so mesh names and hierarchy survive.
