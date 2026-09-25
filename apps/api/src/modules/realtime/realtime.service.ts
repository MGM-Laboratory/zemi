import { Injectable, Logger, type BeforeApplicationShutdown, type MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

/**
 * Channel naming convention (keep to it so counts and cleanup stay predictable):
 *
 *   event:<eventId>:live        public   stream state, viewers, reactions  (LiveEvent from @zemi/shared)
 *   event:<eventId>:attendance  admin    check-ins for the door and dashboard
 *   event:<eventId>:stream      admin    ingest health, preview, go-live changes
 *
 * Payloads are JSON objects with a `type` field. Pings are `{ type: 'ping', t: <iso> }` every 20s.
 */
export const channels = {
  live: (eventId: string) => `event:${eventId}:live`,
  attendance: (eventId: string) => `event:${eventId}:attendance`,
  stream: (eventId: string) => `event:${eventId}:stream`,
} as const;

export interface SseOptions {
  /** Sent first to every new subscriber (current state snapshot). */
  initial?: () => unknown;
  /** Ping interval in ms (default 20s, keeps proxies from closing idle streams). */
  pingMs?: number;
  /** Called when this subscriber disconnects. */
  onClose?: () => void;
}

interface Channel {
  subject: Subject<MessageEvent>;
  subscribers: number;
}

/**
 * In-process SSE hub. Publish from anywhere; controllers expose a channel with Nest's @Sse():
 *
 *   @Public() @Sse(':id/live')
 *   live(@Param('id') id: string) {
 *     return this.realtime.stream(channels.live(id), { initial: () => this.snapshot(id) });
 *   }
 *
 *   this.realtime.publish(channels.live(id), { type: 'viewers', viewers: 42 });
 *
 * Single instance only (no Redis fan-out). That matches our one-API-container deployment.
 */
@Injectable()
export class RealtimeService implements BeforeApplicationShutdown {
  private readonly logger = new Logger('Realtime');
  private readonly channels = new Map<string, Channel>();
  private closing = false;

  /** Push an event to every subscriber of a channel. No-op when nobody listens. */
  publish(channel: string, data: unknown, opts: { event?: string; id?: string } = {}): void {
    const ch = this.channels.get(channel);
    if (!ch || !ch.subscribers) return;
    ch.subject.next({ data: data as object, ...(opts.event ? { type: opts.event } : {}), ...(opts.id ? { id: opts.id } : {}) });
  }

  /** Observable for `@Sse()` handlers: initial snapshot, live events, pings, cleanup on disconnect. */
  stream(channel: string, opts: SseOptions = {}): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      if (this.closing) {
        subscriber.complete();
        return;
      }
      const ch = this.acquire(channel);
      const sub = ch.subject.subscribe({
        next: (m) => subscriber.next(m),
        complete: () => subscriber.complete(),
      });
      const ping = setInterval(() => subscriber.next({ data: { type: 'ping', t: new Date().toISOString() } }), opts.pingMs ?? 20_000);
      ping.unref();

      if (opts.initial) {
        Promise.resolve()
          .then(() => opts.initial!())
          .then((data) => {
            if (data !== undefined && !subscriber.closed) subscriber.next({ data: data as object });
          })
          .catch((err: unknown) => this.logger.warn(`initial snapshot for ${channel} failed: ${(err as Error).message}`));
      }

      return () => {
        clearInterval(ping);
        sub.unsubscribe();
        this.release(channel);
        try {
          opts.onClose?.();
        } catch {
          /* ignore */
        }
      };
    });
  }

  /** Live subscriber count for a channel (e.g. open admin dashboards). */
  subscriberCount(channel: string): number {
    return this.channels.get(channel)?.subscribers ?? 0;
  }

  /** All channels with at least one subscriber, with counts. */
  stats(): Record<string, number> {
    return Object.fromEntries([...this.channels].map(([k, v]) => [k, v.subscribers]));
  }

  private acquire(channel: string): Channel {
    let ch = this.channels.get(channel);
    if (!ch) {
      ch = { subject: new Subject<MessageEvent>(), subscribers: 0 };
      this.channels.set(channel, ch);
    }
    ch.subscribers += 1;
    return ch;
  }

  private release(channel: string): void {
    const ch = this.channels.get(channel);
    if (!ch) return;
    ch.subscribers -= 1;
    if (ch.subscribers <= 0) {
      ch.subject.complete();
      this.channels.delete(channel);
    }
  }

  /** End every open stream so the HTTP server can close. */
  beforeApplicationShutdown(): void {
    this.closing = true;
    for (const ch of this.channels.values()) ch.subject.complete();
    this.channels.clear();
  }
}
