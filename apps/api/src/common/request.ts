import { isIP } from 'node:net';
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
 *
 * Caveat: the web's `/api/v1` rewrite (Next, httpxy) forwards request headers unchanged, so a
 * client-sent `X-Real-IP` reaches us as-is unless the edge in front of the web replaces it. Locally
 * (no edge) any caller can pick its rate-limit bucket; the e2e suite relies on that for isolation.
 * Login also has a global failure limit that doesn't depend on the IP (auth.controller.ts).
 */
export function configureClientIp(header: string | null | undefined): void {
  IP_HEADER = header && header !== 'none' ? header.toLowerCase() : null;
}

/** Trimmed, `::ffff:` mapped IPv4 unwrapped. Null unless it is a real IPv4/IPv6 address (net.isIP). */
function cleanIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v || v.length > 64) return null;
  if (v.toLowerCase().startsWith('::ffff:') && isIP(v.slice(7)) === 4) v = v.slice(7);
  return isIP(v) ? v : null;
}

/**
 * Client IP: the CLIENT_IP_HEADER value when it holds a valid IP, else Express `req.ip` (honours
 * `trust proxy`). Anything that isn't an IP address (`203.0.113.11330`, `evil`, a list) is ignored,
 * so it can't end up in rate-limit keys or the audit log. Null when unknown.
 */
export function clientIp(req: Request): string | null {
  if (IP_HEADER) {
    const raw = req.headers?.[IP_HEADER];
    const fromHeader = cleanIp((Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]);
    if (fromHeader) return fromHeader;
  }
  return cleanIp(req.ip) ?? cleanIp(req.socket?.remoteAddress);
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
