import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import {
  computeEventStatus,
  type EventStreamPublic,
  type LiveEvent,
  type MediaAuthPayload,
  type Principal,
  type StreamAdminEvent,
  type StreamConfig,
  type StreamHealth,
  type StreamPreviewToken,
  type StreamState,
  type StreamStatusSnapshot,
} from '@zemi/shared';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { AppError, conflict, notFound } from '../../common/errors.js';
import { timingSafeEqualStr } from '../../common/crypto.js';
import { CryptoService } from '../../common/crypto.service.js';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db } from '../../db/client.js';
import { events, eventStreams, streamSessions } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { channels, RealtimeService } from '../realtime/realtime.service.js';
import { RevalidateService, tags } from '../revalidate/revalidate.service.js';
import { AudienceService } from './audience.service.js';
import { HlsProxyService } from './hls-proxy.service.js';
import { MediaMtxClient, pathBytes, pathOnline, pathSince, type MtxPath, type MtxTrack } from './mediamtx.client.js';
import { RecordingsService } from './recordings.service.js';
import {
  bitrateFromSamples,
  newPrivateKey,
  newStreamKey,
  parseLivePath,
  pushSample,
  queryParam,
  type ByteSample,
} from './stream.util.js';

export type StreamRow = typeof eventStreams.$inferSelect;

export interface EventLite {
  id: string;
  slug: string;
  title: string;
  number: number | null;
  startsAt: Date;
  endsAt: Date;
  cancelledAt: Date | null;
  visibility: 'draft' | 'published' | 'unlisted';
}

/** What the HLS proxy, heartbeats and reactions need, cached for a second per event. */
export interface StreamGate {
  exists: boolean;
  visibility: EventLite['visibility'] | null;
  streamKey: string | null;
  state: StreamState;
  ingestOnline: boolean;
}

export type AuthDecision = { allowed: true } | { allowed: false; reason: string };

const GATE_TTL_MS = 1000;
const RECONCILE_MS = 10_000;
const HEALTH_TICK_MS = 3000;
/** Reconcile leaves a key alone for this long after a hook touched it (hooks win races). */
const HOOK_GRACE_MS = 15_000;
const PREVIEW_TTL_SEC = 600;
const PREVIEW_PURPOSE = 'hls-preview';

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const VIDEO_CODECS = /^(h264|h265|hevc|av1|vp8|vp9|mpeg-?4 ?video|mpeg-?1\/2 ?video|m-?jpeg)/i;
const AUDIO_CODECS = /^(mpeg-?4 ?audio|aac|opus|ac-?3|mpeg-?1\/2 ?audio|mp3|g711|g722|lpcm|speex|vorbis)/i;

const numProp = (props: Record<string, unknown> | null | undefined, ...names: string[]): number | null => {
  for (const n of names) {
    const v = props?.[n];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
};

/** tracks2 (1.21) or the old `tracks: string[]`. */
export function describeTracks(p: MtxPath): Pick<StreamHealth, 'video' | 'audio'> {
  const tracks: MtxTrack[] = p.tracks2?.length ? p.tracks2 : (p.tracks ?? []).map((codec) => ({ codec }));
  const v = tracks.find((t) => VIDEO_CODECS.test(t.codec) || numProp(t.codecProps, 'width') !== null);
  const a = tracks.find((t) => t !== v && (AUDIO_CODECS.test(t.codec) || numProp(t.codecProps, 'sampleRate') !== null));
  return {
    video: v ? { codec: v.codec, width: numProp(v.codecProps, 'width'), height: numProp(v.codecProps, 'height') } : null,
    audio: a
      ? { codec: a.codec, sampleRate: numProp(a.codecProps, 'sampleRate'), channels: numProp(a.codecProps, 'channelCount', 'channels') }
      : null,
  };
}

/**
 * The livestream engine: per-event stream rows (keys, state), the MediaMTX auth decision and hooks,
 * go live / end / rotate, health, preview tokens, public snapshots, and a 10s reconcile against
 * MediaMTX so a missed hook never leaves the dashboard lying.
 *
 * State machine (SPEC 9): idle -> preview (OBS connected) -> live (admin) -> ended (admin).
 * OBS dropping while live keeps `live` with `ingestOnline=false` (viewers see a slate).
 */
@Injectable()
export class StreamService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Stream');
  private readonly gates = new Map<string, { value: StreamGate; at: number }>();
  private readonly samples = new Map<string, ByteSample[]>();
  private readonly hookTouched = new Map<string, number>();
  /** When each key last went offline (in memory; finalize uses it to wait for the last segment). */
  private readonly offlineAt = new Map<string, number>();
  private reconcileTimer?: NodeJS.Timeout;
  private healthTimer?: NodeJS.Timeout;
  private reconciling = false;
  private healthRunning = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: AppConfig,
    private readonly crypto: CryptoService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
    private readonly mtx: MediaMtxClient,
    private readonly audience: AudienceService,
    private readonly hls: HlsProxyService,
    private readonly recordings: RecordingsService,
  ) {
    this.recordings.bindIngestInfo((key) => this.offlineAt.get(key) ?? null);
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      const live = await this.db
        .select({ row: eventStreams, sessionPeak: streamSessions.peakViewers })
        .from(eventStreams)
        .leftJoin(streamSessions, eq(streamSessions.id, eventStreams.currentSessionId))
        .where(eq(eventStreams.state, 'live'));
      for (const { row, sessionPeak } of live) {
        this.audience.setLive(row.eventId, { sessionId: row.currentSessionId, sessionPeak: sessionPeak ?? 0, eventPeak: row.peakViewers });
      }
    } catch (err) {
      this.logger.error(`Could not load live streams: ${(err as Error).message}`);
    }
    this.reconcileTimer = setInterval(() => void this.reconcile(), RECONCILE_MS);
    this.reconcileTimer.unref();
    this.healthTimer = setInterval(() => void this.tickHealth(), HEALTH_TICK_MS);
    this.healthTimer.unref();
    setTimeout(() => void this.reconcile(), 2000).unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.reconcileTimer);
    clearInterval(this.healthTimer);
  }

  /* ------------------------------------------------------------------------ rows and views */

  async findEvent(eventId: string): Promise<EventLite | null> {
    const [row] = await this.db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        number: events.number,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        cancelledAt: events.cancelledAt,
        visibility: events.visibility,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    return row ?? null;
  }

  async event(eventId: string): Promise<EventLite> {
    const row = await this.findEvent(eventId);
    if (!row) throw notFound("We couldn't find that event.");
    return row;
  }

  async findStream(eventId: string): Promise<StreamRow | null> {
    const [row] = await this.db.select().from(eventStreams).where(eq(eventStreams.eventId, eventId)).limit(1);
    return row ?? null;
  }

  /** The event's stream row, created on first use with fresh keys (SPEC 9). */
  async ensure(eventId: string): Promise<StreamRow> {
    const existing = await this.findStream(eventId);
    if (existing) return existing;
    await this.db
      .insert(eventStreams)
      .values({ eventId, streamKey: newStreamKey(), privateKeyEnc: this.crypto.encrypt(newPrivateKey(), eventId) })
      .onConflictDoNothing();
    const row = await this.findStream(eventId);
    if (!row) throw notFound("We couldn't find that event.");
    return row;
  }

  private privateKey(row: StreamRow): string {
    return this.crypto.decrypt(row.privateKeyEnc, row.eventId);
  }

  hlsUrl(eventId: string): string {
    return `${this.config.env.PUBLIC_API_URL}/api/v1/public/live/${eventId}/index.m3u8`;
  }

  private viewersOf(row: Pick<StreamRow, 'eventId' | 'state'>): number {
    return row.state === 'live' ? this.audience.count(row.eventId) : 0;
  }

  snapshot(row: StreamRow): StreamStatusSnapshot {
    return {
      eventId: row.eventId,
      state: row.state,
      ingestOnline: row.ingestOnline,
      ingestOnlineAt: iso(row.ingestOnlineAt),
      liveStartedAt: iso(row.liveStartedAt),
      liveEndedAt: iso(row.liveEndedAt),
      viewers: this.viewersOf(row),
      peakViewers: Math.max(row.peakViewers, this.audience.peak(row.eventId)),
      currentSessionId: row.currentSessionId,
    };
  }

  toConfig(row: StreamRow): StreamConfig {
    const privateKey = this.privateKey(row);
    return {
      ...this.snapshot(row),
      obs: {
        server: this.config.env.RTMP_PUBLIC_URL,
        streamKey: row.streamKey,
        privateKey,
        obsStreamKey: `${row.streamKey}?key=${privateKey}`,
      },
    };
  }

  /** GET /admin/events/:id/stream */
  async streamConfig(eventId: string): Promise<StreamConfig> {
    await this.event(eventId);
    return this.toConfig(await this.ensure(eventId));
  }

  async statusSnapshot(eventId: string): Promise<StreamStatusSnapshot> {
    await this.event(eventId);
    return this.snapshot(await this.ensure(eventId));
  }

  /** `EventStreamPublic` for public pages (no row yet = idle). */
  publicStream(eventId: string, row: Pick<StreamRow, 'state' | 'ingestOnline' | 'liveStartedAt'> | null): EventStreamPublic {
    const state = row?.state ?? 'idle';
    return {
      state,
      ingestOnline: row?.ingestOnline ?? false,
      hlsUrl: state === 'live' ? this.hlsUrl(eventId) : null,
      liveStartedAt: state === 'live' || state === 'ended' ? iso(row?.liveStartedAt) : null,
      viewers: state === 'live' ? this.audience.count(eventId) : 0,
    };
  }

  /** For the events module: public stream info for many events in one query. */
  async publicStreams(eventIds: string[]): Promise<Map<string, EventStreamPublic>> {
    const ids = [...new Set(eventIds)].filter(Boolean);
    const out = new Map<string, EventStreamPublic>();
    if (!ids.length) return out;
    const rows = await this.db
      .select({ eventId: eventStreams.eventId, state: eventStreams.state, ingestOnline: eventStreams.ingestOnline, liveStartedAt: eventStreams.liveStartedAt })
      .from(eventStreams)
      .where(inArray(eventStreams.eventId, ids));
    const byId = new Map(rows.map((r) => [r.eventId, r]));
    for (const id of ids) out.set(id, this.publicStream(id, byId.get(id) ?? null));
    return out;
  }

  /** Event ids whose stream is live right now (for `isLive` on cards and `/live`). */
  async liveEventIds(): Promise<string[]> {
    const rows = await this.db.select({ id: eventStreams.eventId }).from(eventStreams).where(eq(eventStreams.state, 'live'));
    return rows.map((r) => r.id);
  }

  /** The public SSE `state` message. 404 for unknown or draft events. */
  async liveSnapshot(eventId: string): Promise<LiveEvent> {
    const event = await this.findEvent(eventId);
    if (!event || event.visibility === 'draft') throw notFound("We couldn't find that event.");
    const row = await this.findStream(eventId);
    return { type: 'state', stream: this.publicStream(eventId, row), status: computeEventStatus(event, row?.state ?? null) };
  }

  /** Cached (1s) gate lookup for HLS, heartbeats and reactions. */
  async gate(eventId: string): Promise<StreamGate> {
    const hit = this.gates.get(eventId);
    if (hit && Date.now() - hit.at < GATE_TTL_MS) return hit.value;
    const [row] = await this.db
      .select({
        visibility: events.visibility,
        streamKey: eventStreams.streamKey,
        state: eventStreams.state,
        ingestOnline: eventStreams.ingestOnline,
      })
      .from(events)
      .leftJoin(eventStreams, eq(eventStreams.eventId, events.id))
      .where(eq(events.id, eventId))
      .limit(1);
    const value: StreamGate = row
      ? { exists: true, visibility: row.visibility, streamKey: row.streamKey ?? null, state: row.state ?? 'idle', ingestOnline: row.ingestOnline ?? false }
      : { exists: false, visibility: null, streamKey: null, state: 'idle', ingestOnline: false };
    if (this.gates.size > 2000) this.gates.clear();
    this.gates.set(eventId, { value, at: Date.now() });
    return value;
  }

  /** Push the new state to public + admin listeners and drop cached lookups. */
  private async broadcast(row: StreamRow, event?: EventLite | null): Promise<void> {
    this.gates.delete(row.eventId);
    const ev = event ?? (await this.findEvent(row.eventId));
    const admin: StreamAdminEvent = { type: 'state', stream: this.snapshot(row) };
    this.realtime.publish(channels.stream(row.eventId), admin);
    if (ev && ev.visibility !== 'draft') {
      const live: LiveEvent = { type: 'state', stream: this.publicStream(row.eventId, row), status: computeEventStatus(ev, row.state) };
      this.realtime.publish(channels.live(row.eventId), live);
    }
  }

  /* ------------------------------------------------------------------------- admin actions */

  /** POST /admin/events/:id/stream/live */
  async goLive(eventId: string, principal: Principal, ip: string | null): Promise<StreamConfig> {
    const event = await this.event(eventId);
    if (event.cancelledAt) throw conflict("This event is cancelled, so there's nothing to stream.");
    await this.ensure(eventId);
    const { row, sessionId } = await this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(eventStreams).where(eq(eventStreams.eventId, eventId)).for('update');
      if (!cur) throw notFound("We couldn't find that event.");
      if (cur.state === 'live') throw new AppError(409, 'already_live', "You're already live. Wave at the camera.");
      if (!cur.ingestOnline) {
        throw new AppError(409, 'no_signal', "We don't see OBS yet. Hit Start Streaming in OBS, wait for the preview, then go live.");
      }
      const now = new Date();
      const [session] = await tx
        .insert(streamSessions)
        .values({ eventId, streamKey: cur.streamKey, startedAt: now, recordingStatus: 'recording' })
        .returning({ id: streamSessions.id });
      const [updated] = await tx
        .update(eventStreams)
        .set({ state: 'live', liveStartedAt: now, liveEndedAt: null, currentSessionId: session!.id })
        .where(eq(eventStreams.eventId, eventId))
        .returning();
      return { row: updated!, sessionId: session!.id };
    });
    this.audience.setLive(eventId, { sessionId, sessionPeak: 0, eventPeak: row.peakViewers });
    await this.audit.log({
      principal,
      action: 'stream.live',
      resourceType: 'event',
      resourceId: eventId,
      summary: `Went live on "${event.title}"`,
      meta: { sessionId },
      ip,
    });
    await this.broadcast(row, event);
    void this.revalidate.revalidate([tags.events, tags.event(eventId)]);
    this.logger.log(`Event ${eventId} is live (session ${sessionId})`);
    return this.toConfig(row);
  }

  /** POST /admin/events/:id/stream/end */
  async end(eventId: string, principal: Principal, ip: string | null): Promise<StreamConfig> {
    const event = await this.event(eventId);
    await this.ensure(eventId);
    const { row, sessionId } = await this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(eventStreams).where(eq(eventStreams.eventId, eventId)).for('update');
      if (!cur) throw notFound("We couldn't find that event.");
      if (cur.state !== 'live') throw new AppError(409, 'not_live', "You're not live right now, so there's nothing to end.");
      const now = new Date();
      if (cur.currentSessionId) {
        await tx
          .update(streamSessions)
          .set({ endedAt: now, recordingStatus: 'waiting' })
          .where(and(eq(streamSessions.id, cur.currentSessionId), eq(streamSessions.recordingStatus, 'recording')));
      }
      const [updated] = await tx
        .update(eventStreams)
        .set({ state: 'ended', liveEndedAt: now, currentSessionId: null })
        .where(eq(eventStreams.eventId, eventId))
        .returning();
      return { row: updated!, sessionId: cur.currentSessionId };
    });
    // Keep the final count on the row before the audience forgets it.
    this.audience.setLive(eventId, null);
    if (sessionId) {
      await this.recordings.enqueueFinalize(sessionId, { delaySec: 10 }).catch((err: unknown) => {
        this.logger.error(`Could not queue recording.finalize for ${sessionId}: ${(err as Error).message}`);
      });
      void this.recordings.publishSession(sessionId);
    }
    await this.audit.log({
      principal,
      action: 'stream.end',
      resourceType: 'event',
      resourceId: eventId,
      summary: `Ended the stream for "${event.title}"`,
      meta: { sessionId },
      ip,
    });
    await this.broadcast(row, event);
    void this.revalidate.revalidate([tags.events, tags.event(eventId)]);
    this.logger.log(`Event ${eventId} ended (session ${sessionId ?? 'none'})`);
    return this.toConfig(row);
  }

  /**
   * POST /admin/events/:id/stream/rotate. New keys and the current publisher gets kicked.
   * While live only the private key changes (same path, so the recording keeps going and viewers
   * keep the same playlist); otherwise both the stream key and the private key are new.
   */
  async rotate(eventId: string, principal: Principal, ip: string | null): Promise<StreamConfig> {
    const event = await this.event(eventId);
    await this.ensure(eventId);
    const { row, oldKey, keyChanged } = await this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(eventStreams).where(eq(eventStreams.eventId, eventId)).for('update');
      if (!cur) throw notFound("We couldn't find that event.");
      const live = cur.state === 'live';
      const streamKey = live ? cur.streamKey : newStreamKey();
      const [updated] = await tx
        .update(eventStreams)
        .set({
          streamKey,
          privateKeyEnc: this.crypto.encrypt(newPrivateKey(), eventId),
          ...(live ? {} : { ingestOnline: false, ingestOnlineAt: null, state: cur.state === 'preview' ? ('idle' as const) : cur.state }),
        })
        .where(eq(eventStreams.eventId, eventId))
        .returning();
      return { row: updated!, oldKey: cur.streamKey, keyChanged: !live };
    });
    const kicked = await this.mtx.kickPublisher(`live/${oldKey}`);
    if (keyChanged) {
      this.hls.evict(oldKey);
      this.samples.delete(oldKey);
    }
    this.hookTouched.set(oldKey, Date.now());
    await this.audit.log({
      principal,
      action: 'stream.rotate',
      resourceType: 'event',
      resourceId: eventId,
      summary: `Rotated the stream keys for "${event.title}"`,
      meta: { streamKeyChanged: keyChanged, kicked },
      ip,
    });
    this.realtime.publish(channels.stream(eventId), { type: 'keys-rotated', at: new Date().toISOString(), streamKeyChanged: keyChanged } satisfies StreamAdminEvent);
    await this.broadcast(row, event);
    return this.toConfig(row);
  }

  /** GET /admin/events/:id/stream/preview-token */
  async previewToken(eventId: string): Promise<StreamPreviewToken> {
    await this.event(eventId);
    const token = this.crypto.sign(PREVIEW_PURPOSE, { e: eventId }, PREVIEW_TTL_SEC);
    const exp = this.crypto.verify<{ e: string }>(PREVIEW_PURPOSE, token)?.exp ?? Math.floor(Date.now() / 1000) + PREVIEW_TTL_SEC;
    return {
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
      hlsUrl: `${this.hlsUrl(eventId)}?pt=${encodeURIComponent(token)}`,
    };
  }

  verifyPreviewToken(eventId: string, token: string | null | undefined): boolean {
    if (!token || token.length > 512) return false;
    return this.crypto.verify<{ e: string }>(PREVIEW_PURPOSE, token)?.e === eventId;
  }

  /* -------------------------------------------------------------------------------- health */

  private sample(key: string, p: MtxPath): ByteSample[] {
    const next = pushSample(this.samples.get(key) ?? [], { t: Date.now(), bytes: pathBytes(p) });
    this.samples.set(key, next);
    return next;
  }

  /** GET /admin/events/:id/stream/health */
  async health(eventId: string): Promise<StreamHealth> {
    await this.event(eventId);
    return this.healthFor(await this.ensure(eventId));
  }

  private async healthFor(row: StreamRow): Promise<StreamHealth> {
    const offline: StreamHealth = {
      online: false,
      since: null,
      bitrateKbps: null,
      video: null,
      audio: null,
      bytesReceived: 0,
      readers: 0,
    };
    const found = await this.mtx.getPath(`live/${row.streamKey}`);
    // MediaMTX unreachable: say what the database believes, without numbers.
    if (!found.ok) return { ...offline, online: row.ingestOnline, since: iso(row.ingestOnlineAt) };
    const p = found.path;
    if (!p || !pathOnline(p)) return offline;
    const samples = this.sample(row.streamKey, p);
    return {
      online: true,
      since: pathSince(p) ?? iso(row.ingestOnlineAt),
      bitrateKbps: bitrateFromSamples(samples),
      ...describeTracks(p),
      bytesReceived: pathBytes(p),
      readers: p.readers?.length ?? 0,
    };
  }

  /** Every few seconds, push health to admins who have the stream dashboard open. */
  private async tickHealth(): Promise<void> {
    if (this.healthRunning) return;
    this.healthRunning = true;
    try {
      const ids = Object.keys(this.realtime.stats())
        .map((ch) => /^event:([0-9a-f-]{36}):stream$/.exec(ch)?.[1])
        .filter((id): id is string => !!id);
      if (!ids.length) return;
      const rows = await this.db.select().from(eventStreams).where(inArray(eventStreams.eventId, ids));
      await Promise.all(
        rows.map(async (row) => {
          const health = await this.healthFor(row);
          this.realtime.publish(channels.stream(row.eventId), { type: 'health', health } satisfies StreamAdminEvent);
        }),
      );
    } catch (err) {
      this.logger.warn(`Health tick failed: ${(err as Error).message}`);
    } finally {
      this.healthRunning = false;
    }
  }

  /* ----------------------------------------------------------------------- MediaMTX hooks */

  /**
   * POST /internal/media/auth. Publish needs `live/<streamKey>?key=<privateKey>` of a real,
   * not-cancelled event. Read is only for HLS/RTSP with the internal secret (our own proxy or
   * tools). Everything else is denied.
   */
  async authorize(p: MediaAuthPayload): Promise<AuthDecision> {
    if (p.action === 'publish') {
      const key = parseLivePath(p.path);
      if (!key) return { allowed: false, reason: 'not a live path' };
      const given = queryParam(p.query, 'key');
      if (!given) return { allowed: false, reason: 'missing private key' };
      const [row] = await this.db
        .select({ stream: eventStreams, cancelledAt: events.cancelledAt })
        .from(eventStreams)
        .innerJoin(events, eq(events.id, eventStreams.eventId))
        .where(eq(eventStreams.streamKey, key))
        .limit(1);
      if (!row) return { allowed: false, reason: 'unknown stream key' };
      if (row.cancelledAt) return { allowed: false, reason: 'event is cancelled' };
      let expected: string;
      try {
        expected = this.privateKey(row.stream);
      } catch {
        return { allowed: false, reason: 'private key could not be decrypted' };
      }
      if (!timingSafeEqualStr(given, expected)) return { allowed: false, reason: 'wrong private key' };
      return { allowed: true };
    }
    if (p.action === 'read') {
      if (p.protocol !== 'hls' && p.protocol !== 'rtsp') return { allowed: false, reason: `reading over ${p.protocol || 'that protocol'} is off` };
      const secret = this.config.env.MEDIA_INTERNAL_SECRET;
      const ok = [p.password, p.token, p.user].some((c) => !!c && timingSafeEqualStr(c, secret));
      return ok ? { allowed: true } : { allowed: false, reason: 'readers need the internal secret' };
    }
    return { allowed: false, reason: `action ${p.action} is not allowed` };
  }

  /** runOnOnline: OBS connected. idle/ended -> preview; live stays live (signal is back). */
  async onIngestOnline(path: string, source?: string): Promise<{ ok: boolean; state?: StreamState }> {
    const key = parseLivePath(path);
    if (!key) return { ok: false };
    this.hookTouched.set(key, Date.now());
    this.offlineAt.delete(key);
    const row = await this.markOnline(key);
    if (!row) return { ok: false };
    this.logger.log(`Ingest online for event ${row.eventId} (${source || 'publisher'}), state ${row.state}`);
    return { ok: true, state: row.state };
  }

  /** runOnOffline: OBS disconnected. State is kept (live shows the "signal lost" slate). */
  async onIngestOffline(path: string): Promise<{ ok: boolean; state?: StreamState }> {
    const key = parseLivePath(path);
    if (!key) return { ok: false };
    this.hookTouched.set(key, Date.now());
    this.offlineAt.set(key, Date.now());
    this.samples.delete(key);
    const row = await this.markOffline(key);
    if (!row) return { ok: false };
    this.logger.log(`Ingest offline for event ${row.eventId}, state ${row.state}`);
    return { ok: true, state: row.state };
  }

  private async markOnline(key: string): Promise<StreamRow | null> {
    const [row] = await this.db
      .update(eventStreams)
      .set({
        ingestOnline: true,
        ingestOnlineAt: new Date(),
        state: sql<StreamState>`case when ${eventStreams.state} in ('idle', 'ended') then 'preview' else ${eventStreams.state} end`,
      })
      .where(eq(eventStreams.streamKey, key))
      .returning();
    if (row) await this.broadcast(row);
    return row ?? null;
  }

  private async markOffline(key: string): Promise<StreamRow | null> {
    const [row] = await this.db.update(eventStreams).set({ ingestOnline: false }).where(eq(eventStreams.streamKey, key)).returning();
    if (row) await this.broadcast(row);
    return row ?? null;
  }

  /**
   * Every 10s: compare MediaMTX's live paths with `ingestOnline` and fix drift (missed hooks after a
   * restart of either side). A MediaMTX that doesn't answer changes nothing.
   */
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const paths = await this.mtx.listPaths();
      if (paths) {
        const online = new Map<string, MtxPath>();
        for (const p of paths) {
          const key = parseLivePath(p.name);
          if (key && pathOnline(p)) online.set(key, p);
        }
        for (const [key, p] of online) this.sample(key, p);
        for (const key of [...this.samples.keys()]) if (!online.has(key)) this.samples.delete(key);

        const keys = [...online.keys()];
        const rows = await this.db
          .select({ streamKey: eventStreams.streamKey, ingestOnline: eventStreams.ingestOnline, eventId: eventStreams.eventId })
          .from(eventStreams)
          .where(keys.length ? or(eq(eventStreams.ingestOnline, true), inArray(eventStreams.streamKey, keys)) : eq(eventStreams.ingestOnline, true));
        const now = Date.now();
        for (const r of rows) {
          const shouldBe = online.has(r.streamKey);
          if (r.ingestOnline === shouldBe) continue;
          if (now - (this.hookTouched.get(r.streamKey) ?? 0) < HOOK_GRACE_MS) continue;
          this.logger.warn(`Reconcile: event ${r.eventId} ingest was ${r.ingestOnline ? 'online' : 'offline'}, MediaMTX says ${shouldBe ? 'online' : 'offline'}`);
          if (shouldBe) await this.markOnline(r.streamKey);
          else {
            this.offlineAt.set(r.streamKey, now);
            await this.markOffline(r.streamKey);
          }
        }
        for (const [key, t] of this.hookTouched) if (now - t > 10 * 60_000) this.hookTouched.delete(key);
      }
      await this.recordings.syncAttached();
    } catch (err) {
      this.logger.warn(`Reconcile failed: ${(err as Error).message}`);
    } finally {
      this.reconciling = false;
    }
  }
}
