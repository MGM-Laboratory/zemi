'use client';

import { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER, type BumperQrStyle } from '@zemi/shared';
import QRCode from 'qrcode';
import { memo, useMemo, type CSSProperties } from 'react';
import { INK } from '../engine/palette';

export interface QrMatrix {
  size: number;
  on: (r: number, c: number) => boolean;
}

const cache = new Map<string, QrMatrix | null>();

/** QR modules for a string. Error correction H when a logo sits in the middle, Q otherwise. */
export function qrMatrix(value: string, logo: boolean): QrMatrix | null {
  const key = `${logo ? 'H' : 'Q'}|${value}`;
  if (cache.has(key)) return cache.get(key)!;
  let out: QrMatrix | null = null;
  try {
    const qr = QRCode.create(value || ' ', { errorCorrectionLevel: logo ? 'H' : 'Q' });
    const { size, data } = qr.modules;
    out = { size, on: (r, c) => data[r * size + c] === 1 };
  } catch {
    out = null;
  }
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  cache.set(key, out);
  return out;
}

/** Module colors that keep a reliable scan on the white plate (yellow never: too light). */
export const QR_TONES: Record<string, string> = { ink: INK, blue: '#2f5aa6', green: '#0b6b45', red: '#d92f2f' };

export interface BrandQrProps {
  value: string;
  style?: BumperQrStyle;
  /** Module color (hex). Use QR_TONES; light colors will not scan. */
  color?: string;
  /** Zemi mark in the middle. */
  logo?: boolean;
  /** Quiet zone in modules (4 is the spec). */
  quiet?: number;
  /** Round the plate corners (in modules). */
  radius?: number;
  className?: string;
  cssStyle?: CSSProperties;
  title?: string;
}

function inFinder(r: number, c: number, n: number) {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
}

/**
 * A branded, easy-to-scan QR code as crisp SVG: white plate with a full quiet zone, rounded
 * finder eyes with a round pupil, dot/rounded/square modules and an optional Zemi mark (error
 * correction H covers the cleared center). Fills its box; keep it square.
 */
export const BrandQr = memo(function BrandQr({ value, style = 'rounded', color = INK, logo = true, quiet = 4, radius = 3, className, cssStyle, title }: BrandQrProps) {
  const m = useMemo(() => qrMatrix(value, logo), [value, logo]);
  const body = useMemo(() => {
    if (!m) return null;
    const n = m.size;
    const q = quiet;
    // Clear a centered square for the mark (about 22% of the width, odd number of modules).
    let hole = logo ? Math.max(5, Math.round(n * 0.22)) : 0;
    if (hole && hole % 2 === 0) hole += 1;
    const h0 = Math.floor((n - hole) / 2);
    const inHole = (r: number, c: number) => hole > 0 && r >= h0 - 1 && r < h0 + hole + 1 && c >= h0 - 1 && c < h0 + hole + 1;
    let d = '';
    const dots: Array<[number, number]> = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!m.on(r, c) || inFinder(r, c, n) || inHole(r, c)) continue;
        const x = c + q;
        const y = r + q;
        if (style === 'square') d += `M${x} ${y}h1v1h-1z`;
        else if (style === 'dots') dots.push([x + 0.5, y + 0.5]);
        else {
          // Rounded: join horizontal neighbors into pills so text-like rows stay readable.
          const left = c > 0 && m.on(r, c - 1) && !inFinder(r, c - 1, n) && !inHole(r, c - 1);
          const right = c < n - 1 && m.on(r, c + 1) && !inFinder(r, c + 1, n) && !inHole(r, c + 1);
          const k = 0.42;
          if (left && right) d += `M${x} ${y + 0.04}h1v0.92h-1z`;
          else if (left) d += `M${x} ${y + 0.04}h${1 - k}a${k} ${k} 0 0 1 0 0.92h-${1 - k}z`;
          else if (right) d += `M${x + 1} ${y + 0.04}h-${1 - k}a${k} ${k} 0 0 0 0 0.92h${1 - k}z`;
          else dots.push([x + 0.5, y + 0.5]);
        }
      }
    }
    const eye = (r0: number, c0: number) => {
      const x = c0 + q;
      const y = r0 + q;
      return (
        <g key={`${r0}-${c0}`}>
          <path d={`M${x + 1.9} ${y}h3.2a1.9 1.9 0 0 1 1.9 1.9v3.2a1.9 1.9 0 0 1 -1.9 1.9h-3.2a1.9 1.9 0 0 1 -1.9 -1.9v-3.2a1.9 1.9 0 0 1 1.9 -1.9zM${x + 2.1} ${y + 1}a1.1 1.1 0 0 0 -1.1 1.1v2.8a1.1 1.1 0 0 0 1.1 1.1h2.8a1.1 1.1 0 0 0 1.1 -1.1v-2.8a1.1 1.1 0 0 0 -1.1 -1.1z`} fill={color} fillRule="evenodd" />
          <circle cx={x + 3.5} cy={y + 3.5} r={1.55} fill={color} />
        </g>
      );
    };
    const W = n + q * 2;
    const markSize = hole * 0.86;
    const mx = q + h0 + (hole - markSize) / 2;
    return (
      <>
        <rect width={W} height={W} rx={radius} fill="#ffffff" />
        {d ? <path d={d} fill={color} /> : null}
        {dots.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={0.46} fill={color} />
        ))}
        {eye(0, 0)}
        {eye(0, n - 7)}
        {eye(n - 7, 0)}
        {logo && hole ? (
          <g transform={`translate(${mx} ${mx}) scale(${markSize / 100})`}>
            {SHAPE_ORDER.map((s) => (
              <path key={s} d={MARK_PATHS[s]} fill={SHAPE_COLORS[s]} />
            ))}
          </g>
        ) : null}
      </>
    );
  }, [m, quiet, style, color, logo, radius]);
  if (!m) return null;
  const W = m.size + quiet * 2;
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className={className} style={{ display: 'block', width: '100%', height: '100%', ...cssStyle }} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} shapeRendering="geometricPrecision" data-qr={value}>
      {body}
    </svg>
  );
});
