import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Ability, Policy, Principal } from '@zemi/shared';
import type { Request } from 'express';

/** What the AuthGuard attaches to authenticated requests. */
export interface RequestAuth {
  principal: Principal;
  ability: Ability;
  policy: Policy;
  session: { id: string; createdAt: Date; expiresAt: Date; lastSeenAt: Date };
}

/** Express request as seen by Zemi controllers. `auth` is set on authenticated routes. */
export interface ZemiRequest extends Request {
  auth?: RequestAuth;
  /** Same as `auth.principal` (set by the AuthGuard). */
  principal?: Principal;
  /** Same as `auth.ability`: createAbility() with the admin's current policy. */
  ability?: Ability;
}

let IP_HEADER: string | null = 'x-real-ip';

/**
 * Which request header holds the real client IP (CLIENT_IP_HEADER, set once at boot in main.ts).
 * `null` means "use Express `req.ip`". Railway's edge sets `X-Real-IP`; the leftmost
 * `X-Forwarded-For` entry that `trust proxy: true` picks is whatever the client sent.
 */
export function configureClientIp(header: string | null | undefined): void {
  IP_HEADER = header && header !== 'none' ? header.toLowerCase() : null;
}

const cleanIp = (ip: string) => {
  const v = ip.trim().slice(0, 64);
  return v.startsWith('::ffff:') ? v.slice(7) : v;
};

/** Client IP: the CLIENT_IP_HEADER value when present, else Express `req.ip` (honours `trust proxy`). Null when unknown. */
export function clientIp(req: Request): string | null {
  if (IP_HEADER) {
    const raw = req.headers?.[IP_HEADER];
    const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0];
    if (first && first.trim()) return cleanIp(first);
  }
  const ip = req.ip ?? req.socket?.remoteAddress ?? null;
  return ip ? cleanIp(ip) : null;
}

export function clientUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua ? ua.slice(0, 512) : null;
}

/** `@Ip() ip: string | null` : the caller's IP (proxy aware). */
export const Ip = createParamDecorator((_: unknown, ctx: ExecutionContext) => clientIp(ctx.switchToHttp().getRequest<Request>()));

/** `@UserAgent() ua: string | null` */
export const UserAgent = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  clientUserAgent(ctx.switchToHttp().getRequest<Request>()),
);
