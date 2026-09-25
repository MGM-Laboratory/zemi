'use client';

import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { SHAPE_COLORS, SHAPE_ORDER, SHAPE_PATHS_46 } from '@zemi/shared';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './brand.module.css';

export interface ZemiWordmarkProps {
  className?: string;
  style?: CSSProperties;
  /** Cycle the idea dot on hover, route change and every `interval` ms. Default true. */
  cycle?: boolean;
  /** Idle cycle interval in ms. Default 6000. 0 disables the idle cycle. */
  interval?: number;
  /** `color`: the dot uses each shape's brand color. `current`: everything follows currentColor. */
  dot?: 'color' | 'current';
  /** Accessible name. Default "Zemi". */
  title?: string;
  decorative?: boolean;
}

/**
 * The word "zemı" set live in Recursive (wght 900, CASL 0.35, tracking -0.04em). The dotless i
 * gets an "idea dot" that cycles through the four shapes. Hover eases CASL to 1. Text follows
 * currentColor, so a parent can flip it on dark sections. Size it with font-size.
 *
 * @example <ZemiWordmark className="text-[2rem]" />
 */
export function ZemiWordmark({
  className,
  style,
  cycle = true,
  interval = 6000,
  dot = 'color',
  title = 'Zemi',
  decorative = false,
}: ZemiWordmarkProps) {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const rootRef = useRef<HTMLSpanElement>(null);
  const lastBump = useRef(0);

  const bump = useCallback(() => {
    const now = performance.now();
    if (now - lastBump.current < 350) return;
    lastBump.current = now;
    setIndex((i) => (i + 1) % SHAPE_ORDER.length);
  }, []);

  // Route change (value compare survives StrictMode's double effects).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (cycle) bump();
  }, [pathname, cycle, bump]);

  // Idle cycle, only while on screen and the tab is visible.
  useEffect(() => {
    if (!cycle || !interval || reduced) return;
    const el = rootRef.current;
    let visible = true;
    const io =
      el && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => {
            visible = !!e?.isIntersecting;
          })
        : null;
    if (el) io?.observe(el);
    const t = setInterval(() => {
      if (visible && document.visibilityState === 'visible') bump();
    }, interval);
    return () => {
      clearInterval(t);
      io?.disconnect();
    };
  }, [cycle, interval, reduced, bump]);

  const shape = SHAPE_ORDER[index]!;
  const fill = dot === 'color' ? SHAPE_COLORS[shape] : 'currentColor';

  return (
    <span
      ref={rootRef}
      className={cn('zemi-wordmark', styles.wordmark, className)}
      style={style}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      onPointerEnter={cycle ? bump : undefined}
    >
      <span aria-hidden="true">zem</span>
      <span className={styles.i} aria-hidden="true">
        {'ı'}
        <span className={styles.dot}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.svg
              key={shape}
              viewBox="0 0 46 46"
              width="100%"
              height="100%"
              style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
              initial={reduced ? { opacity: 0 } : { scale: 0, rotate: -120, y: '-60%' }}
              animate={reduced ? { opacity: 1 } : { scale: 1, rotate: 0, y: '0%' }}
              exit={reduced ? { opacity: 0 } : { scale: 0, rotate: 90, y: '40%', opacity: 0 }}
              transition={reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 18 }}
            >
              <path d={SHAPE_PATHS_46[shape]} fill={fill} />
            </motion.svg>
          </AnimatePresence>
        </span>
      </span>
    </span>
  );
}
