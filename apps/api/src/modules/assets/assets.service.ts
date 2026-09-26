import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  PURPOSE_ASPECT,
  type Ability,
  type Adjust,
  type Asset,
  type AssetKind,
  type AssetPurpose,
  type Crop,
  type Paginated,
  type Principal,
} from '@zemi/shared';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { toAssetDto, type AssetRow } from '../../common/asset-refs.js';
import { forbidden, notFound, payloadTooLarge, unprocessable, unsupportedMedia } from '../../common/errors.js';
import { FfmpegError, poster, posterTime, probe, storyboard, transcodeMp4, transcodeWebm } from '../../common/ffmpeg.js';
import { acceptedLabel, EXT_BY_MIME, kindOfMime, PURPOSE_KINDS, sniffFile, type SniffResult } from '../../common/mime.js';
import { dispositionFor } from '../media-serve/media-stream.js';
import { pageToLimitOffset, paginated, searchPattern } from '../../common/pagination.js';
import { withTmpDir } from '../../common/tmp.js';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db } from '../../db/client.js';
import { assets, type AssetVariants } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { JobsService, type JobContext } from '../jobs/jobs.service.js';
import { RevalidateService } from '../revalidate/revalidate.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ImageDecodeError, runImagePipeline } from './image-pipeline.js';

/** Photos, PDFs and audio: quick jobs. */
export const ASSET_QUEUE = 'asset.process';
/** Video transcodes: slow jobs on their own queue so they never hold up photos. */
export const ASSET_VIDEO_QUEUE = 'asset.process-video';

export type VideoMode = 'transcode' | 'as-is';

export interface AssetJobData {
  assetId: string;
  /** 'as-is': the original is already a faststart H.264 MP4 (livestream recordings); only poster + storyboard. */
  videoMode?: VideoMode;
}

export interface IngestFileInput {
  /** Local file to store. The caller keeps ownership (it is not deleted). */
  filePath: string;
  filename: string;
  purpose: AssetPurpose;
  /** Detected from the file when omitted. */
  mime?: string;
  createdBy?: string | null;
  crop?: Crop | null;
  adjust?: Adjust | null;
  alt?: string | null;
  caption?: string | null;
  credit?: string | null;
  /** For videos. Default 'transcode'. */
  videoMode?: VideoMode;
  /** Refuse (413) files over these sizes, by detected kind, before anything is stored. Uploads pass UPLOAD_KIND_MAX_BYTES. */
  maxBytesByKind?: Partial<Record<AssetKind, number>>;
}

const KIND_NOUN: Record<AssetKind, string> = { image: 'photo', video: 'video', document: 'file', audio: 'audio file' };
const megabytes = (n: number) => `${Math.round(n / 1024 ** 2)} MB`;

/** Who is looking, for `Asset.canEdit`. */
export interface AssetViewer {
  ability: Ability;
  principal: Principal;
}

/** Purposes a `site.edit` holder may edit, re-crop and delete (site page media and team photos). */
export const SITE_EDIT_PURPOSES: readonly AssetPurpose[] = ['site', 'team-avatar'];

export interface AssetListQuery {
  purpose?: AssetPurpose;
  kind?: AssetKind;
  status?: 'processing' | 'ready' | 'failed';
  search?: string;
  createdBy?: string;
  page: number;
  pageSize: number;
}

const UPLOAD_CONCURRENCY = 4;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/** Key-order independent JSON, for comparing jsonb values. */
function stableJson(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

const sanitizeFilename = (name: string) =>
  (name || 'upload')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .trim()
    .slice(0, 200) || 'upload';

function allKeys(v: AssetVariants | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!v) return out;
  for (const k of Object.values(v.avif ?? {})) out.add(k);
  for (const k of Object.values(v.webp ?? {})) out.add(k);
  for (const k of [v.mp4, v.webm, v.hls, v.poster, v.storyboard?.key]) if (k) out.add(k);
  return out;
}

/** Pure rule behind `AssetsService.canMutate` (exported for specs). */
export function canMutateAsset(ability: Ability, principal: Principal, row: Pick<AssetRow, 'createdBy' | 'purpose'>): boolean {
  if (ability.isSuperadmin || ability.has('media.library')) return true;
  if (row.createdBy && row.createdBy === principal.id) return true;
  return ability.has('site.edit') && SITE_EDIT_PURPOSES.includes(row.purpose as AssetPurpose);
}

/** Friendly, user-facing reason for a processing failure. */
export function failureMessage(err: unknown, kind: AssetKind): string {
  if (err instanceof ImageDecodeError) return err.message;
  if (err instanceof FfmpegError) {
    return kind === 'video'
      ? "We couldn't process that video. Try exporting it as MP4 (H.264) and upload again."
      : "We couldn't read that file. Try exporting it again and re-uploading.";
  }
  const msg = (err as Error)?.message ?? '';
  if (/Input file|unsupported image format|corrupt|premature end/i.test(msg)) {
    return "We couldn't read that image. Try exporting it as JPEG or PNG.";
  }
  return 'Processing failed on our side. Try uploading it again.';
}

/**
 * Uploaded media (SPEC section 8). Uploads are stored as-is at `assets/<id>/original.<ext>`, a row
 * is inserted with status `processing`, and a job produces the public variants:
 * - image: AVIF + WebP ladder `assets/<id>/w<width>.<fmt>`, lqip, dominant color
 * - video: `video.mp4` (H.264) + `video.webm` (VP9) + `poster.webp` + `storyboard.webp`
 * - document/audio: served as-is (PDF page count when cheap)
 * Re-processing (recrop) overwrites keys in place and bumps `variants.rev`, which is appended to URLs
 * as `?v=` so the immutable cache never serves a stale crop.
 */
@Injectable()
export class AssetsService implements OnModuleInit {
  private readonly logger = new Logger('Assets');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: AppConfig,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
  ) {}

  onModuleInit(): void {
    const handler = (job: JobContext<AssetJobData>) => this.process(job.data, job.signal);
    this.jobs.register<AssetJobData>(ASSET_QUEUE, handler, {
      concurrency: 2,
      expireInSeconds: 30 * 60,
      retryLimit: 1,
      retryDelay: 30,
      policy: 'singleton',
    });
    this.jobs.register<AssetJobData>(ASSET_VIDEO_QUEUE, handler, {
      concurrency: 1,
      expireInSeconds: 8 * 3600,
      retryLimit: 1,
      retryDelay: 60,
      policy: 'singleton',
    });
  }

  /** The admin `Asset`. Pass the viewer to fill `canEdit` (may they edit, re-crop or delete it). */
  dto(row: AssetRow, viewer?: AssetViewer): Asset {
    const dto = toAssetDto(row, (key, rev) => this.config.mediaUrl(key, rev));
    return viewer ? { ...dto, canEdit: this.canMutate(viewer.ability, viewer.principal, row) } : dto;
  }

  /* ------------------------------------------------------------------------------ create */

  /** Detect the file type and check it fits the purpose. Throws 415 with friendly copy. */
  async detect(filePath: string, purpose: AssetPurpose, claimedMime?: string): Promise<SniffResult> {
    const sniffed = await sniffFile(filePath);
    const allowed = PURPOSE_KINDS[purpose];
    if (!sniffed || !allowed.includes(sniffed.kind)) {
      throw unsupportedMedia(`That file won't work here. We need ${acceptedLabel(purpose)}.`, {
        details: { purpose, detected: sniffed?.mime ?? claimedMime ?? null, accepted: allowed },
      });
    }
    return sniffed;
  }

  /**
   * Store a local file as a new asset and queue its processing. Used by the upload endpoint and by
   * other modules (recordings, imports). Returns the row immediately with status `processing`.
   */
  async ingestFile(input: IngestFileInput): Promise<AssetRow> {
    // Trust a caller-provided mime only when it is one we know and it fits the purpose.
    let mime = input.mime;
    let kind = mime ? kindOfMime(mime) : null;
    if (!mime || !kind || !EXT_BY_MIME[mime] || !PURPOSE_KINDS[input.purpose].includes(kind)) {
      const detected = await this.detect(input.filePath, input.purpose, input.mime);
      mime = detected.mime;
      kind = detected.kind;
    }
    const ext = EXT_BY_MIME[mime];
    const id = randomUUID();
    const asIs = kind === 'video' && input.videoMode === 'as-is';
    // As-is videos ARE the public file, so they must not use the private `original.*` name.
    const originalKey = asIs ? `assets/${id}/video.mp4` : `assets/${id}/original.${ext}`;
    const filename = sanitizeFilename(input.filename);
    const { size } = await stat(input.filePath);
    const cap = input.maxBytesByKind?.[kind];
    if (cap != null && size > cap) {
      throw payloadTooLarge(`That ${KIND_NOUN[kind]} is ${megabytes(size)}. Keep it under ${megabytes(cap)}.`, {
        details: { kind, sizeBytes: size, maxBytes: cap },
      });
    }

    await this.storage.putFile(originalKey, input.filePath, {
      contentType: mime,
      contentDisposition: kind === 'document' || kind === 'audio' ? dispositionFor(filename) : undefined,
    });

    const [row] = await this.db
      .insert(assets)
      .values({
        id,
        kind,
        purpose: input.purpose,
        status: 'processing',
        originalFilename: filename,
        mime,
        sizeBytes: size,
        originalKey,
        variants: {},
        crop: kind === 'image' ? (input.crop ?? null) : null,
        adjust: kind === 'image' ? (input.adjust ?? null) : null,
        alt: input.alt ?? null,
        caption: input.caption ?? null,
        credit: input.credit ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    try {
      await this.enqueue(row, input.videoMode);
    } catch (err) {
      // Don't leave a row stuck in `processing` (or orphaned files) when the queue is unavailable.
      await this.db.delete(assets).where(eq(assets.id, id));
      await this.storage.deletePrefix(`assets/${id}/`).catch(() => undefined);
      throw err;
    }
    return row;
  }

  private async enqueue(row: AssetRow, videoMode?: VideoMode): Promise<void> {
    const queue = row.kind === 'video' ? ASSET_VIDEO_QUEUE : ASSET_QUEUE;
    const mode = videoMode ?? (row.kind === 'video' && !/\/original\.[a-z0-9]+$/.test(row.originalKey) ? 'as-is' : 'transcode');
    await this.jobs.send<AssetJobData>(queue, { assetId: row.id, videoMode: mode }, { singletonKey: row.id });
  }

  /* ------------------------------------------------------------------------------- read */

  async find(id: string): Promise<AssetRow | null> {
    const [row] = await this.db.select().from(assets).where(eq(assets.id, id)).limit(1);
    return row ?? null;
  }

  async get(id: string): Promise<AssetRow> {
    const row = await this.find(id);
    if (!row) throw notFound("We couldn't find that file.");
    return row;
  }

  async list(q: AssetListQuery, viewer?: AssetViewer): Promise<Paginated<Asset>> {
    const where: SQL[] = [];
    if (q.purpose) where.push(eq(assets.purpose, q.purpose));
    if (q.kind) where.push(eq(assets.kind, q.kind));
    if (q.status) where.push(eq(assets.status, q.status));
    if (q.createdBy) where.push(eq(assets.createdBy, q.createdBy));
    const pattern = searchPattern(q.search);
    if (pattern) {
      where.push(
        or(ilike(assets.originalFilename, pattern), ilike(assets.alt, pattern), ilike(assets.caption, pattern), ilike(assets.credit, pattern))!,
      );
    }
    const cond = where.length ? and(...where) : undefined;
    const { limit, offset } = pageToLimitOffset(q);
    const [rows, [total]] = await Promise.all([
      this.db.select().from(assets).where(cond).orderBy(desc(assets.createdAt)).limit(limit).offset(offset),
      this.db.select({ n: count() }).from(assets).where(cond),
    ]);
    return paginated(
      rows.map((r) => this.dto(r, viewer)),
      total?.n ?? 0,
      q,
    );
  }

  /**
   * Who may change, re-crop, delete (or fetch the private original of) an asset: the superadmin, media
   * librarians, the uploader, and site editors (`site.edit`) for site page media and team photos.
   */
  canMutate(ability: Ability, principal: Principal, row: Pick<AssetRow, 'createdBy' | 'purpose'>): boolean {
    return canMutateAsset(ability, principal, row);
  }

  assertCanMutate(ability: Ability, principal: Principal, row: Pick<AssetRow, 'createdBy' | 'purpose'>): void {
    if (!this.canMutate(ability, principal, row)) {
      throw forbidden('Only the person who uploaded this (or a media librarian) can change it.');
    }
  }

  /* ------------------------------------------------------------------------------ update */

  async updateMeta(
    row: AssetRow,
    patch: { alt?: string | null; caption?: string | null; credit?: string | null },
    ctx: { principal: Principal; ip: string | null },
  ): Promise<AssetRow> {
    const set: Partial<typeof assets.$inferInsert> = {};
    if (patch.alt !== undefined) set.alt = patch.alt?.trim() || null;
    if (patch.caption !== undefined) set.caption = patch.caption?.trim() || null;
    if (patch.credit !== undefined) set.credit = patch.credit?.trim() || null;
    if (!Object.keys(set).length) return row;
    const [updated] = await this.db.update(assets).set(set).where(eq(assets.id, row.id)).returning();
    await this.audit.log({
      principal: ctx.principal,
      action: 'asset.update',
      resourceType: 'asset',
      resourceId: row.id,
      summary: `Updated details of ${row.originalFilename}`,
      meta: { fields: Object.keys(set) },
      ip: ctx.ip,
    });
    void this.revalidate.revalidate(['events', 'speakers', 'publications', 'site']);
    return updated;
  }

  /** Re-run image processing from the original with a new crop/adjust (variants are replaced). */
  async recrop(row: AssetRow, input: { crop: Crop | null; adjust: Adjust | null }, ctx: { principal: Principal; ip: string | null }): Promise<AssetRow> {
    if (row.kind !== 'image') throw unprocessable('Only photos can be cropped.');
    const [updated] = await this.db
      .update(assets)
      .set({ crop: input.crop, adjust: input.adjust, status: 'processing', error: null })
      .where(eq(assets.id, row.id))
      .returning();
    await this.enqueue(updated);
    await this.audit.log({
      principal: ctx.principal,
      action: 'asset.recrop',
      resourceType: 'asset',
      resourceId: row.id,
      summary: `Re-cropped ${row.originalFilename}`,
      meta: { crop: input.crop, adjust: input.adjust },
      ip: ctx.ip,
    });
    return updated;
  }

  /** Delete the row (references are set null / cascade by FKs) and every file under assets/<id>/. */
  async remove(row: AssetRow, ctx: { principal: Principal; ip: string | null }): Promise<void> {
    await this.db.delete(assets).where(eq(assets.id, row.id));
    try {
      await this.storage.deletePrefix(`assets/${row.id}/`);
      if (!row.originalKey.startsWith(`assets/${row.id}/`)) await this.storage.delete(row.originalKey);
    } catch (err) {
      this.logger.error(`Deleted asset ${row.id} but its files remain: ${(err as Error).message}`);
    }
    await this.audit.log({
      principal: ctx.principal,
      action: 'asset.delete',
      resourceType: 'asset',
      resourceId: row.id,
      summary: `Deleted ${row.originalFilename}`,
      meta: { purpose: row.purpose, kind: row.kind, sizeBytes: row.sizeBytes },
      ip: ctx.ip,
    });
    void this.revalidate.revalidate(['events', 'speakers', 'publications', 'site']);
  }

  /* -------------------------------------------------------------------------- processing */

  /** Job handler. Never throws for bad input: the asset ends up `failed` with a friendly message. */
  async process(data: AssetJobData, signal?: AbortSignal): Promise<void> {
    const row = await this.find(data.assetId);
    if (!row) return; // deleted meanwhile
    const started = Date.now();
    try {
      await withTmpDir(`asset-${row.id.slice(0, 8)}`, async (dir) => {
        const ext = row.originalKey.slice(row.originalKey.lastIndexOf('.') + 1) || 'bin';
        const src = join(dir, `source.${ext}`);
        await this.storage.downloadToFile(row.originalKey, src);
        switch (row.kind) {
          case 'image':
            return this.processImage(row, src, dir);
          case 'video':
            return this.processVideo(row, src, dir, data.videoMode ?? 'transcode', signal);
          case 'document':
            return this.processDocument(row, src);
          case 'audio':
            return this.processAudio(row, src, signal);
        }
      });
      this.logger.log(`Processed ${row.kind} ${row.id} (${row.originalFilename}) in ${Date.now() - started}ms`);
      // Pages rendered while this ran (cover attached mid-upload, a documentation video still transcoding,
      // a re-crop) cached the old state. We don't know which pages use the asset, so refresh the content tags.
      void this.revalidate.revalidate(['events', 'speakers', 'publications', 'site']);
    } catch (err) {
      if (signal?.aborted) throw err; // shutdown or expiry: let pg-boss retry
      this.logger.error(`Processing ${row.kind} ${row.id} failed: ${(err as Error).message}`, (err as Error).stack);
      await this.db
        .update(assets)
        .set({ status: 'failed', error: failureMessage(err, row.kind) })
        .where(eq(assets.id, row.id));
    }
  }

  private newRev(): string {
    return Date.now().toString(36);
  }

  private async processImage(row: AssetRow, src: string, dir: string): Promise<void> {
    const outDir = join(dir, 'out');
    await mkdir(outDir, { recursive: true });
    const aspect = PURPOSE_ASPECT[row.purpose as AssetPurpose] ?? null;
    const result = await runImagePipeline(src, outDir, { crop: row.crop, adjust: row.adjust, aspect });

    const avif: Record<string, string> = {};
    const webp: Record<string, string> = {};
    await mapLimit(result.files, UPLOAD_CONCURRENCY, async (f) => {
      const key = `assets/${row.id}/w${f.width}.${f.format}`;
      await this.storage.putFile(key, f.path, { contentType: f.format === 'avif' ? 'image/avif' : 'image/webp' });
      (f.format === 'avif' ? avif : webp)[String(f.width)] = key;
    });
    const variants: AssetVariants = { rev: this.newRev(), avif, webp };

    // The newest crop wins: if someone re-cropped while we worked, the job they queued (which runs
    // after this one, same singleton key) writes the result. Don't clobber their crop or flip to ready.
    const current = await this.find(row.id);
    if (!current) {
      await this.storage.deletePrefix(`assets/${row.id}/`);
      return;
    }
    if (stableJson(current.crop) !== stableJson(row.crop) || stableJson(current.adjust) !== stableJson(row.adjust)) {
      this.logger.debug(`Asset ${row.id} was re-cropped while processing; leaving it to the next job`);
      return;
    }
    await this.db
      .update(assets)
      .set({
        status: 'ready',
        error: null,
        variants,
        width: result.width,
        height: result.height,
        lqip: result.lqip,
        color: result.color,
        crop: result.crop,
      })
      .where(eq(assets.id, row.id));
    await this.deleteStale(current.variants, variants);
  }

  private async processVideo(row: AssetRow, src: string, dir: string, mode: VideoMode, signal?: AbortSignal): Promise<void> {
    const info = await probe(src, { signal });
    if (!info.video) throw new FfmpegError('No video stream', 1, '');
    const variants: AssetVariants = { rev: this.newRev() };
    let master = src;
    let width = info.video.width;
    let height = info.video.height;
    let duration = info.durationSec;

    if (mode === 'transcode') {
      const mp4 = join(dir, 'video.mp4');
      const webm = join(dir, 'video.webm');
      await transcodeMp4(src, mp4, { signal });
      const out = await probe(mp4, { signal });
      width = out.video?.width ?? width;
      height = out.video?.height ?? height;
      duration = out.durationSec ?? duration;
      await this.storage.putFile(`assets/${row.id}/video.mp4`, mp4, { contentType: 'video/mp4' });
      variants.mp4 = `assets/${row.id}/video.mp4`;
      await transcodeWebm(mp4, webm, { signal });
      await this.storage.putFile(`assets/${row.id}/video.webm`, webm, { contentType: 'video/webm' });
      variants.webm = `assets/${row.id}/video.webm`;
      master = mp4;
    } else {
      variants.mp4 = row.originalKey;
    }

    const posterPath = join(dir, 'poster.webp');
    await poster(master, posterPath, { atSec: posterTime(duration), signal });
    await this.storage.putFile(`assets/${row.id}/poster.webp`, posterPath, { contentType: 'image/webp' });
    variants.poster = `assets/${row.id}/poster.webp`;

    if (duration && duration > 0) {
      const sbPath = join(dir, 'storyboard.webp');
      const sb = await storyboard(master, sbPath, { durationSec: duration, signal });
      await this.storage.putFile(`assets/${row.id}/storyboard.webp`, sbPath, { contentType: 'image/webp' });
      variants.storyboard = { key: `assets/${row.id}/storyboard.webp`, ...sb };
    }

    const current = await this.find(row.id);
    if (!current) {
      await this.storage.deletePrefix(`assets/${row.id}/`);
      return;
    }
    await this.db
      .update(assets)
      .set({ status: 'ready', error: null, variants, width, height, durationSec: duration ?? null })
      .where(eq(assets.id, row.id));
    await this.deleteStale(current.variants, variants, row.originalKey);
  }

  private async processDocument(row: AssetRow, src: string): Promise<void> {
    let pages: number | undefined;
    const { size } = await stat(src);
    if (row.mime === 'application/pdf' && size < 40 * 1024 * 1024) {
      const text = (await readFile(src)).toString('latin1');
      const n = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
      if (n > 0) pages = n;
    }
    await this.db
      .update(assets)
      .set({ status: 'ready', error: null, variants: { rev: this.newRev(), ...(pages ? { pages } : {}) } })
      .where(eq(assets.id, row.id));
  }

  private async processAudio(row: AssetRow, src: string, signal?: AbortSignal): Promise<void> {
    const info = await probe(src, { signal });
    await this.db
      .update(assets)
      .set({ status: 'ready', error: null, durationSec: info.durationSec ?? null, variants: { rev: this.newRev() } })
      .where(eq(assets.id, row.id));
  }

  /** Remove files from a previous processing run that the new run did not produce. */
  private async deleteStale(prev: AssetVariants | null | undefined, next: AssetVariants, keep?: string): Promise<void> {
    const nextKeys = allKeys(next);
    const stale = [...allKeys(prev)].filter((k) => !nextKeys.has(k) && k !== keep);
    if (!stale.length) return;
    try {
      await this.storage.deleteKeys(stale);
    } catch (err) {
      this.logger.warn(`Could not delete ${stale.length} stale variants: ${(err as Error).message}`);
    }
  }
}
