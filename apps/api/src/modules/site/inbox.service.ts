import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  formatJakarta,
  formatTimeRange,
  type ContactMessage,
  type ContactStatus,
  type InboxListQuery,
  type Paginated,
  type Principal,
} from '@zemi/shared';
import { and, count, desc, eq, ilike, ne, or, type SQL } from 'drizzle-orm';
import { createElement } from 'react';
import { notFound } from '../../common/errors.js';
import { pageToLimitOffset, paginated, searchPattern } from '../../common/pagination.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db } from '../../db/client.js';
import { contactMessages } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { SiteService, type Ctx } from './site.service.js';
import { ContactAutoReplyEmail } from './templates/contact-auto-reply.js';
import { ContactNotificationEmail } from './templates/contact-notification.js';

type MessageRow = typeof contactMessages.$inferSelect;

export interface ContactSubmission {
  name: string;
  email: string;
  topic: string;
  message: string;
  /** Honeypot. Real people never see or fill it. */
  website?: string;
}

/** Per IP: a handful of messages per 15 minutes is plenty for a human. */
const CONTACT_LIMIT = { limit: 5, windowMs: 15 * 60_000 };
/** Per address: stops one inbox from being flooded with auto-replies. */
const CONTACT_EMAIL_LIMIT = { limit: 3, windowMs: 60 * 60_000 };

function toMessage(row: MessageRow): ContactMessage {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    topic: row.topic,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Contact form (public) and the admin inbox. */
@Injectable()
export class InboxService implements OnModuleInit {
  private readonly logger = new Logger('Inbox');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: AppConfig,
    private readonly site: SiteService,
    private readonly mail: MailService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    const sample = {
      name: 'Rina Maharani',
      email: 'rina.maharani@ui.ac.id',
      topic: 'I want to present',
      message:
        'Hi Zemi crew!\n\nI am a second year Master’s student working on sign language recognition for BISINDO. I have early results and a lot of questions. Could I present sometime in November?\n\nThanks,\nRina',
    };
    this.mail.registerPreview({
      template: 'contact-notification',
      subject: `New message from ${sample.name}: ${sample.topic}`,
      description: 'Sent to the organizers when someone uses the contact form.',
      render: () =>
        createElement(ContactNotificationEmail, { ...sample, sentAt: `${formatJakarta(new Date(), 'datetime')} WIB`, previousMessages: 1 }),
    });
    this.mail.registerPreview({
      template: 'contact-auto-reply',
      subject: 'Got your message',
      description: 'Sent to the person who used the contact form, right away.',
      render: () =>
        createElement(ContactAutoReplyEmail, {
          name: sample.name,
          topic: sample.topic,
          message: sample.message,
          officeHours: 'Weekdays, 09:00 to 16:00 WIB',
          signature: 'See you Friday,\nThe Zemi crew',
          nextEvent: {
            title: 'Robots, rice fields and the stuff in between',
            number: 106,
            date: 'Fri, 2 Oct 2026',
            time: '13:15 to 15:15 WIB',
            venue: 'Theater A',
            url: `${this.config.env.PUBLIC_WEB_URL}/events`,
          },
        }),
    });
  }

  /* ------------------------------------------------------------------------------ public */

  /**
   * POST /public/contact. A filled honeypot gets the same `{ ok: true }` as a real message, so bots
   * learn nothing, but nothing is stored or sent.
   */
  async submit(input: ContactSubmission, meta: { ip: string | null; userAgent: string | null }): Promise<{ ok: true }> {
    if (input.website && input.website.trim() !== '') {
      this.logger.debug(`Honeypot filled from ${meta.ip ?? 'unknown ip'}, dropped`);
      return { ok: true };
    }
    const email = input.email.trim().toLowerCase();
    this.rateLimit.consume(`contact:${meta.ip ?? 'unknown'}`, CONTACT_LIMIT, "You've sent a few already. Give us a moment to catch up.");
    this.rateLimit.consume(`contact-email:${email}`, CONTACT_EMAIL_LIMIT, 'We already have a few messages from you. We will get back to you soon, promise.');

    const topic = input.topic.trim() || 'Something else';
    const [row] = await this.db
      .insert(contactMessages)
      .values({
        name: input.name.trim(),
        email,
        topic: topic.slice(0, 60),
        message: input.message.trim(),
        status: 'new',
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      })
      .returning();
    await this.audit.log({
      principal: { kind: 'public', name: row.name },
      action: 'contact.create',
      resourceType: 'contact',
      resourceId: row.id,
      summary: `${row.name} sent a message (${row.topic})`,
      ip: meta.ip,
    });
    // Mail never throws, but it can be slow: answer the visitor first.
    void this.sendEmails(row).catch((err: unknown) => this.logger.error(`Contact emails for ${row.id} failed: ${(err as Error).message}`));
    return { ok: true };
  }

  private async sendEmails(row: MessageRow): Promise<void> {
    const [{ notify, contact, email }, nextEvent, [history]] = await Promise.all([
      this.site.contactRecipients(),
      this.site.nextPublicEvent(),
      this.db
        .select({ n: count() })
        .from(contactMessages)
        .where(and(eq(contactMessages.email, row.email), ne(contactMessages.id, row.id))),
    ]);
    const sentAt = `${formatJakarta(row.createdAt, 'datetime')} WIB`;
    const web = this.config.env.PUBLIC_WEB_URL;

    if (notify.length) {
      await this.mail.send({
        to: notify,
        subject: `New message from ${row.name}: ${row.topic}`,
        template: 'contact-notification',
        replyTo: row.email,
        react: createElement(ContactNotificationEmail, {
          name: row.name,
          email: row.email,
          topic: row.topic,
          message: row.message,
          sentAt,
          previousMessages: history?.n ?? 0,
        }),
      });
    } else {
      this.logger.warn('Contact message stored, but no notify address is set (Site settings, Contact).');
    }

    const replyTo = email.replyTo || contact.email || undefined;
    await this.mail.send({
      to: row.email,
      subject: 'Got your message',
      template: 'contact-auto-reply',
      replyTo: replyTo && replyTo.includes('@') ? replyTo : undefined,
      react: createElement(ContactAutoReplyEmail, {
        name: row.name,
        topic: row.topic,
        message: row.message,
        officeHours: contact.officeHours || 'Weekdays, 09:00 to 16:00 WIB',
        signature: email.signature || 'See you Friday,\nThe Zemi crew',
        nextEvent: nextEvent
          ? {
              title: nextEvent.title,
              number: nextEvent.number,
              date: formatJakarta(nextEvent.startsAt, 'date'),
              time: formatTimeRange(nextEvent.startsAt, nextEvent.endsAt),
              venue: nextEvent.venue,
              url: `${web}/events/${nextEvent.slug}`,
            }
          : null,
      }),
    });
  }

  /* ------------------------------------------------------------------------------- admin */

  async list(q: InboxListQuery): Promise<Paginated<ContactMessage>> {
    const where: SQL[] = [];
    if (q.status === 'open') where.push(ne(contactMessages.status, 'archived'));
    else if (q.status !== 'all') where.push(eq(contactMessages.status, q.status));
    if (q.topic) where.push(eq(contactMessages.topic, q.topic));
    const pattern = searchPattern(q.search);
    if (pattern) {
      where.push(or(ilike(contactMessages.name, pattern), ilike(contactMessages.email, pattern), ilike(contactMessages.message, pattern))!);
    }
    const cond = where.length ? and(...where) : undefined;
    const { limit, offset } = pageToLimitOffset(q);
    const [rows, [total]] = await Promise.all([
      this.db.select().from(contactMessages).where(cond).orderBy(desc(contactMessages.createdAt), desc(contactMessages.id)).limit(limit).offset(offset),
      this.db.select({ n: count() }).from(contactMessages).where(cond),
    ]);
    return paginated(rows.map(toMessage), total?.n ?? 0, q);
  }

  async unreadCount(): Promise<{ count: number }> {
    const [row] = await this.db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, 'new'));
    return { count: row?.n ?? 0 };
  }

  async get(id: string): Promise<ContactMessage> {
    return toMessage(await this.find(id));
  }

  async setStatus(id: string, status: ContactStatus, ctx: Ctx): Promise<ContactMessage> {
    const existing = await this.find(id);
    if (existing.status === status) return toMessage(existing);
    const [row] = await this.db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id)).returning();
    await this.audit.log({
      principal: ctx.principal,
      action: 'inbox.update',
      resourceType: 'contact',
      resourceId: id,
      summary: `Marked the message from ${row.name} as ${status}`,
      meta: { from: existing.status, to: status },
      ip: ctx.ip,
    });
    return toMessage(row);
  }

  async remove(id: string, ctx: { principal: Principal; ip: string | null }): Promise<void> {
    const existing = await this.find(id);
    await this.db.delete(contactMessages).where(eq(contactMessages.id, id));
    await this.audit.log({
      principal: ctx.principal,
      action: 'inbox.delete',
      resourceType: 'contact',
      resourceId: id,
      summary: `Deleted the message from ${existing.name}`,
      meta: { topic: existing.topic, status: existing.status },
      ip: ctx.ip,
    });
  }

  private async find(id: string): Promise<MessageRow> {
    const [row] = await this.db.select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1);
    if (!row) throw notFound("We couldn't find that message. Someone may have deleted it.");
    return row;
  }
}
