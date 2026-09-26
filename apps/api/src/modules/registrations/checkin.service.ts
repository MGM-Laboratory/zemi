import { Inject, Injectable } from '@nestjs/common';
import {
  maskEmail,
  maskPhone,
  type AttendanceCounts,
  type AttendanceStreamMessage,
  type CheckinFeedItem,
  type Principal,
  type RosterRow,
} from '@zemi/shared';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import { checkins, registrations } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { channels, RealtimeService } from '../realtime/realtime.service.js';
import { PeopleContext, type RegistrationRow } from './people-context.service.js';
import { shortName } from './registration-rules.js';

export type CheckinRow = typeof checkins.$inferSelect;

export interface CheckinChange {
  changed: boolean;
  registration: RegistrationRow;
  item: CheckinFeedItem | null;
}

export const toRosterRow = (r: RegistrationRow): RosterRow => ({
  id: r.id,
  fullName: r.fullName,
  ticketCode: r.ticketCode,
  maskedEmail: maskEmail(r.email),
  maskedPhone: r.phone ? maskPhone(r.phone) : '',
  attendanceMode: r.attendanceMode,
  checkedInAt: r.checkedInAt?.toISOString() ?? null,
});

export const toFeedItem = (c: CheckinRow, r: Pick<RegistrationRow, 'fullName' | 'ticketCode'>): CheckinFeedItem => ({
  id: c.id,
  registrationId: c.registrationId,
  fullName: r.fullName,
  ticketCode: r.ticketCode,
  action: c.action,
  method: c.method,
  actorName: c.actorName,
  actorId: c.actorId ?? null,
  device: c.device ?? null,
  createdAt: c.createdAt.toISOString(),
});

/**
 * Check-in state changes, shared by scans, manual check-ins, walk-ins and bulk actions. Every change is a
 * conditional UPDATE (so two door phones scanning the same ticket give one check-in and one "already"),
 * writes a `checkins` history row, an audit entry, and pushes the feed + counts over SSE.
 */
@Injectable()
export class CheckinService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ctx: PeopleContext,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  async checkIn(
    reg: RegistrationRow,
    by: { principal: Principal; method: 'qr' | 'manual'; device?: string | null; ip?: string | null },
    db: DbOrTx = this.db,
  ): Promise<CheckinChange> {
    const [updated] = await db
      .update(registrations)
      .set({ checkedInAt: new Date(), checkedInBy: by.principal.name, checkInMethod: by.method })
      .where(and(eq(registrations.id, reg.id), isNull(registrations.checkedInAt), eq(registrations.status, 'registered')))
      .returning();
    if (!updated) {
      const [current] = await db.select().from(registrations).where(eq(registrations.id, reg.id));
      return { changed: false, registration: current ?? reg, item: null };
    }
    const [row] = await db
      .insert(checkins)
      .values({
        registrationId: reg.id,
        eventId: reg.eventId,
        action: 'check-in',
        method: by.method,
        actorId: by.principal.id,
        actorName: by.principal.name.slice(0, 200),
        device: by.device?.slice(0, 80) ?? null,
      })
      .returning();
    await this.audit.log(
      {
        principal: by.principal,
        action: 'registration.check-in',
        resourceType: 'registration',
        resourceId: reg.id,
        summary: `Checked in ${shortName(reg.fullName)} (${reg.ticketCode}) by ${by.method === 'qr' ? 'QR scan' : 'hand'}`,
        meta: { eventId: reg.eventId, method: by.method, device: by.device ?? null },
        ip: by.ip ?? null,
      },
      db,
    );
    return { changed: true, registration: updated, item: toFeedItem(row!, updated) };
  }

  async undo(reg: RegistrationRow, by: { principal: Principal; device?: string | null; ip?: string | null }, db: DbOrTx = this.db): Promise<CheckinChange> {
    const [updated] = await db
      .update(registrations)
      .set({ checkedInAt: null, checkedInBy: null, checkInMethod: null })
      .where(and(eq(registrations.id, reg.id), isNotNull(registrations.checkedInAt)))
      .returning();
    if (!updated) {
      const [current] = await db.select().from(registrations).where(eq(registrations.id, reg.id));
      return { changed: false, registration: current ?? reg, item: null };
    }
    const [row] = await db
      .insert(checkins)
      .values({
        registrationId: reg.id,
        eventId: reg.eventId,
        action: 'undo',
        method: 'manual',
        actorId: by.principal.id,
        actorName: by.principal.name.slice(0, 200),
        device: by.device?.slice(0, 80) ?? null,
      })
      .returning();
    await this.audit.log(
      {
        principal: by.principal,
        action: 'registration.undo-check-in',
        resourceType: 'registration',
        resourceId: reg.id,
        summary: `Undid the check-in of ${shortName(reg.fullName)} (${reg.ticketCode})`,
        meta: { eventId: reg.eventId },
        ip: by.ip ?? null,
      },
      db,
    );
    return { changed: true, registration: updated, item: toFeedItem(row!, updated) };
  }

  /** Push one feed item (or just new counts) to every open door/dashboard for this event. */
  async publish(eventId: string, item: CheckinFeedItem | null, counts?: AttendanceCounts): Promise<AttendanceCounts> {
    const c = counts ?? (await this.ctx.counts(eventId));
    const msg: AttendanceStreamMessage = item ? { type: 'checkin', item, counts: c } : { type: 'counts', counts: c };
    this.realtime.publish(channels.attendance(eventId), msg);
    return c;
  }

  /** Counts changed without a check-in (sign-up, cancel, delete): tell the dashboards if anyone listens. */
  async publishCounts(eventId: string): Promise<void> {
    if (!this.realtime.subscriberCount(channels.attendance(eventId))) return;
    await this.publish(eventId, null);
  }
}
