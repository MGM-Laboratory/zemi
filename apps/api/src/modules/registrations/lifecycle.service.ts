import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db/client.js';
import { eventMedia, events, streamSessions } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PeopleContext, type EventCtx } from './people-context.service.js';
import { PeopleMailer, TEMPLATES, type BatchCounts } from './people-mail.service.js';
import { lifecycleStageSent, lifecycleStaleBefore, lifecycleWindowOpens, type LifecycleStage } from './registration-rules.js';

export const LIFECYCLE_QUEUE = 'people.lifecycle';
/** Enqueued by the events workstream on cancel with `notify: true`. This module owns the handler. */
export const EVENT_CANCELLED_QUEUE = 'event.cancelled.notify';

const MIN = 60_000;
const HOUR = 60 * MIN;

type Stage = LifecycleStage;
const COLUMN = { reminder: events.reminderSentAt, starting: events.startingSentAt, thanks: events.thanksSentAt } as const;

export interface TickReport {
  checked: number;
  sent: Array<{ eventId: string; stage: Stage; counts: BatchCounts }>;
}

/**
 * Lifecycle emails (SPEC 10), polled every 5 minutes by a pg-boss cron (Asia/Jakarta):
 *
 * - reminder: from 09:00 WIB on the Jakarta day before the start, until 1 hour before the start.
 * - starting: from 10 minutes before the start, until 15 minutes before the end.
 * - thanks:   from the end, until 3 hours after the end. Waits (up to 2 hours) while the stream is still live
 *             or a recording is still being stitched, so the email can carry the recording link.
 *
 * Events: visibility published or unlisted (both take sign-ups), not cancelled. Recipients: active seats.
 * Each stage is claimed with a conditional UPDATE of `events.<stage>_sent_at` before sending, so two workers
 * or two ticks never double-send; email_logs dedupe makes a retried batch skip people already done. A sent
 * time more than 6 hours before the stage's current window (the event moved to another day) is stale: that stage
 * runs again. Same-day nudges (starting 20 minutes late, running over) never re-send.
 * Toggles: `site_settings.email` sendReminders / sendStartingNow / sendThankYou (default on).
 */
@Injectable()
export class LifecycleService implements OnModuleInit {
  private readonly logger = new Logger('Lifecycle');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jobs: JobsService,
    private readonly ctx: PeopleContext,
    private readonly mailer: PeopleMailer,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // Register synchronously; `schedule()` waits for pg-boss, so never await it during module init.
    this.jobs.register(LIFECYCLE_QUEUE, () => this.tick(), { policy: 'singleton', retryLimit: 0, expireInSeconds: 20 * 60 });
    this.jobs.register<{ eventId: string }>(EVENT_CANCELLED_QUEUE, (job) => this.notifyCancelled(job.data.eventId), {
      retryLimit: 3,
      retryDelay: 60,
      expireInSeconds: 30 * 60,
    });
    void this.jobs
      .schedule(LIFECYCLE_QUEUE, '*/5 * * * *', {}, { key: 'tick' })
      .then(() => this.logger.log('Lifecycle emails scheduled every 5 minutes'))
      .catch((err: unknown) => this.logger.error(`Could not schedule lifecycle emails: ${(err as Error).message}`));
  }

  /** One pass over upcoming, ongoing and just-ended events. Safe to run any time, as often as you like. */
  async tick(now = new Date()): Promise<TickReport> {
    const settings = await this.ctx.emailSettings();
    const report: TickReport = { checked: 0, sent: [] };
    if (!settings.sendReminders && !settings.sendStartingNow && !settings.sendThankYou) return report;
    const candidates = await this.db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          ne(events.visibility, 'draft'),
          isNull(events.cancelledAt),
          lt(events.startsAt, new Date(now.getTime() + 48 * HOUR)),
          gt(events.endsAt, new Date(now.getTime() - 3 * HOUR)),
        ),
      );
    report.checked = candidates.length;
    for (const { id } of candidates) {
      const event = await this.ctx.event(id);
      if (!event) continue;
      try {
        for (const stage of await this.dueStages(event, now, settings)) {
          const counts = await this.runStage(event, stage, now);
          if (counts) report.sent.push({ eventId: id, stage, counts });
        }
      } catch (err) {
        this.logger.error(`Lifecycle emails for ${id} failed: ${(err as Error).message}`);
      }
    }
    if (report.sent.length) this.logger.log(`Lifecycle tick sent ${report.sent.map((s) => `${s.stage}:${s.counts.recipients}`).join(', ')}`);
    return report;
  }

  /** When each stage's window opens for the event's current times (see `lifecycleWindowOpens`). */
  private windowOpens(event: EventCtx): Record<Stage, Date> {
    return lifecycleWindowOpens(event.row.startsAt, event.row.endsAt);
  }

  private async dueStages(event: EventCtx, now: Date, settings: Awaited<ReturnType<PeopleContext['emailSettings']>>): Promise<Stage[]> {
    const e = event.row;
    const t = now.getTime();
    const start = e.startsAt.getTime();
    const end = e.endsAt.getTime();
    const opens = this.windowOpens(event);
    const done = (sentAt: Date | null, stage: Stage) => lifecycleStageSent(sentAt, opens[stage]);
    const due: Stage[] = [];
    if (settings.sendReminders && !done(e.reminderSentAt, 'reminder') && t >= opens.reminder.getTime() && t < start - HOUR) due.push('reminder');
    if (settings.sendStartingNow && !done(e.startingSentAt, 'starting') && t >= opens.starting.getTime() && t < end - 15 * MIN) due.push('starting');
    if (settings.sendThankYou && !done(e.thanksSentAt, 'thanks') && t >= end && t < end + 3 * HOUR) {
      const waiting = t < end + 2 * HOUR && (event.streamState === 'live' || (await this.recordingInProgress(e.id)));
      if (!waiting) due.push('thanks');
    }
    return due;
  }

  private async recordingInProgress(eventId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: streamSessions.id })
      .from(streamSessions)
      .where(and(eq(streamSessions.eventId, eventId), inArray(streamSessions.recordingStatus, ['recording', 'waiting', 'processing'])))
      .limit(1);
    return !!row;
  }

  private async runStage(event: EventCtx, stage: Stage, now: Date): Promise<BatchCounts | null> {
    const col = COLUMN[stage];
    const opens = this.windowOpens(event)[stage];
    const [claimed] = await this.db
      .update(events)
      .set({ [stage === 'reminder' ? 'reminderSentAt' : stage === 'starting' ? 'startingSentAt' : 'thanksSentAt']: now })
      .where(and(eq(events.id, event.row.id), or(isNull(col), lt(col, lifecycleStaleBefore(opens)))))
      .returning({ id: events.id });
    if (!claimed) return null;
    const template = stage === 'reminder' ? TEMPLATES.reminder : stage === 'starting' ? TEMPLATES.starting : TEMPLATES.thanks;
    // Dedupe against this schedule only: people reminded about the old date get the new one.
    const since = new Date(Math.max(now.getTime() - 12 * HOUR, lifecycleStaleBefore(opens).getTime()));
    const regs = await this.mailer.recipients(event.row.id, template, since);
    let counts: BatchCounts;
    if (stage === 'reminder') counts = await this.mailer.sendReminders(event, regs, now);
    else if (stage === 'starting') counts = await this.mailer.sendStarting(event, regs, now);
    else counts = await this.mailer.sendThanks(event, regs, await this.thanksLinks(event));
    await this.audit.log({
      principal: 'system',
      action: `event.email-${stage}`,
      resourceType: 'event',
      resourceId: event.row.id,
      summary: `Sent the ${stage === 'reminder' ? 'day-before reminder' : stage === 'starting' ? '"starting now" email' : 'thank you email'} for "${event.row.title}" to ${counts.recipients} ${counts.recipients === 1 ? 'person' : 'people'}`,
      meta: { ...counts },
    });
    return counts;
  }

  /** Recording and photo links for the thank you email, when there is something to link to. */
  private async thanksLinks(event: EventCtx): Promise<{ recordingUrl: string | null; photosUrl: string | null }> {
    const base = this.ctx.eventUrl(event.row.slug);
    const [rec] = await this.db
      .select({ id: streamSessions.id })
      .from(streamSessions)
      .where(and(eq(streamSessions.eventId, event.row.id), eq(streamSessions.recordingStatus, 'ready'), eq(streamSessions.visibility, 'public')))
      .limit(1);
    const [media] = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(eventMedia)
      .where(eq(eventMedia.eventId, event.row.id));
    return { recordingUrl: rec ? `${base}#recording` : null, photosUrl: (media?.n ?? 0) > 0 ? `${base}#photos` : null };
  }

  /** Worker for `event.cancelled.notify` { eventId }. Retry safe: skips people emailed since the cancel. */
  async notifyCancelled(eventId: string): Promise<BatchCounts | null> {
    const event = await this.ctx.event(eventId);
    if (!event) {
      this.logger.warn(`event.cancelled.notify: event ${eventId} is gone`);
      return null;
    }
    if (!event.row.cancelledAt) {
      this.logger.log(`event.cancelled.notify: "${event.row.title}" was restored before we could email, skipping`);
      return null;
    }
    const regs = await this.mailer.recipients(eventId, TEMPLATES.eventCancelled, event.row.cancelledAt);
    const counts = await this.mailer.sendEventCancelled(event, regs);
    await this.audit.log({
      principal: 'system',
      action: 'event.email-cancelled',
      resourceType: 'event',
      resourceId: eventId,
      summary: `Told ${counts.recipients} ${counts.recipients === 1 ? 'person' : 'people'} that "${event.row.title}" is cancelled`,
      meta: { ...counts },
    });
    if (counts.failed > 0 && counts.failed === counts.recipients) throw new Error(`All ${counts.failed} cancellation emails failed`);
    return counts;
  }
}
