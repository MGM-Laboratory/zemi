'use client';

import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/** False on the server and during hydration, true afterwards. Use to gate browser-only UI. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** useLayoutEffect in the browser, useEffect on the server (no SSR warning). */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
