import { Inject, Injectable } from '@nestjs/common';
import {
  normalizePolicy,
  type AdminCreateInput,
  type AdminSummary,
  type AdminUpdateInput,
  type AuditEntry,
  type Paginated,
  type Principal,
  type SessionSummary,
} from '@zemi/shared';
import { and, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { notFound } from '../../common/errors.js';
import { pageToLimitOffset, paginated, searchPattern } from '../../common/pagination.js';
import { PassphraseService } from '../../auth/passphrase.service.js';
import { adminBlockReason, SessionService } from '../../auth/session.service.js';
import { DB, type Db } from '../../db/client.js';
import { admins, auditLogs, sessions } from '../../db/schema.js';
import { AuditService, toAuditEntry } from '../audit/audit.service.js';

type AdminRow = typeof admins.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

export interface Ctx {
  principal: Principal;
  ip: string | null;
  sessionId?: string;
}

export interface AuditQuery {
  actor?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  page: number;
  pageSize: number;
}

function status(row: AdminRow, now = new Date()): AdminSummary['status'] {
  return adminBlockReason(row, now) ?? 'active';
}

export function toSessionSummary(s: SessionRow, currentId?: string): SessionSummary {
  return {
    id: s.id,
    principalType: s.principalType,
    adminId: s.adminId ?? null,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    ip: s.ip ?? null,
    userAgent: s.userAgent ?? null,
    current: s.id === currentId,
  };
}

/** Superadmin-only management of normal admins, their sessions, and the audit log. */
@Injectable()
export class AdminsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly passphrases: PassphraseService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  private async activeSessionCounts(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ adminId: sessions.adminId, n: count() })
      .from(sessions)
      .where(and(inArray(sessions.adminId, ids), this.sessions.activeCondition()))
      .groupBy(sessions.adminId);
    return new Map(rows.map((r) => [r.adminId!, r.n]));
  }

  toSummary(row: AdminRow, activeSessions = 0): AdminSummary {
    return {
      id: row.id,
      name: row.name,
      note: row.note ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      disabledAt: row.disabledAt?.toISOString() ?? null,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      status: status(row),
      policy: normalizePolicy(row.policy),
      activeSessions,
    };
  }

  async list(q: { search?: string; status?: AdminSummary['status']; page: number; pageSize: number }): Promise<Paginated<AdminSummary>> {
    const where: SQL[] = [];
    const pattern = searchPattern(q.search);
    if (pattern) where.push(or(ilike(admins.name, pattern), ilike(admins.note, pattern))!);
    const cond = where.length ? and(...where) : undefined;
    let rows = await this.db.select().from(admins).where(cond).orderBy(desc(admins.createdAt));
    if (q.status) rows = rows.filter((r) => status(r) === q.status);
    const { limit, offset } = pageToLimitOffset(q);
    const page = rows.slice(offset, offset + limit);
    const counts = await this.activeSessionCounts(page.map((r) => r.id));
    return paginated(
      page.map((r) => this.toSummary(r, counts.get(r.id) ?? 0)),
      rows.length,
      q,
    );
  }

  async findRow(id: string): Promise<AdminRow> {
    const [row] = await this.db.select().from(admins).where(eq(admins.id, id)).limit(1);
    if (!row) throw notFound("We couldn't find that admin.");
    return row;
  }

  async get(id: string): Promise<AdminSummary> {
    const row = await this.findRow(id);
    const counts = await this.activeSessionCounts([id]);
    return this.toSummary(row, counts.get(id) ?? 0);
  }

  async create(input: AdminCreateInput, ctx: Ctx): Promise<AdminSummary> {
    await this.passphrases.assertAvailable(input.passphrase);
    const secret = await this.passphrases.prepare(input.passphrase);
    const policy = normalizePolicy(input.policy);
    const [row] = await this.db
      .insert(admins)
      .values({
        name: input.name.trim(),
        note: input.note?.trim() || null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        policy,
        createdBy: ctx.principal.id,
        ...secret,
      })
      .returning();
    await this.audit.log({
      principal: ctx.principal,
      action: 'admin.create',
      resourceType: 'admin',
      resourceId: row.id,
      summary: `Added admin "${row.name}"`,
      meta: { policy, expiresAt: input.expiresAt ?? null },
      ip: ctx.ip,
    });
    return this.toSummary(row, 0);
  }

  async update(id: string, input: AdminUpdateInput, ctx: Ctx): Promise<AdminSummary> {
    const before = await this.findRow(id);
    const set: Partial<typeof admins.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name.trim();
    if (input.note !== undefined) set.note = input.note?.trim() || null;
    if (input.expiresAt !== undefined) set.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (input.disabled !== undefined) set.disabledAt = input.disabled ? (before.disabledAt ?? new Date()) : null;
    if (input.policy !== undefined) set.policy = normalizePolicy(input.policy);
    if (!Object.keys(set).length) return this.get(id);

    const [row] = await this.db.update(admins).set(set).where(eq(admins.id, id)).returning();
    let revoked = 0;
    if (adminBlockReason(row)) revoked = await this.sessions.revokeAllForAdmin(id);

    const changes: string[] = [];
    if (set.name !== undefined && set.name !== before.name) changes.push(`renamed to "${set.name}"`);
    if (input.disabled === true && !before.disabledAt) changes.push('switched off');
    if (input.disabled === false && before.disabledAt) changes.push('switched back on');
    if (input.policy !== undefined) changes.push('permissions changed');
    if (input.expiresAt !== undefined) changes.push(input.expiresAt ? `access until ${input.expiresAt}` : 'no end date');
    if (input.note !== undefined) changes.push('note edited');
    await this.audit.log({
      principal: ctx.principal,
      action: input.disabled === true ? 'admin.disable' : input.disabled === false && before.disabledAt ? 'admin.enable' : 'admin.update',
      resourceType: 'admin',
      resourceId: id,
      summary: `Admin "${row.name}": ${changes.join(', ') || 'updated'}`,
      meta: { fields: Object.keys(set), revokedSessions: revoked, ...(input.policy ? { policy: set.policy } : {}) },
      ip: ctx.ip,
    });
    return this.get(id);
  }

  async remove(id: string, ctx: Ctx): Promise<void> {
    const row = await this.findRow(id);
    const revoked = await this.sessions.revokeAllForAdmin(id);
    await this.db.delete(admins).where(eq(admins.id, id));
    await this.audit.log({
      principal: ctx.principal,
      action: 'admin.delete',
      resourceType: 'admin',
      resourceId: id,
      summary: `Removed admin "${row.name}"`,
      meta: { revokedSessions: revoked },
      ip: ctx.ip,
    });
  }

  /** Set a new passphrase. Old sessions end, so the person signs in again with the new one. */
  async setPassphrase(id: string, passphrase: string, ctx: Ctx): Promise<void> {
    const row = await this.findRow(id);
    await this.passphrases.assertAvailable(passphrase, id);
    const secret = await this.passphrases.prepare(passphrase);
    await this.db.update(admins).set(secret).where(eq(admins.id, id));
    const revoked = await this.sessions.revokeAllForAdmin(id);
    await this.audit.log({
      principal: ctx.principal,
      action: 'admin.passphrase',
      resourceType: 'admin',
      resourceId: id,
      summary: `Set a new passphrase for "${row.name}"`,
      meta: { revokedSessions: revoked },
      ip: ctx.ip,
    });
  }

  /** A fresh themed passphrase that nobody uses yet. */
  async generatePassphrase(): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const p = this.passphrases.generate();
      try {
        await this.passphrases.assertAvailable(p);
        return p;
      } catch {
        /* astronomically unlikely, try again */
      }
    }
    return `${this.passphrases.generate()}-${Math.floor(Math.random() * 90 + 10)}`;
  }

  /** Live sessions of an admin (`'superadmin'` lists the superadmin's own sessions). */
  async listSessions(adminId: string, currentSessionId?: string): Promise<SessionSummary[]> {
    const owner = adminId === 'superadmin' ? and(eq(sessions.principalType, 'superadmin'), isNull(sessions.adminId)) : eq(sessions.adminId, adminId);
    if (adminId !== 'superadmin') await this.findRow(adminId);
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(owner, this.sessions.activeCondition()))
      .orderBy(desc(sessions.lastSeenAt))
      .limit(200);
    return rows.map((s) => toSessionSummary(s, currentSessionId));
  }

  async revokeSession(id: string, ctx: Ctx): Promise<void> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!row) throw notFound("We couldn't find that session.");
    await this.sessions.revoke(id);
    let who = 'Superadmin';
    if (row.adminId) {
      const [a] = await this.db.select({ name: admins.name }).from(admins).where(eq(admins.id, row.adminId)).limit(1);
      who = a?.name ?? 'an admin';
    }
    await this.audit.log({
      principal: ctx.principal,
      action: 'session.revoke',
      resourceType: 'session',
      resourceId: id,
      summary: `Signed out a session of ${who}`,
      meta: { adminId: row.adminId, ip: row.ip, userAgent: row.userAgent },
      ip: ctx.ip,
    });
  }

  async auditLog(q: AuditQuery): Promise<Paginated<AuditEntry>> {
    const where: SQL[] = [];
    if (q.actor) {
      const pattern = searchPattern(q.actor)!;
      where.push(or(eq(auditLogs.actorId, q.actor), ilike(auditLogs.actorName, pattern))!);
    }
    if (q.resourceType) where.push(eq(auditLogs.resourceType, q.resourceType));
    if (q.resourceId) where.push(eq(auditLogs.resourceId, q.resourceId));
    if (q.action) where.push(q.action.endsWith('.') || !q.action.includes('.') ? ilike(auditLogs.action, `${q.action.replace(/\.$/, '')}.%`) : eq(auditLogs.action, q.action));
    const cond = where.length ? and(...where) : undefined;
    const { limit, offset } = pageToLimitOffset(q);
    const [rows, [total]] = await Promise.all([
      this.db.select().from(auditLogs).where(cond).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset),
      this.db.select({ n: count() }).from(auditLogs).where(cond),
    ]);
    return paginated(rows.map(toAuditEntry), total?.n ?? 0, q);
  }
}
