/**
 * Pixel preprocessing for hard QR frames (dim rooms, glare on phone screens, low contrast
 * prints, inverted codes). Pure functions on RGBA buffers, safe in a Web Worker and on the
 * main thread. No canvas needed.
 */

export type FrameVariant = 'raw' | 'enhance' | 'invert' | 'crop';

export interface RgbaFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Luma (Rec. 601, integer math) of an RGBA buffer. */
export function toGray(src: RgbaFrame): Uint8ClampedArray {
  const n = src.width * src.height;
  const out = new Uint8ClampedArray(n);
  const d = src.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = (d[j]! * 77 + d[j + 1]! * 150 + d[j + 2]! * 29) >> 8;
  }
  return out;
}

/**
 * Contrast stretch by histogram percentiles (1% to 99%) so a murky frame uses the full range.
 * Cheaper and steadier than full equalization, and it keeps the dot pattern's shape.
 */
export function stretch(gray: Uint8ClampedArray, lowPct = 0.01, highPct = 0.99): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]!]!++;
  const lowCount = gray.length * lowPct;
  const highCount = gray.length * highPct;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= lowCount) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= highCount) {
      hi = v;
      break;
    }
  }
  if (hi - lo < 8) return gray; // flat frame: nothing to stretch
  const lut = new Uint8ClampedArray(256);
  const scale = 255 / (hi - lo);
  for (let v = 0; v < 256; v++) lut[v] = (v - lo) * scale;
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = lut[gray[i]!]!;
  return out;
}

export function invert(gray: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = 255 - gray[i]!;
  return out;
}

/** Bilinear upscale of a gray image by an integer-ish factor. */
export function upscale(gray: Uint8ClampedArray, w: number, h: number, factor: number): { gray: Uint8ClampedArray; width: number; height: number } {
  const W = Math.round(w * factor);
  const H = Math.round(h * factor);
  const out = new Uint8ClampedArray(W * H);
  const sx = (w - 1) / Math.max(1, W - 1);
  const sy = (h - 1) / Math.max(1, H - 1);
  for (let y = 0; y < H; y++) {
    const fy = y * sy;
    const y0 = fy | 0;
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = x * sx;
      const x0 = fx | 0;
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const a = gray[y0 * w + x0]!;
      const b = gray[y0 * w + x1]!;
      const c = gray[y1 * w + x0]!;
      const d = gray[y1 * w + x1]!;
      out[y * W + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return { gray: out, width: W, height: H };
}

/** Light unsharp mask (3x3 Laplacian, amount 0.6). Edges get crisper, flat areas stay put. */
export function sharpen(gray: Uint8ClampedArray, w: number, h: number, amount = 0.6): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  out.set(gray);
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const c = gray[i]!;
      const lap = 4 * c - gray[i - 1]! - gray[i + 1]! - gray[i - w]! - gray[i + w]!;
      out[i] = c + amount * lap;
    }
  }
  return out;
}

/** Gray back to RGBA (what BarcodeDetector.detect wants in an ImageData). */
export function grayToRgba(gray: Uint8ClampedArray, width: number, height: number): RgbaFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    const v = gray[i]!;
    data[j] = v;
    data[j + 1] = v;
    data[j + 2] = v;
    data[j + 3] = 255;
  }
  return { width, height, data };
}

/**
 * Build the frame for a variant.
 * - raw: as captured
 * - enhance: grayscale + percentile contrast stretch
 * - invert: enhance, then inverted (white-on-black codes, some glare cases)
 * - crop: the input is already the center crop (full sensor resolution); upscale small crops
 *   to about 900 px and sharpen, so a small or far-away code gets more pixels per module
 */
export function prepareVariant(variant: FrameVariant, frame: RgbaFrame): RgbaFrame {
  if (variant === 'raw') return frame;
  const gray = stretch(toGray(frame));
  if (variant === 'enhance') return grayToRgba(gray, frame.width, frame.height);
  if (variant === 'invert') return grayToRgba(invert(gray), frame.width, frame.height);
  // crop
  const side = Math.max(frame.width, frame.height);
  const factor = side < 900 ? Math.min(2.5, 900 / side) : 1;
  const up = factor > 1.05 ? upscale(gray, frame.width, frame.height, factor) : { gray, width: frame.width, height: frame.height };
  return grayToRgba(sharpen(up.gray, up.width, up.height), up.width, up.height);
}

/**
 * The rotation the scan loop walks through: the raw frame every other tick, and one
 * preprocessed variant in between. At about 13 fps each variant gets tried a few times a second.
 */
export const VARIANT_CYCLE: readonly FrameVariant[] = ['raw', 'enhance', 'raw', 'invert', 'raw', 'crop'];
