'use client';

import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './motion.module.css';

export interface MarqueeProps {
  children: ReactNode;
  /** px per second at rest. Default 60. */
  speed?: number;
  direction?: 'left' | 'right';
  /** Scroll velocity speeds it up and flips direction with scroll. Default true. */
  reactToScroll?: boolean;
  pauseOnHover?: boolean;
  /** Controlled pause. */
  paused?: boolean;
  /** CSS length between items and copies. Default 3rem. */
  gap?: string;
  /** Edge fade width (CSS length or %). Default 6%. '0' disables. */
  fade?: string;
  className?: string;
  style?: CSSProperties;
  /** Accessible label for the region. The duplicated copies are aria-hidden. */
  label?: string;
}

const wrap = (min: number, max: number, v: number) => {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
};

/**
 * Infinite marquee. Speeds up with scroll velocity (and follows scroll direction), pauses on
 * hover and while focused inside, and stands still under reduced motion.
 *
 * @example <Marquee label="Topics"><span>Robotics</span><span>NLP</span></Marquee>
 */
export function Marquee({
  children,
  speed = 60,
  direction = 'left',
  reactToScroll = true,
  pauseOnHover = true,
  paused = false,
  gap = '3rem',
  fade = '6%',
  className,
  style,
  label,
}: MarqueeProps) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(2);
  const width = useRef(0);
  const hover = useRef(false);
  const visible = useRef(true);
  const dir = useRef(1);

  const x = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });
  const factor = useTransform(smooth, [0, 1000], [0, 4], { clamp: false });
  const transform = useTransform(x, (v) => `translate3d(${v}px, 0, 0)`);

  useEffect(() => {
    const root = rootRef.current;
    const group = groupRef.current;
    if (!root || !group) return;
    const measure = () => {
      width.current = group.offsetWidth;
      const need = width.current > 0 ? Math.ceil(root.offsetWidth / width.current) + 1 : 2;
      setCopies((c) => (c === need ? c : Math.max(2, Math.min(need, 12))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(group);
    const io = new IntersectionObserver(([e]) => {
      visible.current = !!e?.isIntersecting;
    });
    io.observe(root);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  useAnimationFrame((_, delta) => {
    if (reduced || paused || !visible.current || !width.current) return;
    if (pauseOnHover && hover.current) return;
    const base = direction === 'left' ? -1 : 1;
    const f = reactToScroll ? factor.get() : 0;
    // Scrolling down keeps the base direction, scrolling up reverses it (and it stays reversed).
    if (f < -0.01) dir.current = -1;
    else if (f > 0.01) dir.current = 1;
    let move = base * dir.current * speed * (Math.min(delta, 64) / 1000);
    move += move * Math.min(Math.abs(f), 6);
    x.set(wrap(-width.current, 0, x.get() + move));
  });

  return (
    <div
      ref={rootRef}
      className={cn(styles.marquee, className)}
      style={{ '--marquee-gap': gap, '--marquee-fade': fade, ...style } as CSSProperties}
      role={label ? 'region' : undefined}
      aria-label={label}
      onPointerEnter={() => (hover.current = true)}
      onPointerLeave={() => (hover.current = false)}
      onFocusCapture={() => (hover.current = true)}
      onBlurCapture={() => (hover.current = false)}
    >
      <motion.div className={styles.marqueeTrack} style={{ transform }}>
        {Array.from({ length: copies }, (_, i) => (
          <div key={i} ref={i === 0 ? groupRef : undefined} className={styles.marqueeGroup} aria-hidden={i > 0 || undefined} inert={i > 0 || undefined}>
            {children}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
