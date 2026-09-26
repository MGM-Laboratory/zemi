import { Body, Controller, Get, HttpCode, Inject, Logger, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { loginInput, normalizePolicy, SESSION_COOKIE, type LoginInput, type Me, type Policy, type Principal } from '@zemi/shared';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { AppError, unsupportedMedia } from '../common/errors.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { clientIp, clientUserAgent, type RequestAuth, type ZemiRequest } from '../common/request.js';
import { parseOrThrow } from '../common/zod.pipe.js';
import { DB, type Db } from '../db/client.js';
import { admins } from '../db/schema.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { CurrentAuth, Public } from './decorators.js';
import { PassphraseService } from './passphrase.service.js';
import {
  adminBlockReason,
  adminPrincipal,
  SessionService,
  SUPERADMIN_POLICY,
  SUPERADMIN_PRINCIPAL,
  type SessionRow,
} from './session.service.js';

/** Per IP: 8 attempts per 10 minutes. Successful sign-ins are refunded, failures stay counted. */
export const LOGIN_RATE = { limit: 8, windowMs: 10 * 60_000 } as const;
/**
 * Failed sign-ins from every IP together. Past this, each failure waits LOGIN_SLOW_FAIL_DELAY_MS
 * instead of FAIL_DELAY_MS. Never a hard lockout: that would let anyone lock the superadmin out.
 */
export const LOGIN_GLOBAL_FAIL_RATE = { limit: 50, windowMs: 10 * 60_000 } as const;
export const LOGIN_GLOBAL_FAIL_KEY = 'login-fail:all';
const FAIL_DELAY_MS = 400;
export const LOGIN_SLOW_FAIL_DELAY_MS = 4_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toMe(principal: Principal, policy: Policy, session: Pick<SessionRow, 'id' | 'expiresAt' | 'createdAt'>): Me {
  return {
    principal,
    policy,
    session: { id: session.id, expiresAt: session.expiresAt.toISOString(), createdAt: session.createdAt.toISOString() },
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly passphrases: PassphraseService,
    private readonly sessions: SessionService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  /**
   * POST /api/v1/auth/login { passphrase } -> Me, sets the zemi_session cookie.
   * JSON only (415 otherwise): a cross-site HTML form can't send `application/json`, and a
   * cross-site fetch that does needs a CORS preflight we refuse. That stops login CSRF, where
   * another site signs your browser into its own account.
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() raw: unknown, @Req() req: ZemiRequest, @Res({ passthrough: true }) res: Response): Promise<Me> {
    if (!req.is('application/json')) {
      throw unsupportedMedia('Sign in from the Zemi login page.', { details: { expected: 'application/json' } });
    }
    const body: LoginInput = parseOrThrow(loginInput, raw);
    const ip = clientIp(req);
    const userAgent = clientUserAgent(req);
    const rateKey = `login:${ip ?? 'unknown'}`;
    // Counted up front, so a burst of parallel guesses can't slip past the limit while argon2 runs.
    this.rateLimit.consume(rateKey, LOGIN_RATE, 'Too many tries. Take a breather and try again in a few minutes.');

    const fail = async () => {
      const global = this.rateLimit.hit(LOGIN_GLOBAL_FAIL_KEY, LOGIN_GLOBAL_FAIL_RATE);
      if (global.allowed) {
        await this.audit.log({
          principal: { kind: 'public', name: 'Unknown visitor' },
          action: 'auth.login-failed',
          summary: 'Sign-in failed: the passphrase matched nobody',
          meta: { userAgent },
          ip,
        });
      } else if (global.count === LOGIN_GLOBAL_FAIL_RATE.limit + 1) {
        // One entry per window instead of one per guess, so a flood can't flood the audit log too.
        this.logger.warn(`More than ${LOGIN_GLOBAL_FAIL_RATE.limit} failed sign-ins in 10 minutes, slowing every failure down`);
        await this.audit.log({
          principal: 'system',
          action: 'auth.login-throttled',
          summary: `More than ${LOGIN_GLOBAL_FAIL_RATE.limit} failed sign-ins in 10 minutes. Failed tries now wait longer.`,
          meta: { windowMin: LOGIN_GLOBAL_FAIL_RATE.windowMs / 60_000, lastUserAgent: userAgent },
          ip,
        });
      }
      await sleep((global.allowed ? FAIL_DELAY_MS : LOGIN_SLOW_FAIL_DELAY_MS) + Math.floor(Math.random() * 100));
      return new AppError(401, 'invalid_passphrase', "That passphrase didn't open the door. Check for typos and try again.");
    };

    const passphrase = this.passphrases.normalize(body.passphrase);
    if (!passphrase) throw await fail();

    let principal: Principal;
    let policy: Policy;
    if (this.passphrases.isSuperadmin(passphrase)) {
      principal = SUPERADMIN_PRINCIPAL;
      policy = SUPERADMIN_POLICY;
    } else {
      const [admin] = await this.db
        .select()
        .from(admins)
        .where(eq(admins.passphraseLookup, this.passphrases.lookup(passphrase)))
        .limit(1);
      if (!admin || !(await this.passphrases.verify(admin.passphraseHash, passphrase))) throw await fail();
      const blocked = adminBlockReason(admin);
      if (blocked) {
        await sleep(FAIL_DELAY_MS);
        await this.audit.log({
          principal: adminPrincipal(admin),
          action: 'auth.login-blocked',
          resourceType: 'admin',
          resourceId: admin.id,
          summary: `Sign-in refused: account ${blocked}`,
          ip,
        });
        if (blocked === 'disabled') {
          throw new AppError(403, 'admin_disabled', "This passphrase was switched off. Ask the superadmin if that's a surprise.");
        }
        throw new AppError(403, 'admin_expired', 'Your access has ended. Ask the superadmin to extend it.', {
          details: { expiresAt: admin.expiresAt?.toISOString() ?? null },
        });
      }
      principal = adminPrincipal(admin);
      policy = normalizePolicy(admin.policy);
      await this.db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));
    }

    // Only this attempt is given back. Earlier failures from this IP stay counted, so knowing one
    // working passphrase doesn't buy unlimited guesses at the others.
    this.rateLimit.refund(rateKey);
    const { token, session } = await this.sessions.create({ principal, ip, userAgent });
    this.sessions.setCookie(res, token);
    await this.audit.log({
      principal,
      action: 'auth.login',
      resourceType: principal.kind === 'admin' ? 'admin' : null,
      resourceId: principal.kind === 'admin' ? principal.id : null,
      summary: `${principal.name} signed in`,
      meta: { sessionId: session.id, userAgent },
      ip,
    });
    // Opportunistic cleanup of long-dead sessions.
    if (Math.random() < 0.05) void this.sessions.prune().catch(() => undefined);
    return toMe(principal, policy, session);
  }

  /** POST /api/v1/auth/logout: revokes the current session and clears the cookie. */
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentAuth() auth: RequestAuth, @Req() req: ZemiRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(auth.session.id);
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (token) await this.sessions.revokeByToken(token);
    this.sessions.clearCookie(res);
    await this.audit.log({
      principal: auth.principal,
      action: 'auth.logout',
      summary: `${auth.principal.name} signed out`,
      meta: { sessionId: auth.session.id },
      ip: clientIp(req),
    });
    return { ok: true };
  }

  /** GET /api/v1/auth/me -> { principal, policy, session } */
  @Get('me')
  me(@CurrentAuth() auth: RequestAuth): Me {
    return toMe(auth.principal, auth.policy, auth.session);
  }
}
