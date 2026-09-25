"""
Build the Zemi props, export raw GLBs + metadata, and render preview PNGs.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
        --python scripts/blender/build.py -- --out <raw_dir> [--preview <png_dir>] [model ...]

Then run `node scripts/blender/optimize.mjs --raw <raw_dir>` to compress into apps/web/public/models.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

import models  # noqa: E402
import zemi3d as z  # noqa: E402


def parse(argv):
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    out, preview, names = None, None, []
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = Path(argv[i + 1]); i += 2
        elif argv[i] == "--preview":
            preview = Path(argv[i + 1]); i += 2
        else:
            names.append(argv[i]); i += 1
    if out is None:
        raise SystemExit("--out <dir> is required")
    return out, preview, names or list(models.MODELS)


def pose_for_preview(name):
    """Clock at 13:15 in the preview only (the GLB keeps 12:00 as rest pose)."""
    if name == "wall-clock":
        # Blender +Y rotation == glTF -Z rotation == clockwise seen from the front
        bpy.data.objects["minute_hand"].rotation_euler = (0, math.radians(90), 0)
        bpy.data.objects["hour_hand"].rotation_euler = (0, math.radians(37.5), 0)


def main():
    out, preview, names = parse(sys.argv)
    for name in names:
        z.reset()
        root, extra = models.MODELS[name]()
        models.normalize(root)
        meta = z.export(name, out, extra)
        print(f"[zemi3d] {name}: {meta['triangles']} tris, bbox {meta['bbox']['size']}")
        if preview:
            pose_for_preview(name)
            z.render_preview(name, preview / f"{name}.png", view=models.VIEWS.get(name, (1.0, -1.35, 0.85)))


main()
