'use client';

import { animate, useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef } from 'react';

/**
 * A number that rolls to its new value (count-up on first paint, spring-ish ease on changes).
 * The final value is always the real text content, so screen readers and copy-paste see it.
 */
export function AnimatedNumber({ value, className, duration = 0.9, format = (n: number) => Math.round(n).toLocaleString('en-US') }: { value: number; className?: string; duration?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current ?? 0;
    prev.current = value;
    if (reduce || from === value) {
      el.textContent = format(value);
      return;
    }
    const controls = animate(from, value, {
      duration: from === 0 ? duration : Math.min(0.6, duration),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = format(v);
      },
      onComplete: () => {
        el.textContent = format(value);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);

  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {format(value)}
    </span>
  );
}
