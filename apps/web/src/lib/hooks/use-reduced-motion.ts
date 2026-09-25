'use client';

import { useMediaQuery } from './use-media-query';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * True when the user asked for less motion. SSR/hydration returns false, so the first client
 * render matches the server; effects re-run with the real value right after.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY, false);
}

/** Non-hook check for imperative code (event handlers, rAF loops). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
}
