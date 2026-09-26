import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { mimeFromKey } from '../../common/mime.js';
import { AppConfig } from '../../config/app-config.js';

export interface PutOptions {
  contentType?: string;
  /** Defaults to immutable for everything under assets/. */
  cacheControl?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
}

export interface ObjectInfo {
  key: string;
  contentLength: number;
  contentType: string;
  etag: string | null;
  lastModified: Date | null;
}

export interface ObjectStream extends ObjectInfo {
  body: Readable;
  /** `bytes start-end/total` when a range was served. */
  contentRange: string | null;
  /** 206 for ranged reads, 200 otherwise. */
  status: 200 | 206;
  /** Stored Content-Disposition (documents keep their original filename). */
  contentDisposition: string | null;
}

export class StorageNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Object not found: ${key}`);
    this.name = 'StorageNotFoundError';
  }
}

export class StorageNotModified extends Error {
  constructor(readonly etag: string | null) {
    super('Not modified');
    this.name = 'StorageNotModified';
  }
}

export class StorageRangeNotSatisfiable extends Error {
  constructor(readonly size: number | null) {
    super('Range not satisfiable');
    this.name = 'StorageRangeNotSatisfiable';
  }
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

function statusOf(err: unknown): number | undefined {
  return (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}

/** Errors that mean "no object can live at that key". Reads treat them like a missing object. */
const IMPOSSIBLE_KEY = new Set(['KeyTooLongError', 'InvalidURI', 'InvalidObjectName']);

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === 'NoSuchKey' || name === 'NotFound' || name === 'NoSuchBucket' || (!!name && IMPOSSIBLE_KEY.has(name)) || statusOf(err) === 404;
}

/**
 * S3-compatible object storage (Railway Buckets in prod, MinIO locally).
 * Keys are plain strings like `assets/<id>/w640.avif`. Nothing here is public by itself:
 * everything public is served through `GET /media/*`.
 */
@Injectable()
export class StorageService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Storage');
  readonly client: S3Client;
  readonly bucket: string;

  constructor(private readonly config: AppConfig) {
    const env = config.env;
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
      // Newer SDKs add CRC checksums by default, which several S3-compatible stores reject.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (err) {
      // Don't block boot: /health and /admin/system report storage problems.
      this.logger.error(`Bucket "${this.bucket}" is not reachable: ${(err as Error).message}`);
    }
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }

  /** HeadBucket; creates it when missing and S3_AUTO_CREATE_BUCKET=true. */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      if (!isNotFound(err) || !this.config.env.S3_AUTO_CREATE_BUCKET) throw err;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket "${this.bucket}"`);
    }
  }

  /** Cheap reachability check for /admin/system. */
  async ping(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  private defaults(key: string, opts: PutOptions) {
    return {
      ContentType: opts.contentType ?? mimeFromKey(key),
      CacheControl: opts.cacheControl ?? (key.startsWith('assets/') ? IMMUTABLE : undefined),
      ContentDisposition: opts.contentDisposition,
      Metadata: opts.metadata,
    };
  }

  async putBuffer(key: string, body: Buffer | Uint8Array | string, opts: PutOptions = {}): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ...this.defaults(key, opts) }));
  }

  /** Upload a stream of unknown length (multipart, 16 MB parts). */
  async putStream(key: string, body: Readable, opts: PutOptions = {}): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: body, ...this.defaults(key, opts) },
      partSize: 16 * 1024 * 1024,
      queueSize: 4,
      leavePartsOnError: false,
    });
    await upload.done();
  }

  /** Upload a local file. Small files go in one PUT, large ones as multipart. Returns the size. */
  async putFile(key: string, path: string, opts: PutOptions = {}): Promise<number> {
    const { size } = await stat(path);
    if (size < 16 * 1024 * 1024) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: createReadStream(path),
          ContentLength: size,
          ...this.defaults(key, opts),
        }),
      );
    } else {
      await this.putStream(key, createReadStream(path), opts);
    }
    return size;
  }

  /**
   * Stream an object, optionally a byte range (`bytes=0-1023`, as sent by browsers).
   * Throws StorageNotFoundError, StorageNotModified (when `ifNoneMatch` matches) or
   * StorageRangeNotSatisfiable.
   */
  async getStream(key: string, opts: { range?: string; ifNoneMatch?: string; ifModifiedSince?: Date } = {}): Promise<ObjectStream> {
    try {
      const out = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: opts.range,
          IfNoneMatch: opts.ifNoneMatch,
          IfModifiedSince: opts.ifNoneMatch ? undefined : opts.ifModifiedSince,
        }),
      );
      const body = out.Body as Readable | undefined;
      if (!body) throw new StorageNotFoundError(key);
      return {
        key,
        body,
        contentLength: Number(out.ContentLength ?? 0),
        contentRange: out.ContentRange ?? null,
        contentType: out.ContentType && out.ContentType !== 'application/octet-stream' ? out.ContentType : mimeFromKey(key),
        etag: out.ETag ?? null,
        lastModified: out.LastModified ?? null,
        status: out.ContentRange ? 206 : 200,
        contentDisposition: out.ContentDisposition ?? null,
      };
    } catch (err) {
      if (err instanceof StorageNotFoundError) throw err;
      const status = statusOf(err);
      if (status === 304) throw new StorageNotModified(opts.ifNoneMatch ?? null);
      if (status === 416 || (err as { name?: string })?.name === 'InvalidRange') {
        const head = await this.head(key).catch(() => null);
        throw new StorageRangeNotSatisfiable(head?.contentLength ?? null);
      }
      if (isNotFound(err)) throw new StorageNotFoundError(key);
      throw err;
    }
  }

  /** Whole object into memory. Only for small files. */
  async getBuffer(key: string): Promise<Buffer> {
    const { body } = await this.getStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  /** Download an object to a local file (for ffmpeg/sharp processing). */
  async downloadToFile(key: string, path: string): Promise<void> {
    const { body } = await this.getStream(key);
    await pipeline(body, createWriteStream(path));
  }

  /** Object metadata, or null when it doesn't exist. */
  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        key,
        contentLength: Number(out.ContentLength ?? 0),
        contentType: out.ContentType ?? mimeFromKey(key),
        etag: out.ETag ?? null,
        lastModified: out.LastModified ?? null,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  /** All keys under a prefix. */
  async list(prefix: string): Promise<Array<{ key: string; size: number; lastModified: Date | null }>> {
    const out: Array<{ key: string; size: number; lastModified: Date | null }> = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }),
      );
      for (const o of page.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: Number(o.Size ?? 0), lastModified: o.LastModified ?? null });
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  /** Delete many keys (batched DeleteObjects, falling back to single deletes). */
  async deleteKeys(keys: string[]): Promise<number> {
    let deleted = 0;
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      try {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
        );
      } catch (err) {
        if (!(err instanceof S3ServiceException) && !statusOf(err)) throw err;
        for (const k of batch) await this.delete(k);
      }
      deleted += batch.length;
    }
    return deleted;
  }

  /** Delete everything under a prefix (e.g. `assets/<id>/`). Returns the number of keys removed. */
  async deletePrefix(prefix: string): Promise<number> {
    if (!prefix || prefix === '/') throw new Error('Refusing to delete the whole bucket');
    const keys = (await this.list(prefix)).map((o) => o.key);
    return keys.length ? this.deleteKeys(keys) : 0;
  }

  /** Server-side copy within the bucket. */
  async copy(fromKey: string, toKey: string, opts: PutOptions = {}): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: toKey,
        CopySource: `${this.bucket}/${fromKey.split('/').map(encodeURIComponent).join('/')}`,
        ...(opts.contentType || opts.cacheControl ? { MetadataDirective: 'REPLACE', ...this.defaults(toKey, opts) } : {}),
      }),
    );
  }
}
