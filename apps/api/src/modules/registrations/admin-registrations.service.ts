import { Inject, Injectable } from '@nestjs/common';
import {
  maskEmail,
  maskPhone,
  type Ability,
  type adminRegistrationInput,
  type BulkRegistrationResult,
  type bulkRegistrationInput,
  type EventAction,
  type Paginated,
  type Principal,
  type RegistrationListQuery,
  type RegistrationRow as RegistrationRowDto,
  type RegistrationStats,
  type registrationUpdateInput,
  type ResendResult,
} from '@zemi/shared';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { assertCan } from '../../auth/permissions.service.js';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../common/errors.js';
import { searchPattern } from '../../common/pagination.js';
import { DB, type Db } from '../../db/client.js';
import { events, registrations } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { CheckinService } from './checkin.service.js';
import { PeopleContext, type EventCtx, type RegistrationRow } from './people-context.service.js';
import { PeopleMailer } from './people-mail.service.js';
import { arrivals, byHour, tally, timeline, topDomains } from './registration-stats.js';
import { normalizeEmail, normalizePhone, shortName } from './registration-rules.js';
import { fieldError, uniqueQrToken, uniqueTicketCode } from './tickets.service.js';

type AdminCreateInput = z.infer<typeof adminRegistrationInput>;
type UpdateInput = z.infer<typeof registrationUpdateInput>;
type BulkInput = z.infer<typeof bulkRegistrationInput>;

export interface Actor {
  principal: Principal;
  ability: Ability;
  ip: string | null;
}

export type ListFilters = Pick<RegistrationListQuery, 'search' | 'status' | 'checkedIn' | 'mode' | 'source' | 'sort'>;

/** Other Zemi events this email has an active seat for (correlated subquery on the outer row). */
const otherEventsSql = sql<number>`(
  select count(distinct r2.event_id) from registrations r2
  where r2.email = "registrations"."email" and r2.event_id <> "registrations"."event_id" and r2.status = 'registered'
)`.mapWith(Number);

export function toRegistrationDto(r: RegistrationRow, otherEvents: number, fullPii = true): RegistrationRowDto {
  return {
    id: r.id,
    fullName: r.fullName,
    email: fullPii ? r.email : maskEmail(r.email),
    phone: fullPii ? r.phone : r.phone ? maskPhone(r.phone) : '',
    attendanceMode: r.attendanceMode,
    ticketCode: r.ticketCode,
    status: r.status,
    source: r.source,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    checkedInBy: r.checkedInBy ?? null,
    checkInMethod: r.checkInMethod ?? null,
    emailStatus: r.emailStatus ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt.toISOString(),
    otherEvents,
  };
}

/** Admin side of registrations (SPEC 7 "Admin"): list, stats, add, edit, delete, resend, bulk. */
@Injectable()
export class AdminRegistrationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ctx: PeopleContext,
    private readonly mailer: PeopleMailer,
    private readonly checkins: CheckinService,
    private readonly audit: AuditService,
  ) {}

  /** 403 first (don't reveal which ids exist), then 404. */
  async eventFor(ability: Ability, eventId: string, action: EventAction | EventAction[]): Promise<EventCtx> {
    const actions = Array.isArray(action) ? action : [action];
    if (!actions.some((a) => ability.can('event', eventId, a))) assertCan(ability, 'event', eventId, actions[0]!);
    const event = await this.ctx.event(eventId);
    if (!event) throw notFound("We couldn't find that event.");
    return event;
  }

  /** Load a registration by id and check `action` on ITS event. */
  async registrationFor(ability: Ability, id: string, action: EventAction | EventAction[]): Promise<{ reg: RegistrationRow; event: EventCtx }> {
    const [reg] = await this.db.select().from(registrations).where(eq(registrations.id, id));
    if (!reg) throw notFound("We couldn't find that registration.");
    const event = await this.eventFor(ability, reg.eventId, action);
    return { reg, event };
  }

  whereFor(eventId: string, q: ListFilters): SQL {
    const conds: SQL[] = [eq(registrations.eventId, eventId)];
    if (q.status !== 'all') conds.push(eq(registrations.status, q.status));
    if (q.checkedIn === 'yes') conds.push(isNotNull(registrations.checkedInAt));
    if (q.checkedIn === 'no') conds.push(isNull(registrations.checkedInAt));
    if (q.mode !== 'all') conds.push(eq(registrations.attendanceMode, q.mode));
    if (q.source !== 'all') conds.push(eq(registrations.source, q.source));
    const p = searchPattern(q.search);
    if (p) {
      conds.push(
        or(
          ilike(registrations.fullName, p),
          ilike(registrations.email, p),
          ilike(registrations.phone, p),
          ilike(registrations.ticketCode, p),
          ilike(registrations.notes, p),
        )!,
      );
    }
    return and(...conds)!;
  }

  orderFor(sort: ListFilters['sort']): SQL[] {
    switch (sort) {
      case 'name':
        return [asc(sql`lower(${registrations.fullName})`), asc(registrations.createdAt)];
      case '-name':
        return [desc(sql`lower(${registrations.fullName})`), desc(registrations.createdAt)];
      case 'createdAt':
        return [asc(registrations.createdAt)];
      case 'checkedInAt':
        return [sql`${registrations.checkedInAt} asc nulls last`, asc(registrations.createdAt)];
      case '-checkedInAt':
        return [sql`${registrations.checkedInAt} desc nulls last`, desc(registrations.createdAt)];
      case '-createdAt':
      default:
        return [desc(registrations.createdAt)];
    }
  }

  async list(eventId: string, q: RegistrationListQuery): Promise<Paginated<RegistrationRowDto>> {
    const where = this.whereFor(eventId, q);
    // registrationListQuery allows pageSize up to 500 (the door list), so no shared 100 clamp here.
    const pageSize = Math.min(500, Math.max(1, q.pageSize));
    const page = Math.max(1, q.page);
    const rows = await this.db
      .select({ r: registrations, otherEvents: otherEventsSql })
      .from(registrations)
      .where(where)
      .orderBy(...this.orderFor(q.sort))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [{ n } = { n: 0 }] = await this.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(registrations).where(where);
    return { items: rows.map((x) => toRegistrationDto(x.r, x.otherEvents)), total: n, page, pageSize };
  }

  /** Every row matching the filters, for exports. */
  async all(eventId: string, q: ListFilters): Promise<Array<{ r: RegistrationRow; otherEvents: number }>> {
    return this.db
      .select({ r: registrations, otherEvents: otherEventsSql })
      .from(registrations)
      .where(this.whereFor(eventId, q))
      .orderBy(...this.orderFor(q.sort));
  }

  async stats(event: EventCtx): Promise<RegistrationStats> {
    const eventId = event.row.id;
    const rows = await this.db
      .select({
        email: registrations.email,
        status: registrations.status,
        source: registrations.source,
        attendanceMode: registrations.attendanceMode,
        createdAt: registrations.createdAt,
        checkedInAt: registrations.checkedInAt,
      })
      .from(registrations)
      .where(eq(registrations.eventId, eventId));
    const active = rows.filter((r) => r.status === 'registered');
    const returningRows = await this.db.execute<{ n: number }>(sql`
      select count(distinct r.email)::int as n
      from registrations r
      join registrations r2 on r2.email = r.email and r2.event_id <> r.event_id and r2.status = 'registered'
      join events e2 on e2.id = r2.event_id
      where r.event_id = ${eventId} and r.status = 'registered' and e2.starts_at < ${event.row.startsAt.toISOString()}::timestamptz
    `);
    const returning = Number(returningRows[0]?.n ?? 0);
    const now = new Date();
    return {
      total: active.length,
      cancelled: rows.length - active.length,
      checkedIn: active.filter((r) => r.checkedInAt).length,
      inPerson: active.filter((r) => r.attendanceMode === 'in-person').length,
      online: active.filter((r) => r.attendanceMode === 'online').length,
      capacity: event.row.capacity ?? null,
      walkIns: active.filter((r) => r.source === 'walk-in').length,
      returning,
      firstTimers: Math.max(0, active.length - returning),
      timeline: timeline(
        active.map((r) => r.createdAt),
        now < event.row.endsAt ? now : event.row.endsAt,
      ),
      arrivals: arrivals(
        active.flatMap((r) => (r.checkedInAt ? [r.checkedInAt] : [])),
        event.row.startsAt,
      ),
      byHour: byHour(active.map((r) => r.createdAt)),
      domains: topDomains(active.map((r) => r.email)),
      sources: tally(active.map((r) => r.source)),
    };
  }

  /* ------------------------------------------------------------ create */

  async create(eventId: string, input: AdminCreateInput, actor: Actor): Promise<RegistrationRowDto> {
    const { ability } = actor;
    const walkIn = input.source === 'walk-in';
    // Walk-ins are door work (attendance.manage is enough); admin adds need registrations.manage.
    const allowed: EventAction[] = walkIn ? ['attendance.manage', 'registrations.manage'] : ['registrations.manage'];
    const event = await this.eventFor(ability, eventId, allowed);
    if (input.checkIn && !ability.can('event', eventId, 'attendance.manage')) {
      throw forbidden('Checking people in needs door access (attendance.manage) on this event.', {
        details: { type: 'event', id: eventId, action: 'attendance.manage' },
      });
    }
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (!phone.ok) throw fieldError('phone', 'That number looks off. Mind checking it?');
    const fullName = input.fullName.replace(/\s+/g, ' ').trim();
    const attendanceMode = event.row.mode === 'online' ? 'online' : event.row.mode === 'offline' ? 'in-person' : walkIn ? 'in-person' : input.attendanceMode;

    const { reg, reactivated } = await this.db.transaction(async (tx) => {
      const [locked] = await tx.select({ cancelledAt: events.cancelledAt }).from(events).where(eq(events.id, eventId)).for('update');
      if (!locked) throw notFound("We couldn't find that event.");
      if (locked.cancelledAt) throw unprocessable('This event is cancelled, so nobody can be added.');
      const [existing] = await tx
        .select()
        .from(registrations)
        .where(and(eq(registrations.eventId, eventId), eq(registrations.email, email)));
      if (existing?.status === 'registered') {
        throw conflict(`${shortName(existing.fullName)} already has a seat with that email (${existing.ticketCode}).`, {
          details: {
            issues: [{ path: ['email'], message: 'That email is already on the list.' }],
            registrationId: existing.id,
            ticketCode: existing.ticketCode,
            fullName: existing.fullName,
            checkedIn: !!existing.checkedInAt,
          },
        });
      }
      if (existing) {
        const [row] = await tx
          .update(registrations)
          .set({
            status: 'registered',
            cancelledAt: null,
            fullName,
            phone: phone.value,
            attendanceMode,
            source: input.source,
            notes: input.notes ?? existing.notes,
            checkedInAt: null,
            checkedInBy: null,
            checkInMethod: null,
            emailStatus: null,
          })
          .where(eq(registrations.id, existing.id))
          .returning();
        return { reg: row!, reactivated: true };
      }
      const [row] = await tx
        .insert(registrations)
        .values({
          eventId,
          fullName,
          email,
          phone: phone.value,
          attendanceMode,
          ticketCode: await uniqueTicketCode(tx),
          qrToken: await uniqueQrToken(tx),
          status: 'registered',
          source: input.source,
          notes: input.notes ?? null,
        })
        .returning();
      return { reg: row!, reactivated: false };
    });

    let current = reg;
    let item = null;
    if (input.checkIn) {
      const change = await this.checkins.checkIn(reg, { principal: actor.principal, method: 'manual', device: walkIn ? 'walk-in' : 'admin', ip: actor.ip });
      current = change.registration;
      item = change.item;
    }
    let mailStatus: string | null = null;
    if (input.sendEmail) {
      const mail = await this.mailer.sendConfirmation(current, event, { walkIn, checkedIn: !!current.checkedInAt });
      mailStatus = mail.status;
    }
    await this.audit.log({
      principal: actor.principal,
      action: walkIn ? 'registration.walk-in' : 'registration.admin-create',
      resourceType: 'registration',
      resourceId: reg.id,
      summary: `${walkIn ? 'Added walk-in' : 'Added'} ${shortName(fullName)} (${maskEmail(email)}) to "${event.row.title}"${reactivated ? ', restoring their old seat' : ''}${input.checkIn ? ', checked in' : ''}`,
      meta: { eventId, ticketCode: reg.ticketCode, source: input.source, checkIn: input.checkIn, email: mailStatus },
      ip: actor.ip,
    });
    this.ctx.revalidateEvent(eventId);
    await this.checkins.publish(eventId, item);
    const fresh = await this.byId(reg.id);
    return toRegistrationDto(fresh ?? current, await this.otherEvents(fresh ?? current), ability.can('event', eventId, 'registrations.view'));
  }

  /* ------------------------------------------------------------ update / delete / resend */

  async update(id: string, patch: UpdateInput, actor: Actor): Promise<RegistrationRowDto> {
    const { reg } = await this.registrationFor(actor.ability, id, 'registrations.manage');
    const set: Partial<typeof registrations.$inferInsert> = {};
    const fields: string[] = [];
    if (patch.fullName !== undefined && patch.fullName.trim() !== reg.fullName) {
      set.fullName = patch.fullName.replace(/\s+/g, ' ').trim();
      fields.push('name');
    }
    if (patch.email !== undefined) {
      const email = normalizeEmail(patch.email);
      if (email !== reg.email) {
        const [taken] = await this.db
          .select({ id: registrations.id })
          .from(registrations)
          .where(and(eq(registrations.eventId, reg.eventId), eq(registrations.email, email)));
        if (taken) throw conflict('Someone on this list already uses that email.', { details: { issues: [{ path: ['email'], message: 'That email is already on the list.' }] } });
        set.email = email;
        fields.push('email');
      }
    }
    if (patch.phone !== undefined) {
      const phone = normalizePhone(patch.phone);
      if (!phone.ok) throw fieldError('phone', 'That number looks off. Mind checking it?');
      if (phone.value !== reg.phone) {
        set.phone = phone.value;
        fields.push('phone');
      }
    }
    if (patch.attendanceMode !== undefined && patch.attendanceMode !== reg.attendanceMode) {
      set.attendanceMode = patch.attendanceMode;
      fields.push('mode');
    }
    if (patch.notes !== undefined && (patch.notes ?? null) !== (reg.notes ?? null)) {
      set.notes = patch.notes?.trim() || null;
      fields.push('notes');
    }
    if (patch.status !== undefined && patch.status !== reg.status) {
      set.status = patch.status;
      set.cancelledAt = patch.status === 'cancelled' ? new Date() : null;
      fields.push('status');
    }
    if (!fields.length) return toRegistrationDto(reg, await this.otherEvents(reg));
    const [updated] = await this.db.update(registrations).set(set).where(eq(registrations.id, id)).returning();
    await this.audit.log({
      principal: actor.principal,
      action: 'registration.update',
      resourceType: 'registration',
      resourceId: id,
      summary: `Edited ${shortName(updated!.fullName)} (${reg.ticketCode}): ${fields.join(', ')}${set.status ? `, now ${set.status}` : ''}`,
      meta: { eventId: reg.eventId, fields },
      ip: actor.ip,
    });
    if (set.status) {
      this.ctx.revalidateEvent(reg.eventId);
      await this.checkins.publishCounts(reg.eventId);
    }
    return toRegistrationDto(updated!, await this.otherEvents(updated!));
  }

  async remove(id: string, actor: Actor): Promise<{ ok: true }> {
    const { reg, event } = await this.registrationFor(actor.ability, id, 'registrations.manage');
    await this.db.delete(registrations).where(eq(registrations.id, id));
    await this.audit.log({
      principal: actor.principal,
      action: 'registration.delete',
      resourceType: 'registration',
      resourceId: id,
      summary: `Deleted ${shortName(reg.fullName)} (${reg.ticketCode}, ${maskEmail(reg.email)}) from "${event.row.title}"`,
      meta: { eventId: reg.eventId, ticketCode: reg.ticketCode, wasCheckedIn: !!reg.checkedInAt },
      ip: actor.ip,
    });
    this.ctx.revalidateEvent(reg.eventId);
    await this.checkins.publishCounts(reg.eventId);
    return { ok: true };
  }

  async resend(id: string, actor: Actor): Promise<ResendResult> {
    const { reg, event } = await this.registrationFor(actor.ability, id, 'registrations.manage');
    if (reg.status !== 'registered') throw new AppError(422, 'cancelled', 'This seat is cancelled. Restore it first, then resend.');
    const mail = await this.mailer.sendConfirmation(reg, event, { resend: true });
    await this.audit.log({
      principal: actor.principal,
      action: 'registration.resend',
      resourceType: 'registration',
      resourceId: id,
      summary: `Re-sent the ticket to ${maskEmail(reg.email)} (${reg.ticketCode})`,
      meta: { eventId: reg.eventId, email: mail.status },
      ip: actor.ip,
    });
    return { status: mail.status, emailStatus: mail.status };
  }

  /* ------------------------------------------------------------ bulk */

  async bulk(eventId: string, input: BulkInput, actor: Actor): Promise<BulkRegistrationResult> {
    const door = input.action === 'check-in' || input.action === 'undo-check-in';
    const event = await this.eventFor(actor.ability, eventId, door ? 'attendance.manage' : 'registrations.manage');
    const ids = [...new Set(input.ids)];
    // Scoped to this event: ids from other events are ignored (and counted as skipped).
    const rows = await this.db
      .select()
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), inArray(registrations.id, ids)));
    let affected = 0;
    let emails: BulkRegistrationResult['emails'] = null;
    const items = [];
    switch (input.action) {
      case 'resend': {
        emails = { sent: 0, logged: 0, failed: 0 };
        const settings = await this.ctx.emailSettings();
        for (const reg of rows.filter((r) => r.status === 'registered')) {
          const mail = await this.mailer.sendConfirmation(reg, event, { resend: true, settings });
          emails[mail.status] += 1;
          affected += 1;
        }
        break;
      }
      case 'cancel': {
        const target = rows.filter((r) => r.status === 'registered').map((r) => r.id);
        if (target.length) {
          const done = await this.db
            .update(registrations)
            .set({ status: 'cancelled', cancelledAt: new Date() })
            .where(and(inArray(registrations.id, target), eq(registrations.status, 'registered')))
            .returning({ id: registrations.id });
          affected = done.length;
        }
        break;
      }
      case 'restore': {
        const target = rows.filter((r) => r.status === 'cancelled').map((r) => r.id);
        if (target.length) {
          const done = await this.db
            .update(registrations)
            .set({ status: 'registered', cancelledAt: null })
            .where(and(inArray(registrations.id, target), eq(registrations.status, 'cancelled')))
            .returning({ id: registrations.id });
          affected = done.length;
        }
        break;
      }
      case 'delete': {
        if (rows.length) {
          const done = await this.db
            .delete(registrations)
            .where(inArray(
              registrations.id,
              rows.map((r) => r.id),
            ))
            .returning({ id: registrations.id });
          affected = done.length;
        }
        break;
      }
      case 'check-in': {
        for (const reg of rows.filter((r) => r.status === 'registered' && !r.checkedInAt)) {
          const change = await this.checkins.checkIn(reg, { principal: actor.principal, method: 'manual', device: 'bulk', ip: actor.ip });
          if (change.changed) {
            affected += 1;
            if (change.item) items.push(change.item);
          }
        }
        break;
      }
      case 'undo-check-in': {
        for (const reg of rows.filter((r) => r.checkedInAt)) {
          const change = await this.checkins.undo(reg, { principal: actor.principal, device: 'bulk', ip: actor.ip });
          if (change.changed) {
            affected += 1;
            if (change.item) items.push(change.item);
          }
        }
        break;
      }
    }
    await this.audit.log({
      principal: actor.principal,
      action: `registration.bulk-${input.action}`,
      resourceType: 'event',
      resourceId: eventId,
      summary: `Bulk ${input.action.replace(/-/g, ' ')}: ${affected} of ${ids.length} ${ids.length === 1 ? 'registration' : 'registrations'} on "${event.row.title}"`,
      meta: { action: input.action, requested: ids.length, affected, emails },
      ip: actor.ip,
    });
    if (input.action !== 'resend') this.ctx.revalidateEvent(eventId);
    const counts = await this.ctx.counts(eventId);
    for (const item of items) await this.checkins.publish(eventId, item, counts);
    if (!items.length && input.action !== 'resend') await this.checkins.publish(eventId, null, counts);
    return { action: input.action, requested: ids.length, affected, skipped: ids.length - affected, emails, counts };
  }

  /* ------------------------------------------------------------ helpers */

  private async byId(id: string): Promise<RegistrationRow | null> {
    const [row] = await this.db.select().from(registrations).where(eq(registrations.id, id));
    return row ?? null;
  }

  private async otherEvents(r: RegistrationRow): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(distinct ${registrations.eventId})`.mapWith(Number) })
      .from(registrations)
      .where(and(eq(registrations.email, r.email), sql`${registrations.eventId} <> ${r.eventId}`, eq(registrations.status, 'registered')));
    return row?.n ?? 0;
  }
}
