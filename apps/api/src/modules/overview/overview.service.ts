import { Inject, Injectable } from '@nestjs/common';
import { type Ability, type AdminOverview, type AuditEntry } from '@zemi/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  lte,
  notLike,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { visibleIds } from '../../auth/index.js';
import { DB, type Db } from '../../db/client.js';
import {
  auditLogs,
  contactMessages,
  events,
  eventStreams,
  publications,
  registrations,
  speakers,
} from '../../db/schema.js';
import { redactAuditEntry, toAuditEntry } from '../audit/audit.service.js';
import { eventLabel, upcomingFridays } from '../events/event-logic.js';
import { EventsLoader, selectEventList } from '../events/events.loader.js';
import { isLive, streamJoin } from '../events/events.sql.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_FRIDAY_WEEKS = 8;
const LIST_SIZE = 6;
const TREND_SIZE = 12;
const ACTIVITY_SIZE = 15;
/** Postgres regex for "an email is in this text" (masked ones too: r***e@example.com). */
const EMAIL_IN_TEXT = '[^[:space:]@()]+@[^[:space:]@()]+\\.[[:alpha:]]{2,}';

/** `undefined` = no restriction, `false` = nothing visible, else an `IN (...)` on the id column. */
function scopeOf(
  ids: 'all' | string[],
  column: typeof events.id | typeof speakers.id | typeof publications.id,
): SQL | undefined | false {
  if (ids === 'all') return undefined;
  const clean = ids.filter((id) => UUID.test(id));
  return clean.length ? inArray(column, clean) : false;
}

/**
 * The dashboard home. Everything is scoped to what the principal can view: a door-crew admin with
 * one event sees that one event, its numbers and its activity.
 */
@Injectable()
export class OverviewService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly loader: EventsLoader,
  ) {}

  async overview(ability: Ability): Promise<AdminOverview> {
    const now = new Date();
    const eventScope = scopeOf(visibleIds(ability, 'event'), events.id);
    const fridays = upcomingFridays(now, EMPTY_FRIDAY_WEEKS);

    const [emptyFridays, speakerTotal, publicationTotal, unreadMessages, activity] =
      await Promise.all([
        this.emptyFridays(fridays),
        this.countVisible(speakers, scopeOf(visibleIds(ability, 'speaker'), speakers.id)),
        this.countVisible(
          publications,
          scopeOf(visibleIds(ability, 'publication'), publications.id),
        ),
        ability.has('inbox.view')
          ? this.db
              .select({ n: count() })
              .from(contactMessages)
              .where(eq(contactMessages.status, 'new'))
              .then((r) => r[0]?.n ?? 0)
          : Promise.resolve(null),
        this.activity(ability),
      ]);

    if (eventScope === false) {
      return {
        now: now.toISOString(),
        live: null,
        next: null,
        upcoming: [],
        recent: [],
        emptyFridays,
        totals: {
          events: 0,
          upcoming: 0,
          speakers: speakerTotal,
          publications: publicationTotal,
          registrations: 0,
          checkIns: 0,
          unreadMessages,
        },
        trend: [],
        activity,
      };
    }

    const scope = eventScope;
    const ongoingByTime = and(lte(events.startsAt, now), gt(events.endsAt, now));
    const notCancelled = isNull(events.cancelledAt);
    const upcomingByTime = or(gt(events.endsAt, now), isLive);
    const pastByTime = and(
      lte(events.endsAt, now),
      sql`coalesce(${eventStreams.state}, 'idle') <> 'live'`,
    );

    const [liveRows, nextRows, upcomingRows, recentRows, trendRows, totals] = await Promise.all([
      selectEventList(this.db)
        .where(and(scope, notCancelled, or(isLive, ongoingByTime)))
        .orderBy(sql`(coalesce(${eventStreams.state}, 'idle') = 'live') desc`, asc(events.startsAt))
        .limit(1),
      selectEventList(this.db)
        .where(
          and(
            scope,
            notCancelled,
            gt(events.startsAt, now),
            sql`coalesce(${eventStreams.state}, 'idle') <> 'live'`,
          ),
        )
        .orderBy(asc(events.startsAt), asc(events.id))
        .limit(1),
      selectEventList(this.db)
        .where(and(scope, upcomingByTime))
        .orderBy(asc(events.startsAt), asc(events.id))
        .limit(LIST_SIZE + 1),
      selectEventList(this.db)
        .where(and(scope, pastByTime))
        .orderBy(desc(events.startsAt), desc(events.id))
        .limit(LIST_SIZE),
      this.db
        .select({ id: events.id, number: events.number, startsAt: events.startsAt })
        .from(events)
        .leftJoin(eventStreams, streamJoin)
        .where(and(scope, notCancelled, pastByTime))
        .orderBy(desc(events.startsAt))
        .limit(TREND_SIZE),
      this.totals(scope, now),
    ]);

    const liveRow = liveRows[0];
    const upcoming = upcomingRows.filter((r) => r.id !== liveRow?.id).slice(0, LIST_SIZE);
    const rowsToMap = [...(liveRow ? [liveRow] : []), ...nextRows, ...upcoming, ...recentRows];
    const unique = [...new Map(rowsToMap.map((r) => [r.id, r])).values()];
    const mapped = new Map(
      (await this.loader.toAdminRows(unique, ability, now)).map((r) => [r.id, r]),
    );

    const trendIds = trendRows.map((r) => r.id);
    const counts = await this.loader.countsByEvent(trendIds);
    const trend = [...trendRows].reverse().map((r) => {
      const c = counts.get(r.id);
      return {
        eventId: r.id,
        label: eventLabel(r),
        startsAt: r.startsAt.toISOString(),
        registrations: c?.registrations ?? 0,
        checkedIn: c?.checkedIn ?? 0,
      };
    });

    return {
      now: now.toISOString(),
      live: liveRow ? (mapped.get(liveRow.id) ?? null) : null,
      next: nextRows[0] ? (mapped.get(nextRows[0].id) ?? null) : null,
      upcoming: upcoming.map((r) => mapped.get(r.id)!).filter(Boolean),
      recent: recentRows.map((r) => mapped.get(r.id)!).filter(Boolean),
      emptyFridays,
      totals: {
        ...totals,
        speakers: speakerTotal,
        publications: publicationTotal,
        unreadMessages,
      },
      trend,
      activity,
    };
  }

  /** Upcoming Fridays with no event at all (any visibility, cancelled included, whoever can see it). */
  private async emptyFridays(fridays: string[]): Promise<string[]> {
    if (!fridays.length) return [];
    const rows = await this.db
      .selectDistinct({
        date: sql<string>`to_char(${events.startsAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`,
      })
      .from(events)
      .where(
        and(
          sql`${events.startsAt} >= (${fridays[0]}::date - interval '1 day')`,
          sql`${events.startsAt} < (${fridays[fridays.length - 1]}::date + interval '2 days')`,
        ),
      );
    const taken = new Set(rows.map((r) => r.date));
    return fridays.filter((d) => !taken.has(d));
  }

  private async totals(scope: SQL | undefined, now: Date) {
    const regScope = scope
      ? sql`${registrations.eventId} in (select ${events.id} from ${events} where ${scope})`
      : undefined;
    const [eventTotals, regTotals] = await Promise.all([
      this.db
        .select({
          events: count(),
          upcoming:
            sql<number>`count(*) filter (where ${events.cancelledAt} is null and (${events.endsAt} > ${now.toISOString()}::timestamptz or coalesce(${eventStreams.state}, 'idle') = 'live'))`.mapWith(
              Number,
            ),
        })
        .from(events)
        .leftJoin(eventStreams, streamJoin)
        .where(scope),
      this.db
        .select({
          registrations: count(),
          checkIns:
            sql<number>`count(*) filter (where ${registrations.checkedInAt} is not null)`.mapWith(
              Number,
            ),
        })
        .from(registrations)
        .where(and(eq(registrations.status, 'registered'), regScope)),
    ]);
    return {
      events: eventTotals[0]?.events ?? 0,
      upcoming: eventTotals[0]?.upcoming ?? 0,
      registrations: regTotals[0]?.registrations ?? 0,
      checkIns: regTotals[0]?.checkIns ?? 0,
    };
  }

  private async countVisible(
    table: typeof speakers | typeof publications,
    scope: SQL | undefined | false,
  ): Promise<number> {
    if (scope === false) return 0;
    const [r] = await this.db.select({ n: count() }).from(table).where(scope);
    return r?.n ?? 0;
  }

  /**
   * Latest audit entries.
   * - Superadmin: everything, IPs and meta included.
   * - `audit.view`: everything except sign-ins (`auth.*`, `session.*`), with IPs and device details
   *   redacted (`redactAuditEntry`).
   * - Everyone else: content changes (`event.*`) on events they can view, without IP or meta, plus
   *   their own actions (redacted too), never sign-ins.
   * For every non-superadmin, entries that name registrants (`registration.*`, or a summary with an
   * email, even masked) show only on events where they have `registrations.view`. Filtering happens
   * in SQL so the list still has 15 rows.
   */
  private async activity(ability: Ability): Promise<AuditEntry[]> {
    if (ability.isSuperadmin) {
      const rows = await this.db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(ACTIVITY_SIZE);
      return rows.map(toAuditEntry);
    }
    const full = ability.has('audit.view');
    const where: SQL[] = [notLike(auditLogs.action, 'auth.%'), notLike(auditLogs.action, 'session.%'), this.peopleClause(ability)];
    if (!full) {
      const ids = visibleIds(ability, 'event');
      const own = and(eq(auditLogs.actorType, 'admin'), eq(auditLogs.actorId, ability.principal.id));
      // Content changes only (`event.*`): registration and check-in entries can name people.
      const aboutEvents = and(eq(auditLogs.resourceType, 'event'), like(auditLogs.action, 'event.%'));
      const clean = ids === 'all' ? ids : ids.filter((id) => UUID.test(id));
      const eventClause =
        clean === 'all' ? aboutEvents : clean.length ? and(aboutEvents, inArray(auditLogs.resourceId, clean)) : undefined;
      where.push((eventClause ? or(eventClause, own) : own)!);
    }
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(and(...where))
      .orderBy(desc(auditLogs.createdAt))
      .limit(ACTIVITY_SIZE);
    return rows.map((r) => {
      const entry = redactAuditEntry(toAuditEntry(r));
      return full || entry.actorId === ability.principal.id ? entry : { ...entry, meta: null };
    });
  }

  /**
   * Entries that name registrants need `registrations.view` on their event: `registration.*` rows
   * (event id in `meta.eventId`) and any summary with an email in it (event id in `resource_id` for
   * `event.*` rows, like "Sent a test of ... to m***w@example.com").
   */
  private peopleClause(ability: Ability): SQL {
    const aboutPeople = sql`(${auditLogs.action} like 'registration.%' or ${auditLogs.summary} ~ ${EMAIL_IN_TEXT})`;
    if (ability.canAll('event', 'registrations.view')) return sql`true`;
    const ids = ability.idsWith('event', 'registrations.view').filter((id) => UUID.test(id));
    if (!ids.length) return sql`not ${aboutPeople}`;
    const eventOf = sql`coalesce(${auditLogs.meta} ->> 'eventId', case when ${auditLogs.resourceType} = 'event' then ${auditLogs.resourceId} end)`;
    return sql`(not ${aboutPeople} or ${eventOf} in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )}))`;
  }
}
