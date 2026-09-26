'use client';

import type { AttendanceCounts, AttendanceStreamMessage, AttendanceSummary, CheckinFeedItem } from '@zemi/shared';
import { useEffect, useRef, useState } from 'react';
import { adminFetch, apiPath, isApiError } from '@/lib/admin/api';

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'forbidden' | 'closed';

export interface AttendanceStreamState {
  status: StreamStatus;
  counts: AttendanceCounts | null;
  summary: AttendanceSummary | null;
  /** Newest first. Seeded from the snapshot, then prepended live. */
  feed: CheckinFeedItem[];
  /** Ids of feed items that arrived live (for the "new" animation). */
  freshIds: ReadonlySet<string>;
  /** Bumps on every check-in or undo message (even when `item` is null for scan-only viewers). */
  pulse: number;
  lastMessageAt: number | null;
}

const FEED_MAX = 60;

/**
 * Live attendance over SSE (`GET /admin/events/:id/attendance/stream`, same origin, cookie auth).
 *
 * - First message is a `snapshot`, then `checkin` (item may be null for scan-only viewers:
 *   counts still update, the feed skips it), `counts`, and `ping` every 20 s.
 * - EventSource reconnects on its own after network blips. When the browser gives up
 *   (the server answered with an error, like 401 or 403), we probe the JSON endpoint:
 *   401 goes to login (adminFetch does that), 403 stops, anything else retries with backoff.
 * - Cleanup is idempotent, so React strict mode never leaves two connections open.
 */
export function useAttendanceStream(
  eventId: string | null | undefined,
  opts: { enabled?: boolean; onMessage?: (msg: AttendanceStreamMessage) => void } = {},
): AttendanceStreamState {
  const enabled = opts.enabled ?? true;
  const onMessage = useRef(opts.onMessage);
  useEffect(() => {
    onMessage.current = opts.onMessage;
  });
  const [state, setState] = useState<AttendanceStreamState>({
    status: 'connecting',
    counts: null,
    summary: null,
    feed: [],
    freshIds: new Set(),
    pulse: 0,
    lastMessageAt: null,
  });

  useEffect(() => {
    if (!eventId || !enabled || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    const url = apiPath(`/admin/events/${eventId}/attendance/stream`);

    const handle = (raw: string) => {
      let msg: AttendanceStreamMessage;
      try {
        msg = JSON.parse(raw) as AttendanceStreamMessage;
      } catch {
        return;
      }
      attempt = 0;
      onMessage.current?.(msg);
      setState((s) => {
        const now = Date.now();
        switch (msg.type) {
          case 'snapshot':
            return { ...s, status: 'open', counts: msg.counts, summary: msg.summary, feed: msg.summary.recent.slice(0, FEED_MAX), freshIds: new Set(), lastMessageAt: now };
          case 'checkin': {
            const item = msg.item;
            const feed = item ? [item, ...s.feed.filter((f) => f.id !== item.id)].slice(0, FEED_MAX) : s.feed;
            const freshIds = item ? new Set([item.id, ...Array.from(s.freshIds).slice(0, 20)]) : s.freshIds;
            return { ...s, status: 'open', counts: msg.counts, feed, freshIds, pulse: s.pulse + 1, lastMessageAt: now };
          }
          case 'counts':
            return { ...s, status: 'open', counts: msg.counts, lastMessageAt: now };
          case 'ping':
          default:
            return { ...s, status: 'open', lastMessageAt: now };
        }
      });
    };

    const connect = () => {
      if (disposed) return;
      es = new EventSource(url, { withCredentials: true });
      es.onopen = () => {
        if (!disposed) setState((s) => ({ ...s, status: 'open' }));
      };
      es.onmessage = (e) => handle(e.data as string);
      es.onerror = () => {
        if (disposed || !es) return;
        if (es.readyState === EventSource.CONNECTING) {
          setState((s) => ({ ...s, status: 'reconnecting' }));
          return;
        }
        // CLOSED: the browser will not retry. Find out why, then decide.
        es.close();
        es = null;
        setState((s) => ({ ...s, status: 'reconnecting' }));
        void adminFetch(`/admin/events/${eventId}/attendance`)
          .then(() => schedule())
          .catch((err) => {
            if (disposed) return;
            if (isApiError(err) && (err.status === 403 || err.status === 404)) {
              setState((s) => ({ ...s, status: 'forbidden' }));
              return;
            }
            schedule();
          });
      };
    };

    const schedule = () => {
      if (disposed) return;
      attempt += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      retryTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      es = null;
    };
  }, [eventId, enabled]);

  return state;
}
