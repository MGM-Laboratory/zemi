import { Reflector } from '@nestjs/core';
import { createAbility, type Policy, type Principal } from '@zemi/shared';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/errors.js';
import { CsrfGuard, needsCsrf } from '../common/csrf.guard.js';
import type { RequestAuth, ZemiRequest } from '../common/request.js';
import { AuthGuard, capabilityGroupsSatisfied, requiresAuth } from './auth.guard.js';
import { Public, RequireCapability, RequireSuperadmin } from './decorators.js';
import { assertCan, visibleIds } from './permissions.service.js';
import { adminBlockReason, sessionIsValid, SESSION_IDLE_MS, SUPERADMIN_PRINCIPAL, type SessionService } from './session.service.js';

/* ---------------------------------------------------------------- fixtures */

@Public()
class PublicController {
  open() {}
}
class AdminController {
  plain() {}
  @RequireSuperadmin()
  superOnly() {}
  @RequireCapability('audit.view')
  audit() {}
  @RequireCapability('site.edit', 'inbox.view')
  anyOf() {}
  @RequireCapability('site.edit')
  @RequireCapability('inbox.view')
  allOf() {}
}

const admin: Principal = { kind: 'admin', id: 'a1', name: 'Rina', expiresAt: null };

function authFor(principal: Principal, policy: Policy = { capabilities: [], grants: [] }): RequestAuth {
  return {
    principal,
    policy,
    ability: createAbility(principal, policy),
    session: { id: 's1', createdAt: new Date(), expiresAt: new Date(Date.now() + 1e6), lastSeenAt: new Date() },
  };
}

function ctx(path: string, cls: object, handler: (...args: unknown[]) => unknown, cookie?: string) {
  const req = { path, cookies: cookie ? { zemi_session: cookie } : {}, headers: {}, method: 'GET' } as unknown as ZemiRequest;
  const res = { clearCookie: vi.fn() };
  const context = {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { context, req, res };
}

function guardWith(auth: RequestAuth | null) {
  const sessions = { authenticate: vi.fn(async () => auth), clearCookie: vi.fn() } as unknown as SessionService;
  return { guard: new AuthGuard(new Reflector(), sessions), sessions };
}

async function status(p: Promise<unknown>): Promise<number | 'ok'> {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return (err as AppError).getStatus();
  }
}

/* ---------------------------------------------------------------- tests */

describe('requiresAuth', () => {
  it('always protects /api/v1/admin/** and /auth/me|logout, even with @Public', () => {
    expect(requiresAuth('/api/v1/admin/events', true)).toBe(true);
    expect(requiresAuth('/api/v1/admin', true)).toBe(true);
    expect(requiresAuth('/api/v1/auth/me', true)).toBe(true);
    expect(requiresAuth('/api/v1/auth/logout', true)).toBe(true);
  });
  it('ignores path case, like Express routing does', () => {
    expect(requiresAuth('/API/V1/ADMIN/events', true)).toBe(true);
    expect(requiresAuth('/api/v1/Admin/system', true)).toBe(true);
    expect(requiresAuth('/api/v1/Auth/Me', true)).toBe(true);
  });
  it('is secure by default and lets @Public routes through elsewhere', () => {
    expect(requiresAuth('/api/v1/public/events', false)).toBe(true);
    expect(requiresAuth('/api/v1/public/events', true)).toBe(false);
    expect(requiresAuth('/api/v1/auth/login', true)).toBe(false);
    expect(requiresAuth('/media/assets/x/w320.webp', true)).toBe(false);
    expect(requiresAuth('/api/v1/administrators', true)).toBe(false);
  });
});

describe('capabilityGroupsSatisfied', () => {
  it('ORs inside a group and ANDs across groups', () => {
    const has = (c: string) => c === 'site.edit';
    expect(capabilityGroupsSatisfied([['site.edit', 'inbox.view']], has)).toBe(true);
    expect(capabilityGroupsSatisfied([['site.edit'], ['inbox.view']], has)).toBe(false);
    expect(capabilityGroupsSatisfied([], has)).toBe(true);
  });
});

describe('AuthGuard', () => {
  it('lets public routes through without a session', async () => {
    const { guard, sessions } = guardWith(null);
    const { context } = ctx('/api/v1/public/events', PublicController, PublicController.prototype.open);
    expect(await guard.canActivate(context)).toBe(true);
    expect(sessions.authenticate).not.toHaveBeenCalled();
  });

  it('401s on admin paths without a valid session and clears a stale cookie', async () => {
    const { guard } = guardWith(null);
    const noCookie = ctx('/api/v1/admin/events', AdminController, AdminController.prototype.plain);
    expect(await status(guard.canActivate(noCookie.context))).toBe(401);
    const stale = ctx('/api/v1/admin/events', PublicController, PublicController.prototype.open, 'stale-token-stale-token');
    expect(await status(guard.canActivate(stale.context))).toBe(401);
  });

  it('attaches req.auth for valid sessions', async () => {
    const auth = authFor(admin);
    const { guard } = guardWith(auth);
    const { context, req } = ctx('/api/v1/admin/events', AdminController, AdminController.prototype.plain, 'good-token-good-token-1');
    expect(await guard.canActivate(context)).toBe(true);
    expect(req.auth?.principal).toEqual(admin);
  });

  it('enforces @RequireSuperadmin', async () => {
    const h = AdminController.prototype.superOnly;
    expect(await status(guardWith(authFor(admin)).guard.canActivate(ctx('/api/v1/admin/admins', AdminController, h, 'tok-tok-tok-tok-tok-1').context))).toBe(403);
    expect(await status(guardWith(authFor(SUPERADMIN_PRINCIPAL)).guard.canActivate(ctx('/api/v1/admin/admins', AdminController, h, 'tok-tok-tok-tok-tok-1').context))).toBe('ok');
  });

  it('enforces @RequireCapability (any-of within one decorator, all-of when stacked)', async () => {
    const run = (handler: () => void, policy: Policy) =>
      status(guardWith(authFor(admin, policy)).guard.canActivate(ctx('/api/v1/admin/x', AdminController, handler, 'tok-tok-tok-tok-tok-1').context));
    const P = AdminController.prototype;
    expect(await run(P.audit, { capabilities: [], grants: [] })).toBe(403);
    expect(await run(P.audit, { capabilities: ['audit.view'], grants: [] })).toBe('ok');
    expect(await run(P.anyOf, { capabilities: ['inbox.view'], grants: [] })).toBe('ok');
    expect(await run(P.allOf, { capabilities: ['inbox.view'], grants: [] })).toBe(403);
    expect(await run(P.allOf, { capabilities: ['inbox.view', 'site.edit'], grants: [] })).toBe('ok');
  });
});

describe('CSRF', () => {
  it('needs the header on unsafe admin and logout requests only', () => {
    expect(needsCsrf('POST', '/api/v1/admin/events')).toBe(true);
    expect(needsCsrf('DELETE', '/api/v1/admin/assets/1')).toBe(true);
    expect(needsCsrf('POST', '/api/v1/auth/logout')).toBe(true);
    expect(needsCsrf('GET', '/api/v1/admin/events')).toBe(false);
    expect(needsCsrf('POST', '/api/v1/auth/login')).toBe(false);
    expect(needsCsrf('POST', '/api/v1/public/events/1/registrations')).toBe(false);
  });

  it('needsCsrf ignores path case (Express routes /API/V1/ADMIN to the same handlers)', () => {
    expect(needsCsrf('POST', '/API/V1/ADMIN/system/test-email')).toBe(true);
    expect(needsCsrf('PATCH', '/api/v1/Admin/admins/1')).toBe(true);
    expect(needsCsrf('POST', '/api/v1/Auth/Logout')).toBe(true);
  });

  it('CsrfGuard throws 403 without x-zemi-csrf: 1', () => {
    const guard = new CsrfGuard();
    const make = (headers: Record<string, string>) =>
      ({
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => ({ method: 'POST', path: '/api/v1/admin/events', headers }) }),
      }) as unknown as ExecutionContext;
    expect(() => guard.canActivate(make({}))).toThrow(AppError);
    expect(guard.canActivate(make({ 'x-zemi-csrf': '1' }))).toBe(true);
  });
});

describe('session + admin validity', () => {
  const now = Date.now();
  it('rejects revoked, expired and idle sessions', () => {
    const base = { revokedAt: null, expiresAt: new Date(now + 1000), lastSeenAt: new Date(now) };
    expect(sessionIsValid(base, now)).toBe(true);
    expect(sessionIsValid({ ...base, revokedAt: new Date(now) }, now)).toBe(false);
    expect(sessionIsValid({ ...base, expiresAt: new Date(now - 1) }, now)).toBe(false);
    expect(sessionIsValid({ ...base, lastSeenAt: new Date(now - SESSION_IDLE_MS - 1) }, now)).toBe(false);
  });

  it('blocks disabled and expired admins', () => {
    expect(adminBlockReason({ disabledAt: null, expiresAt: null })).toBeNull();
    expect(adminBlockReason({ disabledAt: new Date(), expiresAt: null })).toBe('disabled');
    expect(adminBlockReason({ disabledAt: null, expiresAt: new Date(Date.now() - 1) })).toBe('expired');
    expect(adminBlockReason({ disabledAt: null, expiresAt: new Date(Date.now() + 60_000) })).toBeNull();
  });
});

describe('permission helpers', () => {
  const policy: Policy = {
    capabilities: [],
    grants: [
      { type: 'event', id: 'e1', actions: ['attendance.scan'] },
      { type: 'speaker', id: '*', actions: ['view'] },
    ],
  };
  const ability = createAbility(admin, policy);

  it('assertCan throws 403 when the action is not granted', () => {
    expect(() => assertCan(ability, 'event', 'e1', 'attendance.scan')).not.toThrow();
    expect(() => assertCan(ability, 'event', 'e1', 'view')).not.toThrow(); // implied
    expect(() => assertCan(ability, 'event', 'e1', 'edit')).toThrow(AppError);
    expect(() => assertCan(ability, 'event', 'e2', 'view')).toThrow(AppError);
  });

  it('visibleIds returns "all" for wildcards and superadmin, else the ids', () => {
    expect(visibleIds(ability, 'event')).toEqual(['e1']);
    expect(visibleIds(ability, 'speaker')).toBe('all');
    expect(visibleIds(ability, 'publication')).toEqual([]);
    expect(visibleIds(createAbility(SUPERADMIN_PRINCIPAL, null), 'publication')).toBe('all');
  });
});
