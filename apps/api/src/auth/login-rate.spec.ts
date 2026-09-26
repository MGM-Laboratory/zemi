import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/errors.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { configureClientIp } from '../common/request.js';
import { AuthController, LOGIN_GLOBAL_FAIL_RATE, LOGIN_SLOW_FAIL_DELAY_MS } from './auth.controller.js';

const GOOD = 'friday-coffee-hypothesis-42';

/** AuthController with just enough fakes for the login path (superadmin = the one good passphrase). */
function setup() {
  const rateLimit = new RateLimitService();
  const audits: Array<{ action: string; ip?: string | null; summary: string }> = [];
  const chain = { select: () => chain, from: () => chain, where: () => chain, limit: async () => [] };
  const passphrases = {
    normalize: (p: string) => p.trim(),
    isSuperadmin: (p: string) => p === GOOD,
    lookup: () => 'lookup',
    verify: async () => false,
  };
  const now = new Date();
  const sessions = {
    create: async () => ({ token: 't', session: { id: 's1', createdAt: now, expiresAt: new Date(now.getTime() + 1000) } }),
    setCookie: () => undefined,
    prune: async () => undefined,
  };
  const audit = { log: async (e: { action: string; ip?: string | null; summary: string }) => void audits.push(e) };
  const controller = new AuthController(chain as never, passphrases as never, sessions as never, rateLimit, audit as never);
  return { controller, rateLimit, audits };
}

const request = (ip: string, contentType = 'application/json') =>
  ({
    headers: { 'x-real-ip': ip, 'content-type': contentType, 'user-agent': 'vitest' },
    ip: '127.0.0.1',
    socket: {},
    is: (t: string) => (contentType.startsWith(t) ? t : false),
  }) as never;
const res = {} as never;

/** Run one login attempt to completion (fake timers skip the failure delay), returning the status. */
async function attempt(c: AuthController, ip: string, passphrase: string, contentType?: string): Promise<number> {
  const p = c.login({ passphrase }, request(ip, contentType), res).then(
    () => 200,
    (e: unknown) => (e instanceof AppError ? e.getStatus() : 500),
  );
  await vi.advanceTimersByTimeAsync(LOGIN_SLOW_FAIL_DELAY_MS + 500);
  return p;
}

describe('login rate limits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    configureClientIp('x-real-ip');
  });
  afterEach(() => vi.useRealTimers());

  it('a successful sign-in does not reset the failures before it', async () => {
    const { controller, rateLimit } = setup();
    const ip = '198.18.9.1';
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push(await attempt(controller, ip, `wrong-${i}`));
    statuses.push(await attempt(controller, ip, GOOD));
    for (let i = 0; i < 8; i++) statuses.push(await attempt(controller, ip, `again-${i}`));
    // 7 x 401, the good one, then one more 401 (8 failures in total) and 429 from there on.
    expect(statuses).toEqual([...Array(7).fill(401), 200, 401, ...Array(7).fill(429)]);
    rateLimit.onModuleDestroy();
  });

  it('successes alone never hit the per-IP limit (shared NAT at the venue)', async () => {
    const { controller, rateLimit } = setup();
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) statuses.push(await attempt(controller, '198.18.9.2', GOOD));
    expect(statuses.every((s) => s === 200)).toBe(true);
    rateLimit.onModuleDestroy();
  });

  it('audits failed sign-ins with the IP, and slows everyone down past the global limit without locking anyone out', async () => {
    const { controller, rateLimit, audits } = setup();
    // Spread over many IPs, as a spoofed X-Real-IP would allow.
    for (let i = 0; i < LOGIN_GLOBAL_FAIL_RATE.limit; i++) {
      expect(await attempt(controller, `198.18.10.${i}`, 'nope')).toBe(401);
    }
    const failed = audits.filter((a) => a.action === 'auth.login-failed');
    expect(failed).toHaveLength(LOGIN_GLOBAL_FAIL_RATE.limit);
    expect(failed[0]!.ip).toBe('198.18.10.0');

    // Past the limit: the failure waits the long delay, is summarised once, and is not audited per guess.
    const slow = controller.login({ passphrase: 'nope' }, request('198.18.11.1'), res).catch((e: unknown) => e);
    let settled = false;
    void slow.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(LOGIN_SLOW_FAIL_DELAY_MS);
    expect(((await slow) as AppError).getStatus()).toBe(401);
    expect(await attempt(controller, '198.18.11.2', 'nope')).toBe(401);
    expect(audits.filter((a) => a.action === 'auth.login-throttled')).toHaveLength(1);
    expect(audits.filter((a) => a.action === 'auth.login-failed')).toHaveLength(LOGIN_GLOBAL_FAIL_RATE.limit);

    // The right passphrase still gets in.
    expect(await attempt(controller, '198.18.11.3', GOOD)).toBe(200);
    rateLimit.onModuleDestroy();
  });

  it('refuses anything but JSON before counting the attempt (login CSRF)', async () => {
    const { controller, rateLimit } = setup();
    expect(await attempt(controller, '198.18.9.3', GOOD, 'application/x-www-form-urlencoded')).toBe(415);
    expect(await attempt(controller, '198.18.9.3', GOOD, 'text/plain')).toBe(415);
    expect(rateLimit.peek('login:198.18.9.3', { limit: 8, windowMs: 600_000 }).count).toBe(0);
    rateLimit.onModuleDestroy();
  });
});
