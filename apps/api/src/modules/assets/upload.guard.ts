import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Ability, AssetKind, Capability } from '@zemi/shared';
import { forbidden, unauthorized } from '../../common/errors.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import type { ZemiRequest } from '../../common/request.js';

/** Capabilities that come with a reason to upload (covers, avatars, PDFs, site images, the library). */
const UPLOAD_CAPABILITIES: Capability[] = ['events.create', 'speakers.create', 'publications.create', 'site.edit', 'media.library'];

/**
 * Who may upload at all: the superadmin, anyone with a create/site/library capability, and anyone
 * who can edit something (or manage an event's documentation or recordings). A Viewer or door crew
 * account can't, so it can't fill the bucket or keep the transcoder busy.
 */
export function canUpload(ability: Ability): boolean {
  if (ability.isSuperadmin) return true;
  if (UPLOAD_CAPABILITIES.some((c) => ability.has(c))) return true;
  return (
    ability.canAny('event', 'edit') ||
    ability.canAny('event', 'media.manage') ||
    ability.canAny('event', 'stream.control') ||
    ability.canAny('event', 'bumpers.edit') ||
    ability.has('bumpers.manage') ||
    ability.canAny('speaker', 'edit') ||
    ability.canAny('publication', 'edit')
  );
}

/** Per admin. Roomy enough for a big documentation drop (the web uploads three at a time). */
export const UPLOAD_RATE = { limit: 150, windowMs: 10 * 60_000 } as const;

/**
 * Size caps by detected kind, on top of multer's UPLOAD_MAX_BYTES (which stays the cap for video
 * and audio). They match the web's own limits (100 MB for photos in the documentation tab and for files).
 */
export const UPLOAD_KIND_MAX_BYTES: Partial<Record<AssetKind, number>> = {
  image: 100 * 1024 ** 2,
  document: 100 * 1024 ** 2,
};

/**
 * Runs before multer (guards run before interceptors), so a refused upload is never written to disk.
 * Expects the global AuthGuard to have set `req.ability` / `req.principal`.
 */
@Injectable()
export class UploadGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<ZemiRequest>();
    if (!req.ability || !req.principal) throw unauthorized();
    if (!canUpload(req.ability)) {
      throw forbidden("Uploading needs permission to edit something first. Ask the superadmin if you need it.");
    }
    this.rateLimit.consume(`upload:${req.principal.id}`, UPLOAD_RATE, "That's a lot of uploads in a row. Give it a few minutes, then retry the rest.");
    return true;
  }
}
