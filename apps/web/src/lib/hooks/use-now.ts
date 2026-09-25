'use client';

import { useEffect, useState } from 'react';
import { computeEventStatus, type EventStatus, type StreamState } from '@zemi/shared';

/**
 * A ticking clock. Returns null during SSR and the first client render (so markup matches),
 * then a fresh Date every `intervalMs`. Pauses while the tab is hidden.
 */
export function useNow(intervalMs = 1000, enabled = true): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => setNow(new Date());
    const start = () => {
      tick();
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => (document.visibilityState === 'visible' ? (stop(), start()) : stop());
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs, enabled]);
  return now;
}

export interface StatusSource {
  startsAt: string;
  endsAt: string;
  /** Server-computed status, used until the client clock ticks. */
  status: EventStatus;
  isLive?: boolean;
}

/**
 * Event status that flips on its own (Coming up to Happening now to Wrapped) without a reload.
 * Starts from the server value so hydration matches, then recomputes every 15s.
 * Pass `streamState` from useLiveEvent to react to Go live / End instantly.
 */
export function useEventStatus(event: StatusSource | null | undefined, streamState?: StreamState | null): EventStatus | null {
  const now = useNow(15_000, !!event);
  if (!event) return null;
  if (event.status === 'cancelled') return 'cancelled';
  if (!now) return event.status;
  const stream = streamState ?? (event.isLive ? 'live' : null);
  return computeEventStatus({ startsAt: event.startsAt, endsAt: event.endsAt }, stream, now);
}
