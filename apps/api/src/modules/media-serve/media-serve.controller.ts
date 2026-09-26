import { Controller, Get, Head, Param, Req, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { notFound } from '../../common/errors.js';
import { Public } from '../../auth/decorators.js';
import { StorageService } from '../storage/storage.service.js';
import { streamObject } from './media-stream.js';

/** Originals of photos and videos keep EXIF/GPS and full resolution: never public. */
const PRIVATE_ORIGINAL = /\/original\.(jpe?g|png|webp|avif|heic|heif|gif|tiff?|mp4|m4v|mov|webm|mkv)$/i;
/** Longest path segment we ever write (`assets/<uuid>/<variant>.<ext>`), with lots of headroom. */
const MAX_SEGMENT = 128;

/** Validate and normalise a requested key. Only processed files under `assets/` are public. */
export function publicMediaKey(parts: string[] | string): string | null {
  const key = (Array.isArray(parts) ? parts.join('/') : parts).replace(/^\/+/, '');
  if (!key.startsWith('assets/')) return null;
  if (key.length > 512) return null;
  // NUL and other control bytes (`w320.webp%00`) are never in our keys, and S3 rejects them with a 500.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(key)) return null;
  // Our segments are a uuid or a short variant name. A 300 character one made versitygw throw KeyTooLongError (500).
  if (key.split('/').some((seg) => !seg || seg === '.' || seg === '..' || seg.length > MAX_SEGMENT)) return null;
  if (PRIVATE_ORIGINAL.test(key)) return null;
  return key;
}

/**
 * GET /media/<key>: public, immutable bucket proxy (SPEC section 8). Lives at the root path,
 * outside /api/v1 (see the global prefix exclusion in main.ts).
 */
@ApiExcludeController()
@Public()
@Controller({ path: 'media', version: VERSION_NEUTRAL })
export class MediaServeController {
  constructor(private readonly storage: StorageService) {}

  @Get('{*path}')
  get(@Param('path') path: string[] | string, @Req() req: Request, @Res() res: Response) {
    return this.serve(path, req, res);
  }

  @Head('{*path}')
  head(@Param('path') path: string[] | string, @Req() req: Request, @Res() res: Response) {
    return this.serve(path, req, res);
  }

  private async serve(path: string[] | string, req: Request, res: Response): Promise<void> {
    const key = publicMediaKey(path ?? []);
    if (!key) throw notFound("We couldn't find that file.");
    await streamObject(this.storage, req, res, key, {
      cacheControl: 'public, max-age=31536000, immutable',
      publicCors: true,
    });
  }
}
