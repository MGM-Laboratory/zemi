/**
 * SVG building blocks for procedural seed artwork in the Zemi brand language.
 * Shapes are the four brand shapes (46x46 source box). Characters = shape + two ink eyes with a white
 * glint. No mouths, no limbs, no text (DESIGN.md sections 1 and 3).
 */
import { BRAND, SHAPES_46 } from './common.mjs';

export const f = (v) => Number(v.toFixed(1));

/** A brand shape centered at (cx, cy), `size` px wide. */
export function shape(name, cx, cy, size, fill, { rot = 0, opacity, blend, filter, stroke, strokeWidth, extra = '' } = {}) {
  const s = size / 46;
  const style = blend ? ` style="mix-blend-mode:${blend}"` : '';
  const op = opacity !== undefined ? ` opacity="${opacity}"` : '';
  const st = stroke ? ` stroke="${stroke}" stroke-width="${f(strokeWidth / s)}" stroke-linejoin="round"` : '';
  const path = `<path d="${SHAPES_46[name]}" fill="${fill}"${st}${op}${style}${extra} transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)}) scale(${s.toFixed(4)}) translate(-23 -23)"/>`;
  // filters go on an untransformed group so blur/offset stay in poster pixels
  return filter ? `<g filter="url(#${filter})">${path}</g>` : path;
}

const EYE_AT = {
  circle: { x: 0.17, y: -0.05 },
  square: { x: 0.17, y: -0.06 },
  triangle: { x: 0.105, y: 0.15 },
  arch: { x: 0.17, y: 0.06 },
};

/** Two ink eyes with a white glint. look = [-1..1, -1..1]. */
export function eyes(name, cx, cy, size, { look = [0, 0], blink = false, rot = 0, ink = BRAND.ink, scale = 1 } = {}) {
  const e = EYE_AT[name];
  const rx = 0.056 * size * scale;
  const ry = 0.072 * size * scale;
  const out = [];
  for (const side of [-1, 1]) {
    const x = side * e.x * size + look[0] * 0.035 * size;
    const y = e.y * size + look[1] * 0.03 * size;
    if (blink) {
      out.push(`<path d="M${f(x - rx)} ${f(y)} Q${f(x)} ${f(y + ry * 0.9)} ${f(x + rx)} ${f(y)}" fill="none" stroke="${ink}" stroke-width="${f(size * 0.026)}" stroke-linecap="round"/>`);
    } else {
      out.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${ink}"/>`);
      out.push(`<circle cx="${f(x + rx * 0.32)}" cy="${f(y - ry * 0.36)}" r="${f(rx * 0.36)}" fill="#ffffff"/>`);
    }
  }
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${f(rot)})">${out.join('')}</g>`;
}

export function character(name, cx, cy, size, fill, opts = {}) {
  return shape(name, cx, cy, size, fill, opts) + eyes(name, cx, cy, size, opts);
}

/** Graph paper lines. */
export function graphPaper(W, H, step, color, { width = 2, opacity = 1, major = 0, majorColor, majorWidth = 3 } = {}) {
  const d = [];
  for (let x = step; x < W; x += step) d.push(`M${x} 0V${H}`);
  for (let y = step; y < H; y += step) d.push(`M0 ${y}H${W}`);
  let out = `<path d="${d.join('')}" stroke="${color}" stroke-width="${width}" opacity="${opacity}" fill="none"/>`;
  if (major) {
    const m = [];
    for (let x = step * major; x < W; x += step * major) m.push(`M${x} 0V${H}`);
    for (let y = step * major; y < H; y += step * major) m.push(`M0 ${y}H${W}`);
    out += `<path d="${m.join('')}" stroke="${majorColor ?? color}" stroke-width="${majorWidth}" opacity="${opacity}" fill="none"/>`;
  }
  return out;
}

/** Paper grain, blended softly so white stays white. */
export function grainDefs(seed, freq = 0.8) {
  return `<filter id="grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`;
}
export function grain(W, H, opacity = 0.5) {
  return `<rect width="${W}" height="${H}" filter="url(#grain)" opacity="${opacity}" style="mix-blend-mode:soft-light"/>`;
}

export function shadowDef(id = 'shadow', { dy = 18, blur = 22, opacity = 0.18 } = {}) {
  return `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="${BRAND.ink}" flood-opacity="${opacity}"/></filter>`;
}

/** Smooth path through points (Catmull-Rom -> cubic Bezier). */
export function smoothPath(pts, tension = 0.5) {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2, p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2, p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** Closed smooth blob path. */
export function closedSmooth(pts, tension = 0.5) {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2, p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2, p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

export function svgDoc(W, H, bg, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" fill="${bg}"/>${body}</svg>`;
}
