'use client';

import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Server-corrected time. Screens receive `serverNow` with every state message; the offset lets a
 * countdown on an OBS machine with a drifting clock still hit zero on time.
 */
const ClockContext = createContext<{ offsetMs: number }>({ offsetMs: 0 });
export const BumperClockProvider = ClockContext.Provider;

export function useClockOffset(): number {
  return useContext(ClockContext).offsetMs;
}

/** A `now()` function that includes the server offset. */
export function useNowFn(): () => number {
  const offset = useClockOffset();
  return () => Date.now() + offset;
}

/** Ticking server-corrected time (ms). Keeps ticking when the tab is hidden: OBS sources can be "hidden" and still on air. */
export function useBumperNow(intervalMs = 1000, enabled = true): number {
  const offset = useClockOffset();
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!enabled) return;
    // Align ticks to the second so every screen flips digits together.
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now() + offset);
      t = setTimeout(tick, intervalMs - ((Date.now() + offset) % intervalMs) + 5);
    };
    t = setTimeout(tick, intervalMs - ((Date.now() + offset) % intervalMs) + 5);
    return () => clearTimeout(t);
  }, [offset, intervalMs, enabled]);
  return now;
}

export function splitDuration(ms: number): { h: number; m: number; s: number; total: number } {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60, total };
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
