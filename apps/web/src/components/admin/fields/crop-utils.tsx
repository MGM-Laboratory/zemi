'use client';

import type { Adjust, Crop } from '@zemi/shared';

/*
 * Crop helpers shared by the crop dialog and the upload fields. Kept apart from
 * crop-dialog.tsx so react-easy-crop only loads when the dialog opens.
 */

export const DEFAULT_ADJUST: Adjust = { brightness: 1, contrast: 1, saturation: 1, hue: 0, sharpen: false, grayscale: false };

export interface CropResult {
  /** In the pixel space of the (EXIF-oriented) original after rotating by `crop.rotation`. See the crop contract. */
  crop: Crop;
  adjust: Adjust;
}

/** CSS filter chain that previews the server-side adjustments. */
export function adjustToCssFilter(a: Adjust | null | undefined): string {
  if (!a) return 'none';
  const parts = [
    a.brightness !== 1 ? `brightness(${a.brightness})` : '',
    a.contrast !== 1 ? `contrast(${a.contrast})` : '',
    a.saturation !== 1 ? `saturate(${a.saturation})` : '',
    a.hue ? `hue-rotate(${a.hue}deg)` : '',
    a.grayscale ? 'grayscale(1)' : '',
    a.sharpen ? 'url(#zemi-sharpen)' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : 'none';
}

/** Hidden SVG filter used by the sharpen preview. Render once near any preview. */
export function SharpenFilterDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <filter id="zemi-sharpen">
        <feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 -0.6 0 -0.6 3.4 -0.6 0 -0.6 0" />
      </filter>
    </svg>
  );
}

/**
 * Render a small client-side preview of the crop (canvas), so the field shows the result
 * immediately while the server processes. Same math as the server (see the crop contract).
 */
export async function renderCropPreview(src: string, crop: Crop, adjust: Adjust, maxSize = 900): Promise<string | null> {
  try {
    const img = await loadImage(src);
    const rad = (crop.rotation * Math.PI) / 180;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const bw = Math.abs(Math.cos(rad) * w) + Math.abs(Math.sin(rad) * h);
    const bh = Math.abs(Math.sin(rad) * w) + Math.abs(Math.cos(rad) * h);
    const scale = Math.min(1, maxSize / Math.max(crop.width, crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width * scale));
    canvas.height = Math.max(1, Math.round(crop.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const f = adjustToCssFilter({ ...adjust, sharpen: false });
    if ('filter' in ctx) ctx.filter = f === 'none' ? 'none' : f;
    ctx.scale(scale, scale);
    ctx.translate(-crop.x, -crop.y);
    ctx.translate(bw / 2, bh / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.86));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
