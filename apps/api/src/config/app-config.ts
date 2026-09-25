import { loadDotEnv, parseEnv, type Env } from './env.js';

/**
 * Typed, validated configuration. Inject it anywhere:
 *
 *   constructor(private readonly config: AppConfig) {}
 *   this.config.env.PUBLIC_API_URL
 *
 * Derived helpers live here so every module agrees on them (cookie flags, CORS origins, ...).
 */
export class AppConfig {
  readonly env: Readonly<Env>;

  constructor(env: Env) {
    this.env = Object.freeze({ ...env });
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  /** Origins allowed to call the API with credentials. */
  get corsOrigins(): string[] {
    const extra = (this.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    return Array.from(new Set([this.env.WEB_ORIGIN, ...extra]));
  }

  get swaggerEnabled(): boolean {
    return this.env.SWAGGER ?? !this.isProduction;
  }

  get emailProvider(): 'resend' | 'outbox' {
    return this.env.RESEND_API_KEY ? 'resend' : 'outbox';
  }

  /** Express `trust proxy` value parsed from TRUST_PROXY. */
  get trustProxy(): boolean | number | string {
    const raw = this.env.TRUST_PROXY.trim();
    if (/^(true|yes|on)$/i.test(raw)) return true;
    if (/^(false|no|off)$/i.test(raw)) return false;
    if (/^\d+$/.test(raw)) return Number(raw);
    return raw;
  }

  /** Session cookie `Secure` flag. */
  get cookieSecure(): boolean {
    return this.isProduction || this.env.PUBLIC_WEB_URL.startsWith('https://');
  }

  /**
   * Absolute public URL for a bucket key served by `/media/*`.
   * `rev` is appended as `?v=` so re-processed files bust the immutable cache while keeping the key.
   */
  mediaUrl(key: string, rev?: string | null): string {
    const path = key.split('/').map(encodeURIComponent).join('/');
    return `${this.env.PUBLIC_API_URL}/media/${path}${rev ? `?v=${encodeURIComponent(rev)}` : ''}`;
  }
}

let cached: AppConfig | undefined;

/**
 * Load `.env` (local only), validate, and memoize. Call once in `main.ts` before Nest boots so a
 * bad config fails before anything else happens.
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  if (cached && source === process.env) return cached;
  if (source === process.env) loadDotEnv();
  const config = new AppConfig(parseEnv(source));
  if (source === process.env) cached = config;
  return config;
}
