/**
 * Shared helpers for the Zemi e2e suite: config, API clients, data factories with automatic cleanup,
 * console guards, the dev mail outbox, ffmpeg helpers, and the extended `test` with fixtures.
 *
 * House rules for tests:
 * - Every record a test creates goes through `data.*` (or `cleanup.add`) so it is removed even when the
 *   test fails. Names carry `e2e` plus a time-stamped uid, and global-setup sweeps leftovers from crashed runs.
 * - Events are created with explicit dates (far-future Fridays by default) and `number: null`, so they never
 *   become "the next Friday" or take a Zemi number on the real site.
 * - Rate limited endpoints (login, sign-up, contact, ticket cancel) are keyed on the client IP. Each test gets
 *   its own fake `X-Real-IP` (198.18.0.0/15, the benchmarking range) so reruns and teammates never collide.
 *   Browser pages get it only on those same-origin calls (`isolateRateLimits`), never on cross-origin media.
 */
import { expect, test as base, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AdminSummary,
  EventAdmin,
  EventAdminRow,
  Paginated,
  Policy,
  RegisterResult,
  SpeakerAdmin,
  StreamConfig,
  StreamSessionAdmin,
  Ticket,
} from '../packages/shared/dist/index';

/* ------------------------------------------------------------------ config */

export const WEB_URL = (process.env.E2E_WEB_URL ?? 'http://localhost:3300').replace(/\/$/, '');
/** The API's public origin: media, QR images, HLS and SSE are served from here, like in the app. */
export const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:4400').replace(/\/$/, '');
export const SUPERADMIN_PASSPHRASE = process.env.E2E_SUPERADMIN_PASSPHRASE ?? 'zemi-superadmin-dev-passphrase';
export const RTMP_URL = (process.env.E2E_RTMP_URL ?? 'rtmp://localhost:51935/live').replace(/\/$/, '');
export const REPO_ROOT = path.resolve(__dirname, '..');
export const OUTBOX_DIR = process.env.E2E_OUTBOX_DIR ?? path.join(REPO_ROOT, 'apps/api/.mail-outbox');
export const FFMPEG = process.env.E2E_FFMPEG ?? 'ffmpeg';

/* ------------------------------------------------------------------ ids and time */

/** 12 lowercase base36 chars: 8 of Date.now() (sortable, lets global-setup age leftovers) + 4 random. */
export function uid(): string {
  const rand = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${Date.now().toString(36)}${rand}`;
}

/** Reads the creation time back out of a string that contains a `uid()`. */
export function uidTime(s: string): number | null {
  const m = s.match(/(?:^|[^0-9a-z])([0-9a-z]{12})(?:[^0-9a-z]|$)/);
  if (!m) return null;
  const t = parseInt(m[1]!.slice(0, 8), 36);
  return Number.isFinite(t) && t > 1.6e12 && t < 4e12 ? t : null;
}

/** A random address in 198.18.0.0/15 (RFC 2544), used as X-Real-IP to isolate rate-limit buckets. */
export function fakeIp(): string {
  const r = () => 1 + Math.floor(Math.random() * 253);
  return `198.${18 + Math.floor(Math.random() * 2)}.${r()}.${r()}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MINUTE = 60_000;

/** Friday 13:15 to 15:15 WIB (06:15 to 08:15 UTC), `weeks` Fridays after the first Friday of 2031. */
export function farFutureFriday(weeks = Math.floor(Math.random() * 400)): { startsAt: string; endsAt: string } {
  const d = new Date(Date.UTC(2031, 0, 1, 6, 15));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return { startsAt: d.toISOString(), endsAt: new Date(d.getTime() + 120 * MINUTE).toISOString() };
}

/** Times relative to now, rounded to the minute. */
export function relativeWindow(startMin: number, endMin: number): { startsAt: string; endsAt: string } {
  const now = Math.floor(Date.now() / MINUTE) * MINUTE;
  return { startsAt: new Date(now + startMin * MINUTE).toISOString(), endsAt: new Date(now + endMin * MINUTE).toISOString() };
}

/* ------------------------------------------------------------------ polling */

/** Throw this from a `waitFor` callback to stop polling at once (a terminal state, not "not yet"). */
export class StopWaiting extends Error {}

/**
 * Polls `fn` until it returns a truthy value (which is returned). Errors thrown by `fn` count as "not yet",
 * except `StopWaiting`, which ends the wait immediately. Prefer `expect.poll` for plain assertions; this is
 * for values you need afterwards.
 */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  { timeout = 30_000, interval = 1_000, message = 'condition' }: { timeout?: number; interval?: number; message?: string } = {},
): Promise<T> {
  const deadline = Date.now() + timeout;
  let lastError: unknown = null;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      if (err instanceof StopWaiting) throw err;
      lastError = err;
    }
    if (Date.now() > deadline) {
      const why = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
      throw new Error(`Timed out after ${timeout} ms waiting for ${message}.${why}`);
    }
    await sleep(interval);
  }
}

/* ------------------------------------------------------------------ API client */

type Query = Record<string, string | number | boolean | undefined | null>;
export interface CallOptions {
  body?: unknown;
  query?: Query;
  /** Accepted statuses. Default: any 2xx. */
  ok?: number[];
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${method} ${path} answered ${status}: ${body.slice(0, 600)}`);
  }
  get code(): string | undefined {
    try {
      return (JSON.parse(this.body) as { error?: { code?: string } }).error?.code;
    } catch {
      return undefined;
    }
  }
}

const toApiPath = (p: string) => (p.startsWith('/api/') || /^https?:/.test(p) ? p : `/api/v1${p.startsWith('/') ? p : `/${p}`}`);

/** A 5xx that came from the proxy (API restarting under nest --watch, or the web restarting), not from the API. */
async function isInfraHiccup(res: APIResponse): Promise<boolean> {
  if ([502, 503, 504].includes(res.status())) return true;
  if (res.status() !== 500) return false;
  const text = await res.text().catch(() => '');
  try {
    return !(JSON.parse(text) as { error?: unknown }).error;
  } catch {
    return true; // Next's plain "Internal Server Error" when the rewrite target is down.
  }
}

const NETWORK_ERROR = /ECONNREFUSED|ECONNRESET|socket hang up|EPIPE|other side closed|ETIMEDOUT/i;

/**
 * JSON client for `/api/v1` through the web origin (the same path the browser uses, so the admin cookie
 * lives on the web origin). Non-GET calls send `x-zemi-csrf: 1`. Retries infrastructure hiccups (servers
 * reloading) for up to ~40 s, never real API answers.
 */
export class Api {
  constructor(readonly ctx: APIRequestContext) {}

  async raw(method: string, p: string, { body, query, headers }: Omit<CallOptions, 'ok'> = {}): Promise<APIResponse> {
    const url = toApiPath(p);
    const params: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) params[k] = v;
    const deadline = Date.now() + 40_000;
    for (;;) {
      try {
        const res = await this.ctx.fetch(url, {
          method,
          params,
          data: body === undefined ? undefined : body,
          headers: { ...(method === 'GET' || method === 'HEAD' ? {} : { 'x-zemi-csrf': '1' }), ...headers },
          failOnStatusCode: false,
          maxRedirects: 0,
          timeout: 60_000,
        });
        if (Date.now() < deadline && (await isInfraHiccup(res))) {
          await sleep(2_000);
          continue;
        }
        return res;
      } catch (err) {
        if (Date.now() < deadline && err instanceof Error && NETWORK_ERROR.test(err.message)) {
          await sleep(2_000);
          continue;
        }
        throw err;
      }
    }
  }

  async call<T = unknown>(method: string, p: string, opts: CallOptions = {}): Promise<T> {
    const res = await this.raw(method, p, opts);
    const text = await res.text();
    const accepted = opts.ok ? opts.ok.includes(res.status()) : res.ok();
    if (!accepted) throw new ApiError(method, p, res.status(), text);
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  get<T = unknown>(p: string, query?: Query, opts: Omit<CallOptions, 'query'> = {}) {
    return this.call<T>('GET', p, { ...opts, query });
  }
  post<T = unknown>(p: string, body?: unknown, opts: Omit<CallOptions, 'body'> = {}) {
    return this.call<T>('POST', p, { ...opts, body: body ?? {} });
  }
  patch<T = unknown>(p: string, body: unknown, opts: Omit<CallOptions, 'body'> = {}) {
    return this.call<T>('PATCH', p, { ...opts, body });
  }
  put<T = unknown>(p: string, body: unknown, opts: Omit<CallOptions, 'body'> = {}) {
    return this.call<T>('PUT', p, { ...opts, body });
  }
  del<T = unknown>(p: string, opts: CallOptions = {}) {
    return this.call<T>('DELETE', p, opts);
  }

  /** POST /auth/login. Sets the zemi_session cookie on this context. */
  async login(passphrase: string) {
    return this.post<{ principal: { kind: string; name: string } }>('/auth/login', { passphrase });
  }

  async logout() {
    await this.raw('POST', '/auth/logout', { body: {} }).catch(() => undefined);
  }
}

/** A fresh API request context on the web origin with its own fake client IP. */
export async function newApiContext(
  playwright: { request: { newContext: (o: Record<string, unknown>) => Promise<APIRequestContext> } },
  ip = fakeIp(),
  storageState?: Awaited<ReturnType<APIRequestContext['storageState']>>,
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: WEB_URL,
    extraHTTPHeaders: { 'x-real-ip': ip },
    ignoreHTTPSErrors: true,
    ...(storageState ? { storageState } : {}),
  });
}

/* ------------------------------------------------------------------ cleanup */

export class Cleanup {
  private tasks: Array<{ label: string; run: () => Promise<unknown> }> = [];
  add(label: string, run: () => Promise<unknown>) {
    this.tasks.push({ label, run });
  }
  /** Runs every task newest first. Failures are collected and reported, they never stop the others. */
  async runAll(): Promise<string[]> {
    const failures: string[] = [];
    while (this.tasks.length) {
      const t = this.tasks.pop()!;
      try {
        await t.run();
      } catch (err) {
        failures.push(`${t.label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return failures;
  }
}

/* ------------------------------------------------------------------ data factories */

export interface EventSeed {
  /** Word that goes into the title and slug, like "reg" gives "E2E reg <uid>" and "e2e-reg-<uid>". */
  kind?: string;
  visibility?: 'draft' | 'published' | 'unlisted';
  startsAt?: string;
  endsAt?: string;
  capacity?: number | null;
  mode?: 'hybrid' | 'offline' | 'online';
  extra?: Record<string, unknown>;
}

export interface Person {
  firstName: string;
  fullName: string;
  email: string;
  phone: string;
}

/** A made-up person with a unique, reserved-domain email. */
export function person(kind = 'guest'): Person {
  const id = uid();
  const firstName = ['Kirana', 'Bayu', 'Laras', 'Dimas', 'Sekar', 'Raka'][Math.floor(Math.random() * 6)]!;
  return {
    firstName,
    fullName: `${firstName} E2e ${id}`,
    email: `e2e+${kind}-${id}@example.com`,
    phone: '0812 3456 7890',
  };
}

/** Delete that tolerates "already gone". */
async function quietDelete(api: Api, p: string) {
  await api.del(p, { ok: [200, 204, 404] });
}

/** Removes an event and, first, its recordings (event delete leaves recording assets in the bucket). */
export async function deleteEventDeep(api: Api, eventId: string) {
  const recs = await api.get<StreamSessionAdmin[]>(`/admin/events/${eventId}/recordings`, undefined, { ok: [200, 403, 404] }).catch(() => []);
  for (const r of Array.isArray(recs) ? recs : []) {
    // 409 while it is still recording or processing: wait a bit, then give up and let global-setup retry later.
    await waitFor(
      async () => {
        const res = await api.raw('DELETE', `/admin/recordings/${r.id}`);
        return [200, 204, 404].includes(res.status());
      },
      { timeout: 60_000, interval: 3_000, message: `recording ${r.id} to be deletable` },
    ).catch(() => undefined);
  }
  await quietDelete(api, `/admin/events/${eventId}`);
}

export class DataFactory {
  private readonly mailTo = new Set<string>();
  private readonly startedAt = Date.now();

  constructor(
    readonly api: Api,
    readonly publicApi: Api,
    readonly cleanup: Cleanup,
  ) {}

  /** A made-up person whose dev-outbox mails are removed after the test (keep them with E2E_KEEP_MAIL=1). */
  person(kind = 'guest'): Person {
    const p = person(kind);
    this.trackMail(p.email);
    return p;
  }

  trackMail(email: string) {
    if (!this.mailTo.size && !process.env.E2E_KEEP_MAIL) {
      this.cleanup.add('outbox mail', () => removeOutboxMail(this.mailTo, this.startedAt));
    }
    this.mailTo.add(email.toLowerCase());
  }

  /** An event with explicit dates (a far-future Friday by default), `number: null`, cleaned up afterwards. */
  async event(seed: EventSeed = {}): Promise<EventAdmin> {
    const id = uid();
    const kind = seed.kind ?? 'event';
    const times = seed.startsAt && seed.endsAt ? { startsAt: seed.startsAt, endsAt: seed.endsAt } : farFutureFriday();
    const ev = await this.api.post<EventAdmin>('/admin/events', {
      title: `E2E ${kind} ${id}`,
      slug: `e2e-${kind}-${id}`,
      number: null,
      summary: 'Made by the e2e suite. It tidies up after itself.',
      visibility: seed.visibility ?? 'draft',
      mode: seed.mode ?? 'hybrid',
      registrationOpen: true,
      capacity: seed.capacity === undefined ? 60 : seed.capacity,
      ...times,
      ...seed.extra,
    });
    this.cleanup.add(`event ${ev.slug}`, () => deleteEventDeep(this.api, ev.id));
    return ev;
  }

  async speaker(kind = 'speaker'): Promise<SpeakerAdmin> {
    const id = uid();
    const sp = await this.api.post<SpeakerAdmin>('/admin/speakers', {
      fullName: `E2E ${kind} ${id}`,
      slug: `e2e-${kind}-${id}`,
      headline: 'Test speaker from the e2e suite',
      visibility: 'published',
    });
    this.cleanup.add(`speaker ${sp.slug}`, () => quietDelete(this.api, `/admin/speakers/${sp.id}`));
    return sp;
  }

  /** A normal admin with a known passphrase. */
  async adminUser(kind: string, policy: Policy): Promise<{ admin: AdminSummary; passphrase: string }> {
    const id = uid();
    const passphrase = `e2e-${kind}-${id}-passphrase`;
    const admin = await this.api.post<AdminSummary>('/admin/admins', {
      name: `E2E ${kind} ${id}`,
      note: 'Temporary admin from the e2e suite.',
      passphrase,
      policy,
    });
    this.cleanup.add(`admin ${admin.name}`, () => quietDelete(this.api, `/admin/admins/${admin.id}`));
    return { admin, passphrase };
  }

  /** Signs up through the public API (the same call the register form makes). */
  async publicRegistration(eventId: string, who: Person = this.person('reg'), mode: 'in-person' | 'online' = 'in-person'): Promise<{ result: RegisterResult; who: Person }> {
    const result = await this.publicApi.post<RegisterResult>(`/public/events/${eventId}/registrations`, {
      fullName: who.fullName,
      email: who.email,
      phone: who.phone,
      attendanceMode: mode,
    });
    return { result, who };
  }

  /** Pulls a ticket by token (public JSON). */
  ticket(token: string) {
    return this.publicApi.get<Ticket>(`/public/tickets/${token}`);
  }
}

/* ------------------------------------------------------------------ browser helpers */

/** Endpoints whose rate limits key on the client IP. */
export const RATE_LIMITED_PATHS = [
  '/api/v1/auth/login',
  /\/api\/v1\/public\/events\/[^/]+\/registrations$/,
  '/api/v1/public/contact',
  /\/api\/v1\/public\/tickets\/[^/]+\/cancel$/,
] as const;

/**
 * Adds this test's fake X-Real-IP to same-origin calls of rate-limited endpoints only. Context-wide
 * extraHTTPHeaders would also hit cross-origin media/HLS/SSE on the API origin and trigger CORS preflights.
 */
export async function isolateRateLimits(target: Page | BrowserContext, ip: string) {
  await target.route(
    (url) =>
      url.origin === new URL(WEB_URL).origin &&
      RATE_LIMITED_PATHS.some((p) => (typeof p === 'string' ? url.pathname === p : p.test(url.pathname))),
    (route) => route.continue({ headers: { ...route.request().headers(), 'x-real-ip': ip } }),
  );
}

/** Skips the first-visit site loader (it sets data-zemi-seen before paint) so it never covers a click. */
export async function skipSiteLoader(target: Page | BrowserContext) {
  await target.addInitScript(() => {
    try {
      sessionStorage.setItem('zemi:seen', '1');
    } catch {
      /* private mode */
    }
  });
}

/** Dev-only noise that is never an app problem (HMR socket chatter, the React DevTools hint). */
export const DEV_NOISE: RegExp[] = [
  /webpack-hmr|\[HMR\]|\[Fast Refresh\]|hot-update|turbopack-hmr|__nextjs_original-stack-frame/i,
  /WebSocket connection to 'ws:\/\/localhost:\d+\/_next/i,
  /Download the React DevTools/i,
];

/**
 * Errors the Next/Turbopack dev runtime throws when a hot reload lands while a page is still loading
 * (the shared dev server reloads whenever teammates save). They are tolerated ONLY when the same page
 * shows evidence of that: a "[Fast Refresh] rebuilding" / "performing full reload" log, or the web
 * server dropping connections. Without that evidence they count as real errors, because app code
 * calling a router action too early would throw the same thing.
 */
export const HMR_ONLY_NOISE: RegExp[] = [
  /No link element found for chunk/i, // Turbopack dev CSS chunk swap during HMR
  /Router action dispatched before initialization/i, // HMR refresh racing the first hydration
];
const HMR_EVIDENCE = /\[Fast Refresh\] (rebuilding|performing full reload)/i;

function note(type: string, text: string) {
  try {
    test.info().annotations.push({ type, description: text.slice(0, 300) });
  } catch {
    /* outside a test */
  }
}

export interface PageWatch {
  problems: string[];
  /** Connection failures to the web origin itself: the dev server restarted under the test. */
  infra: string[];
  /** Asserts no uncaught page errors and no console errors (beyond dev noise and `allow`). */
  expectClean(label?: string): void;
}

/** What a browser logs when the web dev server goes away mid-load (the watchdog restarts it past 5 GB). */
const SERVER_GONE = /net::ERR_(CONNECTION_REFUSED|INCOMPLETE_CHUNKED_ENCODING|EMPTY_RESPONSE|CONNECTION_RESET)/;

/**
 * Collects uncaught page errors and console errors. `allow` entries match the message text or the
 * console location URL (useful for "Failed to load resource" lines, whose text has no URL).
 *
 * When the web origin itself stops answering during the test, expectClean fails with an explicit
 * "dev server restarted" message (and a `web-restart` annotation) instead of a wall of chunk errors,
 * so the retry and the report say what really happened.
 */
export function watchPage(page: Page, allow: RegExp[] = []): PageWatch {
  const problems: string[] = [];
  const infra: string[] = [];
  const hmrOnly: string[] = [];
  let hmrSeen = false;
  const webOrigin = new URL(WEB_URL).origin;
  const classify = (line: string, text: string): boolean => {
    if (DEV_NOISE.some((r) => r.test(text))) {
      note('dev-noise', text);
      return true;
    }
    if (HMR_ONLY_NOISE.some((r) => r.test(text))) {
      hmrOnly.push(line);
      return true;
    }
    return false;
  };
  page.on('pageerror', (err) => {
    const text = `${err.name}: ${err.message}`;
    const frames = (err.stack ?? '')
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('at '))
      .slice(0, 4)
      .join(' | ');
    const line = `pageerror ${text}${frames ? ` [${frames}]` : ''}`;
    if (classify(line, text)) return;
    if (allow.some((r) => r.test(text))) return;
    problems.push(line);
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (HMR_EVIDENCE.test(text)) hmrSeen = true;
    if (msg.type() !== 'error') return;
    const where = msg.location()?.url ?? '';
    if (SERVER_GONE.test(text) && where.startsWith(webOrigin)) {
      infra.push(`${text} @ ${where}`);
      return;
    }
    const line = `console.error ${text.slice(0, /hydrat/i.test(text) ? 4000 : 500)}${where ? ` @ ${where}` : ''}`;
    if (classify(line, text)) return;
    if (allow.some((r) => r.test(text) || (where && r.test(where)))) return;
    problems.push(line);
  });
  return {
    problems,
    infra,
    expectClean(label = page.url()) {
      if (infra.length) {
        note('web-restart', `${infra.length} failed loads, first: ${infra[0]}`);
        throw new Error(
          `The web dev server stopped answering during this test (${infra.length} failed loads from ${webOrigin}, first: ${infra[0]}). ` +
            'This is the shared dev server restarting, not an app error; the retry reruns it.',
        );
      }
      if (hmrSeen) for (const line of hmrOnly) note('dev-noise', `during a hot reload: ${line}`);
      expect([...problems, ...(hmrSeen ? [] : hmrOnly)], `console or page errors on ${label}`).toEqual([]);
    },
  };
}

/** Copy the app shows when the web cannot reach the API (admin GateError, public ApiUnavailable). */
const API_DOWN_COPY = /We can't reach the Zemi API right now|The schedule is taking a nap\./;

/** Waits until the API health check answers 200 (it restarts under `nest start --watch` when teammates save). */
export async function waitForApiHealthy(timeout = 90_000) {
  await waitFor(
    async () => {
      const res = await fetch(`${API_URL}/api/v1/health`).catch(() => null);
      return res?.status === 200;
    },
    { timeout, interval: 2_000, message: `${API_URL}/api/v1/health to answer 200` },
  );
}

/**
 * page.goto that rides out a dev server restart: connection refused, a proxy 5xx while it boots, or a page
 * rendered with the "can't reach the API" state while the API reloads. Returns the final response.
 * Real answers like 404 are never retried.
 */
export async function gotoStable(page: Page, url: string, { attempts = 4, waitUntil = 'load' as 'load' | 'domcontentloaded' | 'commit' } = {}) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const last = i === attempts - 1;
    try {
      const res = await page.goto(url, { waitUntil });
      if (res && [502, 503, 504].includes(res.status()) && !last) {
        await sleep(5_000);
        continue;
      }
      if (!last && waitUntil !== 'commit' && (await page.getByText(API_DOWN_COPY).count().catch(() => 0)) > 0) {
        try {
          test.info().annotations.push({ type: 'api-restart', description: `${url} rendered the API-down state; waited and reloaded` });
        } catch {
          /* outside a test */
        }
        await waitForApiHealthy();
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET|ERR_ABORTED|NS_ERROR|net::ERR_/i.test(msg) || last) throw err;
      await sleep(5_000);
    }
  }
  throw lastErr;
}

/**
 * Evidence screenshot at a key moment. Does nothing unless E2E_SHOTS_DIR is set; then it writes
 * `<dir>/<test title>-<name>.png` and attaches it to the HTML report.
 */
export async function snap(page: Page, name: string, { fullPage = false } = {}) {
  const dir = process.env.E2E_SHOTS_DIR;
  if (!dir) return;
  const info = test.info();
  const body = await page.screenshot({ fullPage, animations: 'disabled' }).catch(() => null);
  if (!body) return;
  const file = `${info.title.replace(/@\w+\s*/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60)}-${name}.png`;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), body);
  await info.attach(name, { body, contentType: 'image/png' });
}

/** Signs in through the studio login form and waits for the dashboard (or `next`). */
export async function loginThroughForm(page: Page, passphrase: string, next = '/admin') {
  await gotoStable(page, next === '/admin' ? '/admin/login' : `/admin/login?next=${encodeURIComponent(next)}`);
  const field = page.getByRole('textbox', { name: 'Passphrase' });
  await field.fill(passphrase);
  await field.press('Enter');
  await page.waitForURL((u) => u.pathname === next, { timeout: 60_000 });
}

/** The first h1 exists and says something. */
export async function expectH1(page: Page) {
  const h1 = page.locator('h1').first();
  await expect(h1).toBeAttached();
  await expect.poll(async () => ((await h1.textContent()) ?? '').trim().length, { message: 'h1 has text' }).toBeGreaterThan(0);
}

/** page.evaluate that survives a dev-server full reload (HMR) landing in the middle of it. */
export async function evaluateStable<T>(page: Page, fn: () => T): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await page.evaluate(fn);
    } catch (err) {
      if (i >= 3 || !(err instanceof Error) || !/Execution context was destroyed|navigation/i.test(err.message)) throw err;
      await page.waitForLoadState('load').catch(() => undefined);
      await sleep(1_000);
    }
  }
}

/** Page basics every public page should have: a title, a lang, and no sideways scroll. */
export async function expectPageBasics(page: Page) {
  expect((await page.title()).trim().length, 'document title').toBeGreaterThan(0);
  expect(await page.locator('html').getAttribute('lang'), 'html lang').toBeTruthy();
  const overflow = await evaluateStable(page, () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal page overflow in px').toBeLessThanOrEqual(1);
}

/** Waits until an <img> has actually decoded (naturalWidth > 0). */
export async function expectImageLoaded(page: Page, selector: ReturnType<Page['locator']>) {
  await expect(selector).toBeVisible();
  await expect
    .poll(() => selector.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth), {
      message: 'image decoded',
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
}

/* ------------------------------------------------------------------ mail outbox */

export interface OutboxMail {
  file: string;
  json: { to: string[]; subject: string; template: string; eventId?: string; registrationId?: string; text?: string; createdAt?: string };
  html: string;
}

/**
 * Waits for the dev outbox (RESEND_API_KEY empty) to hold a mail for `to`. Matches on the recipient, not on
 * "newest file", because teammates and the other worker write there too.
 */
export async function waitForMail({
  to,
  template,
  since,
  timeout = 30_000,
}: {
  to: string;
  template?: string;
  since: number;
  timeout?: number;
}): Promise<OutboxMail> {
  const want = to.toLowerCase();
  return waitFor(
    async () => {
      if (!existsSync(OUTBOX_DIR)) return null;
      const names = (await readdir(OUTBOX_DIR)).filter((n) => n.endsWith('.json') && (!template || n.includes(template)));
      const fresh: Array<{ name: string; mtime: number }> = [];
      for (const name of names) {
        const s = await stat(path.join(OUTBOX_DIR, name)).catch(() => null);
        if (s && s.mtimeMs >= since - 2_000) fresh.push({ name, mtime: s.mtimeMs });
      }
      fresh.sort((a, b) => b.mtime - a.mtime);
      for (const f of fresh) {
        const json = JSON.parse(await readFile(path.join(OUTBOX_DIR, f.name), 'utf8')) as OutboxMail['json'];
        if (!json.to?.some((t) => t.toLowerCase() === want)) continue;
        if (template && json.template !== template) continue;
        const htmlPath = path.join(OUTBOX_DIR, f.name.replace(/\.json$/, '.html'));
        const html = existsSync(htmlPath) ? await readFile(htmlPath, 'utf8') : '';
        return { file: path.join(OUTBOX_DIR, f.name), json, html };
      }
      return null;
    },
    { timeout, interval: 1_000, message: `an outbox mail to ${to}${template ? ` (${template})` : ''} in ${OUTBOX_DIR}` },
  );
}

/**
 * Deletes outbox mails (json, html and attachments) addressed to any of `emails`, written since `since`.
 * Waits a moment first: some mails (contact replies) are sent after the HTTP answer.
 */
export async function removeOutboxMail(emails: Set<string>, since: number) {
  if (!emails.size || !existsSync(OUTBOX_DIR)) return;
  await sleep(1_500);
  const names = await readdir(OUTBOX_DIR);
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const full = path.join(OUTBOX_DIR, name);
    const s = await stat(full).catch(() => null);
    if (!s || s.mtimeMs < since - 2_000) continue;
    const json = JSON.parse(await readFile(full, 'utf8').catch(() => '{}')) as { to?: string[]; replyTo?: string | null };
    // `replyTo` catches the organizers' copy of a contact message from this person.
    const addresses = [...(json.to ?? []), ...(json.replyTo ? [json.replyTo] : [])].map((t) => t.toLowerCase());
    if (!addresses.some((t) => emails.has(t))) continue;
    const base = name.replace(/\.json$/, '');
    for (const other of names.filter((n) => n === `${base}.json` || n.startsWith(`${base}.`))) {
      await rm(path.join(OUTBOX_DIR, other), { force: true });
    }
  }
}

/* ------------------------------------------------------------------ ffmpeg */

export interface FfmpegRun {
  proc: ChildProcess;
  /** Resolves with the exit code (null when killed). */
  exited: Promise<number | null>;
  stderr: () => string;
  stop: () => Promise<void>;
}

export function runFfmpeg(args: string[]): FfmpegRun {
  const proc = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  proc.stderr?.on('data', (d: Buffer) => {
    err = (err + d.toString()).slice(-4000);
  });
  const exited = new Promise<number | null>((resolve) => {
    proc.on('exit', (code) => resolve(code));
    proc.on('error', (e) => {
      err += `\nspawn failed: ${e.message}`;
      resolve(-1);
    });
  });
  return {
    proc,
    exited,
    stderr: () => err,
    stop: async () => {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGINT');
        const done = await Promise.race([exited.then(() => true), sleep(5_000).then(() => false)]);
        if (!done) proc.kill('SIGKILL');
      }
      await exited;
    },
  };
}

/**
 * OBS-like test push: testsrc2 + sine, H.264 with 2 s keyframes, AAC 48k, FLV over RTMP, in real time.
 * Deliberately light (640x360, ultrafast): when the encoder falls behind the wall clock, MediaMTX logs
 * "detected drift between recording duration and absolute time, resetting" and the recording gets holes,
 * which makes the API wait its full 4 minute hole budget before stitching.
 */
export function pushTestStream(obsStreamKey: string, seconds: number): FfmpegRun {
  return runFfmpeg([
    '-re',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', String(seconds),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-g', '60', '-b:v', '800k',
    '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2',
    '-f', 'flv', `${RTMP_URL}/${obsStreamKey}`,
  ]);
}

/** Turns a still image into a short Y4M clip for Chromium's --use-file-for-fake-video-capture. */
export async function imageToY4m(input: string, output: string, { size = 640, seconds = 3, fps = 10 } = {}) {
  const run = runFfmpeg([
    '-y', '-loop', '1', '-i', input,
    '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p`,
    '-t', String(seconds), '-r', String(fps), '-f', 'yuv4mpegpipe', output,
  ]);
  const code = await run.exited;
  if (code !== 0) throw new Error(`ffmpeg y4m failed (${code}): ${run.stderr()}`);
}

/* ------------------------------------------------------------------ small API readers */

export async function findEvents(api: Api, query: Query): Promise<Paginated<EventAdminRow>> {
  return api.get<Paginated<EventAdminRow>>('/admin/events', { pageSize: 100, ...query });
}

export async function streamConfig(api: Api, eventId: string) {
  return api.get<StreamConfig>(`/admin/events/${eventId}/stream`);
}

/* ------------------------------------------------------------------ fixtures */

type Fixtures = {
  /** This test's fake client IP (X-Real-IP), for rate-limit isolation. */
  clientIp: string;
  /** Superadmin JSON client on the web origin. Logged out at the end. */
  admin: Api;
  /** Anonymous JSON client on the web origin with this test's client IP. */
  publicApi: Api;
  /** LIFO teardown registry; runs even when the test fails. */
  cleanup: Cleanup;
  /** Factories that register their own cleanup. */
  data: DataFactory;
  /** Storage state (cookies) of the superadmin session, for browser contexts. */
  adminState: Awaited<ReturnType<APIRequestContext['storageState']>>;
};

export const test = base.extend<Fixtures>({
  clientIp: async ({}, use) => {
    await use(fakeIp());
  },
  admin: async ({ playwright, clientIp }, use) => {
    const ctx = await newApiContext(playwright, clientIp);
    const api = new Api(ctx);
    await api.login(SUPERADMIN_PASSPHRASE);
    await use(api);
    await api.logout();
    await ctx.dispose();
  },
  publicApi: async ({ playwright, clientIp }, use) => {
    const ctx = await newApiContext(playwright, clientIp);
    await use(new Api(ctx));
    await ctx.dispose();
  },
  cleanup: async ({ admin }, use, testInfo) => {
    void admin; // torn down before `admin`, so tasks can still use the session
    const c = new Cleanup();
    await use(c);
    const failures = await c.runAll();
    if (failures.length) {
      testInfo.annotations.push({ type: 'cleanup-failed', description: failures.join(' | ') });
      console.warn(`[e2e cleanup] ${testInfo.title}: ${failures.join(' | ')}`);
    }
  },
  data: async ({ admin, publicApi, cleanup }, use) => {
    await use(new DataFactory(admin, publicApi, cleanup));
  },
  adminState: async ({ admin }, use) => {
    await use(await admin.ctx.storageState());
  },
});

export { expect };
