'use client';

import { useEffect, useState, type RefObject } from 'react';

export interface InViewportOptions {
  /** Stop observing after the first time it enters. */
  once?: boolean;
  /** IntersectionObserver rootMargin, e.g. '200px 0px' to trigger early. */
  rootMargin?: string;
  /** 0..1 visible fraction needed. */
  amount?: number;
  /** Value before the observer reports (SSR). Default false. */
  initial?: boolean;
}

/**
 * Tracks whether an element is in (or near) the viewport.
 *
 * @example
 * const ref = useRef<HTMLDivElement>(null);
 * const visible = useInViewport(ref, { rootMargin: '25% 0px' });
 */
export function useInViewport<T extends Element>(ref: RefObject<T | null>, opts: InViewportOptions = {}): boolean {
  const { once = false, rootMargin = '0px', amount = 0, initial = false } = opts;
  const [inView, setInView] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Every supported browser has IntersectionObserver; without it we keep `initial`.
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const visible = entry.isIntersecting && entry.intersectionRatio >= amount;
        setInView(visible);
        if (visible && once) io.disconnect();
      },
      { rootMargin, threshold: amount > 0 ? [0, amount] : 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, rootMargin, amount]);

  return inView;
}
