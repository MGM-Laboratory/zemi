# Foundation: assets (3D props, brand files, seed media)

Owner: assets-3d. These are artifacts, not code. Every file can be regenerated from the scripts listed
below (see each folder's README for commands).

| area | output | regenerate with |
|---|---|---|
| 3D props | `apps/web/public/models/*.glb`, `models/manifest.json`, `models/previews/*.webp` | `scripts/blender/` |
| Brand files | `apps/web/public/brand/*`, `apps/web/public/manifest.webmanifest` | `scripts/brand/` |
| Seed media | `apps/api/seed/assets/**` + `apps/api/seed/assets/manifest.json` | `scripts/seed-media/` |

## 1. 3D props (`/models`)

All files are glTF 2.0 binary with +Y up, 1 unit = 1 m, origin at the **bottom center**, front facing **+Z**.
They're compressed with meshopt (`EXT_meshopt_compression` + `KHR_mesh_quantization`, both *required*)
and use `KHR_materials_clearcoat` / `KHR_materials_sheen`. No textures.

| id | KB | size (x, y, z) m | notable nodes |
|---|---|---|---|
| `seminar-table` | 61 | 1.10, 0.75, 1.10 | `table_top`, `table_column`, `table_foot` |
| `stool` | 44 | 0.36, 0.48, 0.36 | `stool_seat` (material `yellow`, recolor per accent), 4 legs, `stool_footrest` |
| `coffee-cup` | 68 | 0.16, 0.09, 0.15 | `cup`, `cup_handle`, `coffee`, `saucer` (blue) |
| `paper-stack` | 31 | 0.25, 0.07, 0.34 | `sheet_1..5`, `sheet_title`, `sheet_text`, `sheet_figure_*`, `binder_clip`, `clip_handle_a/b` |
| `paper-plane` | 17 | 0.32, 0.12, 0.22 | pivot `plane_body` (banked), `wing_left/right`, `keel`, `sticker_q`, `sticker_hunch`. Nose points +X |
| `microphone` | 50 | 0.13, 0.26, 0.16 | `mic_base`, `mic_stem`, pivot `mic_head` (tilted to +Z) with `mic_handle`, `mic_ring`, `mic_grille` |
| `wall-clock` | 84 | 0.32, 0.32, 0.05 | pivots **`hour_hand`**, **`minute_hand`**; markers are the four brand shapes at 12/3/6/9 |
| `laptop` | 58 | 0.31, 0.21, 0.27 | pivot **`lid_hinge`** with `laptop_lid`, `laptop_screen`, `screen_slide` (emissive), `slide_*` shapes |
| `idea-bubble` | 39 | 0.31, 0.33, 0.09 | `bubble` (blue), `question_mark` (white Recursive "?") |

`models/manifest.json` has per model: `file`, `preview`, `bytes`, `triangles`, `meshes`, `nodes`,
`materials`, `pivots` (position, rotation, parent), `bbox` (exact, from Blender, not the quantized accessors),
`extensionsRequired`, plus `hands` (clock) and `hinge` (laptop).

### Using them (R3F + drei)

drei's `useGLTF` enables the Meshopt decoder by default, so no extra setup is needed.

```tsx
import { useGLTF } from '@react-three/drei';

function WallClock({ h = 13, m = 15 }) {
  const { scene, nodes } = useGLTF('/models/wall-clock.glb');
  // Rotate the PIVOTS (empties), not the *_mesh nodes. 0 rad = 12 o'clock, negative = clockwise from the front.
  nodes.minute_hand.rotation.z = -(m / 60) * Math.PI * 2;
  nodes.hour_hand.rotation.z = -(((h % 12) + m / 60) / 12) * Math.PI * 2; // 13:15 => -0.6545
  return <primitive object={scene} />;
}
useGLTF.preload('/models/wall-clock.glb');
```

- **Clones:** `ModelProp` (and anything else that calls `scene.clone(true)`) renders a *clone*, so drei's
  `nodes.hour_hand` points at the cached original, not what's on screen. After cloning, look the pivot up on
  the clone: `clone.getObjectByName('hour_hand')`. It finds the pivot first, because the child mesh node is
  named `hour_hand_mesh`.
- **Clock naming:** the glTF *meshes* are named `hour_hand` / `minute_hand` (see `gltfMeshNames` in the
  manifest). They hang off *nodes* `hour_hand_mesh` / `minute_hand_mesh`, which sit under the pivot *nodes*
  `hour_hand` / `minute_hand`. drei's `nodes` map is keyed by node name, so `nodes.hour_hand` is the pivot.
- **Default pose:** the file ships at 12:00 (both hand pivots at rotation 0), so always set the hands.
  Only the preview webp is posed at 13:15.
- **Laptop lid:** `nodes.lid_hinge.rotation.x`: `-0.244` is open (file default), about `+1.54` is closed.
- **Recoloring:** materials are named after the palette (`clay`, `paper`, `ink`, `ink_soft`, `grey`, `line`,
  `blue`, `red`, `yellow`, `green`, `steel`, `coffee`, `screen_slide`). Material objects are **shared between
  clones**. To give each stool its own seat color, `scene.clone(true)` and then assign a *cloned* material to
  `stool_seat`.
- **Look:** DESIGN.md wants `MeshPhysicalMaterial` (roughness about 0.35, clearcoat about 0.5, subtle sheen). The
  files already carry that, so you can keep them or override them by material name. Lighting with drei `Environment` +
  `Lightformer`s and `ContactShadows` matches the previews. Tone mapping flattens colors a bit, so check the brand hexes.
- **Reduced motion / no WebGL:** `models/previews/<id>.webp` (800x800, white background, soft floor
  shadow) is a still render of each prop. The clock preview shows 13:15.
- Every prop is centered with y=0 at its base, so it can be dropped straight onto the table top (y = 0.75)
  or the floor.

## 2. Brand files (`/brand`)

| file | what | use |
|---|---|---|
| `favicon.svg`, `mark.svg` | color mark, 100x100 viewBox | `<link rel="icon" type="image/svg+xml">`, anywhere static |
| `mark-ink.svg`, `mark-paper.svg` | monochrome ink / white shapes | print, dark backgrounds |
| `wordmark.svg`, `wordmark-paper.svg`, `wordmark-currentcolor.svg` | `zemı` in Recursive 900 / CASL 0.35, outlined, blue idea dot | static contexts (the live `<ZemiWordmark />` stays in React) |
| `lockup.svg`, `lockup-paper.svg` | mark + wordmark | README, docs, emails that allow SVG |
| `favicon.ico` | 32 + 48 px | legacy favicon |
| `icon-32.png` | transparent | `<link rel="icon" sizes="32x32">` |
| `icon-192.png`, `icon-512.png` | mark on opaque white | web manifest `purpose: any` |
| `maskable-512.png` | full-bleed white, mark inside the 80% safe circle | web manifest `purpose: maskable` |
| `apple-touch-icon.png` | 180, white, padded | `<link rel="apple-touch-icon">` |
| `email-logo.png` | 720x160 on white, aspect **4.5:1** (display at 360x80) | email header `<img width="180" height="40">` (or 198x44, 360x80). Any other ratio squashes it |
| `email-mark.png` | 96x96 on white | email footer / avatar |
| `og-default.png` | 1200x630: graph paper, wordmark, mark, "Fridays, 13:15 WIB. Bring your half-finished research." | default `openGraph.images` / `twitter.images` |

`apps/web/public/manifest.webmanifest` is filled in: name Zemi, theme and background `#ffffff`, and the
icons above.

Suggested Next metadata (in the root layout, owned by web):

```ts
export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/brand/favicon.svg', type: 'image/svg+xml' }, { url: '/brand/icon-32.png', sizes: '32x32' }, { url: '/brand/favicon.ico' }],
    apple: '/brand/apple-touch-icon.png',
  },
  openGraph: { images: [{ url: '/brand/og-default.png', width: 1200, height: 630, alt: 'Zemi. Fridays, 13:15 WIB.' }] },
};
```

## 3. Seed media (`apps/api/seed/assets`)

133 files, about **28.6 MB** in total. `manifest.json` looks like this:

```jsonc
{
  "version": 1,
  "totals": { "files": 133, "bytes": 29961936, "megabytes": 28.6 },
  "sections": {
    "speakers":   { "purpose": "speaker-avatar", "note": "...", "credit": "...", "items": [Item] },
    "authors":    { ... }, "covers": { ... }, "pubCovers": { ... }, "docs": { ... },
    "pdfs": { ... }, "videos": { ... }, "recordings": { ... }
  }
}
```

Each section's `purpose` is a value of `ASSET_PURPOSES` (packages/shared): `speaker-avatar`, `author-avatar`,
`event-cover`, `publication-cover`, `documentation` (docs photos and clips), `publication-pdf`, `recording`.
Pass it as the upload `purpose`. Every item's `type` is the `assets.kind` (`image` / `video` / `document`).

Every item has `id` (stable), `path` (relative to the assets folder), `type` (image/video/document), `mime`,
`bytes`, `usage` and `credit`, plus `width`/`height` for images and videos. Extra fields per section:

| section | count | files | extra fields |
|---|---|---|---|
| `speakers` | 40 | `speakers/speaker-01..40.jpg` 512x512 | `gender` (female/male, alternating), `source` |
| `authors` | 12 | `authors/author-01..12.jpg` 512x512 | `gender`, `source` (never the same face as a speaker) |
| `covers` | 30 | `covers/cover-01..30.jpg` 1600x2000 (4:5) | `style` (composition archetype), `accent` (blue/red/yellow/green: set `events.accent` to it), `ground` |
| `pubCovers` | 16 | `pub-covers/pub-cover-01..16.jpg` 1200x1500 | `style` (scatter, network, contours, ...), `accent` |
| `docs` | 24 | `docs/doc-01..24.jpg` 1536x1024 (3:2) | `scene` (presentation, q-and-a, coffee, group-photo, ...), `alt` (ready to use) |
| `pdfs` | 6 | `pdfs/paper-0N-*.pdf`, 2 pages each | `pages` (PDF page count, not `publications.pages`), `title`, `publicationType` (a `PUBLICATION_TYPES` slug), `publicationTypeLabel` (as printed), `status` (a `PUBLICATION_STATUSES` value), `containerTitle`, `publishedYear`, `language`, `authors` (`[{ fullName, organization, isCorresponding }]`, the manual-author shape of `publicationAuthorInput`), `keywords`, `abstract`, `coverSuggestion` |
| `videos` | 4 | `videos/doc-clip-01..04.mp4` 12.2 s, 1280x720, 30 fps, H.264 High (yuv420p, limited range, faststart) + AAC | `durationSec`, `fps`, `title`, `sourcePhotos` |
| `recordings` | 1 | `videos/recording-01.mp4` 240 s, 1280x720, 30 fps, H.264 + AAC | `durationSec`, `segments` (per 15 s), `suggestedChapters` |

Seeding tips:

- Upload everything through the real asset pipeline (storage service or `POST /admin/assets`) so variants,
  `lqip`, `color`, posters and storyboards get made. Then set `alt` from the manifest (docs) or from the
  speaker/event name.
- PDFs carry full paper metadata under the `publicationInput` field names (title, publicationType -> `type`,
  status, containerTitle, publishedYear, language, authors, abstract, keywords); every item passes the shared
  zod schema once you add a `slug`. Reuse it for the publication rows (map `publicationType` to `type`). `coverSuggestion` points at the pub cover used as the paper's Figure 1.
- `suggestedChapters` on the recording lines up with a 13:15 rundown if you want chapters that match.
- Covers have no text, so the site can overlay event titles.

## Gotchas

- **Portraits are 128 px originals upscaled 4x** (randomuser only serves 128). Keep avatars at 256 CSS px
  or smaller. The faces are international stock placeholders, not Indonesian specifically, so choose names freely.
- **Docs photos are AI-generated** (codex CLI image tool). They're fine as placeholders for "a Zemi
  session", but never present one as a specific real event or real people.
- The 3D files **require** the meshopt decoder. A plain `GLTFLoader` without `setMeshoptDecoder` will fail to load them.
- Always animate the pivot empties. The `*_mesh` children may carry quantization transforms.
- Some teammates' code may expect `/favicon.ico` at the root. It lives at `/brand/favicon.ico`, so point the
  metadata there (see above) or ask assets to copy it.
- White props on a white page need contact shadows to read. Without them the table top disappears.
- **Next metadata routes:** `public/manifest.webmanifest` collides with an `app/manifest.(ts|json|webmanifest)`
  (Next errors on public-vs-route conflicts at the same path), so don't add one. An `app/opengraph-image.*`
  would silently replace `og-default.png` for that segment.
- Verified loaders: three.js `GLTFLoader` + `MeshoptDecoder` (headless Chromium check) and three-stdlib's
  GLTFLoader (used by drei) lists all four extensions (meshopt, quantization, clearcoat, sheen).
