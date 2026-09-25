import { Inject, Injectable } from '@nestjs/common';
import type { Asset, FileRef, ImageRef, ImageSource, VideoRef } from '@zemi/shared';
import { inArray } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { DB, type Db, type DbOrTx } from '../db/client.js';
import { assets } from '../db/schema.js';

export type AssetRow = typeof assets.$inferSelect;

/** Builds an absolute public URL for a bucket key (see `AppConfig.mediaUrl`). */
export type MediaUrlFn = (key: string, rev?: string | null) => string;

/** Admin-only URL that streams the private original (through the web rewrite, with the session cookie). */
export const originalPath = (id: string) => `/api/v1/admin/assets/${id}/original`;

function sources(map: Record<string, string> | undefined, url: MediaUrlFn, rev?: string): ImageSource[] {
  if (!map) return [];
  return Object.entries(map)
    .map(([w, key]) => ({ width: Number(w), url: url(key, rev) }))
    .filter((s) => Number.isFinite(s.width) && s.width > 0)
    .sort((a, b) => a.width - b.width);
}

/**
 * `ImageRef` for an image that has been processed at least once, else null. URLs are absolute
 * (PUBLIC_API_URL + /media/...). A re-crop sets the row back to `processing` (or `failed`) but keeps the
 * previous variants, so public pages keep showing the photo instead of losing it until the job finishes.
 * A brand-new upload has no variants yet and gives null.
 */
export function toImageRef(row: AssetRow | null | undefined, url: MediaUrlFn): ImageRef | null {
  if (!row || row.kind !== 'image') return null;
  const v = row.variants ?? {};
  const webp = sources(v.webp, url, v.rev);
  const avif = sources(v.avif, url, v.rev);
  const largest = webp.at(-1) ?? avif.at(-1);
  if (!largest) return null;
  return {
    id: row.id,
    width: row.width ?? largest.width,
    height: row.height ?? 0,
    alt: row.alt ?? null,
    lqip: row.lqip ?? null,
    color: row.color ?? null,
    avif,
    webp,
    src: largest.url,
  };
}

/** `VideoRef` for a ready video asset (documentation, recordings), else null. */
export function toVideoRef(row: AssetRow | null | undefined, url: MediaUrlFn): VideoRef | null {
  if (!row || row.kind !== 'video' || row.status !== 'ready') return null;
  const v = row.variants ?? {};
  return {
    id: row.id,
    width: row.width ?? null,
    height: row.height ?? null,
    durationSec: row.durationSec ?? null,
    poster: v.poster ? url(v.poster, v.rev) : null,
    mp4: v.mp4 ? url(v.mp4, v.rev) : null,
    webm: v.webm ? url(v.webm, v.rev) : null,
    hls: v.hls ? url(v.hls, v.rev) : null,
    storyboard: v.storyboard
      ? {
          url: url(v.storyboard.key, v.rev),
          interval: v.storyboard.interval,
          columns: v.storyboard.columns,
          tileWidth: v.storyboard.tileWidth,
          tileHeight: v.storyboard.tileHeight,
          count: v.storyboard.count,
        }
      : null,
  };
}

/** `FileRef` for a ready document or audio asset (served as-is), else null. */
export function toFileRef(row: AssetRow | null | undefined, url: MediaUrlFn): FileRef | null {
  if (!row || (row.kind !== 'document' && row.kind !== 'audio') || row.status !== 'ready') return null;
  return {
    id: row.id,
    url: url(row.originalKey, row.variants?.rev),
    filename: row.originalFilename,
    mime: row.mime,
    sizeBytes: Number(row.sizeBytes) || 0,
  };
}

/** Admin-facing `Asset` record. `originalUrl` is relative (admin route, needs the session cookie). */
export function toAssetDto(row: AssetRow, url: MediaUrlFn): Asset {
  return {
    id: row.id,
    kind: row.kind,
    purpose: row.purpose as Asset['purpose'],
    status: row.status,
    error: row.error ?? null,
    originalFilename: row.originalFilename,
    mime: row.mime,
    sizeBytes: Number(row.sizeBytes) || 0,
    width: row.width ?? null,
    height: row.height ?? null,
    durationSec: row.durationSec ?? null,
    alt: row.alt ?? null,
    caption: row.caption ?? null,
    credit: row.credit ?? null,
    crop: row.crop ?? null,
    adjust: row.adjust ?? null,
    originalUrl: originalPath(row.id),
    image: toImageRef(row, url),
    video: toVideoRef(row, url),
    file: toFileRef(row, url),
    createdAt: row.createdAt.toISOString(),
  };
}

const uniqueIds = (ids: Iterable<string | null | undefined>) => [...new Set([...ids].filter((x): x is string => !!x))];

/**
 * Injectable wrapper that knows PUBLIC_API_URL and batch-loads asset rows.
 *
 *   const covers = await refs.imageRefs(rows.map((r) => r.coverAssetId)); // Map<id, ImageRef>
 *   cover: covers.get(row.coverAssetId ?? '') ?? null
 */
@Injectable()
export class AssetRefsService {
  readonly url: MediaUrlFn;

  constructor(
    @Inject(DB) private readonly db: Db,
    config: AppConfig,
  ) {
    this.url = (key, rev) => config.mediaUrl(key, rev);
  }

  /** One query for any number of ids (nulls and duplicates are ignored). */
  async loadMany(ids: Iterable<string | null | undefined>, db: DbOrTx = this.db): Promise<Map<string, AssetRow>> {
    const list = uniqueIds(ids);
    if (!list.length) return new Map();
    const rows = await db.select().from(assets).where(inArray(assets.id, list));
    return new Map(rows.map((r) => [r.id, r]));
  }

  async imageRefs(ids: Iterable<string | null | undefined>, db?: DbOrTx): Promise<Map<string, ImageRef>> {
    return this.mapRefs(await this.loadMany(ids, db), (r) => toImageRef(r, this.url));
  }

  async videoRefs(ids: Iterable<string | null | undefined>, db?: DbOrTx): Promise<Map<string, VideoRef>> {
    return this.mapRefs(await this.loadMany(ids, db), (r) => toVideoRef(r, this.url));
  }

  async fileRefs(ids: Iterable<string | null | undefined>, db?: DbOrTx): Promise<Map<string, FileRef>> {
    return this.mapRefs(await this.loadMany(ids, db), (r) => toFileRef(r, this.url));
  }

  async imageRef(id: string | null | undefined, db?: DbOrTx): Promise<ImageRef | null> {
    if (!id) return null;
    return (await this.imageRefs([id], db)).get(id) ?? null;
  }

  async videoRef(id: string | null | undefined, db?: DbOrTx): Promise<VideoRef | null> {
    if (!id) return null;
    return (await this.videoRefs([id], db)).get(id) ?? null;
  }

  async fileRef(id: string | null | undefined, db?: DbOrTx): Promise<FileRef | null> {
    if (!id) return null;
    return (await this.fileRefs([id], db)).get(id) ?? null;
  }

  image(row: AssetRow | null | undefined): ImageRef | null {
    return toImageRef(row, this.url);
  }

  video(row: AssetRow | null | undefined): VideoRef | null {
    return toVideoRef(row, this.url);
  }

  file(row: AssetRow | null | undefined): FileRef | null {
    return toFileRef(row, this.url);
  }

  dto(row: AssetRow): Asset {
    return toAssetDto(row, this.url);
  }

  private mapRefs<T>(rows: Map<string, AssetRow>, fn: (r: AssetRow) => T | null): Map<string, T> {
    const out = new Map<string, T>();
    for (const [id, row] of rows) {
      const ref = fn(row);
      if (ref) out.set(id, ref);
    }
    return out;
  }
}
