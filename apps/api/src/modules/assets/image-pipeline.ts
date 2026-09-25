import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { IMAGE_WIDTHS, type Adjust, type Crop } from '@zemi/shared';
import sharp, { type Metadata, type Sharp } from 'sharp';
import { decodeToPng } from '../../common/ffmpeg.js';

sharp.cache(false);
sharp.concurrency(Math.max(1, Math.min(4, availableParallelism() - 1)));

export interface ImageVariantFile {
  format: 'avif' | 'webp';
  width: number;
  height: number;
  path: string;
}

export interface ImagePipelineResult {
  files: ImageVariantFile[];
  /** Size of the cropped, adjusted master (before resizing). */
  width: number;
  height: number;
  lqip: string;
  color: string;
  /** The crop that was applied (the requested one, clamped, or the automatic centered crop). */
  crop: Crop | null;
  /** Oriented size of the original (EXIF applied), for crop UIs. */
  sourceWidth: number;
  sourceHeight: number;
}

export interface ImagePipelineOptions {
  crop?: Crop | null;
  adjust?: Adjust | null;
  /** width / height to enforce with a centered crop when no crop is given (PURPOSE_ASPECT). */
  aspect?: number | null;
  widths?: readonly number[];
  avifQuality?: number;
  webpQuality?: number;
}

export class ImageDecodeError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

const DEFAULT_ADJUST: Adjust = { brightness: 1, contrast: 1, saturation: 1, hue: 0, sharpen: false, grayscale: false };

/** Widths to produce: the standard ladder up to the master width, plus the master width itself. */
export function targetWidths(masterWidth: number, ladder: readonly number[] = IMAGE_WIDTHS): number[] {
  const max = ladder[ladder.length - 1] ?? 2560;
  const out = ladder.filter((w) => w <= masterWidth);
  if (masterWidth < max && !out.includes(masterWidth)) out.push(masterWidth);
  if (!out.length) out.push(Math.min(masterWidth, max));
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Largest centered rectangle with the given aspect (width / height). */
export function centeredCrop(width: number, height: number, aspect: number): Crop {
  let w = width;
  let h = Math.round(width / aspect);
  if (h > height) {
    h = height;
    w = Math.round(height * aspect);
  }
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h, rotation: 0 };
}

/** Clamp a crop to integer pixels inside a `width` x `height` frame. */
export function clampCrop(crop: Crop, width: number, height: number): Crop {
  const x = Math.min(Math.max(0, Math.round(crop.x)), Math.max(0, width - 1));
  const y = Math.min(Math.max(0, Math.round(crop.y)), Math.max(0, height - 1));
  const w = Math.max(1, Math.min(Math.round(crop.width), width - x));
  const h = Math.max(1, Math.min(Math.round(crop.height), height - y));
  return { x, y, width: w, height: h, rotation: crop.rotation ?? 0 };
}

const isIdentity = (a: Adjust) =>
  a.brightness === 1 && a.contrast === 1 && a.saturation === 1 && a.hue === 0 && !a.sharpen && !a.grayscale;

const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

interface RawImage {
  data: Buffer;
  info: { width: number; height: number; channels: 1 | 2 | 3 | 4 };
}

const fromRaw = (img: RawImage): Sharp => sharp(img.data, { raw: img.info });

async function toRaw(pipeline: Sharp): Promise<RawImage> {
  const { data, info } = await pipeline.raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  return { data, info: { width: info.width, height: info.height, channels: info.channels } };
}

/** Open an image with sharp, falling back to ffmpeg for formats libvips can't decode (HEIC/HEVC). */
async function openSource(input: string, workDir: string): Promise<{ path: string; meta: Metadata }> {
  try {
    const meta = await sharp(input, { failOn: 'error' }).metadata();
    // Decoding (not just the header) is where HEVC-in-HEIF fails, so try a tiny render too.
    await sharp(input, { failOn: 'error' }).resize(8, 8, { fit: 'inside' }).raw().toBuffer();
    return { path: input, meta };
  } catch (err) {
    const png = join(workDir, 'decoded.png');
    try {
      await decodeToPng(input, png);
      return { path: png, meta: await sharp(png).metadata() };
    } catch {
      throw new ImageDecodeError("We couldn't read that image. Try exporting it as JPEG or PNG.", err);
    }
  }
}

/**
 * Crop and adjust an original, then write AVIF + WebP variants into `outDir`.
 *
 * Coordinate contract (shared with the admin crop UI):
 * - The original is auto-oriented from EXIF first, so crop pixels refer to the image as people see it.
 * - `crop.rotation` (degrees, clockwise) rotates that oriented image around its center, expanding the
 *   canvas (white, or transparent for images with alpha). `x/y/width/height` are pixels in THAT
 *   rotated frame. With rotation 0 they are plain original pixels.
 * - Adjustments: brightness, saturation, hue via modulate; contrast is linear around mid-grey;
 *   optional sharpen and grayscale. Output is sRGB, 8-bit, metadata (EXIF/GPS) stripped.
 */
export async function runImagePipeline(input: string, outDir: string, opts: ImagePipelineOptions = {}): Promise<ImagePipelineResult> {
  const src = await openSource(input, outDir);
  const adjust = { ...DEFAULT_ADJUST, ...(opts.adjust ?? {}) };
  const rotation = ((Math.round((opts.crop?.rotation ?? 0) * 100) / 100) % 360 + 360) % 360;
  const hasAlpha = !!src.meta.hasAlpha;
  const background = hasAlpha ? { r: 255, g: 255, b: 255, alpha: 0 } : { r: 255, g: 255, b: 255, alpha: 1 };

  // Pass 1: orientation (+ rotation). Everything after works on raw sRGB pixels.
  let base = sharp(src.path, { failOn: 'none', autoOrient: true }).toColourspace('srgb');
  const oriented = await toRaw(base);
  const sourceWidth = oriented.info.width;
  const sourceHeight = oriented.info.height;
  let frame = oriented;
  if (rotation !== 0) {
    base = fromRaw(oriented).rotate(rotation, { background });
    frame = await toRaw(base);
  }

  // Pass 2: crop (requested, or centered to the purpose's aspect).
  let crop: Crop | null = null;
  if (opts.crop) crop = clampCrop(opts.crop, frame.info.width, frame.info.height);
  else if (opts.aspect) crop = centeredCrop(frame.info.width, frame.info.height, opts.aspect);
  if (crop) {
    const needed = crop.x !== 0 || crop.y !== 0 || crop.width !== frame.info.width || crop.height !== frame.info.height;
    if (needed) {
      frame = await toRaw(fromRaw(frame).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }));
    }
    crop = { ...crop, rotation };
  }

  // Pass 3: adjustments.
  if (!isIdentity(adjust)) {
    let p = fromRaw(frame);
    if (adjust.brightness !== 1 || adjust.saturation !== 1 || adjust.hue !== 0) {
      p = p.modulate({ brightness: adjust.brightness, saturation: adjust.saturation, hue: Math.round(adjust.hue) });
    }
    if (adjust.contrast !== 1) p = p.linear(adjust.contrast, 128 * (1 - adjust.contrast));
    if (adjust.sharpen) p = p.sharpen({ sigma: 1 });
    if (adjust.grayscale) p = p.grayscale();
    frame = await toRaw(p.toColourspace('srgb'));
  }

  const width = frame.info.width;
  const height = frame.info.height;

  // Variants.
  const files: ImageVariantFile[] = [];
  for (const w of targetWidths(width, opts.widths)) {
    const h = Math.max(1, Math.round((height * w) / width));
    const resized = w === width ? frame : await toRaw(fromRaw(frame).resize({ width: w, height: h, fit: 'fill', kernel: 'lanczos3' }));
    const avifPath = join(outDir, `w${w}.avif`);
    const webpPath = join(outDir, `w${w}.webp`);
    await fromRaw(resized).avif({ quality: opts.avifQuality ?? 55, effort: 4 }).toFile(avifPath);
    await fromRaw(resized).webp({ quality: opts.webpQuality ?? 80, effort: 4, smartSubsample: true }).toFile(webpPath);
    files.push({ format: 'avif', width: w, height: h, path: avifPath }, { format: 'webp', width: w, height: h, path: webpPath });
  }

  const lqipBuf = await fromRaw(frame).resize(24, 24, { fit: 'inside' }).webp({ quality: 50 }).toBuffer();
  const stats = await fromRaw(frame).stats();
  const d = stats.dominant;
  return {
    files,
    width,
    height,
    lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}`,
    color: `#${toHex(d.r)}${toHex(d.g)}${toHex(d.b)}`,
    crop,
    sourceWidth,
    sourceHeight,
  };
}
