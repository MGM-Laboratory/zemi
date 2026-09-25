"""
Zemi props. Each builder creates one model under a root empty and returns extra manifest metadata.

Blender space: Z up, the model's front faces -Y (glTF +Z, towards the camera). 1 unit = 1 m.
After building, `normalize()` moves the model so its bounding box sits on the ground (min z = 0)
and is centered in x/y, which puts the glTF origin at the bottom center.
"""

from __future__ import annotations

import math
import re
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

import zemi3d as z

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DISPLAY_FONT = REPO / "scripts" / "brand" / "fonts" / "build" / "Recursive-Zemi-Display.ttf"

# ------------------------------------------------------------------ shared materials


def mats():
    return {
        "clay": z.material("clay", "clay", rough=0.46, coat=0.45, sheen=0.3),
        "paper": z.material("paper", "paper", rough=0.62, coat=0.1, sheen=0.35),
        "ink": z.material("ink", "ink", rough=0.38, coat=0.55, sheen=0.15),
        "ink2": z.material("ink_soft", "ink2", rough=0.42, coat=0.4, sheen=0.15),
        "grey": z.material("grey", "ink4", rough=0.5, coat=0.3, sheen=0.2),
        "line": z.material("line", "line", rough=0.55, coat=0.2, sheen=0.2),
        "blue": z.material("blue", "blue", rough=0.36, coat=0.55),
        "red": z.material("red", "red", rough=0.36, coat=0.55),
        "yellow": z.material("yellow", "yellow", rough=0.38, coat=0.55),
        "green": z.material("green", "green", rough=0.36, coat=0.55),
        "steel": z.material("steel", "#aab0ba", rough=0.32, coat=0.3, sheen=0.0, metallic=0.35),
        "coffee": z.material("coffee", "coffee", rough=0.18, coat=0.9, coat_rough=0.08, sheen=0.0),
    }


# ------------------------------------------------------------------ 2D brand shapes (y up, centered)


def _svg_poly(d: str, qseg: int = 8) -> list[tuple[float, float]]:
    """Tiny SVG path sampler for the M/L/H/V/Q/Z commands used by the brand shapes."""
    toks = re.findall(r"[MLHVQZ]|-?\d*\.?\d+", d)
    pts: list[tuple[float, float]] = []
    i = 0
    cur = (0.0, 0.0)
    cmd = ""
    while i < len(toks):
        t = toks[i]
        if re.match(r"[MLHVQZ]", t):
            cmd = t
            i += 1
            if cmd == "Z":
                continue
        if cmd in ("M", "L"):
            cur = (float(toks[i]), float(toks[i + 1]))
            i += 2
            pts.append(cur)
        elif cmd == "H":
            cur = (float(toks[i]), cur[1])
            i += 1
            pts.append(cur)
        elif cmd == "V":
            cur = (cur[0], float(toks[i]))
            i += 1
            pts.append(cur)
        elif cmd == "Q":
            c = (float(toks[i]), float(toks[i + 1]))
            e = (float(toks[i + 2]), float(toks[i + 3]))
            i += 4
            for k in range(1, qseg + 1):
                t_ = k / qseg
                x = (1 - t_) ** 2 * cur[0] + 2 * (1 - t_) * t_ * c[0] + t_**2 * e[0]
                y = (1 - t_) ** 2 * cur[1] + 2 * (1 - t_) * t_ * c[1] + t_**2 * e[1]
                pts.append((x, y))
            cur = e
        else:
            i += 1
    # drop a duplicated closing point
    if len(pts) > 2 and abs(pts[0][0] - pts[-1][0]) < 1e-6 and abs(pts[0][1] - pts[-1][1]) < 1e-6:
        pts.pop()
    return pts


SHAPES_46 = {
    "triangle": "M19.76 7.2 Q23 1 26.24 7.2L42.76 38.8 Q46 45 39 45L7 45 Q0 45 3.24 38.8 Z",
    "square": "M10 0 H36 Q46 0 46 10 V36 Q46 46 36 46 H10 Q0 46 0 36 V10 Q0 0 10 0 Z",
}


def brand_shape(name: str, size: float, count: int = 48) -> list[tuple[float, float]]:
    """Outline of a brand shape, `size` wide, centered on the 46x46 cell center, y up."""
    s = size / 46.0
    if name == "circle":
        pts46 = [(23 + 23 * math.cos(2 * math.pi * k / count), 23 + 23 * math.sin(2 * math.pi * k / count)) for k in range(count)]
    elif name == "arch":
        half = count // 2
        pts46 = [(0.0, 46.0), (0.0, 23.0)]
        pts46 += [(23 - 23 * math.cos(math.pi * k / half), 23 - 23 * math.sin(math.pi * k / half)) for k in range(1, half)]
        pts46 += [(46.0, 23.0), (46.0, 46.0)]
    else:
        pts46 = _svg_poly(SHAPES_46[name])
    out = [((x - 23) * s, (23 - y) * s) for x, y in pts46]
    # outlines must be counter-clockwise for a consistent curve fill
    area = sum(out[i][0] * out[(i + 1) % len(out)][1] - out[(i + 1) % len(out)][0] * out[i][1] for i in range(len(out)))
    return out if area > 0 else list(reversed(out))


def rounded_rect(w: float, h: float, r: float, seg: int = 6, cx=0.0, cy=0.0):
    pts = [(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2), (cx + w / 2, cy + h / 2), (cx - w / 2, cy + h / 2)]
    return z.rounded_poly(pts, r, seg)


# ------------------------------------------------------------------ mesh utilities


def boxes_mesh(name: str, boxes, radius: float, mat, parent=None, segments: int = 2):
    """Many boxes in ONE mesh (one draw call), rounded by a single bevel modifier.
    boxes: iterable of (size_xyz, center_xyz, rot_z_radians)."""
    bm = bmesh.new()
    for size, center, rz in boxes:
        geom = bmesh.ops.create_cube(bm, size=1.0)
        verts = geom["verts"]
        m = Matrix.Translation(Vector(center)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Diagonal((*size, 1.0))
        bmesh.ops.transform(bm, matrix=m, verts=verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = z.mesh_object(name, me, parent)
    bev = obj.modifiers.new("bevel", "BEVEL")
    bev.width = radius
    bev.segments = segments
    bev.limit_method = "NONE"
    bev.harden_normals = True
    return z._finish(obj, mat, sharp_angle=None)


def bake_rotation(obj):
    """Apply rotation/scale into the mesh so the node only carries a translation."""
    if obj.type != "MESH":
        return
    loc = obj.location.copy()
    obj.data.transform(obj.matrix_basis.to_3x3().to_4x4())
    obj.rotation_mode = "XYZ"
    obj.matrix_basis = Matrix.Translation(loc)


def normalize(root):
    """Move the model so it sits on z=0 and is centered in x/y (glTF origin = bottom center)."""
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.context.view_layer.update()
    lo, hi = z.world_bbox(meshes)
    off = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for c in root.children:
        c.location += off
    bpy.context.view_layer.update()


def front(obj_rot_x=math.pi / 2):
    """Rotation that turns an XY-plane 2D drawing into a front-facing (-Y) plate, 2D y -> world Z."""
    return (obj_rot_x, 0.0, 0.0)


# ------------------------------------------------------------------ models


def seminar_table():
    m = mats()
    root = z.root("seminar_table")
    R = 0.55  # 1.1 m round top
    top_z0, top_z1 = 0.672, 0.75  # toy-thick 78 mm top
    z.lathe(
        "table_top",
        z.fillet([(0, top_z0, 0), (R - 0.03, top_z0, 0.02), (R, top_z0 + 0.03, 0.03), (R, top_z1 - 0.02, 0.03), (R - 0.04, top_z1, 0.03), (0, top_z1, 0)], 7),
        m["clay"], root, segments=112, sharp_angle=None,
    )
    z.lathe(
        "table_column",
        z.fillet([(0, 0.05, 0), (0.075, 0.05, 0.0), (0.068, 0.56, 0.05), (0.17, 0.645, 0.06), (0.19, top_z0 + 0.003, 0.006), (0, top_z0 + 0.003, 0)], 8),
        m["clay"], root, segments=72, sharp_angle=None,
    )
    z.lathe(
        "table_foot",
        z.fillet([(0, 0.0, 0), (0.31, 0.0, 0.016), (0.325, 0.024, 0.016), (0.24, 0.06, 0.04), (0.09, 0.08, 0.03), (0, 0.082, 0)], 8),
        m["ink"], root, segments=96, sharp_angle=None,
    )
    return root, {"title": "Round seminar table", "notes": "1.1 m round top at 0.75 m. Clay top and column, ink foot."}


def stool():
    m = mats()
    root = z.root("stool")
    seat_z0, seat_z1 = 0.415, 0.47
    z.lathe(
        "stool_seat",
        z.fillet([(0, seat_z0, 0), (0.15, seat_z0, 0.01), (0.182, seat_z0 + 0.02, 0.018), (0.18, seat_z1 - 0.012, 0.02), (0.13, seat_z1 + 0.004, 0.04), (0, seat_z1 + 0.008, 0)], 7),
        m["yellow"], root, segments=72, sharp_angle=None,
    )
    z.lathe(
        "stool_seat_base",
        z.fillet([(0, seat_z0 - 0.022, 0), (0.12, seat_z0 - 0.022, 0.012), (0.13, seat_z0 + 0.004, 0.006), (0, seat_z0 + 0.004, 0)], 5),
        m["clay"], root, segments=64, sharp_angle=None,
    )
    r_top, r_bot, leg = 0.095, 0.2, 0.023
    ring_z = 0.17
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        p0 = (r_bot * math.cos(a), r_bot * math.sin(a), 0.0)
        p1 = (r_top * math.cos(a), r_top * math.sin(a), seat_z0 - 0.01)
        z.capsule(f"stool_leg_{i + 1}", p0, p1, leg, m["clay"], root, segments=20, rings=5)
        # little ink feet
        z.uv_sphere(f"stool_foot_{i + 1}", leg * 1.12, m["ink"], root, loc=(p0[0] * 0.995, p0[1] * 0.995, leg * 1.0), seg=20, rings=10, scale=(1, 1, 0.9))
    t = ring_z / (seat_z0 - 0.01)
    rr = r_bot + (r_top - r_bot) * t
    z.torus("stool_footrest", rr, 0.011, m["ink"], root, loc=(0, 0, ring_z), major_seg=96, minor_seg=12)
    return root, {"title": "Stool", "notes": "Seat is yellow in the file; recolor `stool_seat` per event accent (material `yellow`)."}


def coffee_cup():
    m = mats()
    root = z.root("coffee_cup")
    z.lathe(
        "saucer",
        z.fillet([(0, 0.0, 0), (0.032, 0.0, 0.004), (0.036, 0.004, 0.003), (0.074, 0.011, 0.01), (0.078, 0.017, 0.003), (0.072, 0.0185, 0.003), (0.036, 0.0095, 0.012), (0, 0.009, 0)], 6),
        m["blue"], root, segments=96, sharp_angle=None,
    )
    base = 0.0095
    outer = [(0, base, 0), (0.026, base, 0.004), (0.03, base + 0.006, 0.006), (0.0425, 0.07, 0.03), (0.0455, 0.093, 0.004)]
    inner = [(0.041, 0.0935, 0.002), (0.0385, 0.075, 0.03), (0.027, base + 0.01, 0.01), (0, base + 0.009, 0)]
    prof = z.fillet(outer + inner, 6)
    z.lathe("cup", prof, m["clay"], root, segments=96, sharp_angle=None)
    zc = 0.078
    rc = 0.0385 + (0.041 - 0.0385) * (zc - 0.075) / (0.0935 - 0.075) - 0.0004
    z.lathe("coffee", [(0, zc), (rc, zc), (rc, zc - 0.004), (0, zc - 0.004)], m["coffee"], root, segments=64, sharp_angle=60)
    # handle: an arc in the XZ plane on the +X side
    arc = math.radians(235)
    h = z.torus("cup_handle", 0.019, 0.0062, m["clay"], root, loc=(0.0535, 0, 0.056), major_seg=40, minor_seg=14, arc=arc)
    h.rotation_mode = "ZYX"
    h.rotation_euler = (math.pi / 2, 0.0, -arc / 2)
    return root, {"title": "Coffee cup and saucer", "notes": "Ceramic cup, blue saucer, a flat coffee surface mesh."}


def paper_stack():
    m = mats()
    root = z.root("paper_stack")
    W, H, T = 0.21, 0.297, 0.004
    jaw = 0.0025
    layout = [(-0.006, 0.004, -5.5), (0.007, -0.002, 3.0), (-0.004, 0.006, -1.5), (0.005, 0.001, 4.5), (0.0, 0.0, -0.8)]
    top = None
    for i, (dx, dy, deg) in enumerate(layout):
        zc = jaw + T / 2 + i * (T + 0.0004)
        o = z.rounded_box(f"sheet_{i + 1}", (W, H, T), T * 0.49, m["paper"], root, loc=(dx, dy, zc), rot=(0, 0, math.radians(deg)), segments=2)
        top = (o, zc, math.radians(deg), dx, dy)
    o, zc, rz, dx, dy = top
    zt = zc + T / 2 + 0.0006
    rot = Matrix.Rotation(rz, 4, "Z")

    def at(x, y):
        v = rot @ Vector((x, y, 0))
        return (dx + v.x, dy + v.y, zt)

    # the top sheet: a title, text lines, a little figure made of brand shapes
    boxes_mesh("sheet_title", [((0.12, 0.011, 0.0012), at(-0.03, 0.105), rz), ((0.07, 0.007, 0.0012), at(-0.055, 0.088), rz)], 0.0005, m["ink"], root)
    lines = []
    for k in range(6):
        w = 0.165 if k % 3 != 2 else 0.11
        lines.append(((w, 0.0042, 0.001), at(-0.0825 + w / 2 - 0.0, 0.066 - k * 0.0105), rz))
    for k in range(5):
        w = 0.07 if k != 4 else 0.045
        lines.append(((w, 0.0042, 0.001), at(-0.0825 + w / 2, -0.03 - k * 0.0105), rz))
    for k in range(4):
        w = 0.165 if k != 3 else 0.09
        lines.append(((w, 0.0042, 0.001), at(-0.0825 + w / 2, -0.095 - k * 0.0105), rz))
    boxes_mesh("sheet_text", lines, 0.00045, m["grey"], root)
    # figure on the right: yellow bars + a blue dot
    bars = []
    for k, hgt in enumerate((0.022, 0.036, 0.029, 0.046)):
        bars.append(((0.0105, hgt, 0.0016), at(0.022 + k * 0.016, -0.075 + hgt / 2), rz))
    boxes_mesh("sheet_figure_bars", bars, 0.0006, m["yellow"], root)
    dot = z.lathe("sheet_figure_dot", [(0, zt + 0.0018), (0.009, zt + 0.0018), (0.009, zt - 0.0002), (0, zt - 0.0002)], m["blue"], root, segments=32, sharp_angle=60)
    dot.location = Vector(at(0.058, -0.012)) - Vector((0, 0, zt))
    # binder clip on the far edge (y+), red. Flat bottom plate under the stack, sloped top plate.
    stack_top = jaw + 5 * (T + 0.0004)
    clip_w, cx = 0.05, 0.012
    edge_y = H / 2 - 0.002
    ys, yo = edge_y - 0.022, edge_y + 0.012  # jaw tips (over the paper) and spine (outside the paper)
    top_jaw = 0.0025
    zt2 = stack_top + top_jaw
    zs = zt2 + 0.014  # spine is taller than the jaw opening
    prof = [
        (ys, 0.0), (yo, 0.0), (yo, zs), (ys, zt2), (ys - 0.0005, zt2 - top_jaw),
        (yo - 0.0035, zs - 0.0045), (yo - 0.0035, jaw), (ys - 0.0005, jaw),
    ]
    clip = z.extrude2d("binder_clip", [z.rounded_poly(prof, 0.0012, 3)], clip_w, 0.0009, m["red"], root)
    # drawn as (y, z) in the XY plane and extruded along Z: remap so 2D -> world (y, z), extrusion -> x
    clip.data.transform(Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
    clip.location = (cx, 0, 0)
    # wire handles: one folded back over the paper, one tipped up over the spine
    wr, hx = 0.0015, clip_w / 2 - 0.006
    ya, za = yo - 0.004, zs - 0.0015
    for side, (yb, zb_) in (("a", (edge_y - 0.05, zt2 + 0.0035)), ("b", (yo + 0.026, zs + 0.022))):
        parts = [
            ((cx - hx, ya, za), (cx - hx * 0.8, yb, zb_)),
            ((cx + hx, ya, za), (cx + hx * 0.8, yb, zb_)),
            ((cx - hx * 0.8, yb, zb_), (cx + hx * 0.8, yb, zb_)),
        ]
        objs = [z.capsule(f"clip_handle_{side}_{k}", p0, p1, wr, m["steel"], root, segments=10, rings=3) for k, (p0, p1) in enumerate(parts)]
        join(objs, f"clip_handle_{side}")
    return root, {"title": "Paper stack with binder clip", "notes": "Five A4 sheets, slightly fanned. Top sheet has a title, text lines and a tiny chart."}


def join(objs, name):
    """Join objects into one mesh (applies modifiers + transforms first)."""
    dg = bpy.context.evaluated_depsgraph_get()
    parent = objs[0].parent
    bm = bmesh.new()
    for o in objs:
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    mat = objs[0].material_slots[0].material if objs[0].material_slots else None
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o)
        if data.users == 0:
            bpy.data.meshes.remove(data)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = z.mesh_object(name, me, None)
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return z._finish(obj, mat, sharp_angle=None)


def paper_plane():
    m = mats()
    root = z.root("paper_plane")
    body = z.empty("plane_body", root, rot=(math.radians(-14), math.radians(-7), 0))
    L, w, k, d = 0.3, 0.115, 0.062, 0.036
    zc = k
    N = (L / 2, 0, zc + 0.004)
    T0 = (-L / 2, 0, zc)
    WL = (-L / 2 - 0.012, w, zc + d)
    WR = (-L / 2 - 0.012, -w, zc + d)
    ML = (-L / 2 + 0.01, w * 0.45, zc + d * 0.2)  # crease point: wings fold slightly
    MR = (-L / 2 + 0.01, -w * 0.45, zc + d * 0.2)
    K = (-L / 2 + 0.01, 0, 0.0)
    thick = 0.0026
    z.poly_mesh("wing_left", [N, T0, ML, WL], [(0, 2, 1), (0, 3, 2)], m["paper"], body, thickness=thick, bevel=0.0009)
    z.poly_mesh("wing_right", [N, T0, MR, WR], [(0, 1, 2), (0, 2, 3)], m["paper"], body, thickness=thick, bevel=0.0009)
    z.poly_mesh("keel", [N, T0, K, (L * 0.05, 0, zc * 0.35)], [(0, 3, 2, 1)], m["paper"], body, thickness=thick * 1.6, bevel=0.0009)
    # a blue Q sticker on the left wing, a red Hunch on the right (on the outer wing panels)
    for name, (P, Q, Rr), shape, mat in (
        ("sticker_q", (N, WL, ML), "circle", m["blue"]),
        ("sticker_hunch", (N, WR, MR), "triangle", m["red"]),
    ):
        P, Q, Rr = Vector(P), Vector(Q), Vector(Rr)
        n = (Q - P).cross(Rr - P).normalized()
        if n.z < 0:
            n = -n
        c = P + (Q - P) * 0.55 + (Rr - P) * 0.3
        o = z.extrude2d(name, [brand_shape(shape, 0.028)], 0.0014, 0.0005, mat, body)
        spin = Matrix.Rotation(math.pi / 2 if shape == "triangle" else 0.0, 4, "Z")
        o.data.transform(Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4() @ spin)
        o.location = c + n * (thick / 2 + 0.0005)
    return root, {"title": "Paper plane", "notes": "Nose points +X. Two tiny brand-shape stickers on the wings."}


def microphone():
    m = mats()
    root = z.root("microphone")
    z.lathe(
        "mic_base",
        z.fillet([(0, 0.0, 0), (0.062, 0.0, 0.006), (0.066, 0.01, 0.008), (0.05, 0.024, 0.012), (0.014, 0.028, 0.008), (0, 0.029, 0)], 6),
        m["ink"], root, segments=72, sharp_angle=None,
    )
    z.capsule("mic_stem", (0, 0, 0.02), (0, 0, 0.125), 0.0055, m["steel"], root, segments=16, rings=4)
    # holder + mic, tilted towards the speaker (front, -Y)
    pivot = z.empty("mic_head", root, loc=(0, 0, 0.125), rot=(math.radians(32), 0, 0))
    z.lathe("mic_holder", z.fillet([(0, -0.012, 0), (0.017, -0.012, 0.004), (0.019, 0.02, 0.004), (0.0155, 0.022, 0.001), (0.0155, 0.008, 0.001), (0, 0.004, 0)], 4), m["ink2"], pivot, segments=40, sharp_angle=None)
    z.lathe(
        "mic_handle",
        z.fillet([(0, -0.028, 0), (0.0105, -0.028, 0.005), (0.0145, 0.07, 0.02), (0.0175, 0.1, 0.004), (0, 0.1, 0)], 6),
        m["ink"], pivot, segments=48, sharp_angle=None,
    )
    z.lathe(
        "mic_ring",
        z.fillet([(0, 0.092), (0.0183, 0.092, 0.002), (0.0186, 0.106, 0.002), (0, 0.106)], 3),
        m["red"], pivot, segments=48, sharp_angle=None,
    )
    g = z.uv_sphere("mic_grille", 0.0245, m["steel"], pivot, loc=(0, 0, 0.124), seg=40, rings=20, scale=(1, 1, 1.05))
    # grille bands: two thin rings make it read as a mesh cap
    z.torus("mic_grille_band", 0.0247, 0.0012, m["grey"], pivot, loc=(0, 0, 0.124), major_seg=48, minor_seg=6)
    return root, {"title": "Desk microphone", "notes": "Ink body with a red ring, tilted towards the front (+Z in glTF)."}


def wall_clock():
    m = mats()
    root = z.root("wall_clock")
    R = 0.16
    C = (0.0, 0.0, R)
    rotF = (math.pi / 2, 0, 0)  # lathe axis Z -> front (-Y)
    body = z.lathe(
        "clock_rim",
        z.fillet([(0, 0.0, 0), (R - 0.02, 0.0, 0.006), (R, 0.014, 0.014), (R - 0.001, 0.036, 0.012), (R - 0.018, 0.046, 0.008), (R - 0.024, 0.04, 0.003), (R - 0.026, 0.03, 0.002), (0, 0.03, 0)], 7),
        m["blue"], root, loc=C, segments=128, sharp_angle=None,
    )
    body.rotation_euler = rotF
    face = z.lathe("clock_face", z.fillet([(0, 0.026), (R - 0.025, 0.026, 0.0), (R - 0.025, 0.0325, 0.0015), (0, 0.033)], 3), m["clay"], root, loc=C, segments=128, sharp_angle=None)
    face.rotation_euler = rotF
    face_y = -0.033
    rr = R - 0.05
    # hour markers: the four brand shapes at 12/3/6/9, soft ink dots elsewhere
    marks = {0: ("circle", m["blue"]), 3: ("triangle", m["red"]), 6: ("square", m["yellow"]), 9: ("arch", m["green"])}
    dots = []
    for hr in range(12):
        th = hr / 12 * 2 * math.pi
        x, zz = rr * math.sin(th), R + rr * math.cos(th)
        if hr in marks:
            shape, mat = marks[hr]
            o = z.extrude2d(f"marker_{shape}", [brand_shape(shape, 0.024)], 0.005, 0.0016, mat, root, loc=(x, face_y - 0.0022, zz), rot=rotF)
        else:
            dots.append(z.uv_sphere(f"dot_{hr}", 0.0048, m["ink"], root, loc=(x, face_y + 0.0006, zz), seg=16, rings=8, scale=(1, 0.55, 1)))
    join(dots, "hour_dots")
    # hands: each hand is a mesh parented to a pivot empty at the clock center.
    # Rotate the pivot (glTF node "hour_hand"/"minute_hand") about its local Z: 0 = 12 o'clock.
    for name, (w, back, length, depth_y, mat) in {
        "hour_hand": (0.0125, 0.02, 0.078, face_y - 0.0055, m["ink"]),
        "minute_hand": (0.0085, 0.026, 0.118, face_y - 0.0105, m["ink"]),
    }.items():
        pivot = z.empty(name, root, loc=(C[0], depth_y, C[2]))
        outline = z.rounded_poly([(-w / 2, -back), (w / 2, -back), (w * 0.34, length), (-w * 0.34, length)], w * 0.32, 5)
        hand = z.extrude2d(f"{name}_mesh", [outline], 0.0035, 0.0012, mat, pivot, rot=rotF)
        bake_rotation(hand)
        hand.data.name = name  # glTF mesh name "hour_hand"/"minute_hand"; node "<name>_mesh" under pivot "<name>"
    z.lathe("clock_pin", z.fillet([(0, 0.0), (0.0085, 0.0, 0.001), (0.0085, 0.004, 0.003), (0, 0.006)], 4), m["red"], root, loc=(0, face_y - 0.0118, R), segments=32, sharp_angle=None).rotation_euler = rotF
    return root, {
        "title": "Wall clock",
        "notes": "Rotate the empties `hour_hand` and `minute_hand` about their local Z axis (glTF). 0 rad = 12 o'clock, negative = clockwise seen from the front. 13:15 => minute -PI/2, hour -(1.25/12)*2PI.",
        "hands": {
            "pivotNodes": ["hour_hand", "minute_hand"],
            "meshNodes": ["hour_hand_mesh", "minute_hand_mesh"],
            "axis": "local +Z (towards the viewer)",
            "zeroAt": "12 o'clock",
            "clockwise": "negative rotation",
            "example_13_15": {"hour_hand": -0.6544985, "minute_hand": -1.5707963},
        },
    }


def laptop():
    m = mats()
    root = z.root("laptop")
    W, D, Tb = 0.31, 0.215, 0.015
    z.rounded_box("laptop_base", (W, D, Tb), 0.0065, m["clay"], root, loc=(0, 0, Tb / 2), segments=4)
    # keyboard: one mesh of keys
    keys = []
    kw, kh, gap = 0.0185, 0.0165, 0.0038
    cols = 12
    x0 = -((cols * kw + (cols - 1) * gap) / 2) + kw / 2
    for r in range(4):
        for c in range(cols):
            keys.append(((kw, kh, 0.003), (x0 + c * (kw + gap), 0.058 - r * (kh + gap), Tb + 0.0008), 0.0))
    keys.append(((0.1, kh, 0.003), (0, 0.058 - 4 * (kh + gap), Tb + 0.0008), 0.0))
    for c in (0, 1, 10, 11):
        keys.append(((kw, kh, 0.003), (x0 + c * (kw + gap), 0.058 - 4 * (kh + gap), Tb + 0.0008), 0.0))
    boxes_mesh("laptop_keys", keys, 0.0012, m["ink2"], root, segments=2)
    boxes_mesh("laptop_trackpad", [((0.095, 0.052, 0.0012), (0, -0.075, Tb + 0.0001), 0.0)], 0.0005, m["line"], root)
    # lid on a hinge empty so it can open/close: rotate `lid_hinge` about its local X
    hinge = z.empty("lid_hinge", root, loc=(0, D / 2 - 0.006, Tb - 0.001), rot=(math.radians(-14), 0, 0))
    Hl, Tl = 0.205, 0.0075
    z.rounded_box("laptop_lid", (W, Tl, Hl), 0.0055, m["clay"], hinge, loc=(0, Tl / 2, Hl / 2), segments=4)
    z.rounded_box("laptop_screen", (W - 0.02, 0.0016, Hl - 0.022), 0.0007, m["ink"], hinge, loc=(0, -0.0003, Hl / 2 + 0.002), segments=2)
    glow = z.material("screen_slide", "#ffffff", rough=0.5, coat=0.1, sheen=0.0, emission=0.35)
    slide_w, slide_h = W - 0.05, Hl - 0.05
    z.rounded_box("screen_slide", (slide_w, 0.0008, slide_h), 0.0003, glow, hinge, loc=(0, -0.0015, Hl / 2 + 0.002), segments=1)
    # the four characters on the slide
    for i, (shape, mat) in enumerate((("circle", m["blue"]), ("triangle", m["red"]), ("square", m["yellow"]), ("arch", m["green"]))):
        x = -0.078 + i * 0.052
        o = z.extrude2d(f"slide_{shape}", [brand_shape(shape, 0.034)], 0.0012, 0.0004, mat, hinge, loc=(x, -0.0022, Hl / 2 + 0.012), rot=(math.pi / 2, 0, 0))
    z.rounded_box("slide_title", (0.09, 0.0006, 0.007), 0.0002, m["ink"], hinge, loc=(-0.06, -0.0021, Hl / 2 + 0.058), segments=1)
    z.rounded_box("slide_subtitle", (0.14, 0.0006, 0.0045), 0.0002, m["grey"], hinge, loc=(-0.035, -0.0021, Hl / 2 - 0.035), segments=1)
    return root, {
        "title": "Laptop",
        "notes": "Open generic laptop. `lid_hinge` rotates about local X: -0.244 rad open (file default), about +1.54 rad closed.",
        "hinge": {"node": "lid_hinge", "axis": "local +X", "open": -0.2443, "closed": 1.54},
    }


def idea_bubble():
    m = mats()
    root = z.root("idea_bubble")
    a, b = 0.13, 0.108
    cz = 0.16
    # outline: superellipse with a tail at the bottom left, corners of the tail filleted
    body = []
    n = 120
    t_start, t_end = math.radians(-82), math.radians(-124) + 2 * math.pi
    for k in range(n + 1):
        t = t_start + (t_end - t_start) * k / n
        c, s = math.cos(t), math.sin(t)
        body.append((a * math.copysign(abs(c) ** (2 / 2.6), c), b * math.copysign(abs(s) ** (2 / 2.6), s)))
    tip = (-0.062, -b - 0.07)
    pts = [(x, y, 0.0) for x, y in body[1:-1]]
    pts = [(*body[0], 0.012)] + pts + [(*body[-1], 0.012), (*tip, 0.01), (*body[0], 0.012)]
    # make it a closed filleted loop starting mid-arc
    mid = len(pts) // 2
    loop = pts[mid:-1] + pts[:mid] + [pts[mid]]
    outline = z.fillet(loop, 6)[:-1]
    bub = z.extrude2d("bubble", [outline], 0.07, 0.026, m["blue"], root, loc=(0, 0, cz), rot=(math.pi / 2, 0, 0), bevel_res=5)
    # the "?" in Recursive display, white clay on the front face
    q = z.text_mesh("question_mark", "?", str(DISPLAY_FONT), 0.215, 0.026, 0.007, m["paper"], root, rot=(math.pi / 2, 0, 0))
    bake_rotation(q)
    bpy.context.view_layer.update()
    lo, hi = z.world_bbox([q])
    q.location = Vector((0, 0, cz)) - Vector(((lo.x + hi.x) / 2, 0, (lo.z + hi.z) / 2)) + Vector((0.0, -0.035 - 0.004, 0.004))
    return root, {"title": "Idea bubble", "notes": "Blue speech bubble with a white Recursive question mark, standing on its tail."}


MODELS = {
    "seminar-table": seminar_table,
    "stool": stool,
    "coffee-cup": coffee_cup,
    "paper-stack": paper_stack,
    "paper-plane": paper_plane,
    "microphone": microphone,
    "wall-clock": wall_clock,
    "laptop": laptop,
    "idea-bubble": idea_bubble,
}

# camera direction per model for the preview (Blender space, from target to camera)
VIEWS = {
    "wall-clock": (0.25, -1.5, 0.3),
    "idea-bubble": (0.55, -1.4, 0.45),
    "paper-plane": (0.85, -1.3, 0.55),
    "paper-stack": (0.6, -1.0, 1.4),
    "laptop": (0.75, -1.3, 0.85),
}
