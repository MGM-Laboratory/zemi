import { Inject, Injectable } from '@nestjs/common';
import { isValidSlug, safeWebUrl, type EventCard, type EventDetail, type Paginated } from '@zemi/shared';
import { and, asc, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { notFound, pageToLimitOffset, paginated, SlugService } from '../../common/index.js';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db } from '../../db/client.js';
import { events, eventStreams } from '../../db/schema.js';
import type { EventListQuery } from './events.admin.service.js';
import { EventsLoader, selectEventList } from './events.loader.js';
import { buildEventIcs, icsFilename } from './ics.js';
import {
  isLive,
  searchCondition,
  speakerCondition,
  streamJoin,
  tagCondition,
  whenCondition,
  yearCondition,
} from './events.sql.js';

const PUBLIC_VISIBILITIES = ['published', 'unlisted'] as const;
const isPublished = eq(events.visibility, 'published');

/**
 * Public side of events (no auth). Lists only show `published` events; a detail page also works for
 * `unlisted` ones (link only). Drafts are 404, including through old-slug redirects.
 */
@Injectable()
export class EventsPublicService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly loader: EventsLoader,
    private readonly slugs: SlugService,
    private readonly config: AppConfig,
  ) {}

  async list(q: EventListQuery): Promise<Paginated<EventCard>> {
    const now = new Date();
    const where = and(
      isPublished,
      whenCondition(q.when, now, 'public'),
      searchCondition(q.search, 'public'),
      tagCondition(q.tag),
      speakerCondition(q.speaker, 'public'),
      yearCondition(q.year),
    );
    const ascending = q.when === 'upcoming' || q.when === 'live';
    const order = ascending
      ? [asc(events.startsAt), asc(events.id)]
      : [desc(events.startsAt), desc(events.id)];
    const { limit, offset } = pageToLimitOffset(q);
    const [rows, totals] = await Promise.all([
      selectEventList(this.db)
        .where(where)
        .orderBy(...order)
        .limit(limit)
        .offset(offset),
      this.db.select({ n: count() }).from(events).leftJoin(eventStreams, streamJoin).where(where),
    ]);
    return paginated(await this.loader.toCards(rows, 'public', now), totals[0]?.n ?? 0, q);
  }

  /** The event that is live now, else the next one that hasn't ended (ongoing or scheduled), else null. */
  async next(): Promise<EventCard | null> {
    const now = new Date();
    const base = and(isPublished, isNull(events.cancelledAt));
    let [row] = await selectEventList(this.db)
      .where(and(base, isLive))
      .orderBy(sql`${eventStreams.liveStartedAt} desc nulls last`, asc(events.startsAt))
      .limit(1);
    if (!row) {
      [row] = await selectEventList(this.db)
        .where(and(base, gt(events.endsAt, now)))
        .orderBy(asc(events.startsAt), asc(events.id))
        .limit(1);
    }
    if (!row) return null;
    const [card] = await this.loader.toCards([row], 'public', now);
    return card ?? null;
  }

  /**
   * EventDetail by slug, `{ redirect }` for an old slug (or a differently cased one), 404 otherwise.
   * Anything that can't be a slug (even lowercased) is a plain 404 without a lookup: every current and
   * old slug went through `ensureUniqueSlug`, and junk like a NUL byte would make Postgres throw.
   */
  async bySlug(raw: string): Promise<EventDetail | { redirect: string }> {
    const slug = (raw ?? '').trim();
    const missing = () => notFound("We couldn't find that Friday. Maybe it moved?");
    if (!isValidSlug(slug.toLowerCase())) throw missing();

    let resolved = await this.slugs.resolveSlug('event', slug);
    const lower = slug.toLowerCase();
    if (!resolved && lower !== slug) {
      const again = await this.slugs.resolveSlug('event', lower);
      if (again) resolved = 'id' in again ? { redirect: lower } : again;
    }
    if (!resolved) throw missing();

    if ('redirect' in resolved) {
      const [target] = await this.db
        .select({ visibility: events.visibility })
        .from(events)
        .where(eq(events.slug, resolved.redirect))
        .limit(1);
      if (!target || target.visibility === 'draft') throw missing();
      return { redirect: resolved.redirect };
    }

    const full = await this.loader.loadFull(resolved.id);
    if (!full || full.event.visibility === 'draft') throw missing();
    return this.loader.publicDetail(full);
  }

  /** `.ics` for a published or unlisted event (by id). */
  async calendar(id: string): Promise<{ filename: string; body: string }> {
    const full = await this.loader.loadFull(id);
    if (
      !full ||
      !PUBLIC_VISIBILITIES.includes(full.event.visibility as (typeof PUBLIC_VISIBILITIES)[number])
    ) {
      throw notFound("We couldn't find that Friday.");
    }
    const e = full.event;
    const body = buildEventIcs(
      {
        id: e.id,
        slug: e.slug,
        number: e.number ?? null,
        title: e.title,
        summary: e.summary ?? null,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        mode: e.mode,
        roomNote: e.roomNote ?? null,
        mapsUrl: safeWebUrl(e.mapsUrl),
        onlineNote: e.onlineNote ?? null,
        tags: e.tags ?? [],
        cancelledAt: e.cancelledAt ?? null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        venue: full.venue
          ? {
              name: full.venue.name,
              building: full.venue.building ?? null,
              floor: full.venue.floor ?? null,
              address: full.venue.address ?? null,
              mapsUrl: safeWebUrl(full.venue.mapsUrl),
            }
          : null,
      },
      this.config.env.PUBLIC_WEB_URL,
    );
    return { filename: icsFilename(e), body };
  }
}
