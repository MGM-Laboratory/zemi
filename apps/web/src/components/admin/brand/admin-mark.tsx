'use client';

import { MARK_PATHS, SHAPE_COLORS, SHAPE_ORDER, type ShapeName } from '@zemi/shared';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/admin/cn';

/**
 * Admin-local Zemi mark (2x2 shapes). A small stand-in for `@/components/brand` so the admin
 * does not depend on the public brand workstream. Same geometry (MARK_PATHS from @zemi/shared).
 *
 * - `idle`: static
 * - `loading`: shapes rotate 90deg in turn, forever
 * - `cheer`: all four hop with a 60ms stagger
 */
export type AdminMarkVariant = 'idle' | 'loading' | 'cheer';

export interface AdminMarkProps {
  size?: number;
  variant?: AdminMarkVariant;
  tone?: 'color' | 'ink' | 'paper';
  className?: string;
  /** Accessible label. Decorative when omitted. */
  label?: string;
}

export function AdminMark({ size = 32, variant = 'idle', tone = 'color', className, label }: AdminMarkProps) {
  const reduce = useReducedMotion() ?? false;
  const [turns, setTurns] = useState<Record<ShapeName, number>>({ circle: 0, triangle: 0, square: 0, arch: 0 });

  useEffect(() => {
    if (variant !== 'loading' || reduce) return;
    let step = 0;
    const order: ShapeName[] = ['circle', 'triangle', 'arch', 'square'];
    const t = setInterval(() => {
      const s = order[step % 4]!;
      step++;
      setTurns((prev) => ({ ...prev, [s]: prev[s] + 90 }));
    }, 260);
    return () => clearInterval(t);
  }, [variant, reduce]);

  const fill = (s: ShapeName) => (tone === 'color' ? SHAPE_COLORS[s] : tone === 'ink' ? 'currentColor' : '#ffffff');

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('shrink-0 overflow-visible', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {SHAPE_ORDER.map((s, i) => {
        const animate =
          variant === 'cheer' && !reduce
            ? { y: [0, -14, 0, -4, 0], rotate: 0 }
            : variant === 'loading' && !reduce
              ? { rotate: turns[s], y: 0 }
              : { rotate: Math.ceil(turns[s] / 360) * 360, y: 0 };
        const transition =
          variant === 'cheer' && !reduce
            ? { duration: 0.7, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] as const }
            : { type: 'spring' as const, stiffness: 320, damping: 22 };
        return (
          <motion.g
            key={s}
            animate={animate}
            transition={transition}
          >
            <path d={MARK_PATHS[s]} fill={fill(s)} />
          </motion.g>
        );
      })}
    </svg>
  );
}
