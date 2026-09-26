import { Body, Injectable, Param, Query, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { validationError } from './errors.js';

/** Turn zod issues into the `details` payload and a friendly one-line message. */
export function describeZodError(
  error: z.ZodError,
  opts: { bareValue?: boolean } = {},
): { message: string; details: z.core.$ZodIssue[] } {
  const first = error.issues[0];
  if (!first) return { message: 'Some fields need another look.', details: [] };
  const path = first.path.map(String).join('.');
  let message = 'Some fields need another look.';
  if (error.issues.length === 1 && path) message = `${path}: ${first.message}`;
  // A single route param (`:id`, `:slug`) has no path: its schema's own message ("That id looks off.") is the best copy.
  else if (error.issues.length === 1 && opts.bareValue) message = first.message;
  return { message, details: error.issues };
}

// eslint-disable-next-line no-control-regex
const NUL = /\u0000/g;

/**
 * Input with every NUL byte (\u0000) removed from its strings, in nested plain objects and arrays
 * too. Postgres can't store NUL in text or jsonb (22021 / 22P05), so without this a search like
 * `?search=a%00b` would be a 500. Other values (Dates, class instances, files) pass through as is.
 * Returns the same reference when nothing changed.
 */
export function stripNul<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return (value.includes('\u0000') ? value.replace(NUL, '') : value) as T;
  if (depth > 64 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const list = value as unknown[];
    let out: unknown[] | null = null;
    list.forEach((item, i) => {
      const next = stripNul(item, depth + 1);
      if (next !== item) (out ??= [...list])[i] = next;
    });
    return (out ?? value) as T;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return value;
  let out: Record<string, unknown> | null = null;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = key.includes('\u0000') ? key.replace(NUL, '') : key;
    const next = stripNul(item, depth + 1);
    if (next !== item || cleanKey !== key) {
      out ??= { ...(value as Record<string, unknown>) };
      if (cleanKey !== key) delete out[key];
      out[cleanKey] = next;
    }
  }
  return (out ?? value) as T;
}

/**
 * Validate and transform input with a zod schema (usually one from `@zemi/shared`).
 * Throws 400 `{ error: { code: 'validation', message, details: issues } }`.
 *
 *   @Post() create(@Body(new ZodPipe(eventCreateInput)) body: EventCreateInput) {}
 *
 * Prefer the shorthands `@ZodBody(schema)`, `@ZodQuery(schema)` and `@ZodParam('id', idSchema)`.
 */
@Injectable()
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  /** `bareValue`: the input is one value (a route param), so a pathless issue message is shown as is. */
  constructor(
    private readonly schema: S,
    private readonly opts: { bareValue?: boolean } = {},
  ) {}

  transform(value: unknown): z.output<S> {
    const parsed = this.schema.safeParse(stripNul(value));
    if (parsed.success) return parsed.data;
    const { message, details } = describeZodError(parsed.error, this.opts);
    throw validationError(message, details);
  }
}

/** Parse with a schema outside of a controller, throwing the same 400 as ZodPipe. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  return new ZodPipe(schema).transform(value);
}

/** `@ZodBody(schema) body: z.infer<typeof schema>` */
export const ZodBody = (schema: z.ZodType) => Body(new ZodPipe(schema));
/** `@ZodQuery(schema) query: z.infer<typeof schema>` (validates the whole query object). */
export const ZodQuery = (schema: z.ZodType) => Query(new ZodPipe(schema));
/** `@ZodParam('id', idSchema) id: string` */
export const ZodParam = (name: string, schema: z.ZodType) => Param(name, new ZodPipe(schema, { bareValue: true }));

/** `@UuidParam() id: string` validates `:id` as a uuid (400 instead of a Postgres cast error). */
export const UuidParam = (name = 'id') => Param(name, new ZodPipe(z.uuid({ error: 'That id looks off.' }), { bareValue: true }));
