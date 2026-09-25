import 'reflect-metadata';
import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Ability, Capability, Principal } from '@zemi/shared';
import { unauthorized } from '../common/errors.js';
import type { RequestAuth, ZemiRequest } from '../common/request.js';

export const IS_PUBLIC = 'zemi:public';
export const REQUIRE_SUPERADMIN = 'zemi:superadmin';
export const REQUIRE_CAPABILITY = 'zemi:capability';

/**
 * Opt a controller or handler out of authentication. The AuthGuard is global and secure by default:
 * every route needs a session unless it is marked `@Public()`. Routes under /api/v1/admin and
 * /api/v1/auth/me|logout ALWAYS need a session, `@Public()` is ignored there.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Superadmin only (admins, sessions, system). 403 for everyone else. */
export const RequireSuperadmin = () => SetMetadata(REQUIRE_SUPERADMIN, true);

/**
 * Require a global capability. Several capabilities in one call mean "any of these".
 * Stacking the decorator on class and handler means "all of these groups". Superadmin always passes.
 *
 *   @RequireCapability('venues.manage')
 *   @RequireCapability('audit.view')
 */
export function RequireCapability(...caps: [Capability, ...Capability[]]): ClassDecorator & MethodDecorator {
  return (target: object, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const where = (descriptor?.value ?? target) as object;
    const prev = (Reflect.getMetadata(REQUIRE_CAPABILITY, where) as Capability[][] | undefined) ?? [];
    Reflect.defineMetadata(REQUIRE_CAPABILITY, [...prev, caps], where);
  };
}

function authOf(ctx: ExecutionContext): RequestAuth {
  const req = ctx.switchToHttp().getRequest<ZemiRequest>();
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** `@CurrentPrincipal() principal: Principal` */
export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => authOf(ctx).principal);

/** `@CurrentAbility() ability: Ability` (createAbility with the admin's current policy). */
export const CurrentAbility = createParamDecorator((_: unknown, ctx: ExecutionContext): Ability => authOf(ctx).ability);

/** `@CurrentAuth() auth: RequestAuth` (principal, ability, policy, session). */
export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestAuth => authOf(ctx));
