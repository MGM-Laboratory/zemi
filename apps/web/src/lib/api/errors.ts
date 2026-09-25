import type { ApiErrorBody } from '@zemi/shared';

/** Field path -> first message, ready for react-hook-form `setError` or inline hints. */
export type FieldErrors = Record<string, string>;

/**
 * Error thrown by the public client helpers. Mirrors the API error body
 * `{ error: { code, message, details? } }` plus the HTTP status.
 *
 * status 0 means the request never reached the API (offline, DNS, CORS, timeout).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True for 400/422 with something we can show next to inputs. */
  get isValidation(): boolean {
    return (this.status === 400 || this.status === 422) && Object.keys(this.fieldErrors()).length > 0;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /**
   * Field errors from `details`. Tolerant of the shapes we might get back:
   * - zod issues: `[{ path: ['email'], message }]` or `{ issues: [...] }`
   * - a flat map: `{ email: 'That email looks off.' }` or `{ email: ['...'] }`
   * - zod flatten: `{ fieldErrors: { email: ['...'] } }`
   */
  fieldErrors(): FieldErrors {
    return extractFieldErrors(this.details);
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    const err = (body as Partial<ApiErrorBody> | null)?.error;
    if (err && typeof err.message === 'string') {
      return new ApiError(res.status, err.code ?? `http_${res.status}`, err.message, err.details);
    }
    return new ApiError(res.status, `http_${res.status}`, defaultMessage(res.status));
  }

  static network(cause?: unknown): ApiError {
    const e = new ApiError(0, 'network', "We couldn't reach Zemi. Check your connection and try again.");
    (e as { cause?: unknown }).cause = cause;
    return e;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** A friendly sentence for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Something went sideways. Give it another go?';
}

function defaultMessage(status: number): string {
  if (status === 404) return "We couldn't find that one.";
  if (status === 409) return 'That already exists.';
  if (status === 429) return 'Whoa, that was a lot of clicks. Give it a minute and try again.';
  if (status >= 500) return 'Our side tripped over something. Try again in a bit.';
  if (status === 401 || status === 403) return "You don't have access to that.";
  return 'That did not work. Mind checking and trying again?';
}

function pathKey(path: unknown): string | null {
  if (Array.isArray(path)) return path.map(String).join('.') || null;
  if (typeof path === 'string') return path || null;
  return null;
}

export function extractFieldErrors(details: unknown): FieldErrors {
  const out: FieldErrors = {};
  if (!details) return out;

  const takeIssues = (issues: unknown[]) => {
    for (const issue of issues) {
      if (!issue || typeof issue !== 'object') continue;
      const { path, message } = issue as { path?: unknown; message?: unknown };
      const key = pathKey(path);
      if (key && typeof message === 'string' && !(key in out)) out[key] = message;
    }
  };

  if (Array.isArray(details)) {
    takeIssues(details);
    return out;
  }
  if (typeof details !== 'object') return out;

  const obj = details as Record<string, unknown>;
  if (Array.isArray(obj.issues)) {
    takeIssues(obj.issues);
    return out;
  }
  const source =
    obj.fieldErrors && typeof obj.fieldErrors === 'object' ? (obj.fieldErrors as Record<string, unknown>) : obj;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value) && typeof value[0] === 'string') out[key] = value[0];
  }
  return out;
}
