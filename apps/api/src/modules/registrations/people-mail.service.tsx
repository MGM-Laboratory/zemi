import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { jakartaDateInput } from '@zemi/shared';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db/client.js';
import { emailLogs, registrations } from '../../db/schema.js';
import { MailService, type MailAttachment, type SendMailInput, type SendMailResult } from '../mail/mail.service.js';
import { EventCancelled } from '../mail/templates/event-cancelled.js';
import { EventReminder } from '../mail/templates/event-reminder.js';
import { EventStarting } from '../mail/templates/event-starting.js';
import { EventThanks } from '../mail/templates/event-thanks.js';
import { EventUpdate } from '../mail/templates/event-update.js';
import type { EventEmailInfo } from '../mail/templates/people-parts.js';
import { RegistrationCancelled } from '../mail/templates/registration-cancelled.js';
import { RegistrationConfirmed } from '../mail/templates/registration-confirmed.js';
import { icsFilename } from './calendar.js';
import { personalize } from './broadcast-html.js';
import { PeopleContext, type EmailSettings, type EventCtx, type RegistrationRow } from './people-context.service.js';
import { firstName } from './registration-rules.js';
import { TicketAssets } from './ticket-assets.service.js';

export const TEMPLATES = {
  confirmed: 'registration-confirmed',
  cancelled: 'registration-cancelled',
  reminder: 'event-reminder',
  starting: 'event-starting',
  thanks: 'event-thanks',
  update: 'event-update',
  eventCancelled: 'event-cancelled',
} as const;
export type PeopleTemplate = (typeof TEMPLATES)[keyof typeof TEMPLATES];

export interface BatchCounts {
  recipients: number;
  sent: number;
  logged: number;
  failed: number;
  skipped: number;
}

const emptyCounts = (): BatchCounts => ({ recipients: 0, sent: 0, logged: 0, failed: 0, skipped: 0 });

/** Resend's limit is a few requests a second: send in small batches with a pause between them. */
const BATCH_SIZE = 10;
const BATCH_PAUSE_MS = 400;
/** Only a real address from the email settings; anything else falls back to MAIL_REPLY_TO. */
const replyTo = (s: EmailSettings): string | undefined => {
  const v = s.replyTo?.trim();
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : undefined;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Builds and sends every people email (SPEC 10). All sends go through MailService (Resend or the outbox)
 * and write email_logs with eventId + registrationId, which is also how retries skip people who already
 * got a batch email.
 */
@Injectable()
export class PeopleMailer implements OnModuleInit {
  private readonly logger = new Logger('PeopleMail');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly mail: MailService,
    private readonly ctx: PeopleContext,
    private readonly assets: TicketAssets,
  ) {}

  onModuleInit(): void {
    this.registerPreviews();
  }

  /* ------------------------------------------------------------ ticket emails */

  /**
   * The ticket email (new sign-up, duplicate sign-up, admin add, resend, walk-in). Attaches the QR inline
   * (cid:qr) and the .ics file, and records the delivery on `registrations.email_status`.
   */
  async sendConfirmation(
    reg: RegistrationRow,
    event: EventCtx,
    opts: { resend?: boolean; walkIn?: boolean; checkedIn?: boolean; settings?: EmailSettings } = {},
  ): Promise<SendMailResult> {
    const settings = opts.settings ?? (await this.ctx.emailSettings());
    const info = this.ctx.emailEvent(event);
    let attachments: MailAttachment[] = [];
    try {
      attachments = await this.ticketAttachments(reg, event);
    } catch (err) {
      this.logger.warn(`Ticket attachments failed for ${reg.ticketCode}: ${(err as Error).message}`);
    }
    const hasQr = attachments.some((a) => a.contentId === 'qr');
    const label = info.number != null ? `Zemi #${info.number}` : 'Zemi';
    const subject = opts.walkIn
      ? `Welcome in: your ${label} ticket`
      : opts.resend
        ? `Your ticket for ${label}, again`
        : `You're in: ${label}, ${info.dateLabel.split(',')[0]} at ${info.startTime} WIB`;
    await this.db.update(registrations).set({ emailStatus: 'pending' }).where(eq(registrations.id, reg.id));
    const result = await this.mail.send({
      to: reg.email,
      subject,
      template: TEMPLATES.confirmed,
      react: (
        <RegistrationConfirmed
          firstName={firstName(reg.fullName)}
          event={info}
          ticketCode={reg.ticketCode}
          ticketUrl={this.ctx.ticketUrl(reg.qrToken)}
          cancelUrl={this.ctx.cancelUrl(reg.qrToken)}
          calendarUrl={this.ctx.ticketFileUrl(reg.qrToken, 'calendar.ics')}
          attendanceMode={reg.attendanceMode}
          qrSrc={hasQr ? 'cid:qr' : this.ctx.ticketFileUrl(reg.qrToken, 'qr.png')}
          resend={opts.resend}
          walkIn={opts.walkIn}
          checkedIn={opts.checkedIn}
          signature={settings.signature}
        />
      ),
      attachments,
      eventId: reg.eventId,
      registrationId: reg.id,
      replyTo: replyTo(settings),
      tags: [{ name: 'template', value: TEMPLATES.confirmed }],
    });
    await this.db.update(registrations).set({ emailStatus: result.status }).where(eq(registrations.id, reg.id));
    return result;
  }

  async ticketAttachments(reg: RegistrationRow, event: EventCtx): Promise<MailAttachment[]> {
    const png = await this.assets.qrPng(reg.qrToken, 600);
    return [
      { filename: 'qr.png', content: png, contentType: 'image/png', contentId: 'qr' },
      {
        filename: icsFilename(event.row.number ?? null, event.row.slug),
        content: this.assets.ics(reg, event),
        contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      },
    ];
  }

  /** Did this registration get a ticket email in the last `minutes`? (throttles duplicate sign-ups) */
  async sentConfirmationRecently(registrationId: string, minutes = 10): Promise<boolean> {
    const since = new Date(Date.now() - minutes * 60_000);
    const [row] = await this.db
      .select({ id: emailLogs.id })
      .from(emailLogs)
      .where(and(eq(emailLogs.registrationId, registrationId), eq(emailLogs.template, TEMPLATES.confirmed), gte(emailLogs.createdAt, since)))
      .limit(1);
    return !!row;
  }

  async sendRegistrationCancelled(reg: RegistrationRow, event: EventCtx, by: 'self' | 'organizer'): Promise<SendMailResult> {
    const settings = await this.ctx.emailSettings();
    const info = this.ctx.emailEvent(event);
    const upcoming = this.ctx.status(event) === 'scheduled' && !event.row.cancelledAt;
    return this.mail.send({
      to: reg.email,
      subject: `Seat released: ${info.number != null ? `Zemi #${info.number}` : info.title}`,
      template: TEMPLATES.cancelled,
      react: (
        <RegistrationCancelled
          firstName={firstName(reg.fullName)}
          event={info}
          ticketCode={reg.ticketCode}
          by={by}
          canRegisterAgain={upcoming && event.row.registrationOpen}
          signature={settings.signature}
        />
      ),
      eventId: reg.eventId,
      registrationId: reg.id,
      replyTo: replyTo(settings),
    });
  }

  /* ------------------------------------------------------------ batch emails */

  /** People with an active seat, minus anyone who already got `template` since `since` (retry safe). */
  async recipients(eventId: string, template: PeopleTemplate, since: Date | null): Promise<RegistrationRow[]> {
    const rows = await this.db
      .select()
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), eq(registrations.status, 'registered')))
      .orderBy(registrations.createdAt);
    if (!rows.length || !since) return rows;
    const done = await this.db
      .select({ id: emailLogs.registrationId })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.eventId, eventId),
          eq(emailLogs.template, template),
          gte(emailLogs.createdAt, since),
          inArray(emailLogs.status, ['sent', 'logged']),
          sql`${emailLogs.registrationId} is not null`,
        ),
      );
    const skip = new Set(done.map((d) => d.id));
    return rows.filter((r) => !skip.has(r.id));
  }

  /** Send one email per registration, in paced batches. Individual failures are counted, never thrown. */
  async sendBatch(regs: RegistrationRow[], build: (reg: RegistrationRow) => SendMailInput | null): Promise<BatchCounts> {
    const counts = emptyCounts();
    counts.recipients = regs.length;
    for (let i = 0; i < regs.length; i += BATCH_SIZE) {
      const inputs: SendMailInput[] = [];
      for (const reg of regs.slice(i, i + BATCH_SIZE)) {
        const input = build(reg);
        if (input) inputs.push(input);
        else counts.skipped += 1;
      }
      const results = await this.mail.sendMany(inputs, { concurrency: 2 });
      for (const r of results) counts[r.status] += 1;
      if (i + BATCH_SIZE < regs.length) await sleep(BATCH_PAUSE_MS);
    }
    return counts;
  }

  async sendReminders(event: EventCtx, regs: RegistrationRow[], now = new Date()): Promise<BatchCounts> {
    const settings = await this.ctx.emailSettings();
    const info = this.ctx.emailEvent(event);
    const when = jakartaDateInput(now) === jakartaDateInput(event.row.startsAt) ? 'today' : 'tomorrow';
    const day = when === 'today' ? 'Today' : 'Tomorrow';
    return this.sendBatch(regs, (reg) => ({
      to: reg.email,
      subject: `${day} at ${info.startTime} WIB: ${this.ctx.displayTitle(event.row)}`,
      template: TEMPLATES.reminder,
      react: (
        <EventReminder
          firstName={firstName(reg.fullName)}
          event={info}
          ticketCode={reg.ticketCode}
          ticketUrl={this.ctx.ticketUrl(reg.qrToken)}
          cancelUrl={this.ctx.cancelUrl(reg.qrToken)}
          attendanceMode={reg.attendanceMode}
          when={when}
          signature={settings.signature}
        />
      ),
      eventId: reg.eventId,
      registrationId: reg.id,
      replyTo: replyTo(settings),
    }));
  }

  async sendStarting(event: EventCtx, regs: RegistrationRow[], now = new Date()): Promise<BatchCounts> {
    const settings = await this.ctx.emailSettings();
    const info = this.ctx.emailEvent(event);
    const minutesToStart = Math.round((event.row.startsAt.getTime() - now.getTime()) / 60_000);
    const streams = event.row.mode !== 'offline';
    return this.sendBatch(regs, (reg) => {
      const online = reg.attendanceMode === 'online' && streams;
      return {
        to: reg.email,
        subject: online ? `Going live: ${this.ctx.displayTitle(event.row)}` : `Starting now: ${this.ctx.displayTitle(event.row)}`,
        template: TEMPLATES.starting,
        react: (
          <EventStarting
            firstName={firstName(reg.fullName)}
            event={info}
            attendanceMode={reg.attendanceMode}
            ticketUrl={this.ctx.ticketUrl(reg.qrToken)}
            minutesToStart={minutesToStart}
            signature={settings.signature}
          />
        ),
        eventId: reg.eventId,
        registrationId: reg.id,
        replyTo: replyTo(settings),
      };
    });
  }

  async sendThanks(event: EventCtx, regs: RegistrationRow[], links: { recordingUrl: string | null; photosUrl: string | null }): Promise<BatchCounts> {
    const settings = await this.ctx.emailSettings();
    const info = this.ctx.emailEvent(event);
    return this.sendBatch(regs, (reg) => ({
      to: reg.email,
      subject: links.recordingUrl ? `Thanks for coming. The recording is up` : `Thanks for coming to ${this.ctx.displayTitle(event.row)}`,
      template: TEMPLATES.thanks,
      react: (
        <EventThanks
          firstName={firstName(reg.fullName)}
          event={info}
          attended={!!reg.checkedInAt}
          attendanceMode={reg.attendanceMode}
          recordingUrl={links.recordingUrl}
          photosUrl={links.photosUrl}
          signature={settings.signature}
        />
      ),
      eventId: reg.eventId,
      registrationId: reg.id,
      replyTo: replyTo(settings),
    }));
  }

  async sendEventCancelled(event: EventCtx, regs: RegistrationRow[]): Promise<BatchCounts> {
    const settings = await this.ctx.emailSettings();
    const info = this.ctx.emailEvent(event);
    return this.sendBatch(regs, (reg) => ({
      to: reg.email,
      subject: `Cancelled: ${this.ctx.displayTitle(event.row)} on ${info.dateLabel}`,
      template: TEMPLATES.eventCancelled,
      react: <EventCancelled firstName={firstName(reg.fullName)} event={info} reason={event.row.cancelReason ?? null} signature={settings.signature} />,
      eventId: reg.eventId,
      registrationId: reg.id,
      replyTo: replyTo(settings),
    }));
  }

  /** Admin broadcast. `html` must already be sanitized. One email per person (never a shared To line). */
  async sendUpdate(event: EventCtx, regs: RegistrationRow[], subject: string, html: string): Promise<BatchCounts> {
    const settings = await this.ctx.emailSettings();
    const info = this.ctx.emailEvent(event);
    return this.sendBatch(regs, (reg) => ({
      to: reg.email,
      subject,
      template: TEMPLATES.update,
      react: (
        <EventUpdate
          subject={subject}
          html={personalize(html, { firstName: firstName(reg.fullName), fullName: reg.fullName })}
          event={info}
          ticketUrl={this.ctx.ticketUrl(reg.qrToken)}
          attendanceMode={reg.attendanceMode}
          signature={settings.signature}
        />
      ),
      eventId: reg.eventId,
      registrationId: reg.id,
      replyTo: replyTo(settings),
    }));
  }

  /** A broadcast test: exactly one email to the admin's address, never to registrants. */
  async sendUpdateTest(event: EventCtx, to: string, subject: string, html: string): Promise<SendMailResult> {
    const settings = await this.ctx.emailSettings();
    return this.mail.send({
      to,
      subject: `[Test] ${subject}`,
      template: TEMPLATES.update,
      react: (
        <EventUpdate
          subject={subject}
          html={personalize(html, { firstName: 'Rina', fullName: 'Rina Sari' })}
          event={this.ctx.emailEvent(event)}
          ticketUrl={null}
          signature={settings.signature}
          test
        />
      ),
      eventId: event.row.id,
      replyTo: replyTo(settings),
    });
  }

  /* ------------------------------------------------------------ previews */

  private registerPreviews(): void {
    const sample: EventEmailInfo = {
      title: 'Robots that learn from bad data',
      number: 42,
      dateLabel: 'Friday, 2 October 2026',
      timeLabel: '13:15 to 15:15 WIB',
      startTime: '13:15',
      venueLabel: 'Theater A, Building B, floor 3',
      address: 'Jl. Kaliurang Km 14.5, Sleman, Yogyakarta',
      roomNote: 'Take the stairs next to the coffee corner.',
      mapsUrl: 'https://maps.google.com/?q=-7.686,110.410',
      mode: 'hybrid',
      onlineNote: null,
      eventUrl: `${this.ctx.webUrl}/events/robots-that-learn`,
      accent: 'blue',
    };
    const token = 'preview-token-000000';
    const ticketUrl = `${this.ctx.webUrl}/tickets/${token}`;
    const qrPreview = async () => `data:image/png;base64,${(await this.assets.qrPng(token, 600)).toString('base64')}`;
    this.mail.registerPreview({
      template: TEMPLATES.confirmed,
      subject: "You're in: Zemi #42, Friday at 13:15 WIB",
      description: 'Sent right after someone saves a seat (also for resends and walk-ins).',
      render: async () => (
        <RegistrationConfirmed
          firstName="Rina"
          event={sample}
          ticketCode="ZM-7K3F9Q"
          ticketUrl={ticketUrl}
          cancelUrl={`${ticketUrl}?cancel=1`}
          calendarUrl={`${this.ctx.apiUrl}/api/v1/public/tickets/${token}/calendar.ics`}
          attendanceMode="in-person"
          qrSrc={await qrPreview()}
        />
      ),
    });
    this.mail.registerPreview({
      template: TEMPLATES.cancelled,
      subject: 'Seat released: Zemi #42',
      description: 'Sent when someone (or an admin) releases a seat.',
      render: () => <RegistrationCancelled firstName="Rina" event={sample} ticketCode="ZM-7K3F9Q" />,
    });
    this.mail.registerPreview({
      template: TEMPLATES.reminder,
      subject: 'Tomorrow at 13:15 WIB: Zemi #42: Robots that learn from bad data',
      description: 'The day before, 09:00 WIB.',
      render: () => (
        <EventReminder
          firstName="Rina"
          event={sample}
          ticketCode="ZM-7K3F9Q"
          ticketUrl={ticketUrl}
          cancelUrl={`${ticketUrl}?cancel=1`}
          attendanceMode="in-person"
          when="tomorrow"
        />
      ),
    });
    this.mail.registerPreview({
      template: TEMPLATES.starting,
      subject: 'Going live: Zemi #42: Robots that learn from bad data',
      description: 'About 10 minutes before the start, with the live link.',
      render: () => <EventStarting firstName="Rina" event={sample} attendanceMode="online" ticketUrl={ticketUrl} minutesToStart={8} />,
    });
    this.mail.registerPreview({
      template: TEMPLATES.thanks,
      subject: 'Thanks for coming. The recording is up',
      description: 'Within 3 hours after the end, with the recording and photos when ready.',
      render: () => (
        <EventThanks
          firstName="Rina"
          event={sample}
          attended
          attendanceMode="in-person"
          recordingUrl={`${sample.eventUrl}#recording`}
          photosUrl={`${sample.eventUrl}#photos`}
        />
      ),
    });
    this.mail.registerPreview({
      template: TEMPLATES.update,
      subject: 'Room change: we moved to Theater B',
      description: 'An admin broadcast to registrants (sanitized HTML).',
      render: () => (
        <EventUpdate
          subject="Room change: we moved to Theater B"
          html="<p>Hi Rina, small change: we outgrew Theater A. See you in <strong>Theater B</strong>, same floor, two doors down.</p><ul><li>Same time, 13:15 WIB</li><li>Same coffee</li></ul>"
          event={{ ...sample, venueLabel: 'Theater B, Building B, floor 3' }}
          ticketUrl={ticketUrl}
          attendanceMode="in-person"
        />
      ),
    });
    this.mail.registerPreview({
      template: TEMPLATES.eventCancelled,
      subject: 'Cancelled: Zemi #42 on Friday, 2 October 2026',
      description: 'Sent to everyone with a seat when the organizers cancel the event.',
      render: () => <EventCancelled firstName="Rina" event={sample} reason="Campus is closed for a public holiday. We'll pick this talk up next week." />,
    });
  }
}
