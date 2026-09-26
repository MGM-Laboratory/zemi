'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { QrDetector } from './detector-client';
import { VARIANT_CYCLE, type FrameVariant } from './preprocess';

/**
 * About 12 to 15 scans a second: quick enough to feel instant, light enough for older phones.
 * 62 ms (not 66) so a 15 or 30 fps camera never drops to half rate on timer jitter.
 */
const MIN_INTERVAL_MS = 62;
/** Long side of the raw frame we hand to the detector. Bigger frames are slower, not better. */
const RAW_MAX = 1280;
/** The center crop matches the on-screen guide (a square of this share of the short side). */
export const GUIDE_SHARE = 0.62;
const CROP_MAX = 1100;

export interface ScanLoopStats {
  frames: number;
  hits: Partial<Record<FrameVariant, number>>;
  lastMs: number;
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * Runs detection on live video frames with requestVideoFrameCallback (rAF where missing),
 * throttled and back-pressured: a new frame is grabbed only after the detector answered.
 * Variants rotate (raw, enhanced, raw, inverted, raw, sharpened center crop) so hard frames
 * still read without paying for every variant on every frame.
 */
export function useScanLoop(
  videoRef: RefObject<HTMLVideoElement | null>,
  detector: QrDetector | null,
  active: boolean,
  onValue: (value: string, variant: FrameVariant) => void,
) {
  const cb = useRef(onValue);
  useEffect(() => {
    cb.current = onValue;
  });
  const stats = useRef<ScanLoopStats>({ frames: 0, hits: {}, lastMs: 0 });

  useEffect(() => {
    const video = videoRef.current as VideoWithRvfc | null;
    if (!video || !detector || !active) return;
    let stopped = false;
    let busy = false;
    let last = 0;
    let tick = 0;
    let handle: number | null = null;
    const raw = document.createElement('canvas');
    const crop = document.createElement('canvas');
    const rawCtx = raw.getContext('2d', { willReadFrequently: true });
    const cropCtx = crop.getContext('2d', { willReadFrequently: true });
    if (!rawCtx || !cropCtx) return;

    const schedule = () => {
      if (stopped) return;
      if (typeof video.requestVideoFrameCallback === 'function') handle = video.requestVideoFrameCallback(step);
      else handle = requestAnimationFrame(step);
    };

    const grab = (variant: FrameVariant): ImageData | null => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh || video.readyState < 2) return null;
      if (variant === 'crop') {
        const side = Math.round(Math.min(vw, vh) * GUIDE_SHARE);
        const out = Math.min(side, CROP_MAX);
        if (crop.width !== out) {
          crop.width = out;
          crop.height = out;
        }
        cropCtx.drawImage(video, Math.round((vw - side) / 2), Math.round((vh - side) / 2), side, side, 0, 0, out, out);
        return cropCtx.getImageData(0, 0, out, out);
      }
      const scale = Math.min(1, RAW_MAX / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      if (raw.width !== w || raw.height !== h) {
        raw.width = w;
        raw.height = h;
      }
      rawCtx.drawImage(video, 0, 0, w, h);
      return rawCtx.getImageData(0, 0, w, h);
    };

    const step = () => {
      if (stopped) return;
      const now = performance.now();
      if (busy || now - last < MIN_INTERVAL_MS || document.visibilityState !== 'visible') {
        schedule();
        return;
      }
      const variant = VARIANT_CYCLE[tick % VARIANT_CYCLE.length]!;
      let frame: ImageData | null = null;
      try {
        frame = grab(variant);
      } catch {
        frame = null;
      }
      if (!frame) {
        schedule();
        return;
      }
      tick += 1;
      last = now;
      busy = true;
      const t0 = performance.now();
      detector
        .detect(frame, variant)
        .then((values) => {
          if (stopped) return;
          stats.current.frames += 1;
          stats.current.lastMs = performance.now() - t0;
          if (values.length) {
            stats.current.hits[variant] = (stats.current.hits[variant] ?? 0) + 1;
            values.forEach((v) => cb.current(v, variant));
          }
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
      schedule();
    };

    schedule();
    return () => {
      stopped = true;
      if (handle != null) {
        if (typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(handle);
        else cancelAnimationFrame(handle);
      }
    };
  }, [videoRef, detector, active]);

  return stats;
}
