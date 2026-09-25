'use client';

import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';

export interface CountUpProps {
  value: number;
  /** Seconds. Default 1.6. */
  duration?: number;
  /** Start from. Default 0. */
  from?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Custom formatter (overrides decimals). */
  format?: (n: number) => string;
}

/**
 * Counts up when scrolled into view. Server HTML shows the final value (SEO, no-JS); screen
 * readers always get the final value. Renders through a MotionValue, so no re-render per frame.
 *
 * @example <CountUp value={stats.seatsFilled} suffix="+" />
 */
export function CountUp({ value, duration = 1.6, from = 0, decimals = 0, prefix = '', suffix = '', className, format }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const n = useMotionValue(value);
  const armed = useRef(false);
  const fmtRef = useRef(format);
  useEffect(() => {
    fmtRef.current = format;
  });

  const text = useTransform(n, (v) => {
    const f = fmtRef.current;
    const body = f ? f(v) : v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${prefix}${body}${suffix}`;
  });

  // Arm on mount: drop to `from` so the count is visible when it scrolls in.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    armed.current = true;
    n.set(from);
  }, [from, n]);

  useEffect(() => {
    if (!armed.current) {
      n.set(value);
      return;
    }
    if (!inView) return;
    const controls = animate(n, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [inView, value, duration, n]);

  const final = `${prefix}${format ? format(value) : value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      <motion.span aria-hidden="true">{text}</motion.span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
