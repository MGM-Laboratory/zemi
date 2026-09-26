'use client';

import { initials, SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46, type ImageRef, type ShapeName } from '@zemi/shared';
import type { CSSProperties, ReactNode } from 'react';
import { isMac, useMounted } from '@/lib/admin/hooks';
import { cn } from '@/lib/admin/cn';
import { Tooltip } from './tooltip';

/* ------------------------------------------------------------------ AdminImage */

export interface AdminImageProps {
  image: ImageRef;
  /** `sizes` attribute, like "48px" or "(min-width: 1024px) 320px, 100vw". */
  sizes: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  /** Load eagerly (above the fold). Default lazy. */
  priority?: boolean;
  fit?: 'cover' | 'contain';
}

/** `<picture>` with AVIF + WebP srcsets and the LQIP/dominant color as the placeholder. */
export function AdminImage({ image, sizes, alt, className, imgClassName, style, priority, fit = 'cover' }: AdminImageProps) {
  const set = (list: ImageRef['webp']) => list.map((s) => `${s.url} ${s.width}w`).join(', ');
  return (
    <picture
      className={cn('block overflow-hidden', className)}
      style={{
        backgroundColor: image.color ?? 'var(--color-surface-muted)',
        backgroundImage: image.lqip ? `url(${image.lqip})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        ...style,
      }}
    >
      {image.avif.length ? <source type="image/avif" srcSet={set(image.avif)} sizes={sizes} /> : null}
      {image.webp.length ? <source type="image/webp" srcSet={set(image.webp)} sizes={sizes} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        alt={alt ?? image.alt ?? ''}
        width={image.width}
        height={image.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={cn('size-full', fit === 'cover' ? 'object-cover' : 'object-contain', imgClassName)}
      />
    </picture>
  );
}

/* ------------------------------------------------------------------ Avatar */

export interface AvatarProps {
  name: string;
  image?: ImageRef | null;
  /** px. Default 36. */
  size?: number;
  /** Brand shape behind the initials. Default: picked from the name so it is stable. */
  shape?: ShapeName;
  /** Round (default) or the brand shape itself as the mask. */
  variant?: 'round' | 'shape';
  className?: string;
  ring?: boolean;
}

/** Stable shape per name, so the same person always gets the same color. */
export function shapeForName(name: string): ShapeName {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return SHAPE_ORDER[Math.abs(h) % 4]!;
}

/**
 * Person avatar: their photo, or initials on a brand shape.
 * @example <Avatar name={speaker.fullName} image={speaker.avatar} size={40} />
 */
export function Avatar({ name, image, size = 36, shape, variant = 'round', className, ring }: AvatarProps) {
  const s = shape ?? shapeForName(name);
  const text = initials(name) || '?';
  const fontSize = Math.max(10, Math.round(size * 0.36));
  if (image) {
    return (
      <span
        className={cn('relative inline-block shrink-0 overflow-hidden rounded-full bg-surface-muted', ring && 'ring-2 ring-white', className)}
        style={{ width: size, height: size }}
      >
        <AdminImage image={image} sizes={`${size * 2}px`} alt="" className="size-full" />
        <span className="sr-only">{name}</span>
      </span>
    );
  }
  // White on brand red is only 3.6:1, so the red triangle takes ink initials like yellow does (5.3:1).
  const ink = s === 'square' || s === 'triangle' ? '#0e1116' : '#ffffff';
  if (variant === 'shape') {
    return (
      <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }} role="img" aria-label={name}>
        <svg viewBox="0 0 46 46" className="absolute inset-0 size-full" aria-hidden="true">
          <path d={SHAPE_PATHS_46[s]} fill={SHAPE_COLORS[s]} />
        </svg>
        <span
          className="mono relative font-semibold"
          style={{ fontSize, color: ink, transform: s === 'triangle' ? 'translateY(18%)' : s === 'arch' ? 'translateY(12%)' : undefined }}
          aria-hidden="true"
        >
          {text}
        </span>
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', ring && 'ring-2 ring-white', className)}
      style={{ width: size, height: size, backgroundColor: SHAPE_COLORS[s] }}
    >
      <span className="mono font-semibold" style={{ fontSize, color: ink }} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

export interface AvatarStackProps {
  people: Array<{ name: string; image?: ImageRef | null }>;
  max?: number;
  size?: number;
  className?: string;
}

/** Overlapping avatars with a "+3" bubble. Names show in a tooltip. */
export function AvatarStack({ people, max = 4, size = 28, className }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const all = people.map((p) => p.name).join(', ');
  return (
    <Tooltip content={all} disabled={!people.length}>
      <span className={cn('inline-flex items-center', className)} tabIndex={people.length ? 0 : undefined} aria-label={all || 'Nobody yet'}>
        {shown.map((p, i) => (
          <Avatar key={`${p.name}-${i}`} name={p.name} image={p.image} size={size} ring className={i ? '-ml-2' : undefined} />
        ))}
        {rest > 0 ? (
          <span
            className="mono -ml-2 inline-flex items-center justify-center rounded-full bg-surface-muted font-semibold text-ink-2 ring-2 ring-white"
            style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
          >
            +{rest}
          </span>
        ) : null}
      </span>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ Kbd */

/** Keyboard key. `<Kbd>⌘</Kbd><Kbd>K</Kbd>` or `<Kbd keys={['mod', 'k']} />`. */
export function Kbd({ children, keys, className }: { children?: ReactNode; keys?: string[]; className?: string }) {
  const cls = cn(
    'mono inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-white px-1 text-[0.6875rem] leading-none font-medium text-ink-3 shadow-[inset_0_-1px_0_var(--color-line)]',
    className,
  );
  if (keys) {
    return (
      <span className="inline-flex items-center gap-0.5">
        {keys.map((k) => (
          <kbd key={k} className={cls}>
            {k === 'mod' ? <ModKey /> : k === 'shift' ? '⇧' : k === 'enter' ? '↵' : k.length === 1 ? k.toUpperCase() : k}
          </kbd>
        ))}
      </span>
    );
  }
  return <kbd className={cls}>{children}</kbd>;
}

/** ⌘ on Apple devices, Ctrl elsewhere. Renders ⌘ until mounted so server and client HTML match. */
function ModKey() {
  const mounted = useMounted();
  return <>{mounted && !isMac() ? 'Ctrl' : '⌘'}</>;
}
