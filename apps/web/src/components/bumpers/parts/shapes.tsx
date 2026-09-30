'use client';

import { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46, type ImageRef, type ShapeName } from '@zemi/shared';
import { useId, type CSSProperties } from 'react';
import { INK, PAPER } from '../engine/palette';

/** One brand shape as an SVG (46x46 geometry scaled to the box). */
export function BrandShape({ shape, color, className, style, stroke, strokeWidth = 0 }: { shape: ShapeName; color?: string; className?: string; style?: CSSProperties; stroke?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 46 46" className={className} style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible', ...style }} aria-hidden="true" data-shape={shape}>
      <path d={SHAPE_PATHS_46[shape]} fill={color ?? SHAPE_COLORS[shape]} stroke={stroke} strokeWidth={strokeWidth} vectorEffect={stroke ? 'non-scaling-stroke' : undefined} />
    </svg>
  );
}

/**
 * The Zemi mark (2x2 shapes) as plain SVG with one <g data-shape> per shape, so GSAP can
 * choreograph it (the site's ZemiMark is driven by motion/react and would fight GSAP).
 */
export function StaticMark({ tone = 'color', className, style }: { tone?: 'color' | 'ink' | 'paper'; className?: string; style?: CSSProperties }) {
  const fill = (s: ShapeName) => (tone === 'ink' ? INK : tone === 'paper' ? PAPER : SHAPE_COLORS[s]);
  return (
    <svg viewBox="0 0 100 100" className={className} style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible', ...style }} aria-hidden="true">
      {SHAPE_ORDER.map((s) => (
        <g key={s} data-shape={s} style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
          <path d={MARK_PATHS[s]} fill={fill(s)} />
        </g>
      ))}
    </svg>
  );
}

/** "zemı" set in Recursive with the idea dot as a shape (static; animate [data-dot] if you like). */
export function Wordmark({ color = 'currentColor', dot = 'circle', className, style }: { color?: string; dot?: ShapeName; className?: string; style?: CSSProperties }) {
  return (
    <span className={className} style={{ fontFamily: 'var(--font-recursive), sans-serif', fontWeight: 900, fontVariationSettings: '"CASL" 0.35, "MONO" 0', letterSpacing: '-0.04em', color, display: 'inline-flex', alignItems: 'baseline', lineHeight: 1, ...style }}>
      zem
      <span style={{ position: 'relative', display: 'inline-block' }}>
        ı
        <span data-dot="" style={{ position: 'absolute', left: '50%', top: '-0.02em', width: '0.26em', height: '0.26em', transform: 'translateX(-50%)' }}>
          <BrandShape shape={dot} />
        </span>
      </span>
    </span>
  );
}

/** Pick the smallest source at least `px` wide (webp preferred, avif fallback), else the largest. */
export function pickSrc(image: ImageRef, px: number): string {
  const list = image.webp.length ? image.webp : image.avif;
  const hit = list.find((s) => s.width >= px) ?? list[list.length - 1];
  return hit?.url ?? image.src;
}

/** A responsive photo (AVIF/WebP srcset, LQIP color underneath). `width` is the rendered canvas width, used for `sizes`. */
export function BumperImage({ image, width, fit = 'cover', position = '50% 50%', radius = 0, className, style, alt }: { image: ImageRef; width: number; fit?: 'cover' | 'contain'; position?: string; radius?: number; className?: string; style?: CSSProperties; alt?: string }) {
  const sizes = `${Math.round(width)}px`;
  const bg = image.lqip ? `center / cover no-repeat url("${image.lqip}")` : (image.color ?? '#eee');
  return (
    <picture className={className} style={{ display: 'block', width: '100%', height: '100%', borderRadius: radius, overflow: 'hidden', background: fit === 'cover' ? bg : undefined, ...style }}>
      {image.avif.length ? <source type="image/avif" srcSet={image.avif.map((s) => `${s.url} ${s.width}w`).join(', ')} sizes={sizes} /> : null}
      {image.webp.length ? <source type="image/webp" srcSet={image.webp.map((s) => `${s.url} ${s.width}w`).join(', ')} sizes={sizes} /> : null}
      <img src={image.src} alt={alt ?? image.alt ?? ''} decoding="async" draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: fit, objectPosition: position }} />
    </picture>
  );
}

export type AvatarClip = ShapeName | 'rounded' | 'none';

function initials(name: string) {
  const parts = name.replace(/^(dr|prof|mr|mrs|ms|ir)\.?\s+/i, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || 'Z';
}

/**
 * A portrait clipped into a brand shape (circle, rounded triangle, rounded square, arch) or a
 * rounded rectangle. Without a photo: initials on the shape in its brand color.
 */
export function BumperAvatar({ image, name, clip = 'circle', size, color, ring, ringColor = PAPER, className, style }: { image: ImageRef | null; name: string; clip?: AvatarClip; size: number; color?: string; ring?: number; ringColor?: string; className?: string; style?: CSSProperties }) {
  const id = useId().replace(/[:]/g, '');
  const shape: ShapeName = clip === 'rounded' || clip === 'none' ? 'square' : clip;
  const fill = color ?? SHAPE_COLORS[shape];
  const onDark = shape === 'square' && !color ? INK : PAPER;
  const d = clip === 'rounded' ? 'M6 0 H40 Q46 0 46 6 V40 Q46 46 40 46 H6 Q0 46 0 40 V6 Q0 0 6 0 Z' : clip === 'none' ? 'M0 0H46V46H0Z' : SHAPE_PATHS_46[shape];
  const src = image ? pickSrc(image, size * 1.6) : null;
  return (
    <svg viewBox="0 0 46 46" width={size} height={size} className={className} style={{ display: 'block', overflow: 'visible', ...style }} aria-hidden="true">
      <defs>
        <clipPath id={`bav-${id}`}>
          <path d={d} />
        </clipPath>
      </defs>
      {ring ? <path d={d} fill="none" stroke={ringColor} strokeWidth={(ring / size) * 46 * 2} strokeLinejoin="round" /> : null}
      {src ? (
        <g clipPath={`url(#bav-${id})`}>
          <rect width="46" height="46" fill={image?.color ?? fill} />
          <image href={src} width="46" height="46" preserveAspectRatio="xMidYMid slice" />
        </g>
      ) : (
        <g>
          <path d={d} fill={fill} />
          <text x="23" y={shape === 'triangle' ? 33 : shape === 'arch' ? 32 : 28.5} textAnchor="middle" fontSize={shape === 'triangle' ? 11 : 15} fontWeight={900} fill={onDark} style={{ fontFamily: 'var(--font-recursive), sans-serif', fontVariationSettings: '"CASL" 0.4' }}>
            {initials(name)}
          </text>
        </g>
      )}
    </svg>
  );
}
