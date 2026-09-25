# Brand files

Static logo, icon, email and OG assets in `apps/web/public/brand/` plus `apps/web/public/manifest.webmanifest`.
Geometry comes from `packages/shared/dist/brand.js`; text is Recursive outlined to SVG paths, so the output
never depends on locally installed fonts.

```sh
pnpm --filter @zemi/shared build                                                                  # mark geometry
uv run --no-project --with fonttools --with uharfbuzz python scripts/brand/outline_text.py        # fonts -> paths
node scripts/brand/render.mjs --preview $TMPDIR/zemi-brand                                        # writes everything
```

- `fonts/` holds the variable TTFs from google/fonts (OFL, licenses next to them): Recursive and
  Atkinson Hyperlegible Next. `outline_text.py` pins every axis into static instances in `fonts/build/`
  (display: wght 900, CASL 0.35, MONO 0; mono: MONO 1, CASL 0) and shapes the brand text runs with HarfBuzz
  into `build/text-paths.json` (font units, y down, baseline 0).
- The wordmark is `zemı` (dotless i). The dot is replaced by the blue circle from `SHAPE_PATHS_46`,
  at 0.82x the width of Recursive's own dot, centered on the stem.
- To add a text run (for another OG image), add it to `RUNS` in `outline_text.py` and rerun both scripts.
- `render.mjs` writes an ICO by hand (PNG entries, 32 + 48), since sharp cannot write ICO.
