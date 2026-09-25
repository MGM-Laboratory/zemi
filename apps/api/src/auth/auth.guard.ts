import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE, type Capability } from '@zemi/shared';
import { forbidden, unauthorized } from '../common/errors.js';
import type { ZemiRequest } from '../common/request.js';
import type { Response } from 'express';
import { IS_PUBLIC, REQUIRE_CAPABILITY, REQUIRE_SUPERADMIN } from './decorators.js';
import { SessionService } from './session.service.js';

/** Case-insensitive because Express routing is: `/API/V1/ADMIN/...` hits the same handlers. */
const ALWAYS_PROTECTED = [/^\/api\/v1\/admin(\/|$)/i, /^\/api\/v1\/auth\/(me|logout)\/?$/i];

/** Pure routing decision, exported for tests. */
export function requiresAuth(path: string, isPublic: boolean): boolean {
  if (ALWAYS_PROTECTED.some((re) => re.test(path))) return true;
  return !isPublic;
}

/** Pure capability check: every group must have at least one capability the ability holds. */
export function capabilityGroupsSatisfied(groups: Capability[][], has: (c: Capability) => boolean): boolean {
  return groups.every((group) => group.some((c) => has(c)));
}

/**
 * Global guard (registered as APP_GUARD after CsrfGuard):
 * 1. Decide if the route needs a session (secure by default, see `@Public()`).
 * 2. Resolve the `zemi_session` cookie into `req.auth` = { principal, ability, policy, session }.
 *    The ability uses the admin's CURRENT policy from the DB, on every request.
 * 3. Enforce `@RequireSuperadmin()` and `@RequireCapability(...)`.
 * Resource-level checks (can this admin edit THIS event?) happen in services via `assertCan`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<ZemiRequest>();
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) === true;
    if (!requiresAuth(req.path, isPublic)) return true;

    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const auth = await this.sessions.authenticate(token);
    if (!auth) {
      if (token) this.sessions.clearCookie(context.switchToHttp().getResponse<Response>());
      throw unauthorized(token ? 'Your session ended. Sign in again to keep going.' : 'Please sign in first.');
    }
    req.auth = auth;
    req.principal = auth.principal;
    req.ability = auth.ability;

    const superOnly = this.reflector.getAllAndOverride<boolean>(REQUIRE_SUPERADMIN, targets) === true;
    if (superOnly && !auth.ability.isSuperadmin) throw forbidden('Only the superadmin can do that.');

    const groups = [
      ...(this.reflector.get<Capability[][]>(REQUIRE_CAPABILITY, context.getClass()) ?? []),
      ...(this.reflector.get<Capability[][]>(REQUIRE_CAPABILITY, context.getHandler()) ?? []),
    ];
    if (groups.length && !capabilityGroupsSatisfied(groups, (c) => auth.ability.has(c))) {
      throw forbidden("You don't have permission to do that.", { details: { capabilities: groups } });
    }
    return true;
  }
}
