import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { SHAPE_COLORS, type ShapeName } from '@zemi/shared';

export interface ClayOptions {
  roughness?: number;
  clearcoat?: number;
  sheen?: number;
}

const cache = new Map<string, MeshPhysicalMaterial>();

/**
 * "Soft toy clay" material (DESIGN.md section 9). Colors are brand hexes: three's color
 * management converts sRGB hex to linear for us, so pass the hex as-is.
 * Cached per color + options, so reuse is free. Don't mutate the returned material.
 */
export function clayMaterial(color: string, opts: ClayOptions = {}): MeshPhysicalMaterial {
  const key = `${color}|${opts.roughness ?? ''}|${opts.clearcoat ?? ''}|${opts.sheen ?? ''}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshPhysicalMaterial({
      color: new Color(color),
      roughness: opts.roughness ?? 0.38,
      metalness: 0,
      clearcoat: opts.clearcoat ?? 0.4,
      clearcoatRoughness: 0.32,
      // A little sheen reads as soft clay; more washes the brand colors out.
      sheen: opts.sheen ?? 0.22,
      sheenRoughness: 0.75,
      sheenColor: new Color('#ffffff'),
    });
    cache.set(key, m);
  }
  return m;
}

/** Clay in a shape's brand color. */
export const shapeClay = (shape: ShapeName, opts?: ClayOptions) => clayMaterial(SHAPE_COLORS[shape], opts);

let eyeMat: MeshStandardMaterial | null = null;
let glintMat: MeshStandardMaterial | null = null;

/** Glossy ink for eyes. */
export function eyeMaterial() {
  eyeMat ??= new MeshStandardMaterial({ color: new Color('#0e1116'), roughness: 0.18, metalness: 0 });
  return eyeMat;
}

/** Unlit-looking white for the eye glint. */
export function glintMaterial() {
  glintMat ??= new MeshStandardMaterial({ color: '#ffffff', emissive: new Color('#ffffff'), emissiveIntensity: 1, roughness: 1 });
  return glintMat;
}
