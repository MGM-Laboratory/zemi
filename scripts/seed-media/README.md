# Seed media

Everything seeding uploads lives in `apps/api/seed/assets/` and is described by
`apps/api/seed/assets/manifest.json`. Each generator owns one manifest section and can be rerun alone.
Scratch output (contact sheets, raw AI photos, video temp files) goes to `$ZEMI_SCRATCH`
(default `$TMPDIR/zemi-seed-media`).

| step | command | section | notes |
|---|---|---|---|
| 1 | `node scripts/seed-media/fetch-portraits.mjs` | `speakers` (40), `authors` (12) | randomuser.me, 128px upscaled to 512, deduped by image signature |
| 2 | `node scripts/seed-media/gen-docs-photos.mjs --raw <dir> --jobs 4` | (raw PNGs) | AI photos via the local `codex` CLI image tool, about 1 to 3 min each, skips existing |
| 3 | `node scripts/seed-media/build-docs.mjs --raw <dir>` | `docs` (24) | PNG to JPEG q84, alt text + scene from `docs-prompts.json` |
| 4 | `node scripts/seed-media/gen-covers.mjs` | `covers` (30) | 1600x2000, 12 composition archetypes, seeded PRNG |
| 5 | `node scripts/seed-media/gen-pub-covers.mjs` | `pubCovers` (16) | 1200x1500 figure art |
| 6 | `node scripts/seed-media/gen-pdfs.mjs` | `pdfs` (6) | reportlab via `uv run --with reportlab --with pillow`, figures cropped from pub covers (`figure_fit` keeps a whole cover). Checks `pub_type` / `status` against `packages/shared/dist`, so build shared first |
| 7 | `node scripts/seed-media/gen-videos.mjs` | `videos` (4), `recordings` (1) | ffmpeg; needs steps 3 to 5 first |

Order matters only where noted: PDFs use the pub covers, videos use docs photos, covers and pub covers.
Everything except steps 1 and 2 is deterministic (seeded).

Tools: Node 24 (sharp is borrowed from `apps/api`), `uv`, `ffmpeg` + `ffprobe`, `codex` (step 2 only).
To redo one AI photo: move `<raw>/doc-07.png` aside, then `gen-docs-photos.mjs --raw <raw> --only doc-07`.
Prompts live in `docs-prompts.json` (no readable text, no logos, Southeast Asian students, 3:2).
