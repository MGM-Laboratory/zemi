import type { ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';

export type BadgeTone = 'neutral' | 'blue' | 'yellow' | 'red' | 'green' | 'ink' | 'outline';

// Text on the *-50 tints must reach 4.5:1. red-600 only gets 3.99:1 on red-50, so red uses a deeper red (5.4:1), like yellow uses #7a5600.
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-ink-2',
  blue: 'bg-blue-50 text-blue-600',
  yellow: 'bg-yellow-50 text-[#7a5600]',
  red: 'bg-red-50 text-[#b42525]',
  green: 'bg-green-50 text-green-600',
  ink: 'bg-ink text-white',
  outline: 'border border-line-strong bg-white text-ink-2',
};

export interface BadgeProps {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  /** Small brand shape before the text. */
  shape?: 'circle' | 'triangle' | 'square' | 'arch' | 'dot';
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  title?: string;
}

/** Pill chip with ink text on a tinted fill (yellow is never used as text color). */
export function Badge({ tone = 'neutral', size = 'md', shape, icon, className, children, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap [&_svg]:size-3.5',
        size === 'sm' ? 'h-5 px-2 text-[0.6875rem]' : 'h-6 px-2.5 text-xs',
        TONES[tone],
        className,
      )}
    >
      {shape ? <ShapeGlyph shape={shape} /> : null}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** 8px brand shape glyph in currentColor. */
export function ShapeGlyph({ shape, className }: { shape: 'circle' | 'triangle' | 'square' | 'arch' | 'dot'; className?: string }) {
  const d =
    shape === 'triangle'
      ? 'M4 .9 Q4.5 .9 4.8 1.5 L7.8 6.9 Q8.1 7.6 7.3 7.6 H.7 Q-.1 7.6 .2 6.9 L3.2 1.5 Q3.5 .9 4 .9Z'
      : shape === 'square'
        ? 'M1.8 .5 H6.2 Q7.5 .5 7.5 1.8 V6.2 Q7.5 7.5 6.2 7.5 H1.8 Q.5 7.5 .5 6.2 V1.8 Q.5 .5 1.8 .5Z'
        : shape === 'arch'
          ? 'M.5 7.6 V4.2 A3.5 3.5 0 0 1 7.5 4.2 V7.6Z'
          : null;
  return (
    <svg viewBox="0 0 8 8" className={cn('size-2 shrink-0', className)} aria-hidden="true">
      {d ? <path d={d} fill="currentColor" /> : <circle cx="4" cy="4" r={shape === 'dot' ? 3 : 3.6} fill="currentColor" />}
    </svg>
  );
}

/** Small count bubble for nav items and tabs. */
export function CountBadge({ count, tone = 'red', max = 99, className }: { count: number; tone?: 'red' | 'neutral' | 'blue'; max?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        'mono inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[0.6875rem] leading-none font-semibold tabular-nums',
        tone === 'red' ? 'bg-red-600 text-white' : tone === 'blue' ? 'bg-blue text-white' : 'bg-surface-muted text-ink-2',
        className,
      )}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
