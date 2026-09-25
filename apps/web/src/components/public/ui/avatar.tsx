import type { CSSProperties } from 'react';
import { initials, SHAPE_COLORS, SHAPE_PATHS_46, type ImageRef, type ShapeName } from '@zemi/shared';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { cn } from '@/lib/utils';

const INITIAL_SHAPES: ShapeName[] = ['circle', 'square', 'arch', 'triangle'];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic brand shape for a name (same person, same shape, everywhere). */
export function shapeForName(name: string): ShapeName {
  return INITIAL_SHAPES[hash(name) % INITIAL_SHAPES.length]!;
}

export interface AvatarProps {
  name: string;
  image?: ImageRef | null;
  /** px. Default 48. */
  size?: number;
  /** Force the fallback shape. */
  shape?: ShapeName;
  className?: string;
  /** Ring color when stacked (matches the background). */
  ring?: string;
  /** Decorative (name shown next to it anyway). Default true. */
  decorative?: boolean;
}

/**
 * Person avatar: the photo in a circle, or their initials on a brand shape.
 * @example <Avatar name={speaker.fullName} image={speaker.avatar} size={56} />
 */
export function Avatar({ name, image, size = 48, shape, className, ring, decorative = true }: AvatarProps) {
  const style: CSSProperties = { width: size, height: size };
  if (image) {
    return (
      <span
        className={cn('relative inline-block flex-none overflow-hidden rounded-full', className)}
        style={{ ...style, ...(ring ? { boxShadow: `0 0 0 3px ${ring}` } : null) }}
      >
        <ZemiImage
          image={image}
          fill
          sizes={`${size * 2}px`}
          alt={decorative ? '' : name}
          className="rounded-full"
        />
      </span>
    );
  }
  const s = shape ?? shapeForName(name);
  const ink = s === 'square' || s === 'triangle' ? '#0e1116' : '#ffffff';
  const text = initials(name) || '?';
  return (
    <span
      className={cn('relative inline-grid flex-none place-items-center', className)}
      style={style}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative ? true : undefined}
    >
      <svg viewBox="0 0 46 46" width={size} height={size} className="absolute inset-0 overflow-visible" aria-hidden="true">
        {/* The stacking ring follows the shape itself (a round box-shadow would cut across square corners). */}
        <path
          d={SHAPE_PATHS_46[s]}
          fill={SHAPE_COLORS[s]}
          stroke={ring}
          strokeWidth={ring ? (3 * 46 * 2) / size : undefined}
          strokeLinejoin="round"
          paintOrder="stroke"
        />
      </svg>
      <span
        className="display relative leading-none"
        style={{
          color: ink,
          fontSize: size * (text.length > 1 ? 0.36 : 0.44),
          letterSpacing: '-0.02em',
          fontVariationSettings: "'CASL' 0.6, 'MONO' 0",
          transform: s === 'triangle' ? 'translateY(18%)' : s === 'arch' ? 'translateY(6%)' : undefined,
        }}
      >
        {text}
      </span>
    </span>
  );
}

export interface AvatarStackProps {
  people: Array<{ name: string; image?: ImageRef | null }>;
  size?: number;
  max?: number;
  /** Ring color = the surface behind the stack. Default white. */
  ring?: string;
  className?: string;
}

/** Overlapping avatars with a +N counter. */
export function AvatarStack({ people, size = 36, max = 4, ring = '#ffffff', className }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className={cn('flex items-center', className)}>
      {shown.map((p, i) => (
        <span key={`${p.name}-${i}`} style={{ marginLeft: i === 0 ? 0 : -size * 0.18, zIndex: shown.length - i }} className="relative">
          <Avatar name={p.name} image={p.image} size={size} ring={ring} />
        </span>
      ))}
      {extra > 0 ? (
        <span
          className="label relative grid place-items-center rounded-full bg-surface-muted text-ink-2"
          style={{ width: size, height: size, marginLeft: -size * 0.18, boxShadow: `0 0 0 3px ${ring}` }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
