'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import styles from './motion.module.css';

const COLORS = {
  yellow: 'var(--color-yellow, #f7bf33)',
  blue: 'var(--color-blue-50, #ecf1fa)',
  red: 'var(--color-red-50, #fee5e5)',
  green: 'var(--color-green-50, #e2f1ea)',
} as const;

export interface HighlightSwipeProps {
  children: ReactNode;
  /** Highlighter color. Yellow (default) is the brand highlighter. */
  color?: keyof typeof COLORS;
  /** ms after entering view. */
  delay?: number;
  className?: string;
  /** Start immediately instead of on view. */
  immediate?: boolean;
}

/**
 * A highlighter swipe behind text, left to right, when it scrolls into view. Wraps across lines.
 * Without JS the highlight is simply there.
 *
 * @example <p>Bring the <HighlightSwipe>messy version</HighlightSwipe>.</p>
 */
export function HighlightSwipe({ children, color = 'yellow', delay = 0, className, immediate }: HighlightSwipeProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (immediate || typeof IntersectionObserver === 'undefined') {
      requestAnimationFrame(() => el.setAttribute('data-on', ''));
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          el.setAttribute('data-on', '');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [immediate]);

  return (
    <span
      ref={ref}
      className={cn(styles.highlight, className)}
      style={{ '--hl': COLORS[color], '--hl-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </span>
  );
}
