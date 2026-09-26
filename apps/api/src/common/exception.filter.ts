import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, codeForStatus, messageForStatus } from './errors.js';
import { describeZodError } from './zod.pipe.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Postgres error codes we translate into friendly 4xx responses. */
const PG_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  '23505': { status: 409, code: 'conflict', message: 'That already exists. Try a different value.' },
  '23503': { status: 409, code: 'conflict', message: 'That is linked to something that is missing or still in use.' },
  '23502': { status: 400, code: 'validation', message: 'A required field is missing.' },
  '22P02': { status: 400, code: 'validation', message: 'One of the values has the wrong format.' },
  // A NUL byte (\u0000) in text, or in JSON stored as jsonb (22P05). ZodPipe strips NULs, this catches the rest.
  '22021': { status: 400, code: 'validation', message: "One of the values has a character we can't store. Try retyping it." },
  '22P05': { status: 400, code: 'validation', message: "One of the values has a character we can't store. Try retyping it." },
  '22003': { status: 400, code: 'validation', message: 'One of the numbers is too big.' },
  '22001': { status: 400, code: 'validation', message: 'One of the values is too long.' },
  '22007': { status: 400, code: 'validation', message: 'One of the dates has the wrong format.' },
  '22008': { status: 400, code: 'validation', message: 'One of the dates is out of range.' },
};

/** Walk `cause` chains (drizzle wraps driver errors in DrizzleQueryError). */
function findPgError(err: unknown): { code: string; constraint_name?: string; detail?: string } | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const c = cur as { code?: unknown; name?: unknown; cause?: unknown };
    if (typeof c.code === 'string' && /^[0-9A-Z]{5}$/.test(c.code) && (c.name === 'PostgresError' || PG_ERRORS[c.code])) {
      return cur as { code: string };
    }
    cur = c.cause;
  }
  return null;
}

/**
 * Turns anything thrown into the SPEC error shape `{ error: { code, message, details? } }`.
 * 5xx errors are logged with their stack; 4xx are not (they are the client's problem).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, body, headers } = this.toResponse(exception);

    if (status >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`${req.method} ${req.originalUrl} -> ${status}: ${err.message}`, err.stack);
    }

    if (res.headersSent) {
      // Streaming responses (SSE, media) can fail midway. All we can do is end the socket.
      if (!res.writableEnded) res.destroy();
      return;
    }
    if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(status);
    // Media responses may have set range headers before failing (416 keeps `bytes */size`).
    if (status !== 416) res.removeHeader('Content-Range');
    res.removeHeader('Content-Length');
    res.removeHeader('Content-Disposition');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody; headers?: Record<string, string> } {
    if (exception instanceof AppError) {
      return { status: exception.getStatus(), body: exception.getResponse() as ErrorBody, headers: exception.headers };
    }

    if (exception instanceof ZodError) {
      const { message, details } = describeZodError(exception);
      return { status: 400, body: { error: { code: 'validation', message, details } } };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (raw && typeof raw === 'object' && 'error' in raw && typeof (raw as ErrorBody).error === 'object') {
        return { status, body: raw as ErrorBody };
      }
      // Nest built-ins: keep our friendly copy, but surface Nest's text for 4xx as details.
      const nestMessage =
        typeof raw === 'string' ? raw : ((raw as { message?: unknown } | null)?.message ?? exception.message);
      const friendly = this.friendlyNestMessage(status, nestMessage);
      return {
        status,
        body: {
          error: {
            code: codeForStatus(status),
            message: friendly,
            ...(status < 500 && nestMessage && nestMessage !== friendly ? { details: { reason: nestMessage } } : {}),
          },
        },
      };
    }

    // Body parser errors (bad JSON, body too large) reach us as plain errors with a status.
    const e = exception as { status?: unknown; statusCode?: unknown; type?: unknown; message?: unknown } | null;
    const status = typeof e?.status === 'number' ? e.status : typeof e?.statusCode === 'number' ? e.statusCode : null;
    if (status && status >= 400 && status < 500) {
      let message = messageForStatus(status);
      if (e?.type === 'entity.parse.failed') message = "That JSON doesn't parse. Check the request body.";
      if (e?.type === 'entity.too.large') message = 'That request body is too big.';
      return { status, body: { error: { code: status === 400 ? 'bad_request' : codeForStatus(status), message } } };
    }

    const pg = findPgError(exception);
    if (pg && PG_ERRORS[pg.code]) {
      const m = PG_ERRORS[pg.code];
      return {
        status: m.status,
        body: {
          error: {
            code: m.code,
            message: m.message,
            ...(pg.constraint_name ? { details: { constraint: pg.constraint_name } } : {}),
          },
        },
      };
    }

    return { status: 500, body: { error: { code: 'internal', message: messageForStatus(500) } } };
  }

  private friendlyNestMessage(status: number, nestMessage: unknown): string {
    const text = Array.isArray(nestMessage) ? nestMessage.join(', ') : typeof nestMessage === 'string' ? nestMessage : '';
    if (status === 404 && /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/.test(text)) return "There's nothing at this address.";
    if (status === 413 || /too large/i.test(text)) return messageForStatus(413);
    if (status === 400 && /Unexpected field/i.test(text)) return 'We got a file field we did not expect. Send it as "file".';
    if (status === 400 && /JSON/i.test(text)) return "That JSON doesn't parse. Check the request body.";
    return messageForStatus(status);
  }
}
