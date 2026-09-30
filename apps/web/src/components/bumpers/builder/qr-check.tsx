'use client';

import type { BumperQrStyle } from '@zemi/shared';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { WASM_PATH } from '@/components/admin/scanner/detect-core';
import { Spinner } from '@/components/admin/ui/spinner';
import { cn } from '@/lib/admin/cn';
import { BrandQr, qrMatrix } from '../parts/qr';

/**
 * A live "will this scan?" check for QR codes in the builder. The QR is drawn exactly like the
 * slide draws it (style, color, logo), rasterized small and a little soft, like a phone sees a
 * projector from the back of the room, and decoded with ZXing (the barcode-detector ponyfill,
 * WebAssembly served from our own origin like the door scanner).
 */

type Status = 'idle' | 'checking' | 'ok' | 'warn' | 'unavailable';

interface Detector {
  detect(image: ImageData): Promise<Array<{ rawValue: string }>>;
}

let detector: Promise<Detector | null> | null = null;

function getDetector(): Promise<Detector | null> {
  detector ??= (async () => {
    try {
      const mod = await import('barcode-detector/ponyfill');
      try {
        const url = new URL(WASM_PATH, window.location.origin);
        url.searchParams.set('v', mod.ZXING_WASM_VERSION);
        const res = await fetch(url.toString(), { credentials: 'same-origin' });
        if (res.ok && (res.headers.get('content-type') ?? '').includes('wasm')) {
          await mod.prepareZXingModule({ overrides: { wasmBinary: await res.arrayBuffer() }, fireImmediately: true });
        }
      } catch {
        /* the package falls back to its CDN copy */
      }
      return new mod.BarcodeDetector({ formats: ['qr_code'] }) as unknown as Detector;
    } catch {
      detector = null;
      return null;
    }
  })();
  return detector;
}

/** Draw the QR svg at `px` wide on white (with a margin), optionally softened. */
async function rasterize(svg: SVGSVGElement, px: number, blur: number): Promise<ImageData> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(px));
  clone.setAttribute('height', String(px));
  clone.removeAttribute('style');
  clone.removeAttribute('class');
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const margin = Math.round(px * 0.12);
  const size = px + margin * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) throw new Error('No 2D canvas');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, size, size);
  if (blur) c.filter = `blur(${blur}px)`;
  c.drawImage(img, margin, margin, px, px);
  return c.getImageData(0, 0, size, size);
}

/**
 * The phone at the back of the room: the whole 1920 px slide lands on about 820 camera pixels,
 * a little soft from the projector. Below about 2.8 camera pixels per module a real phone
 * struggles even when a sharp decoder copes, so dense codes (long links, the logo's extra error
 * correction) get flagged before anyone has to find out live.
 */
const CAMERA = 820 / 1920;
const BLUR = 0.8;
const MIN_PX_PER_MODULE = 2.8;
const results = new Map<string, Exclude<Status, 'idle' | 'checking'>>();

async function check(svg: SVGSVGElement, expected: string, logo: boolean, size: number): Promise<Exclude<Status, 'idle' | 'checking'>> {
  const det = await getDetector();
  if (!det) return 'unavailable';
  const px = Math.round(Math.min(480, Math.max(60, size * CAMERA)));
  const modules = (qrMatrix(expected, logo)?.size ?? 0) + 8;
  try {
    const found = await det.detect(await rasterize(svg, px, BLUR));
    const read = found.some((f) => f.rawValue === expected);
    return read && px / modules >= MIN_PX_PER_MODULE ? 'ok' : 'warn';
  } catch {
    return 'unavailable';
  }
}

export interface QrCheckProps {
  /** The exact text the QR encodes. */
  value: string;
  style: BumperQrStyle;
  logo: boolean;
  /** Module color (hex), as the slide draws it. */
  color?: string;
  /** How big the QR is on the 1920 px slide (a small QR has to be simpler to scan). */
  size?: number;
  className?: string;
}

/** A small preview of the QR and a scan verdict: "Scans fine" or "Might not scan...". */
export function QrCheck({ value, style, logo, color, size = 420, className }: QrCheckProps) {
  const holder = useRef<HTMLDivElement>(null);
  const key = `${style}|${logo ? 1 : 0}|${color ?? ''}|${Math.round(size)}|${value}`;
  const [state, setState] = useState<{ key: string; status: Status }>({ key: '', status: 'idle' });

  useEffect(() => {
    if (!value.trim()) return;
    const cached = results.get(key);
    let alive = true;
    const t = setTimeout(
      async () => {
        if (cached) {
          setState({ key, status: cached });
          return;
        }
        setState({ key, status: 'checking' });
        const svg = holder.current?.querySelector('svg');
        if (!svg) return;
        const status = await check(svg, value, logo, size);
        if (status !== 'unavailable') results.set(key, status);
        if (alive) setState({ key, status });
      },
      cached ? 0 : 450,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key, value, logo, size]);

  const status: Status = !value.trim() ? 'idle' : state.key === key ? state.status : 'checking';
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border border-line bg-surface-muted p-2 pr-3', className)}>
      <div ref={holder} className="size-14 shrink-0 overflow-hidden rounded-lg bg-white" aria-hidden="true">
        {value.trim() ? <BrandQr value={value} style={style} logo={logo} color={color} /> : null}
      </div>
      <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug" role="status" aria-live="polite">
        {status === 'idle' ? (
          <span className="text-ink-3">Add a link and we&apos;ll check that it scans.</span>
        ) : status === 'checking' ? (
          <span className="flex items-center gap-2 text-ink-3">
            <Spinner size={14} label={null} /> Checking the scan...
          </span>
        ) : status === 'ok' ? (
          <span className="flex items-center gap-1.5 font-semibold text-green-600">
            <CircleCheck className="size-4 shrink-0" /> Scans fine
          </span>
        ) : status === 'warn' ? (
          <span className="flex items-start gap-1.5 font-medium text-ink">
            <TriangleAlert className="mt-px size-4 shrink-0 text-yellow-600" /> Might not scan, try a shorter link or turn the logo off
          </span>
        ) : (
          <span className="text-ink-3">We couldn&apos;t run the scan check in this browser. Test it with your phone.</span>
        )}
      </p>
    </div>
  );
}
