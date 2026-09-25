import { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER } from '@zemi/shared';
import QRCode from 'qrcode';
import sharp from 'sharp';

/**
 * Branded ticket QR: error correction H, ink dots, rounded finder and alignment patterns, the Zemi mark on
 * a white plate in the middle, a 4 module quiet zone. Pure SVG, so the PNG is just sharp rasterizing it.
 *
 * Scan safety: finders and alignment patterns are drawn as solid rounded squares (dots there hurt detection),
 * the logo covers about 5% of the modules (H corrects up to 30%), dots keep 88% of a module.
 */

const INK = '#0e1116';
const QUIET = 4;
const DOT_R = 0.44;

/** Row/col centers of alignment patterns (same math as qrcode/lib/core/alignment-pattern). */
function alignmentCenters(version: number, size: number): Array<[number, number]> {
  if (version === 1) return [];
  const posCount = Math.floor(version / 7) + 2;
  const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
  const coords = [size - 7];
  for (let i = 1; i < posCount - 1; i++) coords[i] = coords[i - 1]! - intervals;
  coords.push(6);
  coords.reverse();
  const out: Array<[number, number]> = [];
  const last = coords.length - 1;
  for (let i = 0; i < coords.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      // Skip the three that overlap finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      out.push([coords[i]!, coords[j]!]);
    }
  }
  return out;
}

const f = (n: number) => Number(n.toFixed(3)).toString();

export interface QrSvgOptions {
  /** Output width/height in px (the viewBox is in modules). Default 1024. */
  size?: number;
  /** Include the Zemi mark in the middle. Default true. */
  logo?: boolean;
}

export function ticketQrSvg(text: string, opts: QrSvgOptions = {}): string {
  const px = opts.size ?? 1024;
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const total = n + QUIET * 2;
  const isDark = (r: number, c: number) => qr.modules.get(r, c) === 1 || (qr.modules.get(r, c) as unknown) === true;

  // Regions drawn as shapes instead of dots.
  const finders: Array<[number, number]> = [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ];
  const aligns = alignmentCenters(qr.version, n);
  const inFinder = (r: number, c: number) => finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);
  const inAlign = (r: number, c: number) => aligns.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2);

  // Logo plate: an odd number of modules, about 22% of the symbol, centered.
  const logo = opts.logo !== false;
  let plate = Math.round(n * 0.22);
  if (plate % 2 === 0) plate += 1;
  const plateStart = (n - plate) / 2;
  const inPlate = (r: number, c: number) =>
    logo && r + 0.5 > plateStart - 0.35 && r + 0.5 < plateStart + plate + 0.35 && c + 0.5 > plateStart - 0.35 && c + 0.5 < plateStart + plate + 0.35;

  const parts: string[] = [];
  parts.push(`<rect width="${total}" height="${total}" fill="#ffffff"/>`);

  // Data dots as one path (compact): each dot is a circle drawn with two arcs.
  let dots = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!isDark(r, c) || inFinder(r, c) || inAlign(r, c) || inPlate(r, c)) continue;
      const cx = c + QUIET + 0.5;
      const cy = r + QUIET + 0.5;
      dots += `M${f(cx - DOT_R)} ${f(cy)}a${DOT_R} ${DOT_R} 0 1 0 ${f(DOT_R * 2)} 0a${DOT_R} ${DOT_R} 0 1 0 ${f(-DOT_R * 2)} 0z`;
    }
  }
  parts.push(`<path fill="${INK}" d="${dots}"/>`);

  // Finder patterns: rounded ring + rounded eye.
  for (const [fr, fc] of finders) {
    const x = fc + QUIET;
    const y = fr + QUIET;
    parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.7" fill="none" stroke="${INK}" stroke-width="1"/>`);
    parts.push(`<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="${INK}"/>`);
  }
  // Alignment patterns: small ring + center.
  for (const [ar, ac] of aligns) {
    if (inPlate(ar, ac)) continue;
    const x = ac - 2 + QUIET;
    const y = ar - 2 + QUIET;
    parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="4" height="4" rx="1.1" fill="none" stroke="${INK}" stroke-width="1"/>`);
    parts.push(`<rect x="${x + 2}" y="${y + 2}" width="1" height="1" rx="0.3" fill="${INK}"/>`);
  }

  if (logo) {
    const x = plateStart + QUIET;
    const pad = plate * 0.16;
    const markSize = plate - pad * 2;
    const s = markSize / 100;
    parts.push(`<rect x="${f(x)}" y="${f(x)}" width="${plate}" height="${plate}" rx="${f(plate * 0.24)}" fill="#ffffff"/>`);
    const paths = SHAPE_ORDER.map((shape) => `<path d="${MARK_PATHS[shape]}" fill="${SHAPE_COLORS[shape]}"/>`).join('');
    parts.push(`<g transform="translate(${f(x + pad)} ${f(x + pad)}) scale(${f(s)})">${paths}</g>`);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="geometricPrecision" role="img" aria-label="Zemi ticket QR code">` +
    parts.join('') +
    '</svg>'
  );
}

export async function ticketQrPng(text: string, size = 1024): Promise<Buffer> {
  const svg = ticketQrSvg(text, { size });
  return sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).png({ compressionLevel: 9, palette: true }).toBuffer();
}

/** Tiny LRU so repeated requests (email + page + download) don't re-render the same PNG. */
export class QrCache {
  private readonly map = new Map<string, Buffer>();
  constructor(private readonly max = 256) {}

  async get(key: string, make: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const buf = await make();
    this.map.set(key, buf);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
    return buf;
  }
}
