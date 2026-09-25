import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every error the API returns has the SPEC shape:
 *
 *   { "error": { "code": "not_found", "message": "We couldn't find that event.", "details"?: ... } }
 *
 * Throw `AppError` (or one of the helpers below) from anywhere; the global exception filter turns it
 * into that body. Messages are shown to people, so keep them short and friendly (docs/DESIGN.md voice).
 */
export class AppError extends HttpException {
  readonly code: string;
  readonly details?: unknown;
  /** Extra response headers (e.g. Retry-After). */
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    opts: { details?: unknown; headers?: Record<string, string>; cause?: unknown } = {},
  ) {
    super({ error: { code, message, ...(opts.details !== undefined ? { details: opts.details } : {}) } }, status, {
      cause: opts.cause,
    });
    this.code = code;
    this.details = opts.details;
    this.headers = opts.headers;
  }
}

type Opts = { details?: unknown; headers?: Record<string, string>; cause?: unknown };

export const badRequest = (message = "That request doesn't look right.", opts?: Opts) =>
  new AppError(HttpStatus.BAD_REQUEST, 'bad_request', message, opts);

export const validationError = (message = 'Some fields need another look.', details?: unknown) =>
  new AppError(HttpStatus.BAD_REQUEST, 'validation', message, { details });

export const unauthorized = (message = 'Please sign in first.', opts?: Opts) =>
  new AppError(HttpStatus.UNAUTHORIZED, 'unauthorized', message, opts);

export const forbidden = (message = "You don't have access to that.", opts?: Opts) =>
  new AppError(HttpStatus.FORBIDDEN, 'forbidden', message, opts);

export const notFound = (message = "We couldn't find that.", opts?: Opts) =>
  new AppError(HttpStatus.NOT_FOUND, 'not_found', message, opts);

export const conflict = (message = 'That clashes with something that already exists.', opts?: Opts) =>
  new AppError(HttpStatus.CONFLICT, 'conflict', message, opts);

export const payloadTooLarge = (message = 'That file is too big for us. Try a smaller one.', opts?: Opts) =>
  new AppError(HttpStatus.PAYLOAD_TOO_LARGE, 'too_large', message, opts);

export const unsupportedMedia = (message = "We can't use that kind of file here.", opts?: Opts) =>
  new AppError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'unsupported_media', message, opts);

export const unprocessable = (message = "We can't do that right now.", opts?: Opts) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'unprocessable', message, opts);

export const tooManyRequests = (retryAfterSec: number, message = 'Easy there. Try again in a bit.', opts?: Opts) =>
  new AppError(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', message, {
    ...opts,
    details: opts?.details ?? { retryAfterSec },
    headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSec))), ...opts?.headers },
  });

export const internalError = (message = 'Something broke on our side. Try again in a moment.', opts?: Opts) =>
  new AppError(HttpStatus.INTERNAL_SERVER_ERROR, 'internal', message, opts);

export const serviceUnavailable = (message = "That service isn't answering right now.", opts?: Opts) =>
  new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'unavailable', message, opts);

/** Assert helper: `ensureFound(row, 'We couldn't find that event.')` returns the row or throws 404. */
export function ensureFound<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) throw notFound(message);
  return value;
}

/** Default `code` for a bare HTTP status (used for HttpExceptions thrown by Nest itself). */
export function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 405:
      return 'method_not_allowed';
    case 409:
      return 'conflict';
    case 413:
      return 'too_large';
    case 415:
      return 'unsupported_media';
    case 416:
      return 'range_not_satisfiable';
    case 422:
      return 'unprocessable';
    case 429:
      return 'rate_limited';
    case 503:
      return 'unavailable';
    default:
      return status >= 500 ? 'internal' : 'error';
  }
}

export function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return "That request doesn't look right.";
    case 401:
      return 'Please sign in first.';
    case 403:
      return "You don't have access to that.";
    case 404:
      return "We couldn't find that.";
    case 405:
      return "That method isn't allowed here.";
    case 409:
      return 'That clashes with something that already exists.';
    case 413:
      return 'That is too big for us. Try something smaller.';
    case 415:
      return "We can't use that kind of file here.";
    case 416:
      return "That byte range doesn't exist in this file.";
    case 422:
      return "We can't do that right now.";
    case 429:
      return 'Easy there. Try again in a bit.';
    case 503:
      return "That service isn't answering right now.";
    default:
      return status >= 500 ? 'Something broke on our side. Try again in a moment.' : 'Something went wrong.';
  }
}
