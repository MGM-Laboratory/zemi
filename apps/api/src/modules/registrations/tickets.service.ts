import { Inject, Injectable, Logger } from '@nestjs/common';
import { maskEmail, type AlreadyRegisteredDetails, type RegisterInput, type RegisterResult, type Ticket } from '@zemi/shared';
import { and, eq, sql } from 'drizzle-orm';
import { AppError, notFound, unprocessable, validationError } from '../../common/errors.js';
import { DB, type Db, type Tx } from '../../db/client.js';
import { events, registrations } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { CheckinService } from './checkin.service.js';
import { PeopleContext, type EventCtx, type RegistrationRow } from './people-context.service.js';
import { PeopleMailer } from './people-mail.service.js';
import {
  newQrToken,
  newTicketCode,
  normalizeEmail,
  normalizePhone,
  registrationWindow,
  samePhone,
  shortName,
} from './registration-rules.js';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Field error in the zod issue shape, so the web's `fieldErrors()` puts it under the right input. */
export const fieldError = (path: string, message: string) =>
  validationError(`${path}: ${message}`, [{ code: 'custom', path: [path], message }]);

type RegisterOutcome =
  | { kind: 'created' | 'reactivated'; reg: RegistrationRow }
  | { kind: 'existing'; reg: RegistrationRow; phoneMatches: boolean };

/** Allocate a ticket code nobody has yet (collisions are ~1 in a billion, but cheap to rule out). */
export async function uniqueTicketCode(tx: Tx | Db): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = newTicketCode();
    const [hit] = await tx.select({ id: registrations.id }).from(registrations).where(eq(registrations.ticketCode, code)).limit(1);
    if (!hit) return code;
  }
  throw new Error('Could not allocate a ticket code');
}

export async function uniqueQrToken(tx: Tx | Db): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const token = newQrToken();
    const [hit] = await tx.select({ id: registrations.id }).from(registrations).where(eq(registrations.qrToken, token)).limit(1);
    if (!hit) return token;
  }
  throw new Error('Could not allocate a ticket token');
}

/** Public sign-up and the ticket page (SPEC 7, "Public"). */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger('Tickets');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ctx: PeopleContext,
    private readonly mailer: PeopleMailer,
    private readonly audit: AuditService,
    private readonly checkins: CheckinService,
  ) {}

  async register(eventId: string, input: RegisterInput, meta: RequestMeta): Promise<RegisterResult> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (!phone.ok || !phone.value) throw fieldError('phone', 'That number looks off. Mind checking it?');
    const fullName = input.fullName.replace(/\s+/g, ' ').trim();

    const outcome = await this.db.transaction(async (tx): Promise<RegisterOutcome> => {
      // Serialize sign-ups per event: the capacity check and the insert must see the same count.
      const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for('update');
      if (!event || event.visibility === 'draft') throw notFound("We couldn't find that event.");
      const now = new Date();
      if (event.cancelledAt) throw new AppError(422, 'event_cancelled', 'This Friday got cancelled, so there is nothing to sign up for.');
      if (now >= event.endsAt) throw new AppError(422, 'event_past', 'This one already wrapped. Catch the next Friday?');

      const [existing] = await tx
        .select()
        .from(registrations)
        .where(and(eq(registrations.eventId, eventId), eq(registrations.email, email)));
      if (existing?.status === 'registered') {
        return { kind: 'existing', reg: existing, phoneMatches: samePhone(existing.phone, phone.value) };
      }

      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(registrations)
        .where(and(eq(registrations.eventId, eventId), eq(registrations.status, 'registered')));
      const window = registrationWindow(event, n, now);
      if (!window.open) throw new AppError(422, window.code ?? 'registration_closed', window.reason ?? 'Registration is closed.', { details: { spotsLeft: window.spotsLeft } });

      // Online-only and room-only events decide the mode for you.
      const attendanceMode = event.mode === 'online' ? 'online' : event.mode === 'offline' ? 'in-person' : input.attendanceMode;

      if (existing) {
        const [reg] = await tx
          .update(registrations)
          .set({
            status: 'registered',
            cancelledAt: null,
            fullName,
            phone: phone.value,
            attendanceMode,
            checkedInAt: null,
            checkedInBy: null,
            checkInMethod: null,
            ip: meta.ip,
            userAgent: meta.userAgent,
            emailStatus: 'pending',
          })
          .where(eq(registrations.id, existing.id))
          .returning();
        return { kind: 'reactivated', reg: reg! };
      }

      const [reg] = await tx
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
          source: 'web',
          emailStatus: 'pending',
          ip: meta.ip,
          userAgent: meta.userAgent,
        })
        .returning();
      return { kind: 'created', reg: reg! };
    });

    const event = await this.ctx.event(eventId);
    if (!event) throw notFound("We couldn't find that event.");

    if (outcome.kind === 'existing') return this.existing(outcome.reg, event, outcome.phoneMatches, meta);

    const mail = await this.mailer.sendConfirmation(outcome.reg, event);
    await this.audit.log({
      principal: { kind: 'public', name: fullName },
      action: outcome.kind === 'created' ? 'registration.create' : 'registration.reactivate',
      resourceType: 'registration',
      resourceId: outcome.reg.id,
      summary: `${outcome.kind === 'created' ? 'Registered' : 'Came back and re-registered'}: ${shortName(fullName)} (${maskEmail(email)}) for "${event.row.title}"`,
      meta: { eventId, ticketCode: outcome.reg.ticketCode, attendanceMode: outcome.reg.attendanceMode, email: mail.status },
      ip: meta.ip,
    });
    this.ctx.revalidateEvent(eventId);
    void this.checkins.publishCounts(eventId);
    const fresh = (await this.byId(outcome.reg.id)) ?? outcome.reg;
    return { ticket: await this.ctx.ticket(fresh, event), existing: false, emailSent: mail.status !== 'failed' };
  }

  /** Same email signs up again: re-send the ticket (at most once per 10 minutes). */
  private async existing(reg: RegistrationRow, event: EventCtx, phoneMatches: boolean, meta: RequestMeta): Promise<RegisterResult> {
    let emailSent = false;
    if (!(await this.mailer.sentConfirmationRecently(reg.id, 10))) {
      const mail = await this.mailer.sendConfirmation(reg, event, { resend: true });
      emailSent = mail.status !== 'failed';
      await this.audit.log({
        principal: { kind: 'public', name: reg.fullName },
        action: 'registration.resend',
        resourceType: 'registration',
        resourceId: reg.id,
        summary: `Signed up again, ticket re-sent to ${maskEmail(reg.email)}`,
        meta: { eventId: reg.eventId, phoneMatches, email: mail.status },
        ip: meta.ip,
      });
    }
    if (!phoneMatches) {
      // Only the inbox owner gets the ticket. Knowing someone's email isn't enough to see or cancel it.
      const details: AlreadyRegisteredDetails = { email: maskEmail(reg.email), emailSent };
      throw new AppError(
        409,
        'already_registered',
        emailSent
          ? `That email already has a seat. We sent the ticket to ${details.email} again.`
          : `That email already has a seat. The ticket went to ${details.email} a few minutes ago.`,
        { details },
      );
    }
    return { ticket: await this.ctx.ticket(reg, event), existing: true, emailSent };
  }

  private async byId(id: string): Promise<RegistrationRow | null> {
    const [row] = await this.db.select().from(registrations).where(eq(registrations.id, id));
    return row ?? null;
  }

  async byToken(token: string): Promise<{ reg: RegistrationRow; event: EventCtx }> {
    const [reg] = token.length >= 16 && token.length <= 64 ? await this.db.select().from(registrations).where(eq(registrations.qrToken, token)) : [];
    if (!reg) throw notFound("We couldn't find that ticket. Double check the link?");
    const event = await this.ctx.event(reg.eventId);
    if (!event) throw notFound("We couldn't find that ticket. Double check the link?");
    return { reg, event };
  }

  async getTicket(token: string): Promise<Ticket> {
    const { reg, event } = await this.byToken(token);
    return this.ctx.ticket(reg, event);
  }

  async cancel(token: string, meta: RequestMeta): Promise<Ticket> {
    const { reg, event } = await this.byToken(token);
    if (reg.status === 'cancelled') return this.ctx.ticket(reg, event);
    if (new Date() >= event.row.endsAt) throw unprocessable('This one already happened, so there is nothing to cancel.');
    if (reg.checkedInAt) throw new AppError(422, 'checked_in', "You're already checked in, so the seat is yours.");
    const [updated] = await this.db
      .update(registrations)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(and(eq(registrations.id, reg.id), eq(registrations.status, 'registered')))
      .returning();
    if (!updated) {
      const again = await this.byToken(token);
      return this.ctx.ticket(again.reg, again.event);
    }
    const mail = await this.mailer.sendRegistrationCancelled(updated, event, 'self');
    await this.audit.log({
      principal: { kind: 'public', name: reg.fullName },
      action: 'registration.cancel',
      resourceType: 'registration',
      resourceId: reg.id,
      summary: `Released their seat: ${shortName(reg.fullName)} (${reg.ticketCode}) for "${event.row.title}"`,
      meta: { eventId: reg.eventId, email: mail.status },
      ip: meta.ip,
    });
    this.ctx.revalidateEvent(reg.eventId);
    void this.checkins.publishCounts(reg.eventId);
    return this.ctx.ticket(updated, event);
  }
}
