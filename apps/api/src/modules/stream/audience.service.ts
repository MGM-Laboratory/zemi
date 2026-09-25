import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { LiveEvent, StreamAdminEvent } from '@zemi/shared';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db/client.js';
import { eventStreams, streamSessions } from '../../db/schema.js';
import { channels, RealtimeService } from '../realtime/realtime.service.js';

/** A viewer counts while their last heartbeat is younger than this (web sends one every 15s). */
export const VIEWER_WINDOW_MS = 40_000;
const VIEWERS_TICK_MS = 5_000;
const REACTIONS_TICK_MS = 1_000;
/** Memory guards against a flood of made-up viewer ids. */
const MAX_VIEWERS_PER_EVENT = 50_000;
const MAX_TRACKED_EVENTS = 200;

export interface LiveInfo {
  sessionId: string | null;
  /** Peak of the current session (stream_sessions.peak_viewers). */
  sessionPeak: number;
  /** All-time peak for the event (event_streams.peak_viewers, shown as StreamConfig.peakViewers). */
  eventPeak: number;
}

/**
 * Live audience: viewer counting from heartbeats (distinct ids in the last 40s), peak tracking,
 * and reaction bursts aggregated per second. In memory, single API instance (like the SSE hub).
 *
 * StreamService tells us which events are live (`setLive`), so the 5s viewers tick also reaches
 * people who only have the SSE open, and drops to 0 are published too.
 */
@Injectable()
export class AudienceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Audience');
  private readonly viewers = new Map<string, Map<string, number>>();
  private readonly live = new Map<string, LiveInfo>();
  private readonly lastCount = new Map<string, number>();
  private readonly pendingReactions = new Map<string, Map<string, number>>();
  private viewersTimer?: NodeJS.Timeout;
  private reactionsTimer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit(): void {
    this.viewersTimer = setInterval(() => void this.tickViewers(), VIEWERS_TICK_MS);
    this.viewersTimer.unref();
    this.reactionsTimer = setInterval(() => this.flushReactions(), REACTIONS_TICK_MS);
    this.reactionsTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.viewersTimer);
    clearInterval(this.reactionsTimer);
  }

  /** Mark an event live (with its session and stored peak) or not live (clears its viewers). */
  setLive(eventId: string, info: LiveInfo | null): void {
    if (info) {
      const prev = this.live.get(eventId);
      const same = prev?.sessionId === info.sessionId;
      this.live.set(eventId, {
        sessionId: info.sessionId,
        sessionPeak: Math.max(info.sessionPeak, same ? prev.sessionPeak : 0),
        eventPeak: Math.max(info.eventPeak, prev?.eventPeak ?? 0),
      });
    } else {
      this.live.delete(eventId);
      this.viewers.delete(eventId);
      this.lastCount.delete(eventId);
      this.pendingReactions.delete(eventId);
    }
  }

  isLive(eventId: string): boolean {
    return this.live.has(eventId);
  }

  /** Record a heartbeat. Returns the current viewer count. */
  heartbeat(eventId: string, viewerId: string, now = Date.now()): number {
    let map = this.viewers.get(eventId);
    if (!map) {
      if (this.viewers.size >= MAX_TRACKED_EVENTS) return 0;
      map = new Map();
      this.viewers.set(eventId, map);
    }
    if (map.has(viewerId) || map.size < MAX_VIEWERS_PER_EVENT) map.set(viewerId, now);
    return this.count(eventId, now);
  }

  /** Distinct viewers seen in the last 40s. */
  count(eventId: string, now = Date.now()): number {
    const map = this.viewers.get(eventId);
    if (!map) return 0;
    let n = 0;
    for (const t of map.values()) if (now - t <= VIEWER_WINDOW_MS) n += 1;
    return n;
  }

  /** All-time peak for the event as far as this process knows (0 when not live). */
  peak(eventId: string): number {
    return this.live.get(eventId)?.eventPeak ?? 0;
  }

  /** Queue one reaction; bursts go out once per second as `{ type: 'reaction', kind, count }`. */
  react(eventId: string, kind: string): void {
    let map = this.pendingReactions.get(eventId);
    if (!map) {
      map = new Map();
      this.pendingReactions.set(eventId, map);
    }
    map.set(kind, (map.get(kind) ?? 0) + 1);
  }

  private flushReactions(): void {
    if (!this.pendingReactions.size) return;
    const batch = [...this.pendingReactions];
    this.pendingReactions.clear();
    for (const [eventId, kinds] of batch) {
      for (const [kind, count] of kinds) {
        this.realtime.publish(channels.live(eventId), { type: 'reaction', kind, count } satisfies LiveEvent);
      }
    }
  }

  private async tickViewers(now = Date.now()): Promise<void> {
    // Forget stale viewers and events nobody watches anymore.
    for (const [eventId, map] of this.viewers) {
      for (const [id, t] of map) if (now - t > VIEWER_WINDOW_MS) map.delete(id);
      if (!map.size && !this.live.has(eventId)) this.viewers.delete(eventId);
    }
    for (const [eventId, info] of this.live) {
      const n = this.count(eventId, now);
      this.lastCount.set(eventId, n);
      if (n > info.sessionPeak || n > info.eventPeak) {
        info.sessionPeak = Math.max(info.sessionPeak, n);
        info.eventPeak = Math.max(info.eventPeak, n);
        await this.persistPeak(eventId, info.sessionId, n);
      }
      this.realtime.publish(channels.live(eventId), { type: 'viewers', viewers: n } satisfies LiveEvent);
      this.realtime.publish(channels.stream(eventId), { type: 'viewers', viewers: n, peakViewers: info.eventPeak } satisfies StreamAdminEvent);
    }
  }

  private async persistPeak(eventId: string, sessionId: string | null, n: number): Promise<void> {
    try {
      await this.db
        .update(eventStreams)
        .set({ peakViewers: sql`greatest(${eventStreams.peakViewers}, ${n})` })
        .where(and(eq(eventStreams.eventId, eventId), lt(eventStreams.peakViewers, n)));
      if (sessionId) {
        await this.db
          .update(streamSessions)
          .set({ peakViewers: sql`greatest(${streamSessions.peakViewers}, ${n})` })
          .where(and(eq(streamSessions.id, sessionId), lt(streamSessions.peakViewers, n)));
      }
    } catch (err) {
      this.logger.warn(`Could not save peak viewers for ${eventId}: ${(err as Error).message}`);
    }
  }
}
