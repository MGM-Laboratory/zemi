"""
Shared helpers for the Zemi prop builders ("soft toy clay on white", DESIGN.md section 9).

Everything is authored in Blender's Z-up, -Y-front space and exported with +Y up, so in glTF:
  x -> x,  z -> y (up),  -y -> z (towards the viewer).
1 Blender unit = 1 meter. Every model has a root empty at the origin (bottom center of the model).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------- palette

HEX = {
    "clay": "#f4f4f2",  # furniture white clay
    "paper": "#fbfbf8",  # paper sheets, a hair brighter than clay
    "ink": "#0e1116",
    "ink2": "#3b4150",
    "ink3": "#6b7280",
    "ink4": "#9aa1ad",
    "line": "#d8d8d2",
    "blue": "#3a6dc5",
    "red": "#f94141",
    "yellow": "#f7bf33",
    "green": "#0f8657",
    "blue50": "#ecf1fa",
    "coffee": "#4a2c1d",
    "steel": "#c9ccd2",
}


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h: str) -> tuple[float, float, float, float]:
    h = h.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


_MATS: dict[str, bpy.types.Material] = {}


def material(
    name: str,
    color: str,
    rough: float = 0.42,
    coat: float = 0.5,
    coat_rough: float = 0.28,
    sheen: float = 0.25,
    metallic: float = 0.0,
    emission: float = 0.0,
) -> bpy.types.Material:
    """Principled clay material. Exported as glTF PBR + clearcoat + sheen."""
    key = name
    if key in _MATS and _MATS[key].name in bpy.data.materials:
        return _MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    col = hex_linear(HEX.get(color, color))
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Sheen Roughness"].default_value = 0.5
    b.inputs["Sheen Tint"].default_value = (1, 1, 1, 1)
    if emission > 0:
        b.inputs["Emission Color"].default_value = col
        b.inputs["Emission Strength"].default_value = emission
    m.diffuse_color = col
    _MATS[key] = m
    return m


# --------------------------------------------------------------------------- scene

def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


def root(name: str) -> bpy.types.Object:
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.05
    bpy.context.scene.collection.objects.link(e)
    return e


def empty(name: str, parent: bpy.types.Object, loc=(0, 0, 0), rot=(0, 0, 0)) -> bpy.types.Object:
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = 0.03
    bpy.context.scene.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    e.rotation_euler = rot
    return e


def link(obj: bpy.types.Object, parent: bpy.types.Object | None) -> bpy.types.Object:
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def _finish(obj, mat, smooth=True, sharp_angle=40.0, weighted=False, keep_uv=False):
    me = obj.data
    if mat is not None:
        me.materials.clear()
        me.materials.append(mat)
    if smooth:
        me.shade_smooth()
        if sharp_angle is not None:
            me.set_sharp_from_angle(angle=math.radians(sharp_angle))
    if weighted:
        mod = obj.modifiers.new("weighted", "WEIGHTED_NORMAL")
        mod.mode = "FACE_AREA"
        mod.weight = 50
        mod.keep_sharp = True
    obj["keep_uv"] = keep_uv
    return obj


def mesh_object(name: str, me: bpy.types.Mesh, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)) -> bpy.types.Object:
    me.name = name
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    obj.rotation_euler = rot
    return link(obj, parent)


# --------------------------------------------------------------------------- 2D profile helpers

def fillet(points: list[tuple[float, float, float]], seg: int = 6) -> list[tuple[float, float]]:
    """Round the corners of a polyline. points = (x, y, radius); endpoints keep their position."""
    out: list[tuple[float, float]] = []
    points = [tuple(p) if len(p) == 3 else (p[0], p[1], 0.0) for p in points]
    n = len(points)
    for i, (x, y, r) in enumerate(points):
        if i == 0 or i == n - 1 or r <= 0:
            out.append((x, y))
            continue
        p = Vector((x, y))
        a = Vector(points[i - 1][:2])
        b = Vector(points[i + 1][:2])
        u = (a - p).normalized()
        v = (b - p).normalized()
        cosang = max(-1.0, min(1.0, u.dot(v)))
        theta = math.acos(cosang)
        if theta < 1e-3 or abs(theta - math.pi) < 1e-3:
            out.append((x, y))
            continue
        t = r / math.tan(theta / 2)
        t = min(t, (a - p).length * 0.5, (b - p).length * 0.5)
        rr = t * math.tan(theta / 2)
        s = p + u * t
        e = p + v * t
        bis = (u + v).normalized()
        c = p + bis * (rr / math.sin(theta / 2))
        a0 = math.atan2(s.y - c.y, s.x - c.x)
        a1 = math.atan2(e.y - c.y, e.x - c.x)
        d = a1 - a0
        while d > math.pi:
            d -= 2 * math.pi
        while d < -math.pi:
            d += 2 * math.pi
        for k in range(seg + 1):
            ang = a0 + d * k / seg
            out.append((c.x + rr * math.cos(ang), c.y + rr * math.sin(ang)))
    return out


def lathe(name: str, profile: list[tuple[float, float]], mat, parent=None, loc=(0, 0, 0), segments: int = 64,
          sharp_angle: float | None = 50.0) -> bpy.types.Object:
    """Revolve a (radius, z) profile around Z. Radius 0 at the ends closes the solid with a pole."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            ring = []
            for k in range(segments):
                a = 2 * math.pi * k / segments
                ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
            rings.append(ring)
    for ra, rb in zip(rings, rings[1:]):
        if len(ra) == 1 and len(rb) == 1:
            continue
        if len(ra) == 1:
            for k in range(segments):
                bm.faces.new((ra[0], rb[(k + 1) % segments], rb[k]))
        elif len(rb) == 1:
            for k in range(segments):
                bm.faces.new((ra[k], ra[(k + 1) % segments], rb[0]))
        else:
            for k in range(segments):
                bm.faces.new((ra[k], ra[(k + 1) % segments], rb[(k + 1) % segments], rb[k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = mesh_object(name, me, parent, loc)
    return _finish(obj, mat, sharp_angle=sharp_angle)


def rounded_box(name: str, size, radius: float, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), segments: int = 4,
                keep_uv=False) -> bpy.types.Object:
    """Box with beveled edges and hardened normals, centered on loc."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = mesh_object(name, me, parent, loc, rot)
    r = min(radius, min(size) * 0.499)
    if r > 0:
        bev = obj.modifiers.new("bevel", "BEVEL")
        bev.width = r
        bev.segments = segments
        bev.limit_method = "NONE"
        bev.harden_normals = True
    return _finish(obj, mat, sharp_angle=None, keep_uv=keep_uv)


def capsule(name: str, a, b, radius: float, mat, parent=None, segments: int = 24, rings: int = 6) -> bpy.types.Object:
    """Rounded rod from point a to point b (Blender space)."""
    a, b = Vector(a), Vector(b)
    length = (b - a).length
    prof = [(0.0, 0.0)]
    for k in range(1, rings + 1):
        t = k / rings * (math.pi / 2)
        prof.append((radius * math.sin(t), radius - radius * math.cos(t)))
    for k in range(rings, -1, -1):
        t = k / rings * (math.pi / 2)
        prof.append((radius * math.sin(t), length - radius + radius * math.cos(t)))
    prof = [(max(r, 0.0), z) for r, z in prof]
    obj = lathe(name, prof, mat, parent, segments=segments, sharp_angle=None)
    d = (b - a).normalized()
    q = Vector((0, 0, 1)).rotation_difference(d)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = q
    obj.location = a
    return obj


def torus(name: str, major: float, minor: float, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0),
          major_seg=64, minor_seg=16, arc: float = 2 * math.pi) -> bpy.types.Object:
    bm = bmesh.new()
    closed = arc >= 2 * math.pi - 1e-6
    n_major = major_seg if closed else major_seg + 1
    rings = []
    for i in range(n_major):
        u = arc * i / major_seg
        ring = []
        for j in range(minor_seg):
            v = 2 * math.pi * j / minor_seg
            x = (major + minor * math.cos(v)) * math.cos(u)
            y = (major + minor * math.cos(v)) * math.sin(u)
            z = minor * math.sin(v)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    pairs = list(zip(rings, rings[1:] + ([rings[0]] if closed else [])))
    for ra, rb in pairs:
        for j in range(minor_seg):
            bm.faces.new((ra[j], rb[j], rb[(j + 1) % minor_seg], ra[(j + 1) % minor_seg]))
    if not closed:
        # round end caps
        for ring, sign in ((rings[0], -1), (rings[-1], 1)):
            c = sum((v.co for v in ring), Vector()) / len(ring)
            cv = bm.verts.new(c)
            for j in range(minor_seg):
                f = (ring[j], ring[(j + 1) % minor_seg], cv) if sign > 0 else (ring[(j + 1) % minor_seg], ring[j], cv)
                bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = mesh_object(name, me, parent, loc, rot)
    return _finish(obj, mat, sharp_angle=None)


def uv_sphere(name: str, radius: float, mat, parent=None, loc=(0, 0, 0), seg=32, rings=16, scale=(1, 1, 1)):
    prof = []
    for k in range(rings + 1):
        t = math.pi * k / rings
        prof.append((radius * math.sin(t), -radius * math.cos(t)))
    obj = lathe(name, prof, mat, parent, loc=loc, segments=seg, sharp_angle=None)
    obj.scale = scale
    return obj


def extrude2d(name: str, outlines: list[list[tuple[float, float]]], depth: float, bevel: float, mat, parent=None,
              loc=(0, 0, 0), rot=(0, 0, 0), bevel_res: int = 3, keep_uv=False) -> bpy.types.Object:
    """Extrude closed 2D outlines (XY plane) to `depth` with rounded edges. Holes: pass extra outlines."""
    cu = bpy.data.curves.new(name + "_curve", "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = max(depth / 2 - bevel, 0.0)
    cu.bevel_depth = bevel
    cu.bevel_resolution = bevel_res
    cu.resolution_u = 2
    for pts in outlines:
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for p, (x, y) in zip(sp.points, pts):
            p.co = (x, y, 0, 1)
        sp.use_cyclic_u = True
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    obj = mesh_object(name, me, parent, loc, rot)
    _weld(obj)
    return _finish(obj, mat, sharp_angle=None, weighted=True, keep_uv=keep_uv)


def text_mesh(name: str, body: str, font_path: str, size: float, depth: float, bevel: float, mat, parent=None,
              loc=(0, 0, 0), rot=(0, 0, 0)) -> bpy.types.Object:
    cu = bpy.data.curves.new(name + "_text", "FONT")
    cu.body = body
    cu.font = bpy.data.fonts.load(font_path, check_existing=True)
    cu.size = size
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = max(depth / 2 - bevel, 0.0)
    cu.bevel_depth = bevel
    cu.bevel_resolution = 3
    cu.resolution_u = 6
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    obj = mesh_object(name, me, parent, loc, rot)
    _weld(obj)
    return _finish(obj, mat, sharp_angle=None, weighted=True)


def _weld(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(obj.data)
    bm.free()


def poly_mesh(name: str, verts, faces, mat, parent=None, loc=(0, 0, 0), thickness: float = 0.0, bevel: float = 0.0,
              sharp_angle: float | None = 30.0) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    obj = mesh_object(name, me, parent, loc)
    if thickness > 0:
        s = obj.modifiers.new("solidify", "SOLIDIFY")
        s.thickness = thickness
        s.offset = 0
        s.use_even_offset = True
    if bevel > 0:
        b = obj.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 2
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(50)
        b.harden_normals = True
    return _finish(obj, mat, sharp_angle=sharp_angle if bevel == 0 else None)


def superellipse(a: float, b: float, n: float = 4.0, count: int = 96, start: float = 0.0):
    pts = []
    for k in range(count):
        t = start + 2 * math.pi * k / count
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / n), c)
        y = b * math.copysign(abs(s) ** (2 / n), s)
        pts.append((x, y))
    return pts


def circle_pts(r: float, count: int = 48, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * math.pi * k / count), cy + r * math.sin(2 * math.pi * k / count)) for k in range(count)]


def rounded_poly(pts: list[tuple[float, float]], radius: float, seg: int = 6):
    """Round every corner of a closed polygon."""
    n = len(pts)
    ext = [pts[-1]] + pts + [pts[0]]
    out = []
    for i in range(1, n + 1):
        trio = [(*ext[i - 1], 0), (*ext[i], radius), (*ext[i + 1], 0)]
        out.extend(fillet(trio, seg)[1:-1])
    return out


# --------------------------------------------------------------------------- export + meta

def to_gltf(v: Vector) -> list[float]:
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def world_bbox(objs) -> tuple[Vector, Vector]:
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = o.matrix_world
        for v in me.vertices:
            w = mw @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
        ev.to_mesh_clear()
    return lo, hi


def strip_uvs():
    for o in bpy.data.objects:
        if o.type == "MESH" and not o.get("keep_uv", False):
            while o.data.uv_layers:
                o.data.uv_layers.remove(o.data.uv_layers[0])


def export(model: str, out_dir: Path, meta_extra: dict | None = None) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    strip_uvs()
    path = out_dir / f"{model}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=True,
        export_tangents=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_animations=False,
        export_attributes=False,
        use_selection=False,
        use_visible=False,
    )
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    lo, hi = world_bbox(meshes)
    glo, ghi = to_gltf(lo), to_gltf(hi)
    # y-up + z flip: min/max per axis after conversion
    bmin = [min(glo[i], ghi[i]) for i in range(3)]
    bmax = [max(glo[i], ghi[i]) for i in range(3)]
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        ev.to_mesh_clear()
    meta = {
        "model": model,
        "meshes": sorted(o.name for o in meshes),
        "nodes": sorted(o.name for o in bpy.data.objects),
        "materials": sorted({s.material.name for o in meshes for s in o.material_slots if s.material}),
        "bbox": {"min": bmin, "max": bmax, "size": [round(bmax[i] - bmin[i], 5) for i in range(3)]},
        "triangles": tris,
        "pivots": {
            o.name: {"position": to_gltf(o.matrix_world.translation)}
            for o in bpy.data.objects
            if o.type == "EMPTY" and o.parent is not None
        },
    }
    if meta_extra:
        meta.update(meta_extra)
    (out_dir / f"{model}.meta.json").write_text(json.dumps(meta, indent=2))
    return meta


# --------------------------------------------------------------------------- preview render

def render_preview(model: str, png: Path, view=(1.0, -1.35, 0.85), res: int = 900, lens: float = 70.0,
                   floor: bool = True, ambient: float = 0.4, light: float = 0.34) -> None:
    scene = bpy.context.scene
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    lo, hi = world_bbox(meshes)
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.01)

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.film_transparent = False
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    ee = scene.eevee
    ee.taa_render_samples = 64
    ee.use_shadows = True
    ee.use_raytracing = True
    ee.fast_gi_method = "GLOBAL_ILLUMINATION"
    ee.use_fast_gi = True

    # white backdrop for camera rays, dimmer ambient for lighting so brand colors don't clip
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes.get("Background")
    bg.inputs["Color"].default_value = (1, 1, 1, 1)
    bg.inputs["Strength"].default_value = ambient
    cam_bg = nt.nodes.new("ShaderNodeBackground")
    cam_bg.inputs["Color"].default_value = (1, 1, 1, 1)
    cam_bg.inputs["Strength"].default_value = 1.0
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.get("World Output")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(bg.outputs[0], mix.inputs[1])
    nt.links.new(cam_bg.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    scene.world = world

    d = Vector(view).normalized()
    fov = 2 * math.atan(18 / lens)
    dist = radius / math.sin(fov / 2) * 1.08
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = center + d * dist
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (center - cam.location).to_track_quat("-Z", "Y")
    cam_data.clip_start = dist * 0.01
    cam_data.clip_end = dist * 10
    scene.camera = cam

    s = radius * 3.2
    def area(name, loc, energy, size):
        ld = bpy.data.lights.new(name, "AREA")
        ld.shape = "DISK"
        ld.size = size
        ld.energy = energy
        lo_ = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo_)
        lo_.location = loc
        lo_.rotation_mode = "QUATERNION"
        lo_.rotation_quaternion = (center - Vector(loc)).to_track_quat("-Z", "Y")
        return lo_

    k = s * s * light
    area("key", center + Vector((-0.9, -0.8, 1.6)).normalized() * s, 38 * k, s * 0.9)
    area("fill", center + Vector((1.2, -0.6, 0.5)).normalized() * s, 12 * k, s * 1.2)
    area("rim", center + Vector((0.3, 1.2, 1.0)).normalized() * s, 18 * k, s * 0.8)

    tmp = []
    if floor:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=radius * 40)
        me = bpy.data.meshes.new("preview_floor")
        bm.to_mesh(me)
        bm.free()
        fl = bpy.data.objects.new("preview_floor", me)
        fl.location = (center.x, center.y, lo.z)
        scene.collection.objects.link(fl)
        # "shadow catcher" floor: lit diffuse -> luminance -> remapped so open floor is pure white
        # and only contact/cast shadows darken it (no grey horizon band).
        fm = bpy.data.materials.new("preview_floor")
        fm.use_nodes = True
        nt = fm.node_tree
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(n)
        mo = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
        dif.inputs["Color"].default_value = (1, 1, 1, 1)
        s2r = nt.nodes.new("ShaderNodeShaderToRGB")
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.clamp = True
        mr.inputs["From Min"].default_value = 0.04
        mr.inputs["From Max"].default_value = ambient * 0.92
        mr.inputs["To Min"].default_value = 0.62
        mr.inputs["To Max"].default_value = 1.0
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(dif.outputs[0], s2r.inputs[0])
        nt.links.new(s2r.outputs["Color"], bw.inputs[0])
        nt.links.new(bw.outputs[0], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], em.inputs["Color"])
        nt.links.new(em.outputs[0], mo.inputs["Surface"])
        me.materials.append(fm)
        tmp.append(fl)

    scene.render.filepath = str(png)
    scene.render.image_settings.file_format = "PNG"
    png.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    for o in tmp:
        bpy.data.objects.remove(o)
