import type { Request, Response } from 'express';
import { AppError, notFound } from '../../common/errors.js';
import {
  StorageNotFoundError,
  StorageNotModified,
  StorageRangeNotSatisfiable,
  type StorageService,
} from '../storage/storage.service.js';

export interface StreamObjectOptions {
  cacheControl: string;
  /** Add `Access-Control-Allow-Origin: *` unless CORS already set an origin. */
  publicCors?: boolean;
  /** `inline; filename="..."` or `attachment; ...` */
  contentDisposition?: string;
}

/** Only a single `bytes=a-b`, `bytes=a-` or `bytes=-n` range is forwarded; anything else serves 200. */
export function parseSingleRange(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return undefined;
  if (m[1] && m[2] && Number(m[2]) < Number(m[1])) return undefined;
  return `bytes=${m[1]}-${m[2]}`;
}

/**
 * Stream a bucket object to an Express response with Range (206), ETag/If-None-Match (304),
 * Accept-Ranges, Content-Type and caching headers. Aborts the S3 read when the client goes away.
 */
export async function streamObject(storage: StorageService, req: Request, res: Response, key: string, opts: StreamObjectOptions): Promise<void> {
  const range = parseSingleRange(req.headers.range);
  const ifNoneMatch = typeof req.headers['if-none-match'] === 'string' ? req.headers['if-none-match'] : undefined;
  const ims = req.headers['if-modified-since'];
  const ifModifiedSince = typeof ims === 'string' && !Number.isNaN(Date.parse(ims)) ? new Date(ims) : undefined;

  const common = () => {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', opts.cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Timing-Allow-Origin', '*');
    if (opts.publicCors) {
      if (!res.getHeader('Access-Control-Allow-Origin')) res.setHeader('Access-Control-Allow-Origin', '*');
      // Static files are safe to embed (PDF viewers in an iframe on the web origin).
      res.removeHeader('X-Frame-Options');
    }
  };

  let obj;
  try {
    obj = await storage.getStream(key, { range, ifNoneMatch, ifModifiedSince });
  } catch (err) {
    if (err instanceof StorageNotModified) {
      common();
      if (err.etag) res.setHeader('ETag', err.etag);
      res.status(304).end();
      return;
    }
    if (err instanceof StorageRangeNotSatisfiable) {
      common();
      if (err.size !== null) res.setHeader('Content-Range', `bytes */${err.size}`);
      throw new AppError(416, 'range_not_satisfiable', "That byte range doesn't exist in this file.");
    }
    if (err instanceof StorageNotFoundError) throw notFound("We couldn't find that file.");
    throw err;
  }

  common();
  res.status(obj.status);
  res.setHeader('Content-Type', obj.contentType);
  res.setHeader('Content-Length', String(obj.contentLength));
  if (obj.contentRange) res.setHeader('Content-Range', obj.contentRange);
  if (obj.etag) res.setHeader('ETag', obj.etag);
  if (obj.lastModified) res.setHeader('Last-Modified', obj.lastModified.toUTCString());
  const disposition = opts.contentDisposition ?? obj.contentDisposition;
  if (disposition) res.setHeader('Content-Disposition', disposition);

  if (req.method === 'HEAD') {
    obj.body.destroy();
    res.end();
    return;
  }

  await new Promise<void>((resolve) => {
    const body = obj.body;
    const done = () => resolve();
    res.on('close', () => {
      if (!res.writableFinished) body.destroy();
      done();
    });
    body.on('error', () => {
      if (!res.headersSent) res.status(502);
      res.destroy();
      done();
    });
    body.pipe(res);
  });
}

/** `inline; filename="..."; filename*=UTF-8''...` */
export function dispositionFor(filename: string, kind: 'inline' | 'attachment' = 'inline'): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
