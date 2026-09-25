"""
Instance the brand variable fonts and outline every piece of brand text into SVG path data.

Run from the repo root:
    uv run --no-project --with fonttools --with uharfbuzz python scripts/brand/outline_text.py

Outputs
    scripts/brand/fonts/build/*.ttf        static instances (Blender loads the display one for the 3D "?")
    scripts/brand/build/text-paths.json    outlined runs in font units, y down, baseline at y=0

Nothing here renders text with a system font, so the SVG/PNG output looks the same on every machine.
"""

from __future__ import annotations

import json
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = Path(__file__).resolve().parent
FONTS = HERE / "fonts"
BUILD_FONTS = FONTS / "build"
OUT = HERE / "build" / "text-paths.json"

# Static instances. Every axis is pinned so the result never depends on font defaults.
INSTANCES = {
    # Wordmark + display lines: DESIGN.md section 3 (wght 900, CASL 0.35).
    "display": (
        "Recursive-Variable.ttf",
        {"wght": 900, "CASL": 0.35, "MONO": 0, "slnt": 0, "CRSV": 0.5},
        "Recursive-Zemi-Display.ttf",
    ),
    # Mono utility voice (times, labels): MONO 1, CASL 0.
    "mono": (
        "Recursive-Variable.ttf",
        {"wght": 600, "CASL": 0, "MONO": 1, "slnt": 0, "CRSV": 0.5},
        "Recursive-Zemi-Mono.ttf",
    ),
    # Body voice.
    "body": (
        "AtkinsonHyperlegibleNext-Variable.ttf",
        {"wght": 500},
        "AtkinsonHyperlegibleNext-Zemi-Medium.ttf",
    ),
    "body-bold": (
        "AtkinsonHyperlegibleNext-Variable.ttf",
        {"wght": 700},
        "AtkinsonHyperlegibleNext-Zemi-Bold.ttf",
    ),
}

# Text runs the brand renderer needs. tracking is in em (DESIGN.md: wordmark -0.04em).
RUNS = [
    {"id": "wordmark", "font": "display", "text": "zemı", "tracking": -0.04},
    {"id": "og-line-1", "font": "mono", "text": "Fridays, 13:15 WIB.", "tracking": 0.0},
    {"id": "og-line-2", "font": "display", "text": "Bring your half-finished research.", "tracking": -0.02},
    {"id": "og-label", "font": "mono", "text": "MGM LABORATORY  WEEKLY SEMINAR", "tracking": 0.08},
]


def build_instances() -> dict[str, Path]:
    BUILD_FONTS.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for key, (src, axes, out_name) in INSTANCES.items():
        out = BUILD_FONTS / out_name
        vf = TTFont(FONTS / src)
        # Only pin axes the font actually has.
        have = {a.axisTag for a in vf["fvar"].axes}
        loc = {k: v for k, v in axes.items() if k in have}
        inst = instantiateVariableFont(vf, loc, updateFontNames=False)
        # Give the instance its own family name so Blender/OS never confuses it with the VF.
        family = out_name.removesuffix(".ttf").replace("-", " ")
        for rec in inst["name"].names:
            if rec.nameID in (1, 4, 16):
                rec.string = family
            elif rec.nameID == 6:
                rec.string = out_name.removesuffix(".ttf")
        inst.save(out)
        paths[key] = out
    return paths


def glyph_path(glyphset, name: str, dx: float, dy: float) -> str:
    """SVG path for one glyph, flipped to y-down, translated by (dx, dy) in font units."""
    pen = SVGPathPen(glyphset, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    tpen = TransformPen(pen, (1, 0, 0, -1, dx, dy))
    glyphset[name].draw(tpen)
    return pen.getCommands()


def contour_bounds(glyphset, name: str) -> list[tuple[float, float, float, float]]:
    """Bounding boxes of each contour of a glyph (font units, y up)."""
    rec = DecomposingRecordingPen(glyphset)
    glyphset[name].draw(rec)
    contours: list[list] = []
    for op, args in rec.value:
        if op == "moveTo":
            contours.append([(op, args)])
        elif contours:
            contours[-1].append((op, args))
    boxes = []
    for c in contours:
        bp = BoundsPen(glyphset)
        for op, args in c:
            getattr(bp, op)(*args)
        if bp.bounds:
            boxes.append(bp.bounds)
    return boxes


def shape_run(font_path: Path, text: str, tracking_em: float):
    blob = hb.Blob.from_file_path(str(font_path))
    face = hb.Face(blob)
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    return buf.glyph_infos, buf.glyph_positions


def main() -> None:
    inst = build_instances()
    runs_out = []
    for run in RUNS:
        fpath = inst[run["font"]]
        tt = TTFont(fpath)
        upem = tt["head"].unitsPerEm
        order = tt.getGlyphOrder()
        gs = tt.getGlyphSet()
        infos, positions = shape_run(fpath, run["text"], run["tracking"])
        track = run["tracking"] * upem
        x = 0.0
        parts = []
        glyphs = []
        n = len(infos)
        ink_min_x, ink_max_x = float("inf"), float("-inf")
        for i, (info, pos) in enumerate(zip(infos, positions)):
            name = order[info.codepoint]
            gx = x + pos.x_offset
            d = glyph_path(gs, name, gx, -pos.y_offset)
            if d:
                parts.append(d)
            bp = BoundsPen(gs)
            gs[name].draw(bp)
            if bp.bounds:
                ink_min_x = min(ink_min_x, gx + bp.bounds[0])
                ink_max_x = max(ink_max_x, gx + bp.bounds[2])
            glyphs.append({"name": name, "x": round(gx, 2), "advance": pos.x_advance, "bounds": bp.bounds})
            x += pos.x_advance + (track if i < n - 1 else 0)
        os2 = tt["OS/2"]
        entry = {
            "id": run["id"],
            "text": run["text"],
            "font": fpath.name,
            "upem": upem,
            "advance": round(x, 2),
            "inkMinX": round(ink_min_x, 2),
            "inkMaxX": round(ink_max_x, 2),
            "ascender": tt["hhea"].ascent,
            "descender": tt["hhea"].descent,
            "xHeight": getattr(os2, "sxHeight", 0),
            "capHeight": getattr(os2, "sCapHeight", 0),
            "d": " ".join(parts),
            "glyphs": glyphs,
        }
        if run["id"] == "wordmark":
            # Where the i's tittle would sit: the highest contour of the dotted "i" at this instance.
            boxes = contour_bounds(gs, "i")
            dot = max(boxes, key=lambda b: b[1])
            dotless = next(g for g in glyphs if g["name"] == "dotlessi")
            # Align the dot to the dotless stem's horizontal center (i and dotlessi share the stem).
            stem_box = contour_bounds(gs, "dotlessi")
            stem = max(stem_box, key=lambda b: b[3] - b[1])
            entry["ideaDot"] = {
                # font units, y down, relative to the run origin
                "cx": round(dotless["x"] + (stem[0] + stem[2]) / 2, 2),
                "cy": round(-(dot[1] + dot[3]) / 2, 2),
                "w": round(dot[2] - dot[0], 2),
                "h": round(dot[3] - dot[1], 2),
                "top": round(-dot[3], 2),
            }
            entry["stemTop"] = round(-stem[3], 2)
        runs_out.append(entry)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"runs": runs_out}, indent=2))
    print(f"wrote {OUT.relative_to(HERE.parent.parent)} and {len(inst)} font instances")
    for r in runs_out:
        extra = f" dot={r['ideaDot']}" if "ideaDot" in r else ""
        print(f"  {r['id']}: advance={r['advance']} upem={r['upem']}{extra}")


if __name__ == "__main__":
    main()
