import { BufferGeometry, ExtrudeGeometry, SphereGeometry, type Shape } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHAPE_PATHS_46, type ShapeName } from '@zemi/shared';

/** World units per 46-unit shape cell. Every character is ~2 units wide, like the unit sphere. */
export const SHAPE_SIZE = 2;
const S = SHAPE_SIZE / 46;

/** Extrusion depth in world units (chunky toy). */
export const SHAPE_DEPTH = 0.66;
const BEVEL = 0.24;

const cache = new Map<ShapeName, BufferGeometry>();

function svgShapes(shape: ShapeName): Shape[] {
  const loader = new SVGLoader();
  const data = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 46"><path d="${SHAPE_PATHS_46[shape]}"/></svg>`);
  // Each brand shape is a single closed subpath, so toShapes() returns exactly one Shape.
  return data.paths.flatMap((p) => p.toShapes());
}

/**
 * Geometry for a brand shape, centered at the origin, ~2 units across:
 * - circle: a sphere (radius 1)
 * - triangle, square, arch: SHAPE_PATHS_46 extruded with a soft bevel, smooth-shaded
 * Cached, shared between characters. Front face points +Z.
 */
export function shapeGeometry(shape: ShapeName): BufferGeometry {
  const hit = cache.get(shape);
  if (hit) return hit;
  let geo: BufferGeometry;
  if (shape === 'circle') {
    geo = new SphereGeometry(1, 64, 48);
  } else {
    const shapes = svgShapes(shape);
    const extruded = new ExtrudeGeometry(shapes, {
      depth: SHAPE_DEPTH / S - (2 * BEVEL) / S,
      bevelEnabled: true,
      bevelThickness: BEVEL / S,
      bevelSize: (BEVEL * 0.72) / S,
      bevelSegments: 10,
      curveSegments: 40,
    });
    // SVG y points down. Rotating 180deg around X flips y (upright) without mirroring, so the
    // triangle winding (and therefore normals) stays correct. Both caps are identical.
    extruded.rotateX(Math.PI);
    extruded.scale(S, S, S);
    extruded.center();
    // Smooth the bevel into the faces for a rounded clay look.
    extruded.deleteAttribute('normal');
    extruded.deleteAttribute('uv');
    const merged = mergeVertices(extruded, 1e-4);
    merged.computeVertexNormals();
    extruded.dispose();
    geo = merged;
  }
  geo.computeBoundingBox();
  cache.set(shape, geo);
  return geo;
}

/** Eye centers (x, y) on the front face per shape, in world units, plus eye radius. */
export const EYES_3D: Record<ShapeName, { l: [number, number]; r: [number, number]; size: number }> = {
  circle: { l: [-0.3, 0.12], r: [0.3, 0.12], size: 0.14 },
  triangle: { l: [-0.2, -0.34], r: [0.2, -0.34], size: 0.12 },
  square: { l: [-0.32, 0.1], r: [0.32, 0.1], size: 0.145 },
  arch: { l: [-0.32, 0.02], r: [0.32, 0.02], size: 0.145 },
};

/** z of the front surface at (x, y) for placing eyes. */
export function frontZ(shape: ShapeName, x: number, y: number): number {
  if (shape === 'circle') return Math.sqrt(Math.max(0, 1 - x * x - y * y));
  return SHAPE_DEPTH / 2;
}
