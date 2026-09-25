/**
 * Browser-side helpers for the public site. Safe to import from Client Components.
 *
 * JSON calls go to the same-origin rewrite (`/api/v1/...`). Media, HLS, SSE and .ics go straight
 * to the public API origin via `publicApiUrl()`.
 */
import type { ContactInput, ReactionKind, RegisterInput, RegisterResult, Ticket } from '@zemi/shared';
import { ApiError } from './errors';

const PUBLIC_API_ORIGIN = (process.env.NEXT_PUBLIC_API_PUBLIC_URL ?? '').replace(/\/+$/, '');

/**
 * Absolute URL on the public API origin (NEXT_PUBLIC_API_PUBLIC_URL). Falls back to a
 * same-origin path when the env var is missing, which works through the Next rewrites.
 *
 * @example publicApiUrl(`/api/v1/public/live/${eventId}/index.m3u8`)
 */
export function publicApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${PUBLIC_API_ORIGIN}${p}`;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Keep the request alive while the page unloads (heartbeats). */
  keepalive?: boolean;
}

/** fetch wrapper for `/api/v1${path}`. Throws ApiError on non-2xx or network failure. */
export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: opts.signal,
      keepalive: opts.keepalive,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw ApiError.network(e);
  }
  if (!res.ok) throw await ApiError.fromResponse(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* ------------------------------------------------------------------ registrations */

/** POST /public/events/:id/registrations. 400/422 errors carry field errors (see ApiError.fieldErrors). */
export function register(eventId: string, input: RegisterInput, opts?: RequestOptions): Promise<RegisterResult> {
  return apiRequest<RegisterResult>('POST', `/public/events/${encodeURIComponent(eventId)}/registrations`, input, opts);
}

/** POST /public/tickets/:token/cancel. Resolves to the updated ticket when the API returns one. */
export function cancelTicket(token: string, opts?: RequestOptions): Promise<Ticket | undefined> {
  return apiRequest<Ticket | undefined>('POST', `/public/tickets/${encodeURIComponent(token)}/cancel`, {}, opts);
}

/** GET /public/tickets/:token from the browser (e.g. polling check-in state on the ticket page). */
export function fetchTicket(token: string, opts?: RequestOptions): Promise<Ticket> {
  return apiRequest<Ticket>('GET', `/public/tickets/${encodeURIComponent(token)}`, undefined, opts);
}

/* ------------------------------------------------------------------ contact */

export function sendContact(input: ContactInput, opts?: RequestOptions): Promise<{ ok: true } | undefined> {
  return apiRequest('POST', '/public/contact', input, opts);
}

/* ------------------------------------------------------------------ live */

/** POST /public/events/:id/heartbeat. Swallows errors: a missed heartbeat is not worth a toast. */
export async function heartbeat(eventId: string, viewerId: string): Promise<void> {
  try {
    await apiRequest('POST', `/public/events/${encodeURIComponent(eventId)}/heartbeat`, { viewerId }, { keepalive: true });
  } catch {
    /* ignore */
  }
}

/** POST /public/events/:id/reactions. Throws ApiError (429 when rate limited). */
export function react(eventId: string, kind: ReactionKind, opts?: RequestOptions): Promise<unknown> {
  return apiRequest('POST', `/public/events/${encodeURIComponent(eventId)}/reactions`, { kind }, opts);
}

/** Stable anonymous viewer id for heartbeats (sessionStorage, falls back to memory). */
let memoryViewerId: string | null = null;
export function getViewerId(): string {
  const make = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    const existing = sessionStorage.getItem('zemi:viewer');
    if (existing) return existing;
    const id = make();
    sessionStorage.setItem('zemi:viewer', id);
    return id;
  } catch {
    memoryViewerId ??= make();
    return memoryViewerId;
  }
}

/** Public URLs for a ticket's assets on the API origin. */
export const ticketUrls = (token: string) => ({
  qrSvg: publicApiUrl(`/api/v1/public/tickets/${encodeURIComponent(token)}/qr.svg`),
  qrPng: publicApiUrl(`/api/v1/public/tickets/${encodeURIComponent(token)}/qr.png`),
  calendar: publicApiUrl(`/api/v1/public/tickets/${encodeURIComponent(token)}/calendar.ics`),
});

export const eventUrls = (eventId: string) => ({
  calendar: publicApiUrl(`/api/v1/public/events/${encodeURIComponent(eventId)}/calendar.ics`),
  live: publicApiUrl(`/api/v1/public/events/${encodeURIComponent(eventId)}/live`),
  hls: publicApiUrl(`/api/v1/public/live/${encodeURIComponent(eventId)}/index.m3u8`),
});
