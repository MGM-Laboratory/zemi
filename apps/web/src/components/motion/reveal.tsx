'use client';

import { motion, useScroll, useTransform, type HTMLMotionProps } from 'motion/react';
import { useRef, type ElementType, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './motion.module.css';

type RevealTag = 'div' | 'section' | 'li' | 'span' | 'p' | 'article' | 'figure' | 'ul';

export interface RevealProps extends Omit<HTMLMotionProps<'div'>, 'initial' | 'whileInView' | 'children'> {
  as?: RevealTag;
  children?: ReactNode;
  /** Slide distance in px. Default 28. 0 = fade only. */
  y?: number;
  x?: number;
  /** Start scale (0.96 gives a soft pop). Default 1. */
  scale?: number;
  delay?: number;
  duration?: number;
  /** Play once (default) or every time it enters. */
  once?: boolean;
  /** Visible fraction needed. Default 0.2. */
  amount?: number;
}

/**
 * Fade/slide in when scrolled into view. Transform parts are dropped under reduced motion
 * (the fade stays). Content is never hidden for visitors without JavaScript.
 *
 * @example <Reveal delay={0.1}><EventCard .../></Reveal>
 */
export function Reveal({
  as = 'div',
  children,
  y = 28,
  x = 0,
  scale = 1,
  delay = 0,
  duration = 0.9,
  once = true,
  amount = 0.2,
  className,
  ...rest
}: RevealProps) {
  const reduced = useReducedMotion();
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      className={cn(styles.reveal, className)}
      initial={{ opacity: 0, y: reduced ? 0 : y, x: reduced ? 0 : x, scale: reduced ? 1 : scale }}
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      viewport={{ once, amount }}
      transition={{ duration: reduced ? 0.15 : duration, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </Tag>
  );
}


export interface ParallaxProps {
  children?: ReactNode;
  /** Fraction of scroll distance to drift. Positive drifts up slower (feels further). Default 0.15. */
  speed?: number;
  /** Also drift sideways. */
  xSpeed?: number;
  className?: string;
  as?: ElementType;
}

/**
 * Scroll parallax (translate only). Off under reduced motion.
 * @example <Parallax speed={0.25}><Character shape="arch" /></Parallax>
 */
export function Parallax({ children, speed = 0.15, xSpeed = 0, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const range = speed * 400;
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [range, -range]);
  const x = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [xSpeed * 400, -xSpeed * 400]);
  return (
    <motion.div ref={ref} className={className} style={{ y, x, willChange: 'transform' }}>
      {children}
    </motion.div>
  );
}
