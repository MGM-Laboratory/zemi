'use client';

import { useEffect, useState } from 'react';

export interface ScrollDirectionState {
  direction: 'up' | 'down';
  /** True when scrolled less than `topOffset` px. */
  atTop: boolean;
}

/**
 * Scroll direction with hysteresis, for hide-on-scroll-down headers. Works with Lenis (which
 * drives native scroll) and without it. rAF-throttled.
 */
export function useScrollDirection({ threshold = 8, topOffset = 24 } = {}): ScrollDirectionState {
  const [state, setState] = useState<ScrollDirectionState>({ direction: 'up', atTop: true });

  useEffect(() => {
    let last = window.scrollY;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const atTop = y < topOffset;
      const delta = y - last;
      if (Math.abs(delta) < threshold && !atTop) return;
      const direction: 'up' | 'down' = atTop ? 'up' : delta > 0 ? 'down' : 'up';
      last = y;
      setState((s) => (s.direction === direction && s.atTop === atTop ? s : { direction, atTop }));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [threshold, topOffset]);

  return state;
}
