'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useSiteReady } from '@/components/brand/site-loader';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './speakers.module.css';

export interface EnterProps {
  children: ReactNode;
  delay?: number;
  /** Slide distance in px. Default 20. */
  y?: number;
  className?: string;
  as?: 'div' | 'p' | 'section' | 'aside' | 'header';
}

/**
 * Above-the-fold entrance: plays on mount (once the site loader lifts), not on scroll, so hero
 * copy never waits for an IntersectionObserver. Visible without JavaScript.
 */
export function Enter({ children, delay = 0, y = 20, className, as = 'div' }: EnterProps) {
  const reduced = useReducedMotion();
  const ready = useSiteReady();
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      className={cn(styles.enter, className)}
      initial={{ opacity: 0, y: reduced ? 0 : y }}
      animate={ready ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: reduced ? 0.15 : 0.8,
        delay: reduced ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </Tag>
  );
}
