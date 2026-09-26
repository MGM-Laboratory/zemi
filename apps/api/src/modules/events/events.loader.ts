import { Inject, Injectable } from '@nestjs/common';
import { safeWebUrl } from '@zemi/shared';
import type {
  Ability,
  EventAdmin,
  EventAdminRow,
  EventCard,
  EventDetail,
  EventMediaAdminItem,
  EventSpeaker,
  ImageRef,
  PublicationCard,
  PublicationStatus,
  PublicationType,
  Recording,
  RundownItem,
  SpeakerRef,
} from '@zemi/shared';
import { and, asc, desc, eq, inArray, isNull, lt, gt, or, sql } from 'drizzle-orm';
import { AssetRefsService, type AssetRow } from '../../common/index.js';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import {
  eventMedia,
  eventPublications,
  eventSpeakers,
  eventStreams,
  events,
  publicationAuthors,
  publications,
  registrations,
  rundownItems,
  speakers,
  streamSessions,
  venues,
  assets,
} from '../../db/schema.js';
import { eventStatus, recordingChapters, registrationInfo, streamPublic } from './event-logic.js';
import { listColumns, streamJoin, venueJoin, type Audience } from './events.sql.js';

/** `SELECT listColumns FROM events LEFT JOIN event_streams LEFT JOIN venues` (dynamic, add where/order/limit). */
export function selectEventList(db: DbOrTx) {
  return db
    .select(listColumns)
    .from(events)
    .leftJoin(eventStreams, streamJoin)
    .leftJoin(venues, venueJoin)
    .$dynamic();
}
export type EventListRow = Awaited<ReturnType<typeof selectEventList>>[number];

export type EventRow = typeof events.$inferSelect;
type StreamRow = typeof eventStreams.$inferSelect;
type VenueRow = typeof venues.$inferSelect;

export interface EventCounts {
  registrations: number;
  checkedIn: number;
  inPerson: number;
  online: number;
}
const ZERO_COUNTS: EventCounts = { registrations: 0, checkedIn: 0, inPerson: 0, online: 0 };

interface SpeakerJoinRow {
  eventId: string;
  role: EventSpeaker['role'];
  organization: string | null;
  position: string | null;
  talkTitle: string | null;
  sortOrder: number;
  speakerId: string;
  slug: string;
  fullName: string;
  nickname: string | null;
  headline: string | null;
  avatarAssetId: string | null;
  defaultOrganization: string | null;
  defaultPosition: string | null;
  visibility: 'draft' | 'published' | 'unlisted';
}

type SpeakerBase = Pick<
  SpeakerJoinRow,
  | 'speakerId'
  | 'slug'
  | 'fullName'
  | 'nickname'
  | 'headline'
  | 'avatarAssetId'
  | 'defaultOrganization'
  | 'defaultPosition'
>;

const speakerColumns = {
  speakerId: speakers.id,
  slug: speakers.slug,
  fullName: speakers.fullName,
  nickname: speakers.nickname,
  headline: speakers.headline,
  avatarAssetId: speakers.avatarAssetId,
  defaultOrganization: speakers.defaultOrganization,
  defaultPosition: speakers.defaultPosition,
  visibility: speakers.visibility,
} as const;

const uniq = <T>(xs: Iterable<T | null | undefined>): T[] => [
  ...new Set([...xs].filter((x): x is T => x !== null && x !== undefined)),
];

/**
 * Read side of events: batch loaders and mappers for EventCard, EventAdminRow, EventDetail and
 * EventAdmin. Lists never do per-row queries: one query per relation for the whole page.
 * Exported from EventsModule so the overview (and anyone else) can build the same shapes.
 */
@Injectable()
export class EventsLoader {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly refs: AssetRefsService,
    private readonly config: AppConfig,
  ) {}

  /* ---------------------------------------------------------------- batch relations */

  /** Speakers of many events, in their sort order. Public: drafts hidden. */
  async speakersByEvent(
    eventIds: string[],
    audience: Audience,
    db: DbOrTx = this.db,
  ): Promise<Map<string, SpeakerJoinRow[]>> {
    const out = new Map<string, SpeakerJoinRow[]>();
    if (!eventIds.length) return out;
    const rows = await db
      .select({
        eventId: eventSpeakers.eventId,
        role: eventSpeakers.role,
        organization: eventSpeakers.organization,
        position: eventSpeakers.position,
        talkTitle: eventSpeakers.talkTitle,
        sortOrder: eventSpeakers.sortOrder,
        ...speakerColumns,
      })
      .from(eventSpeakers)
      .innerJoin(speakers, eq(speakers.id, eventSpeakers.speakerId))
      .where(
        and(
          inArray(eventSpeakers.eventId, eventIds),
          audience === 'public' ? sql`${speakers.visibility} <> 'draft'` : undefined,
        ),
      )
      .orderBy(asc(eventSpeakers.eventId), asc(eventSpeakers.sortOrder), asc(eventSpeakers.id));
    for (const r of rows) {
      const list = out.get(r.eventId) ?? [];
      list.push(r);
      out.set(r.eventId, list);
    }
    return out;
  }

  /** Registration counts (status `registered` only) for many events, one grouped query. */
  async countsByEvent(eventIds: string[], db: DbOrTx = this.db): Promise<Map<string, EventCounts>> {
    const out = new Map<string, EventCounts>();
    if (!eventIds.length) return out;
    const active = sql`${registrations.status} = 'registered'`;
    const rows = await db
      .select({
        eventId: registrations.eventId,
        registrations: sql<number>`count(*) filter (where ${active})`.mapWith(Number),
        checkedIn:
          sql<number>`count(*) filter (where ${active} and ${registrations.checkedInAt} is not null)`.mapWith(
            Number,
          ),
        inPerson:
          sql<number>`count(*) filter (where ${active} and ${registrations.attendanceMode} = 'in-person')`.mapWith(
            Number,
          ),
        online:
          sql<number>`count(*) filter (where ${active} and ${registrations.attendanceMode} = 'online')`.mapWith(
            Number,
          ),
      })
      .from(registrations)
      .where(inArray(registrations.eventId, eventIds))
      .groupBy(registrations.eventId);
    for (const r of rows)
      out.set(r.eventId, {
        registrations: r.registrations,
        checkedIn: r.checkedIn,
        inPerson: r.inPerson,
        online: r.online,
      });
    return out;
  }

  /** Events (of these) with at least one public, ready recording whose video is ready. */
  async eventsWithRecordings(eventIds: string[], db: DbOrTx = this.db): Promise<Set<string>> {
    if (!eventIds.length) return new Set();
    const rows = await db
      .selectDistinct({ eventId: streamSessions.eventId })
      .from(streamSessions)
      .innerJoin(assets, eq(assets.id, streamSessions.recordingAssetId))
      .where(
        and(
          inArray(streamSessions.eventId, eventIds),
          eq(streamSessions.visibility, 'public'),
          eq(streamSessions.recordingStatus, 'ready'),
          eq(assets.status, 'ready'),
        ),
      );
    return new Set(rows.map((r) => r.eventId));
  }

  /* ---------------------------------------------------------------- mappers */

  speakerRef(s: SpeakerBase, avatars: Map<string, ImageRef>): SpeakerRef {
    return {
      id: s.speakerId,
      slug: s.slug,
      fullName: s.fullName,
      nickname: s.nickname ?? null,
      headline: s.headline ?? null,
      avatar: s.avatarAssetId ? (avatars.get(s.avatarAssetId) ?? null) : null,
      defaultOrganization: s.defaultOrganization ?? null,
      defaultPosition: s.defaultPosition ?? null,
    };
  }

  /** Public: per-event organization/position fall back to the speaker's defaults. Admin: raw values (the editor shows defaults as placeholders). */
  eventSpeaker(
    s: SpeakerJoinRow,
    avatars: Map<string, ImageRef>,
    audience: Audience,
  ): EventSpeaker {
    const resolve = audience === 'public';
    return {
      ...this.speakerRef(s, avatars),
      role: s.role,
      organization: s.organization ?? (resolve ? (s.defaultOrganization ?? null) : null),
      position: s.position ?? (resolve ? (s.defaultPosition ?? null) : null),
      talkTitle: s.talkTitle ?? null,
    };
  }

  private cardSpeakers(
    list: SpeakerJoinRow[],
    avatars: Map<string, ImageRef>,
  ): EventCard['speakers'] {
    return list.map((s) => ({
      id: s.speakerId,
      slug: s.slug,
      fullName: s.fullName,
      nickname: s.nickname ?? null,
      avatar: s.avatarAssetId ? (avatars.get(s.avatarAssetId) ?? null) : null,
      organization: s.organization ?? s.defaultOrganization ?? null,
      role: s.role,
    }));
  }

  private cardFromRow(
    row: EventListRow,
    ctx: {
      covers: Map<string, ImageRef>;
      avatars: Map<string, ImageRef>;
      speakers: SpeakerJoinRow[];
      counts: EventCounts;
      hasRecording: boolean;
      audience: Audience;
      now: Date;
    },
  ): EventCard {
    const streamState = row.streamState ?? 'idle';
    return {
      id: row.id,
      slug: row.slug,
      number: row.number ?? null,
      title: row.title,
      summary: row.summary ?? null,
      cover: row.coverAssetId ? (ctx.covers.get(row.coverAssetId) ?? null) : null,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: eventStatus(row, streamState, ctx.now),
      isLive: streamState === 'live',
      venue: row.venueName ? { name: row.venueName, kind: row.venueKind ?? 'other' } : null,
      mode: row.mode,
      accent: row.accent,
      tags: row.tags ?? [],
      speakers: this.cardSpeakers(ctx.speakers, ctx.avatars),
      registrationCount:
        ctx.audience === 'admin' || row.showRegistrantCount ? ctx.counts.registrations : null,
      capacity: row.capacity ?? null,
      hasRecording: ctx.hasRecording,
    };
  }

  /** Public (or admin preview) cards for a page of rows. 4 queries total, whatever the page size. */
  async toCards(
    rows: EventListRow[],
    audience: Audience = 'public',
    now: Date = new Date(),
  ): Promise<EventCard[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [speakerMap, counts, withRec] = await Promise.all([
      this.speakersByEvent(ids, audience),
      this.countsByEvent(ids),
      this.eventsWithRecordings(ids),
    ]);
    const avatarIds = [...speakerMap.values()].flat().map((s) => s.avatarAssetId);
    const images = await this.refs.imageRefs([...rows.map((r) => r.coverAssetId), ...avatarIds]);
    return rows.map((row) =>
      this.cardFromRow(row, {
        covers: images,
        avatars: images,
        speakers: speakerMap.get(row.id) ?? [],
        counts: counts.get(row.id) ?? ZERO_COUNTS,
        hasRecording: withRec.has(row.id),
        audience,
        now,
      }),
    );
  }

  /** Admin list rows with permissions from the ability. 3 queries total. */
  async toAdminRows(
    rows: EventListRow[],
    ability: Ability,
    now: Date = new Date(),
  ): Promise<EventAdminRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [speakerMap, counts] = await Promise.all([
      this.speakersByEvent(ids, 'admin'),
      this.countsByEvent(ids),
    ]);
    const avatarIds = [...speakerMap.values()].flat().map((s) => s.avatarAssetId);
    const images = await this.refs.imageRefs([...rows.map((r) => r.coverAssetId), ...avatarIds]);
    return rows.map((row) => {
      const list = speakerMap.get(row.id) ?? [];
      const c = counts.get(row.id) ?? ZERO_COUNTS;
      const streamState = row.streamState ?? 'idle';
      return {
        id: row.id,
        slug: row.slug,
        number: row.number ?? null,
        title: row.title,
        cover: row.coverAssetId ? (images.get(row.coverAssetId) ?? null) : null,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: eventStatus(row, streamState, now),
        visibility: row.visibility,
        streamState,
        venue: row.venueName ?? null,
        accent: row.accent,
        registrations: c.registrations,
        checkedIn: c.checkedIn,
        capacity: row.capacity ?? null,
        speakers: list.map((s) => s.fullName),
        speakerAvatars: list.map((s) => ({
          fullName: s.fullName,
          avatar: s.avatarAssetId ? (images.get(s.avatarAssetId) ?? null) : null,
        })),
        permissions: ability.actionsOn('event', row.id),
      };
    });
  }

  /** Admin rows for specific ids, in the given order (missing ids skipped). */
  async adminRowsByIds(
    ids: string[],
    ability: Ability,
    now: Date = new Date(),
  ): Promise<EventAdminRow[]> {
    if (!ids.length) return [];
    const rows = await selectEventList(this.db).where(inArray(events.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return this.toAdminRows(
      ids.map((id) => byId.get(id)).filter((r): r is EventListRow => !!r),
      ability,
      now,
    );
  }

  /* ---------------------------------------------------------------- detail */

  /** The full event row with its stream and venue rows (null when missing). */
  async loadFull(
    id: string,
    db: DbOrTx = this.db,
  ): Promise<{ event: EventRow; stream: StreamRow | null; venue: VenueRow | null } | null> {
    const [row] = await db
      .select({ event: events, stream: eventStreams, venue: venues })
      .from(events)
      .leftJoin(eventStreams, streamJoin)
      .leftJoin(venues, venueJoin)
      .where(eq(events.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Everything EventDetail has except prev/next, for either audience.
   * Public: draft speakers hidden, only published publications, only media and recordings that can play.
   * Admin: everything linked (drafts included), media items with their processing status.
   */
  async detailCore(
    full: { event: EventRow; stream: StreamRow | null; venue: VenueRow | null },
    audience: Audience,
    now: Date = new Date(),
  ): Promise<{
    detail: Omit<EventDetail, 'prev' | 'next'> & { media: EventMediaAdminItem[] };
    counts: EventCounts;
  }> {
    const { event: e, stream, venue } = full;
    const db = this.db;
    const [speakerMap, countsMap, rundownRows, pubRows, mediaRows, sessionRows] = await Promise.all(
      [
        this.speakersByEvent([e.id], audience),
        this.countsByEvent([e.id]),
        db
          .select()
          .from(rundownItems)
          .where(eq(rundownItems.eventId, e.id))
          .orderBy(asc(rundownItems.sortOrder), asc(rundownItems.time)),
        db
          .select({
            note: eventPublications.note,
            id: publications.id,
            slug: publications.slug,
            type: publications.type,
            title: publications.title,
            subtitle: publications.subtitle,
            containerTitle: publications.containerTitle,
            publishedYear: publications.publishedYear,
            status: publications.status,
            coverAssetId: publications.coverAssetId,
            pdfAssetId: publications.pdfAssetId,
            keywords: publications.keywords,
            doi: publications.doi,
          })
          .from(eventPublications)
          .innerJoin(publications, eq(publications.id, eventPublications.publicationId))
          .where(
            and(
              eq(eventPublications.eventId, e.id),
              audience === 'public' ? eq(publications.visibility, 'published') : undefined,
            ),
          )
          .orderBy(asc(eventPublications.sortOrder)),
        db
          .select({ media: eventMedia, asset: assets })
          .from(eventMedia)
          .innerJoin(assets, eq(assets.id, eventMedia.assetId))
          .where(eq(eventMedia.eventId, e.id))
          .orderBy(asc(eventMedia.sortOrder), asc(eventMedia.createdAt)),
        db
          .select({
            id: streamSessions.id,
            title: streamSessions.title,
            startedAt: streamSessions.startedAt,
            endedAt: streamSessions.endedAt,
            isPrimary: streamSessions.isPrimary,
            recordingAssetId: streamSessions.recordingAssetId,
          })
          .from(streamSessions)
          .where(
            and(
              eq(streamSessions.eventId, e.id),
              eq(streamSessions.visibility, 'public'),
              eq(streamSessions.recordingStatus, 'ready'),
            ),
          )
          .orderBy(desc(streamSessions.isPrimary), asc(streamSessions.startedAt)),
      ],
    );

    const eventSpeakerRows = speakerMap.get(e.id) ?? [];
    const counts = countsMap.get(e.id) ?? ZERO_COUNTS;

    // Rundown speakers that are not on the speaker list still need a ref.
    const known = new Map<string, SpeakerBase & { visibility: string }>(
      eventSpeakerRows.map((s) => [s.speakerId, s]),
    );
    const missing = uniq(rundownRows.map((r) => r.speakerId)).filter((id) => !known.has(id));
    const pubIds = pubRows.map((p) => p.id);
    const [extraSpeakers, authorRows] = await Promise.all([
      missing.length
        ? db
            .select(speakerColumns)
            .from(speakers)
            .where(
              and(
                inArray(speakers.id, missing),
                audience === 'public' ? sql`${speakers.visibility} <> 'draft'` : undefined,
              ),
            )
        : Promise.resolve([]),
      pubIds.length
        ? db
            .select({
              publicationId: publicationAuthors.publicationId,
              fullName: publicationAuthors.fullName,
              avatarAssetId: publicationAuthors.avatarAssetId,
              speakerSlug: speakers.slug,
              speakerName: speakers.fullName,
              speakerAvatarId: speakers.avatarAssetId,
              speakerVisibility: speakers.visibility,
            })
            .from(publicationAuthors)
            .leftJoin(speakers, eq(speakers.id, publicationAuthors.speakerId))
            .where(inArray(publicationAuthors.publicationId, pubIds))
            .orderBy(asc(publicationAuthors.publicationId), asc(publicationAuthors.sortOrder))
        : Promise.resolve([]),
    ]);
    for (const s of extraSpeakers) known.set(s.speakerId, s);

    // One asset query for everything on the page.
    const assetRows = await this.refs.loadMany([
      e.coverAssetId,
      ...[...known.values()].map((s) => s.avatarAssetId),
      ...pubRows.flatMap((p) => [p.coverAssetId, p.pdfAssetId]),
      ...authorRows.flatMap((a) => [a.avatarAssetId, a.speakerAvatarId]),
      ...sessionRows.map((s) => s.recordingAssetId),
    ]);
    const image = (id: string | null | undefined) =>
      id ? this.refs.image(assetRows.get(id)) : null;
    const images = new Map<string, ImageRef>();
    for (const [id, row] of assetRows) {
      const ref = this.refs.image(row);
      if (ref) images.set(id, ref);
    }

    const streamState = stream?.state ?? 'idle';
    const status = eventStatus(e, streamState, now);

    const rundown: RundownItem[] = rundownRows.map((r) => {
      const s = r.speakerId ? known.get(r.speakerId) : undefined;
      return {
        id: r.id,
        time: r.time,
        endTime: r.endTime ?? null,
        agenda: r.agenda,
        note: r.note ?? null,
        speaker: s ? this.speakerRef(s, images) : null,
      };
    });

    const authorsByPub = new Map<string, PublicationCard['authors']>();
    for (const a of authorRows) {
      const list = authorsByPub.get(a.publicationId) ?? [];
      const linked = !!a.speakerSlug && (audience === 'admin' || a.speakerVisibility !== 'draft');
      list.push({
        fullName: a.speakerName ?? a.fullName ?? 'Unknown author',
        avatar: image(a.speakerAvatarId ?? a.avatarAssetId),
        speakerSlug: linked ? a.speakerSlug : null,
      });
      authorsByPub.set(a.publicationId, list);
    }
    const pubs = pubRows.map((p) => {
      const pdf = p.pdfAssetId ? assetRows.get(p.pdfAssetId) : undefined;
      return {
        id: p.id,
        slug: p.slug,
        type: p.type as PublicationType,
        title: p.title,
        subtitle: p.subtitle ?? null,
        containerTitle: p.containerTitle ?? null,
        publishedYear: p.publishedYear ?? null,
        status: p.status as PublicationStatus,
        cover: image(p.coverAssetId),
        authors: authorsByPub.get(p.id) ?? [],
        keywords: p.keywords ?? [],
        doi: p.doi ?? null,
        hasPdf: !!pdf && pdf.status === 'ready',
        note: p.note ?? null,
      };
    });

    const allMedia: EventMediaAdminItem[] = mediaRows
      .filter((m) => m.asset.kind === 'image' || m.asset.kind === 'video')
      .map((m) => this.mediaItem(m.media, m.asset, audience));
    const media =
      audience === 'public'
        ? allMedia.filter((m) => (m.kind === 'image' ? !!m.image : !!m.video))
        : allMedia;

    const recordings: Recording[] = [];
    for (const s of sessionRows) {
      const video = s.recordingAssetId ? this.refs.video(assetRows.get(s.recordingAssetId)) : null;
      if (!video) continue;
      recordings.push({
        id: s.id,
        title: s.title ?? null,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : null,
        isPrimary: s.isPrimary,
        video,
        chapters: recordingChapters(
          rundownRows,
          { startedAt: s.startedAt, durationSec: video.durationSec },
          e.startsAt,
        ),
      });
    }

    const speakersFull = eventSpeakerRows.map((s) => this.eventSpeaker(s, images, audience));
    const detail: Omit<EventDetail, 'prev' | 'next'> & { media: EventMediaAdminItem[] } = {
      id: e.id,
      slug: e.slug,
      number: e.number ?? null,
      title: e.title,
      summary: e.summary ?? null,
      cover: image(e.coverAssetId),
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      status,
      isLive: streamState === 'live',
      venue: venue ? { name: venue.name, kind: venue.kind } : null,
      mode: e.mode,
      accent: e.accent,
      tags: e.tags ?? [],
      speakers: this.cardSpeakers(eventSpeakerRows, images),
      registrationCount:
        audience === 'admin' || e.showRegistrantCount ? counts.registrations : null,
      capacity: e.capacity ?? null,
      hasRecording: recordings.length > 0,
      description: e.description ?? [],
      roomNote: e.roomNote ?? null,
      mapsUrl: audience === 'public' ? safeWebUrl(e.mapsUrl) || safeWebUrl(venue?.mapsUrl) : safeWebUrl(e.mapsUrl),
      onlineNote: e.onlineNote ?? null,
      venueFull: venue
        ? {
            id: venue.id,
            name: venue.name,
            kind: venue.kind,
            building: venue.building ?? null,
            floor: venue.floor ?? null,
            capacity: venue.capacity ?? null,
            address: venue.address ?? null,
            mapsUrl: safeWebUrl(venue.mapsUrl),
          }
        : null,
      speakersFull,
      rundown,
      publications: pubs,
      media,
      recordings,
      stream: streamPublic(stream, e.id, this.config.env.PUBLIC_API_URL),
      registration: registrationInfo(e, counts.registrations, now),
      cancelReason: e.cancelledAt ? (e.cancelReason ?? null) : null,
      // Public pages use it for `noindex` on unlisted events (drafts never reach the public API).
      visibility: e.visibility,
      updatedAt: e.updatedAt.toISOString(),
    };
    return { detail, counts };
  }

  mediaItem(
    m: typeof eventMedia.$inferSelect,
    asset: AssetRow,
    audience: Audience,
  ): EventMediaAdminItem {
    const kind = asset.kind === 'video' ? 'video' : 'image';
    return {
      id: m.id,
      kind,
      caption: audience === 'public' ? (m.caption ?? asset.caption ?? null) : (m.caption ?? null),
      featured: m.featured,
      image: kind === 'image' ? this.refs.image(asset) : null,
      video: kind === 'video' ? this.refs.video(asset) : null,
      createdAt: m.createdAt.toISOString(),
      assetId: asset.id,
      status: asset.status,
      error: asset.error ?? null,
      originalFilename: asset.originalFilename,
      sortOrder: m.sortOrder,
    };
  }

  /** Public EventDetail (prev/next among published, non-cancelled events). */
  async publicDetail(
    full: { event: EventRow; stream: StreamRow | null; venue: VenueRow | null },
    now = new Date(),
  ): Promise<EventDetail> {
    const e = full.event;
    const neighbour = { slug: events.slug, title: events.title, number: events.number };
    const visible = and(eq(events.visibility, 'published'), isNull(events.cancelledAt));
    const [{ detail }, prev, next] = await Promise.all([
      this.detailCore(full, 'public', now),
      this.db
        .select(neighbour)
        .from(events)
        .where(
          and(
            visible,
            or(
              lt(events.startsAt, e.startsAt),
              and(eq(events.startsAt, e.startsAt), lt(events.id, e.id)),
            ),
          ),
        )
        .orderBy(desc(events.startsAt), desc(events.id))
        .limit(1),
      this.db
        .select(neighbour)
        .from(events)
        .where(
          and(
            visible,
            or(
              gt(events.startsAt, e.startsAt),
              and(eq(events.startsAt, e.startsAt), gt(events.id, e.id)),
            ),
          ),
        )
        .orderBy(asc(events.startsAt), asc(events.id))
        .limit(1),
    ]);
    // Public media items drop the admin-only fields (asset id, status, file name).
    const publicMedia = detail.media.map((m) => ({
      id: m.id,
      kind: m.kind,
      caption: m.caption,
      featured: m.featured,
      image: m.image,
      video: m.video,
      createdAt: m.createdAt,
    }));
    const n = (r: (typeof prev)[number] | undefined) =>
      r ? { slug: r.slug, title: r.title, number: r.number ?? null } : null;
    return { ...detail, media: publicMedia, prev: n(prev[0]), next: n(next[0]) };
  }

  /** EventAdmin for the dashboard. `ability` gives `permissions`. */
  async adminDetail(id: string, ability: Ability, now = new Date()): Promise<EventAdmin | null> {
    const full = await this.loadFull(id);
    if (!full) return null;
    const { detail, counts } = await this.detailCore(full, 'admin', now);
    const e = full.event;
    return {
      ...detail,
      visibility: e.visibility,
      coverAssetId: e.coverAssetId ?? null,
      venueId: e.venueId ?? null,
      registrationOpen: e.registrationOpen,
      registrationClosesAt: e.registrationClosesAt ? e.registrationClosesAt.toISOString() : null,
      showRegistrantCount: e.showRegistrantCount,
      cancelledAt: e.cancelledAt ? e.cancelledAt.toISOString() : null,
      publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null,
      createdAt: e.createdAt.toISOString(),
      permissions: ability.actionsOn('event', e.id),
      counts,
      streamConfigured: !!full.stream,
    };
  }
}
