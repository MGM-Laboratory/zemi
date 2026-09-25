'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to a media query. Returns `serverValue` during SSR and hydration
 * (default false), then the live value.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

/** True on devices with a precise hovering pointer (mouse, trackpad). */
export function useFinePointer(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)');
}

/** Tailwind-aligned helper: true at >= 1024px (lg). */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
