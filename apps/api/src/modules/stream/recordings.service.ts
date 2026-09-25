import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import {
  fromJakartaInput,
  jakartaDateInput,
  type Principal,
  type Recording,
  type RecordingChapter,
  type RecordingStatus,
  type StreamAdminEvent,
  type StreamSessionAdmin,
} from '@zemi/shared';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import { toVideoRef } from '../../common/asset-refs.js';
import { AppError, badRequest, conflict, notFound, unprocessable } from '../../common/errors.js';
import { concatCopy, FfmpegError, poster, posterTime, probe, storyboard, trimCopy } from '../../common/ffmpeg.js';
import { withTmpDir } from '../../common/tmp.js';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db } from '../../db/client.js';
import { assets, events, eventStreams, recordingSegments, rundownItems, streamSessions, type AssetVariants } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { channels, RealtimeService } from '../realtime/realtime.service.js';
import { RevalidateService, tags } from '../revalidate/revalidate.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  finalizeBackoffSec,
  isSegmentFilename,
  parseDurationSec,
  parseLivePath,
  parseSegmentFilename,
  planCuts,
  segmentsCover,
  type SegmentSpan,
} from './stream.util.js';

export const FINALIZE_QUEUE = 'recording.finalize';
export const CLEANUP_QUEUE = 'recording.cleanup';

/** Give up waiting for the last segment this long after End (SPEC: "max 3 min", we allow ~4). */
const MAX_WAIT_MS = 4 * 60_000;
/** Ingest offline and nothing new for this long: the last segment isn't coming. */
const QUIET_MS = 90_000;
/** Segments are 60s; anything starting this long before a session can't overlap it. */
const LOOKBEHIND_MS = 10 * 60_000;
/** Raw segments nobody needs are deleted after this (preview before Go live, stray uploads). */
const ORPHAN_AFTER_MS = 2 * 3600_000;
/** Raw segments of failed sessions are kept this long for a reprocess. */
const FAILED_KEEP_MS = 7 * 86_400_000;
/** Sessions whose raw segments must stay. */
const NEEDS_SEGMENTS: RecordingStatus[] = ['recording', 'waiting', 'processing', 'failed'];

export interface FinalizeJob {
  sessionId: string;
  /** How many times we already waited for segments. */
  attempt?: number;
  /** Admin pressed Reprocess: skip the wait, keep a good recording when there is nothing to re-stitch. */
  reprocess?: boolean;
}

export type SessionRow = typeof streamSessions.$inferSelect;
type SegmentRow = typeof recordingSegments.$inferSelect;
type AssetRow = typeof assets.$inferSelect;

const spanOf = (s: SegmentRow): SegmentSpan & { row: SegmentRow } => ({
  id: s.id,
  startedAt: s.startedAt,
  durationSec: s.durationSec && s.durationSec > 0 ? s.durationSec : 60,
  row: s,
});

/** Does a segment overlap a session (an open session runs until now and beyond)? */
function overlaps(seg: SegmentRow, s: Pick<SessionRow, 'startedAt' | 'endedAt'>): boolean {
  const a = seg.startedAt.getTime();
  const b = a + (seg.durationSec && seg.durationSec > 0 ? seg.durationSec : 60) * 1000;
  const end = s.endedAt ? s.endedAt.getTime() : Number.POSITIVE_INFINITY;
  return a < end && b > s.startedAt.getTime();
}

function friendlyError(err: unknown): string {
  if (err instanceof FfmpegError) return "We couldn't stitch the recording (ffmpeg failed). Try Reprocess, or upload the file yourself.";
  const msg = (err as Error)?.message ?? '';
  if (/No video/i.test(msg)) return 'The recording had no video in it.';
  if (/ENOSPC/i.test(msg)) return 'The server ran out of disk space while stitching. Try Reprocess in a bit.';
  return 'Something broke while we stitched the recording. Try Reprocess.';
}

/**
 * Recordings: raw 60s fMP4 segments from MediaMTX (`recordings/raw/<streamKey>/<file>`), the
 * `recording.finalize` job that turns a session into one MP4 asset, and the admin endpoints.
 */
@Injectable()
export class RecordingsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger('Recordings');
  private readonly running = new Set<string>();
  private offlineAtOf: (streamKey: string) => number | null = () => null;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: AppConfig,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
    private readonly realtime: RealtimeService,
  ) {}

  /** StreamService hands us "when did this key go offline" (kept in memory by the hooks). */
  bindIngestInfo(fn: (streamKey: string) => number | null): void {
    this.offlineAtOf = fn;
  }

  onModuleInit(): void {
    this.jobs.register<FinalizeJob>(FINALIZE_QUEUE, (job) => this.finalize(job.data, job.signal), {
      concurrency: 1,
      expireInSeconds: 4 * 3600,
      retryLimit: 2,
      retryDelay: 60,
      retryBackoff: true,
    });
    this.jobs.register<Record<string, never>>(CLEANUP_QUEUE, () => this.cleanupSegments(), { retryLimit: 0, expireInSeconds: 1800 });
  }

  onApplicationBootstrap(): void {
    void this.jobs.schedule(CLEANUP_QUEUE, '23 * * * *', {}, { key: 'hourly' }).catch((err: unknown) => {
      this.logger.warn(`Could not schedule ${CLEANUP_QUEUE}: ${(err as Error).message}`);
    });
  }

  enqueueFinalize(sessionId: string, opts: { delaySec?: number; attempt?: number; reprocess?: boolean } = {}): Promise<string | null> {
    const data: FinalizeJob = { sessionId };
    if (opts.attempt) data.attempt = opts.attempt;
    if (opts.reprocess) data.reprocess = true;
    return this.jobs.send<FinalizeJob>(FINALIZE_QUEUE, data, { startAfter: opts.delaySec, singletonKey: sessionId });
  }

  /* ------------------------------------------------------------------------------ segments */

  /**
   * POST /internal/media/segments. Stores the file under recordings/raw/<key>/<filename> and records
   * it (idempotent: the sweeper may send the same file again). Unknown keys are accepted and dropped
   * so MediaMTX deletes the file instead of retrying forever.
   */
  async ingestSegment(input: { path: string; duration?: string; filename: string; filePath: string }): Promise<{ stored: boolean; id?: string; reason?: string }> {
    const key = parseLivePath(input.path);
    if (!key) throw badRequest('That path is not a live path.');
    const filename = input.filename.trim();
    if (!isSegmentFilename(filename)) throw badRequest('That segment filename does not look like one of ours.');
    const startedAt = parseSegmentFilename(filename);
    if (!startedAt) throw badRequest('That segment filename has an impossible date.');

    const [current] = await this.db.select({ k: eventStreams.streamKey }).from(eventStreams).where(eq(eventStreams.streamKey, key)).limit(1);
    const known = current
      ? true
      : (await this.db.select({ k: streamSessions.streamKey }).from(streamSessions).where(eq(streamSessions.streamKey, key)).limit(1)).length > 0;
    if (!known) {
      this.logger.warn(`Dropped segment ${filename} for unknown key ${key.slice(0, 6)}...`);
      return { stored: false, reason: 'unknown stream key' };
    }

    const { size } = await stat(input.filePath);
    let durationSec = parseDurationSec(input.duration);
    if (durationSec === null) {
      try {
        durationSec = (await probe(input.filePath)).durationSec;
      } catch (err) {
        this.logger.warn(`ffprobe failed on segment ${filename}: ${(err as Error).message}`);
      }
    }
    const s3Key = `recordings/raw/${key}/${filename}`;
    await this.storage.putFile(s3Key, input.filePath, { contentType: 'video/mp4', cacheControl: 'private, no-store' });
    const [row] = await this.db
      .insert(recordingSegments)
      .values({ streamKey: key, s3Key, filename, startedAt, durationSec, sizeBytes: size })
      .onConflictDoUpdate({
        target: [recordingSegments.streamKey, recordingSegments.filename],
        set: { s3Key, durationSec, sizeBytes: size },
      })
      .returning({ id: recordingSegments.id });
    this.logger.debug(`Stored segment ${key.slice(0, 6)}.../${filename} (${Math.round(size / 1024)} KB, ${durationSec ?? '?'}s)`);
    return { stored: true, id: row?.id };
  }

  /* -------------------------------------------------------------------------------- views */

  private async loadAssets(ids: Array<string | null | undefined>): Promise<Map<string, AssetRow>> {
    const list = [...new Set(ids.filter((v): v is string => !!v))];
    if (!list.length) return new Map();
    const rows = await this.db.select().from(assets).where(inArray(assets.id, list));
    return new Map(rows.map((r) => [r.id, r]));
  }

  private url = (key: string, rev?: string | null) => this.config.mediaUrl(key, rev);

  toAdmin(s: SessionRow, asset: AssetRow | null | undefined): StreamSessionAdmin {
    return {
      id: s.id,
      title: s.title,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt ? s.endedAt.toISOString() : null,
      recordingStatus: s.recordingStatus,
      visibility: s.visibility,
      isPrimary: s.isPrimary,
      peakViewers: s.peakViewers,
      error: s.error,
      video: toVideoRef(asset ?? null, this.url),
      durationSec: asset?.durationSec ?? null,
      sizeBytes: asset ? Number(asset.sizeBytes) || 0 : null,
    };
  }

  async find(id: string): Promise<SessionRow | null> {
    const [row] = await this.db.select().from(streamSessions).where(eq(streamSessions.id, id)).limit(1);
    return row ?? null;
  }

  async get(id: string): Promise<SessionRow> {
    const row = await this.find(id);
    if (!row) throw notFound("We couldn't find that recording.");
    return row;
  }

  async adminView(s: SessionRow): Promise<StreamSessionAdmin> {
    const map = await this.loadAssets([s.recordingAssetId]);
    return this.toAdmin(s, s.recordingAssetId ? map.get(s.recordingAssetId) : null);
  }

  /** GET /admin/events/:id/recordings (newest first). */
  async list(eventId: string): Promise<StreamSessionAdmin[]> {
    const rows = await this.db.select().from(streamSessions).where(eq(streamSessions.eventId, eventId)).orderBy(desc(streamSessions.startedAt));
    const map = await this.loadAssets(rows.map((r) => r.recordingAssetId));
    return rows.map((r) => this.toAdmin(r, r.recordingAssetId ? map.get(r.recordingAssetId) : null));
  }

  /** Push a session's current admin view on the event's stream channel. */
  async publishSession(sessionId: string): Promise<void> {
    try {
      const s = await this.find(sessionId);
      if (!s) return;
      const session = await this.adminView(s);
      this.realtime.publish(channels.stream(s.eventId), { type: 'recording', session } satisfies StreamAdminEvent);
    } catch (err) {
      this.logger.warn(`Could not publish session ${sessionId}: ${(err as Error).message}`);
    }
  }

  /**
   * For the events module: public recordings per event (visible, ready, video ready), primary
   * first, with chapters from the rundown (rundown times are WIB on the event's day).
   */
  async publicRecordings(eventIds: string[]): Promise<Map<string, Recording[]>> {
    const ids = [...new Set(eventIds)].filter(Boolean);
    const out = new Map<string, Recording[]>(ids.map((id) => [id, []]));
    if (!ids.length) return out;
    const sessions = await this.db
      .select()
      .from(streamSessions)
      .where(
        and(
          inArray(streamSessions.eventId, ids),
          eq(streamSessions.visibility, 'public'),
          eq(streamSessions.recordingStatus, 'ready'),
          isNotNull(streamSessions.recordingAssetId),
        ),
      )
      .orderBy(desc(streamSessions.isPrimary), asc(streamSessions.startedAt));
    if (!sessions.length) return out;
    const evIds = [...new Set(sessions.map((s) => s.eventId))];
    const [assetMap, evRows, rundown] = await Promise.all([
      this.loadAssets(sessions.map((s) => s.recordingAssetId)),
      this.db.select({ id: events.id, startsAt: events.startsAt }).from(events).where(inArray(events.id, evIds)),
      this.db
        .select({ eventId: rundownItems.eventId, time: rundownItems.time, agenda: rundownItems.agenda })
        .from(rundownItems)
        .where(inArray(rundownItems.eventId, evIds))
        .orderBy(asc(rundownItems.sortOrder), asc(rundownItems.time)),
    ]);
    const startsAt = new Map(evRows.map((e) => [e.id, e.startsAt]));
    for (const s of sessions) {
      const video = toVideoRef(assetMap.get(s.recordingAssetId!) ?? null, this.url);
      if (!video) continue;
      const items = rundown.filter((r) => r.eventId === s.eventId);
      out.get(s.eventId)!.push({
        id: s.id,
        title: s.title,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        isPrimary: s.isPrimary,
        video,
        chapters: chaptersFor(items, startsAt.get(s.eventId) ?? s.startedAt, s.startedAt, video.durationSec),
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------------ admin actions */

  /** PATCH /admin/recordings/:id { title?, visibility?, isPrimary? } (one primary per event). */
  async update(
    s: SessionRow,
    input: { title?: string | null; visibility?: 'public' | 'hidden'; isPrimary?: boolean },
    principal: Principal,
    ip: string | null,
  ): Promise<StreamSessionAdmin> {
    const patch: Partial<Pick<SessionRow, 'title' | 'visibility' | 'isPrimary'>> = {};
    if (input.title !== undefined) patch.title = input.title?.trim() ? input.title.trim() : null;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.isPrimary !== undefined) patch.isPrimary = input.isPrimary;
    if (!Object.keys(patch).length) return this.adminView(s);
    const updated = await this.db.transaction(async (tx) => {
      if (input.isPrimary === true) {
        await tx
          .update(streamSessions)
          .set({ isPrimary: false })
          .where(and(eq(streamSessions.eventId, s.eventId), ne(streamSessions.id, s.id), eq(streamSessions.isPrimary, true)));
      }
      const [row] = await tx.update(streamSessions).set(patch).where(eq(streamSessions.id, s.id)).returning();
      return row!;
    });
    await this.audit.log({
      principal,
      action: 'recording.update',
      resourceType: 'event',
      resourceId: s.eventId,
      summary: `Updated a recording${updated.title ? ` ("${updated.title}")` : ''}`,
      meta: { sessionId: s.id, ...patch },
      ip,
    });
    void this.revalidate.revalidate([tags.events, tags.event(s.eventId)]);
    void this.publishSession(s.id);
    return this.adminView(updated);
  }

  /** DELETE /admin/recordings/:id: the session, its video asset, and raw segments only it needed. */
  async remove(s: SessionRow, principal: Principal, ip: string | null): Promise<void> {
    if (s.recordingStatus === 'recording') throw new AppError(409, 'still_recording', "This one is still recording. End the stream first.");
    if (s.recordingStatus === 'processing' || this.running.has(s.id)) {
      throw new AppError(409, 'processing', "We're stitching this one right now. Try again in a minute.");
    }
    await this.db.delete(streamSessions).where(eq(streamSessions.id, s.id));
    if (s.recordingAssetId) await this.deleteAsset(s.recordingAssetId);
    await this.deleteUnneededSegments(await this.segmentsFor(s), s.streamKey);
    if (s.isPrimary) await this.promotePrimary(s.eventId);
    await this.audit.log({
      principal,
      action: 'recording.delete',
      resourceType: 'event',
      resourceId: s.eventId,
      summary: `Deleted a recording${s.title ? ` ("${s.title}")` : ''}`,
      meta: { sessionId: s.id, assetId: s.recordingAssetId },
      ip,
    });
    this.realtime.publish(channels.stream(s.eventId), { type: 'recording-removed', sessionId: s.id } satisfies StreamAdminEvent);
    void this.revalidate.revalidate([tags.events, tags.event(s.eventId)]);
  }

  /** POST /admin/recordings/:id/reprocess */
  async reprocess(s: SessionRow, principal: Principal, ip: string | null): Promise<StreamSessionAdmin> {
    if (s.recordingStatus === 'recording') throw new AppError(409, 'still_recording', "This one is still recording. End the stream first.");
    if (s.recordingStatus === 'waiting') throw new AppError(409, 'waiting', 'Still collecting the last bits. Give it a minute.');
    if (s.recordingStatus === 'processing' || this.running.has(s.id)) {
      throw new AppError(409, 'processing', "We're already on it. Hang tight.");
    }
    const hasSegments = (await this.segmentsFor(s)).length > 0;
    if (!hasSegments && !s.recordingAssetId) {
      throw unprocessable("There's nothing left to rebuild this one from. Upload the video and attach it instead.");
    }
    const [row] = await this.db
      .update(streamSessions)
      .set({ recordingStatus: 'waiting', error: null })
      .where(and(eq(streamSessions.id, s.id), inArray(streamSessions.recordingStatus, ['ready', 'failed', 'none'])))
      .returning();
    if (!row) throw conflict('Someone else just changed this recording. Refresh and try again.');
    await this.enqueueFinalize(s.id, { reprocess: true });
    await this.audit.log({
      principal,
      action: 'recording.reprocess',
      resourceType: 'event',
      resourceId: s.eventId,
      summary: hasSegments ? 'Re-stitching a recording from its raw segments' : 'Rebuilding the poster and storyboard of a recording',
      meta: { sessionId: s.id, fromSegments: hasSegments },
      ip,
    });
    void this.publishSession(s.id);
    return this.adminView(row);
  }

  /** POST /admin/events/:id/recordings { assetId, title }: attach an uploaded video as a public recording. */
  async attach(
    event: { id: string; startsAt: Date; endsAt: Date },
    input: { assetId: string; title?: string | null },
    principal: Principal,
    ip: string | null,
  ): Promise<StreamSessionAdmin> {
    const [asset] = await this.db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1);
    if (!asset) throw notFound("We couldn't find that video.");
    if (asset.kind !== 'video') throw unprocessable("That file isn't a video. Upload an MP4, MOV or WebM.");
    if (asset.status === 'failed') throw unprocessable("That video didn't process. Try uploading it again.");
    const [dupe] = await this.db
      .select({ id: streamSessions.id })
      .from(streamSessions)
      .where(and(eq(streamSessions.eventId, event.id), eq(streamSessions.recordingAssetId, asset.id)))
      .limit(1);
    if (dupe) throw conflict('That video is already attached to this event.');
    const row = await this.db.transaction(async (tx) => {
      const [primary] = await tx
        .select({ id: streamSessions.id })
        .from(streamSessions)
        .where(and(eq(streamSessions.eventId, event.id), eq(streamSessions.isPrimary, true)))
        .limit(1);
      const [created] = await tx
        .insert(streamSessions)
        .values({
          eventId: event.id,
          // Never a real MediaMTX path, so raw segments can't match an attached video.
          streamKey: `external:${asset.id}`,
          title: input.title?.trim() || null,
          startedAt: event.startsAt,
          endedAt: event.endsAt,
          recordingStatus: asset.status === 'ready' ? 'ready' : 'processing',
          recordingAssetId: asset.id,
          visibility: 'public',
          isPrimary: !primary,
        })
        .returning();
      return created!;
    });
    await this.audit.log({
      principal,
      action: 'recording.attach',
      resourceType: 'event',
      resourceId: event.id,
      summary: `Attached ${asset.originalFilename} as a recording`,
      meta: { sessionId: row.id, assetId: asset.id },
      ip,
    });
    void this.revalidate.revalidate([tags.events, tags.event(event.id)]);
    void this.publishSession(row.id);
    return this.toAdmin(row, asset);
  }

  /** Attached uploads finish processing on the asset queue: flip their sessions (called by reconcile). */
  async syncAttached(): Promise<void> {
    const rows = await this.db
      .select({ id: streamSessions.id, eventId: streamSessions.eventId, assetId: assets.id, status: assets.status, error: assets.error })
      .from(streamSessions)
      .innerJoin(assets, eq(assets.id, streamSessions.recordingAssetId))
      .where(and(eq(streamSessions.recordingStatus, 'processing'), inArray(assets.status, ['ready', 'failed'])));
    for (const r of rows) {
      if (this.running.has(r.id)) continue;
      const ready = r.status === 'ready';
      const [row] = await this.db
        .update(streamSessions)
        .set({ recordingStatus: ready ? 'ready' : 'failed', error: ready ? null : (r.error ?? "The video didn't process.") })
        .where(and(eq(streamSessions.id, r.id), eq(streamSessions.recordingStatus, 'processing'), eq(streamSessions.recordingAssetId, r.assetId)))
        .returning({ id: streamSessions.id });
      if (!row) continue;
      void this.publishSession(r.id);
      if (ready) void this.revalidate.revalidate([tags.events, tags.event(r.eventId)]);
    }
  }

  /* ---------------------------------------------------------------------------- finalize */

  private async segmentsFor(s: Pick<SessionRow, 'streamKey' | 'startedAt' | 'endedAt'>): Promise<SegmentRow[]> {
    const end = s.endedAt ?? new Date();
    const rows = await this.db
      .select()
      .from(recordingSegments)
      .where(
        and(
          eq(recordingSegments.streamKey, s.streamKey),
          lt(recordingSegments.startedAt, end),
          gte(recordingSegments.startedAt, new Date(s.startedAt.getTime() - LOOKBEHIND_MS)),
        ),
      )
      .orderBy(asc(recordingSegments.startedAt));
    return rows.filter((seg) => overlaps(seg, { startedAt: s.startedAt, endedAt: end }));
  }

  /** Has everything up to `endedAt` arrived, or is it clear nothing more is coming? */
  private async segmentsReady(s: SessionRow, endedAt: Date): Promise<{ ready: boolean; why: string }> {
    const segs = await this.segmentsFor({ ...s, endedAt });
    if (segmentsCover(segs.map(spanOf), endedAt)) return { ready: true, why: 'covered' };
    const [stream] = await this.db
      .select({ streamKey: eventStreams.streamKey, ingestOnline: eventStreams.ingestOnline })
      .from(eventStreams)
      .where(eq(eventStreams.eventId, s.eventId))
      .limit(1);
    const keyOnline = !!stream && stream.streamKey === s.streamKey && stream.ingestOnline;
    if (keyOnline) return { ready: false, why: 'ingest still online, waiting for the segment that covers the end' };
    const [last] = await this.db
      .select({ at: sql<Date>`max(${recordingSegments.createdAt})` })
      .from(recordingSegments)
      .where(eq(recordingSegments.streamKey, s.streamKey));
    const lastArrival = last?.at ? new Date(last.at).getTime() : 0;
    const quietSince = Math.max(lastArrival, endedAt.getTime(), this.offlineAtOf(s.streamKey) ?? 0);
    if (Date.now() - quietSince >= QUIET_MS) return { ready: true, why: 'ingest offline and quiet' };
    return { ready: false, why: 'ingest offline, giving the last segment time to arrive' };
  }

  /** Job handler for `recording.finalize`. */
  async finalize(data: FinalizeJob, signal?: AbortSignal): Promise<void> {
    const s = await this.find(data.sessionId);
    if (!s || this.running.has(s.id)) return;
    if (s.recordingStatus !== 'waiting' && s.recordingStatus !== 'processing') return;
    const endedAt = s.endedAt ?? new Date();

    if (s.recordingStatus === 'waiting' && !data.reprocess) {
      const check = await this.segmentsReady(s, endedAt);
      if (!check.ready) {
        if (Date.now() - endedAt.getTime() < MAX_WAIT_MS) {
          const attempt = (data.attempt ?? 0) + 1;
          await this.enqueueFinalize(s.id, { delaySec: finalizeBackoffSec(attempt), attempt });
          this.logger.debug(`Session ${s.id}: ${check.why}; checking again (attempt ${attempt})`);
          return;
        }
        this.logger.warn(`Session ${s.id}: waited ${Math.round((Date.now() - endedAt.getTime()) / 1000)}s (${check.why}); stitching what we have`);
      }
    }

    const [claimed] = await this.db
      .update(streamSessions)
      .set({ recordingStatus: 'processing', error: null })
      .where(and(eq(streamSessions.id, s.id), inArray(streamSessions.recordingStatus, ['waiting', 'processing'])))
      .returning();
    if (!claimed) return;
    this.running.add(s.id);
    void this.publishSession(s.id);
    const started = Date.now();
    try {
      const segs = await this.segmentsFor({ ...claimed, endedAt });
      if (!segs.length) {
        if (data.reprocess && claimed.recordingAssetId) await this.refreshPosters(claimed, signal);
        else await this.markNone(claimed);
        return;
      }
      await this.stitch(claimed, endedAt, segs, signal);
      this.logger.log(`Recording for session ${s.id} ready in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      if (signal?.aborted) throw err; // shutdown or expiry: pg-boss retries, status stays processing
      this.logger.error(`Finalize ${s.id} failed: ${(err as Error).message}`, (err as Error).stack);
      await this.db
        .update(streamSessions)
        .set({ recordingStatus: 'failed', error: friendlyError(err) })
        .where(eq(streamSessions.id, s.id));
      await this.audit.log({
        principal: 'system',
        action: 'recording.failed',
        resourceType: 'event',
        resourceId: s.eventId,
        summary: 'A recording failed to stitch',
        meta: { sessionId: s.id, error: (err as Error).message.slice(0, 500) },
      });
    } finally {
      this.running.delete(s.id);
      void this.publishSession(s.id);
    }
  }

  private async markNone(s: SessionRow): Promise<void> {
    await this.db.update(streamSessions).set({ recordingStatus: 'none', error: null }).where(eq(streamSessions.id, s.id));
    this.logger.warn(`Session ${s.id} has no recording segments`);
    await this.audit.log({
      principal: 'system',
      action: 'recording.none',
      resourceType: 'event',
      resourceId: s.eventId,
      summary: 'A stream ended without any recorded video',
      meta: { sessionId: s.id },
    });
  }

  /** Cut the edge segments, concat everything (stream copy), upload as a ready video asset. */
  private async stitch(s: SessionRow, endedAt: Date, segs: SegmentRow[], signal?: AbortSignal): Promise<void> {
    const plans = planCuts(segs.map(spanOf), s.startedAt, endedAt);
    if (!plans.length) return this.markNone(s);
    const [event] = await this.db.select({ slug: events.slug, number: events.number }).from(events).where(eq(events.id, s.eventId)).limit(1);

    await withTmpDir(`rec-${s.id.slice(0, 8)}`, async (dir) => {
      const pieces: string[] = [];
      for (const [i, plan] of plans.entries()) {
        const raw = join(dir, `seg-${String(i).padStart(4, '0')}.mp4`);
        await this.storage.downloadToFile(plan.segment.row.s3Key, raw);
        if (plan.from > 0 || plan.to !== null) {
          const cut = join(dir, `cut-${String(i).padStart(4, '0')}.mp4`);
          await trimCopy(raw, plan.from, plan.to ?? plan.segment.durationSec + 5, cut, { signal });
          await rm(raw, { force: true });
          pieces.push(cut);
        } else {
          pieces.push(raw);
        }
      }
      const out = join(dir, 'recording.mp4');
      await concatCopy(pieces, out, { signal });
      await Promise.all(pieces.map((p) => rm(p, { force: true })));

      const info = await probe(out, { signal });
      if (!info.video) throw new Error('No video stream in the stitched recording');
      const duration = info.durationSec ?? 0;
      const assetId = randomUUID();
      const base = `assets/${assetId}`;
      const variants: AssetVariants = { rev: Date.now().toString(36), mp4: `${base}/video.mp4` };
      await this.storage.putFile(`${base}/video.mp4`, out, { contentType: 'video/mp4' });
      const posterPath = join(dir, 'poster.webp');
      await poster(out, posterPath, { atSec: posterTime(duration), signal });
      await this.storage.putFile(`${base}/poster.webp`, posterPath, { contentType: 'image/webp' });
      variants.poster = `${base}/poster.webp`;
      if (duration > 0) {
        const sbPath = join(dir, 'storyboard.webp');
        const sb = await storyboard(out, sbPath, { durationSec: duration, signal });
        await this.storage.putFile(`${base}/storyboard.webp`, sbPath, { contentType: 'image/webp' });
        variants.storyboard = { key: `${base}/storyboard.webp`, ...sb };
      }
      const { size } = await stat(out);
      const day = jakartaDateInput(s.startedAt);
      const label = event?.number ? `zemi-${event.number}` : (event?.slug ?? 'zemi');
      await this.db.insert(assets).values({
        id: assetId,
        kind: 'video',
        purpose: 'recording',
        status: 'ready',
        originalFilename: `${label}-${day}-recording.mp4`,
        mime: 'video/mp4',
        sizeBytes: size,
        originalKey: `${base}/video.mp4`,
        variants,
        width: info.video.width,
        height: info.video.height,
        durationSec: duration || null,
        createdBy: 'system',
      });

      const attached = await this.db.transaction(async (tx) => {
        const [cur] = await tx.select().from(streamSessions).where(eq(streamSessions.id, s.id)).for('update');
        if (!cur) return null;
        const [primary] = await tx
          .select({ id: streamSessions.id })
          .from(streamSessions)
          .where(and(eq(streamSessions.eventId, s.eventId), eq(streamSessions.isPrimary, true), ne(streamSessions.id, s.id)))
          .limit(1);
        await tx
          .update(streamSessions)
          .set({ recordingStatus: 'ready', recordingAssetId: assetId, error: null, isPrimary: cur.isPrimary || !primary })
          .where(eq(streamSessions.id, s.id));
        return { oldAssetId: cur.recordingAssetId };
      });
      if (!attached) {
        // Deleted while we worked: don't leave an orphan video behind.
        await this.deleteAsset(assetId);
        return;
      }
      if (attached.oldAssetId && attached.oldAssetId !== assetId) await this.deleteAsset(attached.oldAssetId);
      await this.deleteUnneededSegments(plans.map((p) => p.segment.row), s.streamKey, s.id);
      await this.audit.log({
        principal: 'system',
        action: 'recording.ready',
        resourceType: 'event',
        resourceId: s.eventId,
        summary: `Recording ready (${Math.round(duration / 60)} min)`,
        meta: { sessionId: s.id, assetId, durationSec: duration, sizeBytes: size, segments: plans.length },
      });
      void this.revalidate.revalidate([tags.events, tags.event(s.eventId)]);
    });
  }

  /** Reprocess without raw segments: rebuild poster + storyboard + duration from the stored video. */
  private async refreshPosters(s: SessionRow, signal?: AbortSignal): Promise<void> {
    const [asset] = await this.db.select().from(assets).where(eq(assets.id, s.recordingAssetId!)).limit(1);
    if (!asset) return this.markNone(s);
    const key = asset.variants?.mp4 ?? asset.originalKey;
    await withTmpDir(`rec-${s.id.slice(0, 8)}`, async (dir) => {
      const src = join(dir, 'video.mp4');
      await this.storage.downloadToFile(key, src);
      const info = await probe(src, { signal });
      if (!info.video) throw new Error('No video stream in the stored recording');
      const duration = info.durationSec ?? 0;
      const base = `assets/${asset.id}`;
      const variants: AssetVariants = { ...asset.variants, rev: Date.now().toString(36) };
      const posterPath = join(dir, 'poster.webp');
      await poster(src, posterPath, { atSec: posterTime(duration), signal });
      await this.storage.putFile(`${base}/poster.webp`, posterPath, { contentType: 'image/webp' });
      variants.poster = `${base}/poster.webp`;
      if (duration > 0) {
        const sbPath = join(dir, 'storyboard.webp');
        const sb = await storyboard(src, sbPath, { durationSec: duration, signal });
        await this.storage.putFile(`${base}/storyboard.webp`, sbPath, { contentType: 'image/webp' });
        variants.storyboard = { key: `${base}/storyboard.webp`, ...sb };
      }
      await this.db
        .update(assets)
        .set({ status: 'ready', error: null, variants, width: info.video.width, height: info.video.height, durationSec: duration || null })
        .where(eq(assets.id, asset.id));
    });
    await this.db.update(streamSessions).set({ recordingStatus: 'ready', error: null }).where(eq(streamSessions.id, s.id));
    void this.revalidate.revalidate([tags.events, tags.event(s.eventId)]);
  }

  /* ----------------------------------------------------------------------------- cleanup */

  private async deleteAsset(assetId: string): Promise<void> {
    try {
      await this.db.delete(assets).where(eq(assets.id, assetId));
      await this.storage.deletePrefix(`assets/${assetId}/`);
    } catch (err) {
      this.logger.error(`Could not delete asset ${assetId}: ${(err as Error).message}`);
    }
  }

  /** Delete raw segments unless another unfinished session of the same key still needs them. */
  private async deleteUnneededSegments(segs: SegmentRow[], streamKey: string, exceptSessionId?: string): Promise<number> {
    if (!segs.length) return 0;
    const others = await this.db
      .select({ id: streamSessions.id, startedAt: streamSessions.startedAt, endedAt: streamSessions.endedAt })
      .from(streamSessions)
      .where(and(eq(streamSessions.streamKey, streamKey), inArray(streamSessions.recordingStatus, NEEDS_SEGMENTS)));
    const keepers = others.filter((o) => o.id !== exceptSessionId);
    const doomed = segs.filter((seg) => !keepers.some((o) => overlaps(seg, o)));
    return this.deleteSegmentRows(doomed);
  }

  private async deleteSegmentRows(rows: SegmentRow[]): Promise<number> {
    if (!rows.length) return 0;
    try {
      await this.storage.deleteKeys(rows.map((r) => r.s3Key));
      await this.db.delete(recordingSegments).where(inArray(recordingSegments.id, rows.map((r) => r.id)));
    } catch (err) {
      this.logger.error(`Could not delete ${rows.length} raw segments: ${(err as Error).message}`);
      return 0;
    }
    return rows.length;
  }

  /** Hourly: raw segments no unfinished session needs (preview before Go live, strays), and anything very old. */
  async cleanupSegments(now = Date.now()): Promise<number> {
    const candidates = await this.db
      .select()
      .from(recordingSegments)
      .where(lt(recordingSegments.createdAt, new Date(now - ORPHAN_AFTER_MS)))
      .orderBy(asc(recordingSegments.createdAt))
      .limit(5000);
    if (!candidates.length) return 0;
    const keys = [...new Set(candidates.map((c) => c.streamKey))];
    const sessions = await this.db
      .select({ streamKey: streamSessions.streamKey, startedAt: streamSessions.startedAt, endedAt: streamSessions.endedAt, status: streamSessions.recordingStatus })
      .from(streamSessions)
      .where(and(inArray(streamSessions.streamKey, keys), inArray(streamSessions.recordingStatus, NEEDS_SEGMENTS)));
    const doomed = candidates.filter((seg) => {
      if (now - seg.createdAt.getTime() > FAILED_KEEP_MS) return true;
      return !sessions.some((s) => s.streamKey === seg.streamKey && overlaps(seg, s));
    });
    const n = await this.deleteSegmentRows(doomed);
    if (n) this.logger.log(`Cleaned up ${n} raw recording segments nobody needs`);
    return n;
  }

  /** After deleting the primary recording, the next public ready one takes over. */
  private async promotePrimary(eventId: string): Promise<void> {
    const [next] = await this.db
      .select({ id: streamSessions.id })
      .from(streamSessions)
      .where(and(eq(streamSessions.eventId, eventId), eq(streamSessions.recordingStatus, 'ready'), eq(streamSessions.visibility, 'public')))
      .orderBy(asc(streamSessions.startedAt))
      .limit(1);
    if (next) {
      await this.db.update(streamSessions).set({ isPrimary: true }).where(eq(streamSessions.id, next.id));
      void this.publishSession(next.id);
    }
  }
}

/** Rundown times ('HH:mm' WIB on the event's day) as offsets into a recording. */
export function chaptersFor(
  items: Array<{ time: string; agenda: string }>,
  eventStartsAt: Date,
  recordingStartedAt: Date,
  durationSec: number | null,
): RecordingChapter[] {
  const day = jakartaDateInput(eventStartsAt);
  const seen = new Set<number>();
  const out: RecordingChapter[] = [];
  for (const item of items) {
    if (!/^\d{2}:\d{2}$/.test(item.time) || !item.agenda.trim()) continue;
    const at = fromJakartaInput(day, item.time).getTime();
    if (!Number.isFinite(at)) continue;
    let startSec = Math.round((at - recordingStartedAt.getTime()) / 1000);
    // Something scheduled a little before the recording started opens it.
    if (startSec < 0 && startSec > -15 * 60) startSec = 0;
    if (startSec < 0 || (durationSec !== null && startSec >= durationSec) || seen.has(startSec)) continue;
    seen.add(startSec);
    out.push({ title: item.agenda.trim(), startSec });
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}
