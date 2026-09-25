import { Inject, Injectable } from '@nestjs/common';
import {
  maskEmail,
  type AudienceRow,
  type audienceQuery,
  type BroadcastResult,
  type broadcastInput,
  type EmailLogRow,
  type emailLogQuery,
  type Paginated,
} from '@zemi/shared';
import { and, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { AppError, badRequest } from '../../common/errors.js';
import { searchPattern } from '../../common/pagination.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { DB, type Db } from '../../db/client.js';
import { emailLogs, events, registrations } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from './admin-registrations.service.js';
import { sanitizeBroadcastHtml, textOf } from './broadcast-html.js';
import type { EventCtx } from './people-context.service.js';
import { PeopleMailer } from './people-mail.service.js';

type AudienceQuery = z.infer<typeof audienceQuery>;
type BroadcastInput = z.infer<typeof broadcastInput>;
type EmailLogQuery = z.infer<typeof emailLogQuery>;

/** Audience (everyone across events), broadcasts and the per-event email log. */
@Injectable()
export class AudienceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly mailer: PeopleMailer,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Unique people (by email) with an active seat on any event, most recently seen first. */
  async audience(q: AudienceQuery): Promise<Paginated<AudienceRow>> {
    const conds: SQL[] = [eq(registrations.status, 'registered')];
    const p = searchPattern(q.search);
    if (p) conds.push(sql`(${registrations.fullName} ilike ${p} or ${registrations.email} ilike ${p} or ${registrations.phone} ilike ${p})`);
    const where = and(...conds)!;
    const pageSize = Math.min(100, Math.max(1, q.pageSize));
    const page = Math.max(1, q.page);

    const groups = await this.db
      .select({
        email: registrations.email,
        registrations: sql<number>`count(*)`.mapWith(Number),
        attended: sql<number>`count(*) filter (where ${registrations.checkedInAt} is not null)`.mapWith(Number),
        firstSeen: sql<Date>`min(${registrations.createdAt})`.mapWith((v: string | Date) => new Date(v)),
        lastSeen: sql<Date>`max(${registrations.createdAt})`.mapWith((v: string | Date) => new Date(v)),
      })
      .from(registrations)
      .where(where)
      .groupBy(registrations.email)
      .orderBy(desc(sql`max(${registrations.createdAt})`), registrations.email)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: sql<number>`count(distinct ${registrations.email})`.mapWith(Number) })
      .from(registrations)
      .where(where);
    if (!groups.length) return { items: [], total: n, page, pageSize };

    const detail = await this.db
      .select({
        email: registrations.email,
        fullName: registrations.fullName,
        phone: registrations.phone,
        createdAt: registrations.createdAt,
        checkedInAt: registrations.checkedInAt,
        eventId: events.id,
        title: events.title,
        startsAt: events.startsAt,
      })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(
        and(
          eq(registrations.status, 'registered'),
          inArray(
            registrations.email,
            groups.map((g) => g.email),
          ),
        ),
      )
      .orderBy(desc(events.startsAt));
    const byEmail = new Map<string, typeof detail>();
    for (const d of detail) byEmail.set(d.email, [...(byEmail.get(d.email) ?? []), d]);

    const items: AudienceRow[] = groups.map((g) => {
      const regs = byEmail.get(g.email) ?? [];
      const latest = [...regs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return {
        email: g.email,
        fullName: latest[0]?.fullName ?? g.email,
        phone: latest.find((r) => r.phone)?.phone ?? null,
        registrations: g.registrations,
        attended: g.attended,
        firstSeen: g.firstSeen.toISOString(),
        lastSeen: g.lastSeen.toISOString(),
        events: regs.map((r) => ({ id: r.eventId, title: r.title, startsAt: r.startsAt.toISOString(), checkedIn: !!r.checkedInAt })),
      };
    });
    return { items, total: n, page, pageSize };
  }

  /* ------------------------------------------------------------ broadcast */

  async broadcast(event: EventCtx, input: BroadcastInput, actor: Actor): Promise<BroadcastResult> {
    const html = sanitizeBroadcastHtml(input.html);
    if (!textOf(html) && !/<img\s/i.test(html)) {
      throw badRequest('That message is empty once we strip the unsafe bits. Add some text?', {
        details: { issues: [{ path: ['html'], message: 'Write something first.' }] },
      });
    }
    const subject = input.subject.replace(/\s+/g, ' ').trim();
    const eventId = event.row.id;

    if (input.testEmail) {
      const res = await this.mailer.sendUpdateTest(event, input.testEmail, subject, html);
      await this.audit.log({
        principal: actor.principal,
        action: 'event.broadcast-test',
        resourceType: 'event',
        resourceId: eventId,
        summary: `Sent a test of "${subject.slice(0, 80)}" to ${maskEmail(input.testEmail)}`,
        meta: { status: res.status },
        ip: actor.ip,
      });
      return { test: true, audience: input.audience, recipients: 1, sent: res.status === 'sent' ? 1 : 0, logged: res.status === 'logged' ? 1 : 0, failed: res.status === 'failed' ? 1 : 0 };
    }

    // A double click (or an itchy trigger finger) shouldn't email everyone twice.
    const limit = this.rateLimit.hit(`broadcast:${eventId}`, { limit: 3, windowMs: 10 * 60_000 });
    if (!limit.allowed) {
      throw new AppError(429, 'rate_limited', 'That is a lot of broadcasts for one event. Give it a few minutes.', {
        details: { retryAfterSec: limit.retryAfterSec },
        headers: { 'Retry-After': String(limit.retryAfterSec) },
      });
    }

    const conds: SQL[] = [eq(registrations.eventId, eventId), eq(registrations.status, 'registered')];
    if (input.audience === 'in-person') conds.push(eq(registrations.attendanceMode, 'in-person'));
    if (input.audience === 'online') conds.push(eq(registrations.attendanceMode, 'online'));
    if (input.audience === 'checked-in') conds.push(isNotNull(registrations.checkedInAt));
    if (input.audience === 'not-checked-in') conds.push(isNull(registrations.checkedInAt));
    const regs = await this.db
      .select()
      .from(registrations)
      .where(and(...conds))
      .orderBy(registrations.createdAt);

    const counts = await this.mailer.sendUpdate(event, regs, subject, html);
    await this.audit.log({
      principal: actor.principal,
      action: 'event.broadcast',
      resourceType: 'event',
      resourceId: eventId,
      summary: `Emailed "${subject.slice(0, 80)}" to ${counts.recipients} ${counts.recipients === 1 ? 'person' : 'people'} (${input.audience})`,
      meta: { audience: input.audience, ...counts },
      ip: actor.ip,
    });
    return { test: false, audience: input.audience, recipients: counts.recipients, sent: counts.sent, logged: counts.logged, failed: counts.failed };
  }

  /* ------------------------------------------------------------ email log */

  async emailLog(eventId: string, q: EmailLogQuery, fullPii: boolean): Promise<Paginated<EmailLogRow>> {
    const conds: SQL[] = [eq(emailLogs.eventId, eventId)];
    if (q.template) conds.push(eq(emailLogs.template, q.template));
    if (q.status !== 'all') conds.push(eq(emailLogs.status, q.status));
    const where = and(...conds)!;
    const pageSize = Math.min(100, Math.max(1, q.pageSize));
    const page = Math.max(1, q.page);
    const rows = await this.db
      .select()
      .from(emailLogs)
      .where(where)
      .orderBy(desc(emailLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [{ n } = { n: 0 }] = await this.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(emailLogs).where(where);
    return {
      items: rows.map((r) => ({
        id: r.id,
        to: fullPii ? r.to : r.to.split(/,\s*/).map(maskEmail).join(', '),
        template: r.template,
        subject: r.subject,
        status: r.status,
        error: r.error ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total: n,
      page,
      pageSize,
    };
  }
}
