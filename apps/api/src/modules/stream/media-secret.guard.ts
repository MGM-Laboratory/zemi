import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqualStr } from '../../common/crypto.js';
import { unauthorized } from '../../common/errors.js';
import { AppConfig } from '../../config/app-config.js';

/**
 * True when the request carries MEDIA_INTERNAL_SECRET as `x-media-secret`, `Authorization: Bearer`,
 * or the password (or user) of `Authorization: Basic`. All comparisons are constant time.
 * MediaMTX's authHTTP sends Basic credentials taken from the userinfo of `authHTTPAddress`
 * (see apps/media/scripts/entrypoint.sh); the hook and upload scripts send `x-media-secret`.
 */
export function hasMediaSecret(headers: Request['headers'], secret: string): boolean {
  const h = headers['x-media-secret'];
  if (typeof h === 'string' && h && timingSafeEqualStr(h, secret)) return true;
  const auth = headers.authorization;
  if (typeof auth !== 'string') return false;
  const space = auth.indexOf(' ');
  if (space < 0) return false;
  const scheme = auth.slice(0, space).toLowerCase();
  const value = auth.slice(space + 1).trim();
  if (scheme === 'bearer') return !!value && timingSafeEqualStr(value, secret);
  if (scheme === 'basic') {
    let decoded = '';
    try {
      decoded = Buffer.from(value, 'base64').toString('utf8');
    } catch {
      return false;
    }
    const colon = decoded.indexOf(':');
    const user = colon >= 0 ? decoded.slice(0, colon) : decoded;
    const pass = colon >= 0 ? decoded.slice(colon + 1) : '';
    const passOk = !!pass && timingSafeEqualStr(pass, secret);
    const userOk = !!user && timingSafeEqualStr(user, secret);
    return passOk || userOk;
  }
  return false;
}

/** Guards /internal/media/* (runs before multer, so strangers can't even upload). */
@Injectable()
export class MediaSecretGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (hasMediaSecret(req.headers, this.config.env.MEDIA_INTERNAL_SECRET)) return true;
    throw unauthorized('Media server credentials are missing or wrong.');
  }
}
