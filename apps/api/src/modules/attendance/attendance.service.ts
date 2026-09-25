import { Inject, Injectable, type MessageEvent } from '@nestjs/common';
import {
  formatJakarta,
  parseTicketPayload,
  type Ability,
  type AttendanceStreamMessage,
  type AttendanceSummary,
  type CheckinResult,
  type Paginated,
  type Principal,
  type RosterRow,
  type rosterQuery,
  type ScanResult,
} from '@zemi/shared';
import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { map, type Observable } from 'rxjs';
import type { z } from 'zod';
import { AppError } from '../../common/errors.js';
import { searchPattern } from '../../common/pagination.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { DB, type Db } from '../../db/client.js';
import { checkins, events, registrations } from '../../db/schema.js';
import { channels, RealtimeService } from '../realtime/realtime.service.js';
import { AdminRegistrationsService } from '../registrations/admin-registrations.service.js';
import { CheckinService, toFeedItem, toRosterRow } from '../registrations/checkin.service.js';
import { PeopleContext, type RegistrationRow } from '../registrations/people-context.service.js';
import { arrivals } from '../registrations/registration-stats.js';
import { firstName, shortName } from '../registrations/registration-rules.js';

type RosterQuery = z.infer<typeof rosterQuery>;

export interface DoorActor {
  principal: Principal;
  ability: Ability;
  ip: string | null;
}

const RECENT = 20;

/**
 * The door (SPEC 6 + 7): QR scans, manual check-ins, the live feed, the masked roster.
 *
 * Least privilege: `attendance.scan` alone sees only the person just scanned. For those principals the summary's
 * `recent` list and the SSE feed items are limited to their own scans; counts and the arrivals chart are shared.
 * `attendance.manage` sees the whole feed and the roster (masked email/phone).
 */
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ctx: PeopleContext,
    private readonly checkins: CheckinService,
    private readonly regs: AdminRegistrationsService,
    private readonly realtime: RealtimeService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /* ------------------------------------------------------------ scan */

  async scan(eventId: string, payload: string, device: string | null, actor: DoorActor): Promise<ScanResult> {
    await this.regs.eventFor(actor.ability, eventId, 'attendance.scan');
    // Generous for a busy door (one scan every 2 seconds per phone), tight enough to stop code guessing.
    const limit = this.rateLimit.hit(`scan:${actor.principal.id}:${eventId}`, { limit: 90, windowMs: 60_000 });
    if (!limit.allowed) {
      throw new AppError(429, 'rate_limited', 'Scanning too fast. Take a breath and try again.', {
        details: { retryAfterSec: limit.retryAfterSec },
        headers: { 'Retry-After': String(limit.retryAfterSec) },
      });
    }

    const key = parseTicketPayload(payload);
    const counts = () => this.ctx.counts(eventId);
    if (!key) {
      return { outcome: 'not-found', message: "That QR isn't a Zemi ticket. Try typing the ticket code?", registration: null, otherEvent: null, counts: await counts() };
    }
    const byCode = key.startsWith('ZM-');
    const [reg] = await this.db
      .select()
      .from(registrations)
      .where(byCode ? eq(registrations.ticketCode, key) : eq(registrations.qrToken, key))
      .limit(1);
    if (!reg) {
      return { outcome: 'not-found', message: "We don't know this ticket. Check the code, or add them as a walk-in.", registration: null, otherEvent: null, counts: await counts() };
    }

    const person = (r: RegistrationRow) => ({
      id: r.id,
      fullName: r.fullName,
      ticketCode: r.ticketCode,
      attendanceMode: r.attendanceMode,
      checkedInAt: r.checkedInAt?.toISOString() ?? null,
      checkedInBy: r.checkedInBy ?? null,
    });

    if (reg.eventId !== eventId) {
      const [other] = await this.db
        .select({ id: events.id, title: events.title, startsAt: events.startsAt })
        .from(events)
        .where(eq(events.id, reg.eventId));
      const when = other ? formatJakarta(other.startsAt, 'date') : 'another day';
      return {
        outcome: 'wrong-event',
        message: other ? `This ticket is for "${other.title}" on ${when}, not this one.` : 'This ticket is for a different Zemi.',
        registration: { ...person(reg), checkedInAt: null, checkedInBy: null },
        otherEvent: other ? { id: other.id, title: other.title, startsAt: other.startsAt.toISOString() } : null,
        counts: await counts(),
      };
    }
    if (reg.status === 'cancelled') {
      return {
        outcome: 'cancelled',
        message: `${firstName(reg.fullName)} cancelled this ticket. Add them as a walk-in if there's room.`,
        registration: person(reg),
        otherEvent: null,
        counts: await counts(),
      };
    }
    if (reg.checkedInAt) return this.already(reg, await counts());

    const change = await this.checkins.checkIn(reg, { principal: actor.principal, method: 'qr', device, ip: actor.ip });
    const c = await counts();
    if (!change.changed) return this.already(change.registration, c);
    await this.checkins.publish(eventId, change.item, c);
    return {
      outcome: 'checked-in',
      message: `Welcome, ${firstName(reg.fullName)}. You're in.`,
      registration: person(change.registration),
      otherEvent: null,
      counts: c,
    };
  }

  private already(reg: RegistrationRow, counts: ScanResult['counts']): ScanResult {
    const bits = [reg.checkedInAt ? `since ${formatJakarta(reg.checkedInAt, 'time')} WIB` : null, reg.checkedInBy ? `by ${reg.checkedInBy}` : null].filter(Boolean);
    return {
      outcome: 'already',
      message: `${firstName(reg.fullName)} is already in${bits.length ? ` (${bits.join(', ')})` : ''}.`,
      registration: {
        id: reg.id,
        fullName: reg.fullName,
        ticketCode: reg.ticketCode,
        attendanceMode: reg.attendanceMode,
        checkedInAt: reg.checkedInAt?.toISOString() ?? null,
        checkedInBy: reg.checkedInBy ?? null,
      },
      otherEvent: null,
      counts,
    };
  }

  /* ------------------------------------------------------------ manual */

  async checkIn(id: string, actor: DoorActor, device: string | null = null): Promise<CheckinResult> {
    const { reg } = await this.regs.registrationFor(actor.ability, id, 'attendance.manage');
    if (reg.status === 'cancelled') {
      throw new AppError(422, 'cancelled', `${firstName(reg.fullName)} cancelled this seat. Add them again as a walk-in to check them in.`);
    }
    const change = await this.checkins.checkIn(reg, { principal: actor.principal, method: 'manual', device, ip: actor.ip });
    const counts = await this.ctx.counts(reg.eventId);
    if (change.changed) await this.checkins.publish(reg.eventId, change.item, counts);
    return {
      changed: change.changed,
      message: change.changed ? `${shortName(reg.fullName)} is checked in.` : `${shortName(reg.fullName)} was already checked in.`,
      registration: toRosterRow(change.registration),
      item: change.item,
      counts,
    };
  }

  async undo(id: string, actor: DoorActor, device: string | null = null): Promise<CheckinResult> {
    const { reg } = await this.regs.registrationFor(actor.ability, id, 'attendance.manage');
    const change = await this.checkins.undo(reg, { principal: actor.principal, device, ip: actor.ip });
    const counts = await this.ctx.counts(reg.eventId);
    if (change.changed) await this.checkins.publish(reg.eventId, change.item, counts);
    return {
      changed: change.changed,
      message: change.changed ? `Undid ${shortName(reg.fullName)}'s check-in.` : `${shortName(reg.fullName)} wasn't checked in.`,
      registration: toRosterRow(change.registration),
      item: change.item,
      counts,
    };
  }

  /* ------------------------------------------------------------ summary, roster, stream */

  async summary(eventId: string, ability: Ability, principal: Principal): Promise<AttendanceSummary> {
    const event = await this.regs.eventFor(ability, eventId, 'attendance.scan');
    return this.buildSummary(eventId, event.row.startsAt, !ability.can('event', eventId, 'attendance.manage') ? principal.name : null);
  }

  private async buildSummary(eventId: string, startsAt: Date, onlyActor: string | null): Promise<AttendanceSummary> {
    const counts = await this.ctx.counts(eventId);
    const times = await this.db
      .select({ at: registrations.checkedInAt })
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), eq(registrations.status, 'registered'), isNotNull(registrations.checkedInAt)));
    const conds: SQL[] = [eq(checkins.eventId, eventId)];
    if (onlyActor) conds.push(eq(checkins.actorName, onlyActor));
    const recent = await this.db
      .select({ c: checkins, fullName: registrations.fullName, ticketCode: registrations.ticketCode })
      .from(checkins)
      .innerJoin(registrations, eq(registrations.id, checkins.registrationId))
      .where(and(...conds))
      .orderBy(desc(checkins.createdAt))
      .limit(RECENT);
    return {
      registered: counts.registered,
      checkedIn: counts.checkedIn,
      inPersonRegistered: counts.inPersonRegistered,
      walkIns: counts.walkIns,
      arrivals: arrivals(
        times.flatMap((t) => (t.at ? [t.at] : [])),
        startsAt,
      ),
      recent: recent.map((r) => toFeedItem(r.c, r)),
    };
  }

  async roster(eventId: string, q: RosterQuery, ability: Ability): Promise<Paginated<RosterRow>> {
    await this.regs.eventFor(ability, eventId, 'attendance.manage');
    const conds: SQL[] = [eq(registrations.eventId, eventId), eq(registrations.status, 'registered')];
    if (q.checkedIn === 'yes') conds.push(isNotNull(registrations.checkedInAt));
    if (q.checkedIn === 'no') conds.push(isNull(registrations.checkedInAt));
    const p = searchPattern(q.search);
    if (p) conds.push(or(ilike(registrations.fullName, p), ilike(registrations.ticketCode, p), ilike(registrations.email, p), ilike(registrations.phone, p))!);
    const where = and(...conds)!;
    const pageSize = Math.min(500, Math.max(1, q.pageSize));
    const page = Math.max(1, q.page);
    const rows = await this.db
      .select()
      .from(registrations)
      .where(where)
      .orderBy(asc(sql`lower(${registrations.fullName})`), asc(registrations.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [{ n } = { n: 0 }] = await this.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(registrations).where(where);
    return { items: rows.map(toRosterRow), total: n, page, pageSize };
  }

  /** SSE: snapshot first, then every check-in/undo/walk-in/cancel from any device. */
  async stream(eventId: string, ability: Ability, principal: Principal): Promise<Observable<MessageEvent>> {
    const event = await this.regs.eventFor(ability, eventId, 'attendance.scan');
    const full = ability.can('event', eventId, 'attendance.manage');
    const onlyActor = full ? null : principal.name;
    const source = this.realtime.stream(channels.attendance(eventId), {
      initial: async (): Promise<AttendanceStreamMessage> => {
        const summary = await this.buildSummary(eventId, event.row.startsAt, onlyActor);
        return { type: 'snapshot', summary, counts: await this.ctx.counts(eventId) };
      },
    });
    if (full) return source;
    // Scan-only: keep counts, drop other people's names.
    return source.pipe(
      map((msg) => {
        const data = msg.data as AttendanceStreamMessage;
        if (data && typeof data === 'object' && data.type === 'checkin' && data.item && data.item.actorName !== onlyActor) {
          return { ...msg, data: { type: 'checkin', item: null, counts: data.counts } satisfies AttendanceStreamMessage };
        }
        return msg;
      }),
    );
  }
}
