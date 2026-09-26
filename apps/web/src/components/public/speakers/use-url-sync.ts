'use client';

import { useEffect, useRef } from 'react';

/**
 * Mirror filter state into the query string without a navigation (no RSC round trip per
 * keystroke). Next's router picks up `history.replaceState`, so back/forward and shared links
 * keep working. Empty values are dropped. Skips the first run so the server URL stays as-is.
 */
export function useUrlSync(
  values: Record<string, string | number | null | undefined>,
  delay = 250,
) {
  const serialized = JSON.stringify(values);
  const prev = useRef(serialized);

  useEffect(() => {
    if (prev.current === serialized) return;
    prev.current = serialized;
    const t = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const next = JSON.parse(serialized) as Record<string, string | number | null | undefined>;
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === undefined || v === '') url.searchParams.delete(k);
        else url.searchParams.set(k, String(v));
      }
      const target = `${url.pathname}${url.search}${url.hash}`;
      if (
        target !== `${window.location.pathname}${window.location.search}${window.location.hash}`
      ) {
        window.history.replaceState(window.history.state, '', target);
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [serialized, delay]);
}
