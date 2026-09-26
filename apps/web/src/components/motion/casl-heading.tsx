'use client';

import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './motion.module.css';
import { childrenKey, splitMode, splitTargetProps, useSplitReveal, type SplitRevealOptions } from './split-reveal';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'div' | 'span';
export type DisplaySize = 'xl' | 'l' | 'm' | 'title';

const SIZE: Record<DisplaySize, string> = {
  xl: 'text-display-xl',
  l: 'text-display-l',
  m: 'text-display-m',
  title: 'text-title',
};

export interface CaslHeadingProps {
  as?: HeadingTag;
  size?: DisplaySize;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
  /** CASL at rest (formal). Default 0. */
  from?: number;
  /** CASL when fully loosened. Default 1. */
  to?: number;
  /** Base weight. Default 900. The loosen adds `wghtNudge`. */
  weight?: number;
  /** Extra weight at full loosen. Default 60. */
  wghtNudge?: number;
  /** Loosen as it scrolls into view. Default true. */
  scroll?: boolean;
  /** Loosen on hover. Default true. */
  hover?: boolean;
  /**
   * Also run the masked line reveal. Pass true or SplitReveal options. As an `h1` it is the
   * above-the-fold paint rise instead (visible at first paint), unless `paint: false`.
   */
  reveal?: boolean | SplitRevealOptions;
}

/**
 * Display heading in Recursive whose CASL axis loosens from formal to casual (signature 2 in
 * DESIGN.md): on hover and as it scrolls into view. Weight nudges up a touch with it.
 *
 * @example <CaslHeading as="h2" size="l" reveal>Research is lonely. Fridays aren't.</CaslHeading>
 */
export function CaslHeading({
  as = 'h2',
  size = 'l',
  children,
  className,
  style,
  id,
  from = 0,
  to = 1,
  weight = 900,
  wghtNudge = 60,
  scroll = true,
  hover = true,
  reveal = false,
}: CaslHeadingProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 92%', 'start 40%'] });
  const hovered = useSpring(0, { stiffness: 180, damping: 26 });
  const scrolled = useSpring(0, { stiffness: 120, damping: 24 });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (scroll && !reduced) scrolled.set(v);
  });

  const casl = useTransform(() => from + (to - from) * Math.max(scrolled.get(), hovered.get()));
  const fontWeight = useTransform(() => Math.round(weight + wghtNudge * Math.max(scrolled.get(), hovered.get())));

  const splitRef = useRef<HTMLSpanElement>(null);
  const textKey = childrenKey(children);
  const revealOpts = reveal === true ? {} : reveal === false ? null : reveal;
  // An h1 is above the fold: it paints visible and rises in CSS (see SplitRevealOptions.paint).
  const mode = splitMode(revealOpts, as);
  useSplitReveal(splitRef, mode === 'split' ? { ...revealOpts, textKey } : { enabled: false });

  const MotionTag = motion[as] as typeof motion.h2;
  return (
    <MotionTag
      ref={ref as never}
      id={id}
      className={cn(styles.casl, styles.split, SIZE[size], className)}
      style={{ ...style, '--casl': casl, fontWeight } as never}
      onPointerEnter={hover ? () => hovered.set(1) : undefined}
      onPointerLeave={hover ? () => hovered.set(0) : undefined}
    >
      {reveal ? (
        // Keyed by the text so new children remount instead of patching split DOM.
        <span key={textKey} ref={splitRef} {...splitTargetProps(mode, revealOpts ?? {})}>
          {children}
        </span>
      ) : (
        children
      )}
    </MotionTag>
  );
}
