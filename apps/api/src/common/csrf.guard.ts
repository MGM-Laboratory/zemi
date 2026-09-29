import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { CSRF_HEADER } from '@zemi/shared';
import type { Request } from 'express';
import { AppError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Does this path need the CSRF header on unsafe methods? */
export function needsCsrf(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  // Case-insensitive on purpose: Express routing ignores case, so `/api/v1/Admin/...` reaches the same handlers.
  return /^\/api\/v1\/(admin|public\/discussion)(\/|$)/i.test(path) || /^\/api\/v1\/auth\/logout\/?$/i.test(path);
}

/**
 * Global guard: every non-GET request under /api/v1/admin and POST /api/v1/auth/logout must carry
 * `x-zemi-csrf: 1`. Browsers can't add custom headers cross-site without a CORS preflight, and the
 * preflight only passes for WEB_ORIGIN, so this blocks classic CSRF. The web client adds it for you.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (!needsCsrf(req.method, req.path)) return true;
    if (req.headers[CSRF_HEADER] === '1') return true;
    throw new AppError(403, 'csrf', 'Missing the x-zemi-csrf header. Reload the page and try again.');
  }
}
