/**
 * SQL building blocks for event lists. Every list query selects from `events` left-joined with
 * `event_streams` (for the live state) and `venues`, so these conditions can reference all three.
 */
import { and, eq, gt, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { searchPattern } from '../../common/index.js';
import { events, eventSpeakers, eventStreams, speakers, venues } from '../../db/schema.js';

export type When = 'upcoming' | 'past' | 'live' | 'all';
export type Audience = 'public' | 'admin';

/** Stream is live (no `event_streams` row means idle). */
export const isLive: SQL = sql`coalesce(${eventStreams.state}, 'idle') = 'live'`;
const notLive: SQL = sql`coalesce(${eventStreams.state}, 'idle') <> 'live'`;

/**
 * Time buckets.
 *
 * Public follows `computeEventStatus`: upcoming = scheduled or ongoing (not cancelled), past = past
 * (not cancelled). Cancelled events only show up in `all` and on their own page.
 *
 * Admin buckets are by time only, so a cancelled Friday still sits in "upcoming" where someone can
 * restore it, and in "past" once its date has gone by.
 */
export function whenCondition(when: When, now: Date, audience: Audience): SQL | undefined {
  const upcomingByTime = or(gt(events.endsAt, now), isLive)!;
  const pastByTime = and(lte(events.endsAt, now), notLive)!;
  switch (when) {
    case 'live':
      return audience === 'public' ? and(isLive, isNull(events.cancelledAt)) : isLive;
    case 'upcoming':
      return audience === 'public'
        ? and(isNull(events.cancelledAt), upcomingByTime)
        : upcomingByTime;
    case 'past':
      return audience === 'public' ? and(isNull(events.cancelledAt), pastByTime) : pastByTime;
    default:
      return undefined;
  }
}

/** Speakers the public may see (drafts are hidden everywhere public). */
const publicSpeaker = sql`${speakers.visibility} <> 'draft'`;

/**
 * Search title, summary, slug, description text, tags, speaker names and nicknames. "12" or "#12"
 * also matches Zemi #12.
 */
export function searchCondition(
  search: string | null | undefined,
  audience: Audience,
): SQL | undefined {
  const p = searchPattern(search);
  if (!p) return undefined;
  const speakerMatch = sql`exists (
    select 1 from ${eventSpeakers} inner join ${speakers} on ${speakers.id} = ${eventSpeakers.speakerId}
    where ${eventSpeakers.eventId} = ${events.id}
      and (${speakers.fullName} ilike ${p} or ${speakers.nickname} ilike ${p})
      ${audience === 'public' ? sql`and ${publicSpeaker}` : sql``}
  )`;
  const parts: SQL[] = [
    ilike(events.title, p),
    ilike(events.summary, p),
    ilike(events.slug, p),
    ilike(events.descriptionText, p),
    sql`exists (select 1 from unnest(${events.tags}) as t(tag) where t.tag ilike ${p})`,
    speakerMatch,
  ];
  const n = (search ?? '').trim().match(/^#?(\d{1,6})$/);
  if (n) parts.push(eq(events.number, Number(n[1])));
  return or(...parts);
}

/** Case-insensitive tag match. */
export function tagCondition(tag: string | null | undefined): SQL | undefined {
  const t = (tag ?? '').trim();
  if (!t) return undefined;
  return sql`exists (select 1 from unnest(${events.tags}) as t(tag) where lower(t.tag) = lower(${t}))`;
}

/** Events featuring the speaker with this slug. */
export function speakerCondition(
  slug: string | null | undefined,
  audience: Audience,
): SQL | undefined {
  const s = (slug ?? '').trim().toLowerCase();
  if (!s) return undefined;
  return sql`exists (
    select 1 from ${eventSpeakers} inner join ${speakers} on ${speakers.id} = ${eventSpeakers.speakerId}
    where ${eventSpeakers.eventId} = ${events.id} and ${speakers.slug} = ${s}
      ${audience === 'public' ? sql`and ${publicSpeaker}` : sql``}
  )`;
}

/** Events that start in this Jakarta calendar year. */
export function yearCondition(year: number | null | undefined): SQL | undefined {
  if (!year) return undefined;
  return sql`extract(year from (${events.startsAt} at time zone 'Asia/Jakarta'))::int = ${year}`;
}

/** Columns every card/row needs (no description jsonb). */
export const listColumns = {
  id: events.id,
  slug: events.slug,
  number: events.number,
  title: events.title,
  summary: events.summary,
  coverAssetId: events.coverAssetId,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  venueId: events.venueId,
  mode: events.mode,
  accent: events.accent,
  tags: events.tags,
  visibility: events.visibility,
  registrationOpen: events.registrationOpen,
  capacity: events.capacity,
  registrationClosesAt: events.registrationClosesAt,
  showRegistrantCount: events.showRegistrantCount,
  cancelledAt: events.cancelledAt,
  streamState: eventStreams.state,
  liveStartedAt: eventStreams.liveStartedAt,
  venueName: venues.name,
  venueKind: venues.kind,
} as const;

/** Join clause targets used with `listColumns`. */
export const streamJoin = eq(eventStreams.eventId, events.id);
export const venueJoin = eq(venues.id, events.venueId);
