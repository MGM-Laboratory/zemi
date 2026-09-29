import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv as parseDotEnv } from 'node:util';
import { z } from 'zod';

/**
 * Environment contract for the API. Parsed once at boot (see `loadConfig`), fails fast with a
 * readable list of problems. Empty strings are treated as "not set" so `RESEND_API_KEY=` works.
 */

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const str = () => z.preprocess(blank, z.string());
const optStr = () => z.preprocess(blank, z.string().optional());
const bool = (fallback: boolean) =>
  z.preprocess(blank, z.stringbool({ truthy: ['true', '1', 'yes', 'on'], falsy: ['false', '0', 'no', 'off'] }).default(fallback));
const int = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess(blank, z.coerce.number().int().min(min).max(max).default(fallback));
const httpUrl = () =>
  z.preprocess(
    blank,
    z
      .url({ protocol: /^https?$/, error: 'must be an http(s) URL' })
      .transform((u) => u.replace(/\/+$/, '')),
  );
const optHttpUrl = () => z.preprocess(blank, httpUrl().optional());

export const envSchema = z
  .object({
    NODE_ENV: z.preprocess(blank, z.enum(['development', 'test', 'production']).default('development')),
    PORT: int(4000, 1, 65_535),
    HOST: z.preprocess(blank, z.string().default('::')),
    /** Express `trust proxy` setting: true, false, a hop count, or a comma list of subnets. */
    TRUST_PROXY: z.preprocess(blank, z.string().default('true')),
    /**
     * Header that carries the real client IP (rate limits, audit, sessions). Railway's edge sets
     * `X-Real-IP` to the caller's address, which a client can't forge the way it can prepend to
     * `X-Forwarded-For`. `none` falls back to Express `req.ip` (TRUST_PROXY rules).
     */
    CLIENT_IP_HEADER: z.preprocess(
      blank,
      z
        .string()
        .regex(/^(none|[A-Za-z0-9-]{1,64})$/, 'must be a header name like x-real-ip, or none')
        .transform((v) => v.toLowerCase())
        .default('x-real-ip'),
    ),

    WEB_ORIGIN: httpUrl(),
    /** Extra allowed CORS origins (comma separated), e.g. preview deployments. */
    CORS_ORIGINS: optStr(),

    DATABASE_URL: z.preprocess(
      blank,
      z.string({ error: 'is required' }).regex(/^postgres(ql)?:\/\//, 'must start with postgres://'),
    ),
    DATABASE_POOL_MAX: int(10, 1, 100),
    MIGRATE_ON_BOOT: bool(true),

    SUPERADMIN_PASSPHRASE: z.preprocess(blank, z.string({ error: 'is required' }).min(12, 'must be at least 12 characters')),
    APP_SECRET: z.preprocess(blank, z.string({ error: 'is required' }).min(32, 'must be at least 32 characters')),

    PUBLIC_API_URL: httpUrl(),
    PUBLIC_WEB_URL: httpUrl(),

    S3_ENDPOINT: optHttpUrl(),
    S3_REGION: z.preprocess(blank, z.string().default('us-east-1')),
    S3_BUCKET: str(),
    S3_ACCESS_KEY_ID: str(),
    S3_SECRET_ACCESS_KEY: str(),
    S3_FORCE_PATH_STYLE: bool(false),
    S3_AUTO_CREATE_BUCKET: bool(false),

    RESEND_API_KEY: optStr(),
    TURNSTILE_SECRET_KEY: optStr(),
    MAIL_FROM: z.preprocess(blank, z.string().default('Zemi <no-reply@labmgm.org>')),
    MAIL_REPLY_TO: optStr(),
    /** Where rendered emails go when RESEND_API_KEY is empty. Defaults to apps/api/.mail-outbox. */
    MAIL_OUTBOX_DIR: optStr(),

    MEDIA_INTERNAL_SECRET: z.preprocess(blank, z.string({ error: 'is required' }).min(8, 'must be at least 8 characters')),
    MEDIA_HLS_URL: httpUrl(),
    MEDIA_API_URL: httpUrl(),
    RTMP_PUBLIC_URL: str(),

    WEB_REVALIDATE_URL: optHttpUrl(),
    REVALIDATE_SECRET: optStr(),

    FFMPEG_PATH: z.preprocess(blank, z.string().default('ffmpeg')),
    FFPROBE_PATH: z.preprocess(blank, z.string().default('ffprobe')),

    /** Max multipart upload size in bytes (default 4 GiB). */
    UPLOAD_MAX_BYTES: int(4 * 1024 ** 3, 1024),
    /** Start pg-boss workers in this process. */
    JOBS_ENABLED: bool(true),
    /** Serve Swagger UI at /api/docs. Defaults to on outside production. */
    SWAGGER: z.preprocess(blank, z.stringbool().optional()),
  })
  .superRefine((env, ctx) => {
    if (env.WEB_REVALIDATE_URL && !env.REVALIDATE_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['REVALIDATE_SECRET'], message: 'is required when WEB_REVALIDATE_URL is set' });
    }
    if (env.NODE_ENV === 'production') {
      if (/dev|change-?me|example/i.test(env.SUPERADMIN_PASSPHRASE)) {
        ctx.addIssue({ code: 'custom', path: ['SUPERADMIN_PASSPHRASE'], message: 'looks like a dev value, set a real one in production' });
      }
      if (/dev|change-?me|example/i.test(env.APP_SECRET)) {
        ctx.addIssue({ code: 'custom', path: ['APP_SECRET'], message: 'looks like a dev value, set a real one in production' });
      }
      // The documented local defaults must never reach production.
      if (env.MEDIA_INTERNAL_SECRET === 'dev-media-secret') {
        ctx.addIssue({ code: 'custom', path: ['MEDIA_INTERNAL_SECRET'], message: 'is the dev value, set a real one in production' });
      }
      if (env.REVALIDATE_SECRET === 'dev-revalidate') {
        ctx.addIssue({ code: 'custom', path: ['REVALIDATE_SECRET'], message: 'is the dev value, set a real one in production' });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid API configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Parse an env object. Throws ConfigError listing every problem at once. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => {
    const key = i.path.join('.') || '(root)';
    const msg = i.code === 'invalid_type' && source[key] === undefined ? 'is required' : i.message;
    return `${key} ${msg}`;
  });
  throw new ConfigError(problems);
}

/** apps/api/.env, resolved from this file so it works from src/ and dist/ and any cwd. */
export const DEFAULT_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

/**
 * Load `apps/api/.env` into process.env without overriding variables that are already set
 * (Railway injects real env vars; the file only exists locally).
 */
export function loadDotEnv(file = DEFAULT_ENV_FILE): void {
  if (!existsSync(file)) return;
  const values = parseDotEnv(readFileSync(file, 'utf8')) as Record<string, string>;
  for (const [k, v] of Object.entries(values)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
