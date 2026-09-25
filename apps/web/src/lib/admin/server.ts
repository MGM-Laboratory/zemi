import { SESSION_COOKIE, type Me } from '@zemi/shared';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { ApiError, apiErrorFromBody, buildQuery, type QueryParams } from './api';

/**
 * Server-only helpers for the admin (server components, route handlers).
 * Do not import this file from client components: it reads request cookies.
 */

const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export type MeResult =
  | { ok: true; me: Me }
  | { ok: false; reason: 'unauthorized'; status: 401 }
  | { ok: false; reason: 'unreachable' | 'error'; status: number; message: string };

async function forwardHeaders(): Promise<Headers> {
  const incoming = await headers();
  const out = new Headers({ accept: 'application/json' });
  const cookie = incoming.get('cookie');
  if (cookie) out.set('cookie', cookie);
  const ua = incoming.get('user-agent');
  if (ua) out.set('user-agent', ua);
  const fwd = incoming.get('x-forwarded-for') ?? incoming.get('x-real-ip');
  if (fwd) out.set('x-forwarded-for', fwd);
  return out;
}

/**
 * Who is signed in, resolved against the API with the incoming cookie.
 * Deduped per request (layout + page can both call it).
 *
 * - `{ ok: true, me }` signed in
 * - `{ ok: false, reason: 'unauthorized' }` no cookie, expired or revoked session: send to login
 * - `{ ok: false, reason: 'unreachable' | 'error' }` the API is down: show an error, do NOT redirect
 */
export const getMeServer = cache(async (): Promise<MeResult> => {
  const jar = await cookies();
  if (!jar.get(SESSION_COOKIE)?.value) return { ok: false, reason: 'unauthorized', status: 401 };
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/api/v1/auth/me`, {
      headers: await forwardHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return {
      ok: false,
      reason: 'unreachable',
      status: 0,
      message: "We can't reach the Zemi API right now.",
    };
  }
  if (res.status === 401) return { ok: false, reason: 'unauthorized', status: 401 };
  if (!res.ok) {
    return {
      ok: false,
      reason: res.status >= 500 || res.status === 404 ? 'unreachable' : 'error',
      status: res.status,
      message: `The API answered ${res.status}.`,
    };
  }
  try {
    const me = (await res.json()) as Me;
    if (!me?.principal) throw new Error('bad me');
    return { ok: true, me };
  } catch {
    return { ok: false, reason: 'error', status: 500, message: 'The API sent something we could not read.' };
  }
});

/**
 * Fetch an admin endpoint from a server component, forwarding the admin's cookie.
 * Throws ApiError like the browser client (no redirects; handle 401 yourself or rely on the layout gate).
 *
 * @example const overview = await adminServerFetch<AdminOverview>('/admin/overview');
 */
export async function adminServerFetch<T>(path: string, opts: { query?: QueryParams; timeoutMs?: number } = {}): Promise<T> {
  const clean = path.startsWith('/api/') ? path : `/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}${clean}${buildQuery(opts.query)}`, {
      headers: await forwardHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  } catch {
    throw new ApiError({ status: 0, code: 'network', message: "We can't reach the Zemi API right now." });
  }
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) throw apiErrorFromBody(res.status, data, res.headers.get('retry-after'));
  return data as T;
}

/** The path (with search) of the current admin request, set by `proxy.ts`. */
export async function currentAdminPath(fallback = '/admin'): Promise<string> {
  const h = await headers();
  return h.get('x-zemi-pathname') ?? fallback;
}
