import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ACTIONS_BY_TYPE,
  CAPABILITIES,
  createAbility,
  normalizePolicy,
  RESOURCE_TYPES,
  SESSION_COOKIE,
  type Policy,
  type Principal,
} from '@zemi/shared';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { CookieOptions, Response } from 'express';
import { randomToken, sha256 } from '../common/crypto.js';
import type { RequestAuth } from '../common/request.js';
import { AppConfig } from '../config/app-config.js';
import { DB, type Db, type DbOrTx } from '../db/client.js';
import { admins, sessions } from '../db/schema.js';

export const SESSION_IDLE_MS = 12 * 3600_000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 3600_000;
/** Don't write `last_seen_at` more often than this. */
const TOUCH_EVERY_MS = 60_000;

export type SessionRow = typeof sessions.$inferSelect;
export type AdminRow = typeof admins.$inferSelect;

export const SUPERADMIN_PRINCIPAL: Principal = { kind: 'superadmin', id: 'superadmin', name: 'Superadmin' };

/** The superadmin can do everything; this policy is only what `/auth/me` shows for them. */
export const SUPERADMIN_POLICY: Policy = {
  capabilities: [...CAPABILITIES],
  grants: RESOURCE_TYPES.map((type) => ({ type, id: '*', actions: [...ACTIONS_BY_TYPE[type]] })),
};

export function adminPrincipal(row: Pick<AdminRow, 'id' | 'name' | 'expiresAt'>): Principal {
  return { kind: 'admin', id: row.id, name: row.name, expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null };
}

/** Why an admin can't sign in (or keep a session), or null when they can. */
export function adminBlockReason(row: Pick<AdminRow, 'disabledAt' | 'expiresAt'>, now = new Date()): 'disabled' | 'expired' | null {
  if (row.disabledAt) return 'disabled';
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return null;
}

/** Pure session validity check (idle 12h, absolute 7d, revoked). */
export function sessionIsValid(s: Pick<SessionRow, 'revokedAt' | 'expiresAt' | 'lastSeenAt'>, now = Date.now()): boolean {
  if (s.revokedAt) return false;
  if (s.expiresAt.getTime() <= now) return false;
  if (now - s.lastSeenAt.getTime() > SESSION_IDLE_MS) return false;
  return true;
}

/**
 * Cookie sessions. The browser holds a random 32-byte token in `zemi_session`; the DB stores only
 * its sha256. Every request re-reads the session and the admin row, so revocation, expiry,
 * disabling and policy edits take effect on the very next request.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger('Sessions');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: AppConfig,
  ) {}

  cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.config.cookieSecure, path: '/' };
  }

  setCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge: SESSION_ABSOLUTE_MS });
  }

  clearCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  async create(input: { principal: Principal; ip?: string | null; userAgent?: string | null }): Promise<{ token: string; session: SessionRow }> {
    const token = randomToken(32);
    const now = new Date();
    const [session] = await this.db
      .insert(sessions)
      .values({
        tokenHash: sha256(token),
        principalType: input.principal.kind,
        adminId: input.principal.kind === 'admin' ? input.principal.id : null,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      })
      .returning();
    return { token, session: session };
  }

  /**
   * Resolve a cookie token into a principal + ability with the admin's CURRENT policy.
   * Returns null for unknown, revoked, idle, expired sessions, and for disabled or expired admins
   * (whose sessions are revoked on the spot).
   */
  async authenticate(token: string | null | undefined): Promise<RequestAuth | null> {
    if (!token || token.length < 20 || token.length > 200) return null;
    const [row] = await this.db
      .select({ session: sessions, admin: admins })
      .from(sessions)
      .leftJoin(admins, eq(sessions.adminId, admins.id))
      .where(eq(sessions.tokenHash, sha256(token)))
      .limit(1);
    if (!row) return null;
    const { session, admin } = row;
    const now = Date.now();
    if (!sessionIsValid(session, now)) return null;

    let principal: Principal;
    let policy: Policy;
    if (session.principalType === 'superadmin') {
      principal = SUPERADMIN_PRINCIPAL;
      policy = SUPERADMIN_POLICY;
    } else {
      if (!admin) {
        await this.revoke(session.id);
        return null;
      }
      if (adminBlockReason(admin, new Date(now))) {
        await this.revokeAllForAdmin(admin.id);
        return null;
      }
      principal = adminPrincipal(admin);
      policy = normalizePolicy(admin.policy);
    }

    if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      const lastSeenAt = new Date(now);
      session.lastSeenAt = lastSeenAt;
      this.db
        .update(sessions)
        .set({ lastSeenAt })
        .where(eq(sessions.id, session.id))
        .catch((err: unknown) => this.logger.warn(`touch failed: ${(err as Error).message}`));
    }

    return {
      principal,
      policy,
      ability: createAbility(principal, policy),
      session: { id: session.id, createdAt: session.createdAt, expiresAt: session.expiresAt, lastSeenAt: session.lastSeenAt },
    };
  }

  /** Alias of `authenticate` (validate a cookie token). */
  validate(token: string | null | undefined): Promise<RequestAuth | null> {
    return this.authenticate(token);
  }

  /** Mark a session as used now (authenticate already does this at most once a minute). */
  async touch(sessionId: string, db: DbOrTx = this.db): Promise<void> {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async revoke(sessionId: string, db: DbOrTx = this.db): Promise<boolean> {
    const rows = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  async revokeByToken(token: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt)));
  }

  /** Revoke every live session of an admin (disable, delete, passphrase change). Returns how many. */
  async revokeAllForAdmin(adminId: string, db: DbOrTx = this.db): Promise<number> {
    const rows = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.adminId, adminId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return rows.length;
  }

  /** SQL condition for "session still usable now" (for listings and counts). */
  activeCondition(now = new Date()) {
    return and(
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, now),
      gt(sessions.lastSeenAt, new Date(now.getTime() - SESSION_IDLE_MS)),
    );
  }

  /** Delete long-dead sessions (called opportunistically). */
  async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600_000);
    await this.db
      .delete(sessions)
      .where(or(lt(sessions.expiresAt, cutoff), and(sql`${sessions.revokedAt} is not null`, lt(sessions.revokedAt, cutoff))));
  }
}
