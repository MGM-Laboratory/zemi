'use client';

import { motion, useSpring } from 'motion/react';
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';

export interface MagneticProps {
  children: ReactNode;
  /** 0..1, how far the child follows the pointer. Default 0.35. */
  strength?: number;
  /** Extra px around the child that still pulls. Default 24. */
  padding?: number;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

/**
 * Magnetic hover pull (DESIGN.md: primary buttons). Fine pointers only, off under reduced motion.
 * Renders an inline-block span around the child.
 *
 * @example <Magnetic><Button>Save my seat</Button></Magnetic>
 */
export function Magnetic({ children, strength = 0.35, padding = 24, className, style, disabled }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const x = useSpring(0, { stiffness: 320, damping: 22, mass: 0.6 });
  const y = useSpring(0, { stiffness: 320, damping: 22, mass: 0.6 });

  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    if (disabled || e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span
      ref={ref}
      className={cn('inline-block', className)}
      style={{ x, y, padding, margin: -padding, ...style }}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onBlur={reset}
    >
      {children}
    </motion.span>
  );
}
