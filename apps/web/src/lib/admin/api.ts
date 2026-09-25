import { CSRF_HEADER, type ApiErrorBody } from '@zemi/shared';

/**
 * Browser-side client for the Zemi admin API.
 *
 * Every call goes to the same-origin `/api/v1/*` rewrite, so the httpOnly `zemi_session`
 * cookie rides along automatically. Non-GET requests carry the CSRF header the API expects.
 */

export type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;
export type QueryParams = Record<string, QueryValue>;
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface AdminFetchOptions {
  method?: HttpMethod;
  /** Appended as a query string. `undefined`, `null` and `''` are skipped. Arrays repeat the key. */
  query?: QueryParams;
  /** Plain values are sent as JSON. `FormData`, `Blob` and `URLSearchParams` are sent as-is. */
  body?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
  /**
   * When the API answers 401, send the browser to /admin/login?next=<here>. Default true.
   * The login form turns this off so a wrong passphrase stays on the page.
   */
  redirectOn401?: boolean;
}

export interface ZodLikeIssue {
  path?: Array<string | number>;
  message?: string;
  code?: string;
}

/** Error thrown by `adminFetch` for any non-2xx response or network failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  /** Field path (dot-joined, like `speakers.0.talkTitle`) to the first message for that field. */
  readonly fieldErrors: Record<string, string>;
  /** Seconds until retrying makes sense (429), from `Retry-After` or `details.retryAfter*`. */
  readonly retryAfterSec: number | null;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    retryAfterSec?: number | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.fieldErrors = extractFieldErrors(init.details);
    this.retryAfterSec = init.retryAfterSec ?? extractRetryAfter(init.details);
  }

  get isNetwork() {
    return this.status === 0;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isValidation() {
    return this.status === 400 || this.status === 422;
  }
  get isRateLimited() {
    return this.status === 429;
  }
  get hasFieldErrors() {
    return Object.keys(this.fieldErrors).length > 0;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError')
  );
}

/** A friendly sentence for any error, suitable for a toast or an inline message. */
export function errorMessage(err: unknown, fallback = 'Something went sideways. Try again in a moment.'): string {
  if (err instanceof ApiError) {
    if (err.isNetwork) return "We can't reach the server. Check your connection and try again.";
    if (err.isForbidden) return err.message || "You don't have access to that.";
    if (err.isRateLimited) {
      return err.retryAfterSec
        ? `Easy there. Try again in ${formatWait(err.retryAfterSec)}.`
        : 'Easy there. Give it a minute and try again.';
    }
    if (err.status >= 500) return 'The server tripped over something. Try again in a moment.';
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function formatWait(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}:${String(r).padStart(2, '0')} min` : `${m} minute${m === 1 ? '' : 's'}`;
}

function extractFieldErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const take = (path: string, message: unknown) => {
    if (typeof message !== 'string' || !message) return;
    if (!(path in out)) out[path] = message;
  };
  const fromIssues = (issues: unknown) => {
    if (!Array.isArray(issues)) return false;
    for (const raw of issues) {
      const issue = raw as ZodLikeIssue;
      if (!issue || typeof issue !== 'object') continue;
      const path = Array.isArray(issue.path) ? issue.path.map(String).join('.') : '';
      take(path || '_root', issue.message);
    }
    return true;
  };
  if (fromIssues(details)) return out;
  if (details && typeof details === 'object') {
    const d = details as Record<string, unknown>;
    if (fromIssues(d.issues)) return out;
    // zod `flatten()` shape: { fieldErrors: { name: ['msg'] }, formErrors: ['msg'] }
    const fe = (d.fieldErrors ?? d.fields) as Record<string, unknown> | undefined;
    if (fe && typeof fe === 'object') {
      for (const [k, v] of Object.entries(fe)) take(k, Array.isArray(v) ? v[0] : v);
    }
    if (Array.isArray(d.formErrors)) take('_root', d.formErrors[0]);
  }
  return out;
}

function extractRetryAfter(details: unknown): number | null {
  if (!details || typeof details !== 'object') return null;
  const d = details as Record<string, unknown>;
  const sec = d.retryAfterSec ?? d.retryAfterSeconds ?? d.retryAfter;
  if (typeof sec === 'number' && Number.isFinite(sec)) return sec;
  if (typeof d.retryAfterMs === 'number') return Math.ceil(d.retryAfterMs / 1000);
  return null;
}

function parseRetryAfterHeader(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
}

/** `/admin/events` or `/api/v1/admin/events` both resolve to `/api/v1/admin/events`. */
export function apiPath(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean.startsWith('/api/') ? clean : `/api/v1${clean}`;
}

export function buildQuery(query?: QueryParams): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, String(v)));
    else sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Absolute-path URL for links and downloads (exports, PDFs). GET requests need no CSRF header. */
export function adminUrl(path: string, query?: QueryParams): string {
  return `${apiPath(path)}${buildQuery(query)}`;
}

function isRawBody(body: unknown): body is BodyInit {
  return (
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    typeof body === 'string'
  );
}

let redirecting = false;

/**
 * Called by logout: from now on a 401 no longer triggers the "session ended" redirect
 * (the logout navigation is already on its way).
 */
export function markSigningOut() {
  redirecting = true;
}

/** Send the browser to the login page, remembering where we were. */
export function redirectToLogin(reason: 'expired' | 'signed-out' = 'expired') {
  if (typeof window === 'undefined' || redirecting) return;
  const here = window.location.pathname + window.location.search;
  if (window.location.pathname.startsWith('/admin/login')) return;
  redirecting = true;
  const params = new URLSearchParams({ next: here });
  if (reason === 'expired') params.set('reason', 'expired');
  window.location.assign(`/admin/login?${params.toString()}`);
}

/** Build an ApiError out of a failed Response (also used by the XHR uploader). */
export function apiErrorFromBody(status: number, body: unknown, retryAfterHeader: string | null): ApiError {
  const err = (body as Partial<ApiErrorBody> | null)?.error;
  return new ApiError({
    status,
    code: typeof err?.code === 'string' ? err.code : defaultCode(status),
    message: typeof err?.message === 'string' && err.message ? err.message : defaultMessage(status),
    details: err?.details,
    retryAfterSec: parseRetryAfterHeader(retryAfterHeader),
  });
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'unprocessable';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'server_error' : 'error';
  }
}

function defaultMessage(status: number): string {
  switch (status) {
    case 401:
      return 'Your session ended. Log in again to keep going.';
    case 403:
      return "You don't have access to that.";
    case 404:
      return "We couldn't find that. It may have been moved or deleted.";
    case 409:
      return 'Someone else changed this at the same time. Reload and try again.';
    case 429:
      return 'Easy there. Give it a minute and try again.';
    default:
      return status >= 500 ? 'The server tripped over something. Try again in a moment.' : 'That did not work.';
  }
}

/**
 * Call the admin API. Resolves with the parsed JSON body (or `undefined` for 204).
 * Throws `ApiError` on any failure. Aborts propagate as the native AbortError.
 *
 * @example
 * const page = await adminFetch<Paginated<EventAdminRow>>('/admin/events', { query: { search, page } });
 * await adminFetch('/admin/events/' + id, { method: 'PATCH', body: patch });
 */
export async function adminFetch<T = unknown>(path: string, opts: AdminFetchOptions = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers = new Headers(opts.headers);
  headers.set('accept', 'application/json');
  if (method !== 'GET') headers.set(CSRF_HEADER, '1');

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (isRawBody(opts.body)) {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
      headers.set('content-type', 'application/json');
    }
  }

  let res: Response;
  try {
    res = await fetch(`${apiPath(path)}${buildQuery(opts.query)}`, {
      method,
      headers,
      body,
      signal: opts.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiError({ status: 0, code: 'network', message: "We can't reach the server right now." });
  }

  if (res.status === 204) return undefined as T;

  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    if (type.includes('json')) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      data = text;
    }
  }

  if (!res.ok) {
    const error = apiErrorFromBody(res.status, data, res.headers.get('retry-after'));
    if (res.status === 401 && opts.redirectOn401 !== false) redirectToLogin('expired');
    throw error;
  }
  return data as T;
}

/** Shorthands. */
export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) => adminFetch<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => adminFetch<T>(path, { method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => adminFetch<T>(path, { method: 'PUT', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => adminFetch<T>(path, { method: 'PATCH', body: body ?? {} }),
  delete: <T = void>(path: string, query?: QueryParams) => adminFetch<T>(path, { method: 'DELETE', query }),
};
