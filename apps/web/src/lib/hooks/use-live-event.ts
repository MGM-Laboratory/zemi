'use client';

import { useEffect, useRef, useState } from 'react';
import type { EventStatus, EventStreamPublic, LiveEvent } from '@zemi/shared';
import { eventUrls } from '@/lib/api/client';

export type LiveConnection = 'idle' | 'connecting' | 'open' | 'reconnecting';

export interface LiveEventState {
  connection: LiveConnection;
  stream: EventStreamPublic | null;
  status: EventStatus | null;
  viewers: number | null;
  /** Running total per reaction kind since the page opened. */
  reactions: Record<string, number>;
  lastPingAt: string | null;
}

export interface UseLiveEventOptions {
  /** Default true. Pass false to hold the connection (e.g. event is far in the future). */
  enabled?: boolean;
  /** Seed values from the server render so the UI doesn't flash. */
  initial?: { stream?: EventStreamPublic | null; status?: EventStatus | null };
  /** Fires for every reaction burst (float an emoji, bump a counter). */
  onReaction?: (kind: string, count: number) => void;
  /** Fires for every parsed message. */
  onMessage?: (msg: LiveEvent) => void;
}

const NAMED_EVENTS = ['state', 'viewers', 'reaction', 'ping'] as const;

function parse(data: unknown, namedType?: string): LiveEvent | null {
  if (typeof data !== 'string' || !data) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  const type = typeof msg.type === 'string' ? msg.type : namedType;
  switch (type) {
    case 'state':
      return msg.stream && typeof msg.stream === 'object'
        ? { type: 'state', stream: msg.stream as EventStreamPublic, status: msg.status as EventStatus }
        : null;
    case 'viewers':
      return typeof msg.viewers === 'number' ? { type: 'viewers', viewers: msg.viewers } : null;
    case 'reaction':
      return typeof msg.kind === 'string'
        ? { type: 'reaction', kind: msg.kind, count: typeof msg.count === 'number' ? msg.count : 1 }
        : null;
    case 'ping':
      return { type: 'ping', t: typeof msg.t === 'string' ? msg.t : new Date().toISOString() };
    default:
      return null;
  }
}

/**
 * Subscribe to GET /api/v1/public/events/:id/live (SSE on the public API origin).
 * Handles both unnamed `data: {"type":...}` messages and named `event: state` messages,
 * and reconnects with backoff when the browser gives up (EventSource CLOSED).
 */
export function useLiveEvent(eventId: string | null | undefined, opts: UseLiveEventOptions = {}): LiveEventState {
  const { enabled = true } = opts;
  const [state, setState] = useState<LiveEventState>(() => ({
    connection: 'idle',
    stream: opts.initial?.stream ?? null,
    status: opts.initial?.status ?? null,
    viewers: opts.initial?.stream?.viewers ?? null,
    reactions: {},
    lastPingAt: null,
  }));

  const cbs = useRef({ onReaction: opts.onReaction, onMessage: opts.onMessage });
  useEffect(() => {
    cbs.current = { onReaction: opts.onReaction, onMessage: opts.onMessage };
  });

  useEffect(() => {
    if (!eventId || !enabled || typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    let es: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const handle = (data: unknown, named?: string) => {
      const msg = parse(data, named);
      if (!msg) return;
      cbs.current.onMessage?.(msg);
      setState((s) => {
        switch (msg.type) {
          case 'state':
            return { ...s, stream: msg.stream, status: msg.status ?? s.status, viewers: msg.stream.viewers ?? s.viewers };
          case 'viewers':
            return { ...s, viewers: msg.viewers };
          case 'reaction':
            return { ...s, reactions: { ...s.reactions, [msg.kind]: (s.reactions[msg.kind] ?? 0) + msg.count } };
          case 'ping':
            return { ...s, lastPingAt: msg.t };
        }
      });
      if (msg.type === 'reaction') cbs.current.onReaction?.(msg.kind, msg.count);
    };

    const connect = () => {
      if (disposed) return;
      setState((s) => ({ ...s, connection: retry === 0 ? 'connecting' : 'reconnecting' }));
      es = new EventSource(eventUrls(eventId).live);
      es.onopen = () => {
        retry = 0;
        setState((s) => ({ ...s, connection: 'open' }));
      };
      es.onmessage = (e) => handle(e.data);
      for (const name of NAMED_EVENTS) es.addEventListener(name, (e) => handle((e as MessageEvent).data, name));
      es.onerror = () => {
        if (!es || disposed) return;
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          retry += 1;
          const delay = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)) + Math.random() * 500;
          setState((s) => ({ ...s, connection: 'reconnecting' }));
          timer = setTimeout(connect, delay);
        } else {
          // The browser is retrying on its own.
          setState((s) => ({ ...s, connection: 'reconnecting' }));
        }
      };
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !es && !disposed) {
        if (timer) clearTimeout(timer);
        retry = 0;
        connect();
      }
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearTimeout(timer);
      es?.close();
      es = null;
    };
  }, [eventId, enabled]);

  return state;
}
