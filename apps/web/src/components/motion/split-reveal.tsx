'use client';

import { Children, isValidElement, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import { gsap, ScrollTrigger, SplitText, useGSAP } from './gsap';
import styles from './motion.module.css';

export interface SplitRevealOptions {
  /** Split into lines (default) or words. Both slide up from a line mask. */
  by?: 'lines' | 'words';
  /** Seconds between lines/words. Default 0.04 (DESIGN.md). */
  stagger?: number;
  delay?: number;
  duration?: number;
  /**
   * Controlled start. Leave undefined to play when scrolled into view.
   * Pass false to hold, then true to play (e.g. `useSiteReady()` for a hero).
   */
  play?: boolean;
  /** ScrollTrigger start. Default 'top 88%'. */
  start?: string;
  /** Set false to skip splitting entirely. Default true. */
  enabled?: boolean;
  /** Re-split when this changes (the components pass a key derived from their children). */
  textKey?: string;
}

/**
 * A stable string for React children, used to remount split text when the content changes
 * (SplitText rewrites the DOM, so React must never patch split nodes in place).
 */
export function childrenKey(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? `<${String(c.key ?? '')}>` : ''))
    .join('|');
}

/**
 * Split an element's text into masked lines/words and slide them up once.
 * The components key an inner element by their text, so changing children is safe.
 * With the hook on your own element, remount it (change its `key`) when the text changes.
 * Reduced motion: text just appears.
 */
export function useSplitReveal(ref: RefObject<HTMLElement | null>, opts: SplitRevealOptions = {}) {
  const { by = 'lines', stagger = 0.04, delay = 0, duration = 0.95, play, start = 'top 88%', enabled = true, textKey } = opts;
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !enabled) return;
      const show = () => el.removeAttribute('data-split-pending');
      if (prefersReducedMotion()) {
        el.classList.remove(styles.splitPending!);
        show();
        return;
      }
      const split = SplitText.create(el, {
        type: by === 'lines' ? 'lines' : 'lines,words',
        mask: 'lines',
        linesClass: 'split-line',
        wordsClass: 'split-word',
        autoSplit: true,
        onSplit(self) {
          const targets = by === 'lines' ? self.lines : self.words;
          const controlled = playRef.current !== undefined;
          const tween = gsap.from(targets, {
            yPercent: 115,
            rotate: by === 'words' ? 4 : 0,
            duration,
            delay,
            stagger,
            ease: 'expo.out',
            paused: controlled && !playRef.current,
            scrollTrigger: controlled ? undefined : { trigger: el, start, once: true },
          });
          tweenRef.current = tween;
          return tween;
        },
      });
      el.classList.remove(styles.splitPending!);
      show();
      return () => {
        tweenRef.current = null;
        split.revert();
      };
    },
    { scope: ref, dependencies: [by, stagger, delay, duration, start, enabled, textKey] },
  );

  useEffect(() => {
    if (play) tweenRef.current?.play();
  }, [play]);
}

export interface SplitRevealProps extends SplitRevealOptions {
  as?: 'div' | 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'li';
  className?: string;
  children: ReactNode;
  id?: string;
}

/**
 * @example <SplitReveal as="h2" className="display text-display-l">Bring the messy version.</SplitReveal>
 */
export function SplitReveal({ as = 'div', className, children, id, ...opts }: SplitRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const textKey = childrenKey(children);
  useSplitReveal(ref, { ...opts, textKey });
  const Tag = as as 'div';
  return (
    <Tag id={id} className={cn(styles.split, className)}>
      <span key={textKey} ref={ref} className={cn(styles.splitInner, styles.splitPending)} data-split-pending="">
        {children}
      </span>
    </Tag>
  );
}

/** Refresh every ScrollTrigger (call after layout shifts, e.g. fonts or images). */
export const refreshScroll = () => ScrollTrigger.refresh();
