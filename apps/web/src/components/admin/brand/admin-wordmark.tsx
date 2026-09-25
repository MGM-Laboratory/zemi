'use client';

import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46 } from '@zemi/shared';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/admin/cn';

/**
 * Admin-local wordmark: "zemı" in Recursive with the idea dot (a shape that cycles through the
 * four brand shapes on hover and every ~6s). Stand-in until `@/components/brand` ships.
 */
export function AdminWordmark({ className, cycle = true }: { className?: string; cycle?: boolean }) {
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!cycle || reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % 4), 6000);
    return () => clearInterval(t);
  }, [cycle, reduce]);
  const shape = SHAPE_ORDER[i]!;
  return (
    <span
      className={cn(
        'inline-flex items-baseline font-display leading-none font-black tracking-[-0.04em] transition-[font-variation-settings] duration-500',
        className,
      )}
      style={{ fontVariationSettings: `'CASL' ${hover ? 1 : 0.35}, 'MONO' 0` }}
      onPointerEnter={() => {
        setHover(true);
        setI((n) => (n + 1) % 4);
      }}
      onPointerLeave={() => setHover(false)}
      aria-label="Zemi"
      role="img"
    >
      <span aria-hidden="true">zem</span>
      <span aria-hidden="true" className="relative inline-block">
        ı
        <span className="absolute top-[0.1em] left-[48%] size-[0.27em] -translate-x-1/2">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.svg
              key={shape}
              viewBox="0 0 46 46"
              className="absolute inset-0 size-full overflow-visible"
              initial={reduce ? false : { scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={reduce ? undefined : { scale: 0, rotate: 90 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            >
              <path d={SHAPE_PATHS_46[shape]} fill={SHAPE_COLORS[shape]} />
            </motion.svg>
          </AnimatePresence>
        </span>
      </span>
    </span>
  );
}
