import { Inject, Injectable } from '@nestjs/common';
import {
  canCreateBumpers,
  type Ability,
  type BumperEventPick,
  type BumperImagePick,
  type BumperPublicationData,
  type BumperSourceQuery,
  type BumperSpeakerData,
  type BumperTeamData,
  type BumperThreadData,
  type Principal,
} from '@zemi/shared';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AssetRefsService } from '../../common/asset-refs.js';
import { searchPattern } from '../../common/pagination.js';
import { DB, type Db } from '../../db/client.js';
import {
  assets,
  discussionThreads,
  eventMedia,
  eventPublications,
  events,
  eventSpeakers,
  eventStreams,
  publications,
  speakers,
  teamMembers,
} from '../../db/schema.js';
import { eventStatus } from '../events/event-logic.js';
import { searchCondition } from '../events/events.sql.js';
import { PublicationsService } from '../publications/publications.service.js';
import { SpeakersService } from '../speakers/speakers.service.js';
import { seesAllShows } from './access.js';
import { BumpersDataService, VISIBLE_THREAD_STATUSES } from './data.service.js';

/** Upcoming (soonest first) before past (newest first). */
const upcomingFirst = [
  sql`case when ${events.endsAt} > now() then 0 else 1 end`,
  sql`case when ${events.endsAt} > now() then ${events.startsAt} end asc nulls last`,
  desc(events.startsAt),
];

/**
 * The builder's pickers (GET /admin/bumpers/sources/*). Everything is limited to what the
 * principal may see: draft events, speakers and publications only with view access, the full
 * image library only with `media.library`.
 */
@Injectable()
export class BumperSourcesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly refs: AssetRefsService,
    private readonly data: BumpersDataService,
    private readonly speakers: SpeakersService,
    private readonly publications: PublicationsService,
  ) {}

  /** Events the principal can build for first (canBuild), then published upcoming and recent ones to reference. */
  async events(q: BumperSourceQuery, ability: Ability): Promise<BumperEventPick[]> {
    const cols = {
      id: events.id,
      number: events.number,
      title: events.title,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      accent: events.accent,
      coverAssetId: events.coverAssetId,
      cancelledAt: events.cancelledAt,
      streamState: eventStreams.state,
    };
    const search = searchCondition(q.q, 'admin');
    let buildable: SQL | undefined;
    if (!seesAllShows(ability) && !ability.canAll('event', 'bumpers.edit')) {
      const ids = ability.idsWith('event', 'bumpers.edit');
      buildable = ids.length ? inArray(events.id, ids) : sql`false`;
    }
    const mine = await this.db
      .select(cols)
      .from(events)
      .leftJoin(eventStreams, eq(eventStreams.eventId, events.id))
      .where(and(buildable, search))
      .orderBy(...upcomingFirst)
      .limit(q.limit);
    const seen = mine.map((r) => r.id);
    const rest =
      mine.length < q.limit
        ? await this.db
            .select(cols)
            .from(events)
            .leftJoin(eventStreams, eq(eventStreams.eventId, events.id))
            .where(
              and(
                eq(events.visibility, 'published'),
                seen.length ? notInArray(events.id, seen) : undefined,
                search,
              ),
            )
            .orderBy(...upcomingFirst)
            .limit(q.limit - mine.length)
        : [];
    const rows = [...mine, ...rest];
    const covers = await this.refs.imageRefs(rows.map((r) => r.coverAssetId));
    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      number: r.number ?? null,
      title: r.title,
      startsAt: r.startsAt.toISOString(),
      accent: r.accent,
      cover: covers.get(r.coverAssetId ?? '') ?? null,
      status: eventStatus(r, r.streamState, now),
      canBuild: canCreateBumpers(ability, r.id),
    }));
  }

  /** Speakers: the event lineup first (drafts when the event is visible to the principal), then the directory search. */
  async speakerList(q: BumperSourceQuery, ability: Ability): Promise<BumperSpeakerData[]> {
    const ids: string[] = [];
    if (q.eventId && ability.can('event', q.eventId, 'view')) {
      const p = searchPattern(q.q);
      const lineup = await this.db
        .select({ id: eventSpeakers.speakerId })
        .from(eventSpeakers)
        .innerJoin(speakers, eq(speakers.id, eventSpeakers.speakerId))
        .where(
          and(
            eq(eventSpeakers.eventId, q.eventId),
            p
              ? or(
                  ilike(speakers.fullName, p),
                  ilike(speakers.nickname, p),
                  ilike(speakers.defaultOrganization, p),
                )
              : undefined,
          ),
        )
        .orderBy(asc(eventSpeakers.sortOrder), asc(eventSpeakers.id));
      for (const r of lineup) if (!ids.includes(r.id)) ids.push(r.id);
    }
    if (ids.length < q.limit) {
      const found = await this.speakers.lookup(q.q, q.limit, ability);
      for (const s of found) if (!ids.includes(s.id)) ids.push(s.id);
    }
    return this.data.speakersByIds(ids.slice(0, q.limit));
  }

  /** Publications: the event's papers first, then the search (drafts only with view access). */
  async publicationList(q: BumperSourceQuery, ability: Ability): Promise<BumperPublicationData[]> {
    const ids: string[] = [];
    if (q.eventId && ability.can('event', q.eventId, 'view')) {
      const p = searchPattern(q.q);
      const rows = await this.db
        .select({ id: eventPublications.publicationId })
        .from(eventPublications)
        .innerJoin(publications, eq(publications.id, eventPublications.publicationId))
        .where(
          and(
            eq(eventPublications.eventId, q.eventId),
            p ? or(ilike(publications.title, p), ilike(publications.containerTitle, p)) : undefined,
          ),
        )
        .orderBy(asc(eventPublications.sortOrder));
      ids.push(...rows.map((r) => r.id));
    }
    if (ids.length < q.limit) {
      const found = await this.publications.lookup(q.q, q.limit, ability);
      for (const p of found) if (!ids.includes(p.id)) ids.push(p.id);
    }
    return this.data.publicationsByIds(ids.slice(0, q.limit));
  }

  /** Published team members (hosts, openers, credits). */
  async team(q: BumperSourceQuery): Promise<BumperTeamData[]> {
    const p = searchPattern(q.q);
    const rows = await this.db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        role: teamMembers.role,
        avatarAssetId: teamMembers.avatarAssetId,
      })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.visibility, 'published'),
          p ? or(ilike(teamMembers.name, p), ilike(teamMembers.role, p)) : undefined,
        ),
      )
      .orderBy(asc(teamMembers.sortOrder), asc(teamMembers.createdAt))
      .limit(q.limit);
    const avatars = await this.refs.imageRefs(rows.map((r) => r.avatarAssetId));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role ?? null,
      avatar: avatars.get(r.avatarAssetId ?? '') ?? null,
    }));
  }

  /** Visible discussion threads (open, locked, archived), pinned first, then by votes. */
  async threads(q: BumperSourceQuery): Promise<BumperThreadData[]> {
    const t = discussionThreads;
    const p = searchPattern(q.q);
    const rows = await this.db
      .select({
        id: t.id,
        title: t.title,
        bodyText: t.bodyText,
        authorLabel: t.authorLabel,
        score: t.score,
        commentCount: t.commentCount,
        eventId: t.eventId,
        createdAt: t.createdAt,
      })
      .from(t)
      .where(
        and(
          inArray(t.status, [...VISIBLE_THREAD_STATUSES]),
          q.eventId ? eq(t.eventId, q.eventId) : undefined,
          p ? or(ilike(t.title, p), ilike(t.bodyText, p)) : undefined,
        ),
      )
      .orderBy(desc(t.pinned), desc(t.score), desc(t.createdAt))
      .limit(q.limit);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      excerpt:
        r.bodyText.length > 220
          ? `${r.bodyText.slice(0, 217).replace(/\s+\S*$/, '')}...`
          : r.bodyText,
      authorLabel: r.authorLabel,
      score: r.score,
      commentCount: r.commentCount,
      eventId: r.eventId ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Images: the event's documentation photos and cover (when the event is visible), the
   * principal's own bumper uploads, and the whole image library with `media.library`.
   */
  async images(
    q: BumperSourceQuery,
    ability: Ability,
    principal: Principal,
  ): Promise<BumperImagePick[]> {
    const p = searchPattern(q.q);
    const match = p
      ? or(ilike(assets.originalFilename, p), ilike(assets.alt, p), ilike(assets.caption, p))
      : undefined;
    const isImage = and(eq(assets.kind, 'image'), ne(assets.status, 'failed'));
    const out: BumperImagePick[] = [];
    const seen = new Set<string>();
    const add = (
      id: string,
      image: BumperImagePick['image'] | null,
      caption: string | null,
      source: BumperImagePick['source'],
    ) => {
      if (!image || seen.has(id) || out.length >= q.limit) return;
      seen.add(id);
      out.push({ id, image, caption, source });
    };

    if (q.eventId && ability.can('event', q.eventId, 'view')) {
      const [cover, docs] = await Promise.all([
        this.db
          .select({ assetId: events.coverAssetId, title: events.title })
          .from(events)
          .where(and(eq(events.id, q.eventId), isNotNull(events.coverAssetId))),
        this.db
          .select({
            assetId: eventMedia.assetId,
            caption: eventMedia.caption,
            assetCaption: assets.caption,
          })
          .from(eventMedia)
          .innerJoin(assets, eq(assets.id, eventMedia.assetId))
          .where(and(eq(eventMedia.eventId, q.eventId), isImage, match))
          .orderBy(desc(eventMedia.featured), asc(eventMedia.sortOrder), asc(eventMedia.createdAt))
          .limit(q.limit),
      ]);
      const refs = await this.refs.imageRefs([
        ...cover.map((c) => c.assetId),
        ...docs.map((d) => d.assetId),
      ]);
      for (const c of cover)
        if (c.assetId && !p)
          add(c.assetId, refs.get(c.assetId) ?? null, `Cover of ${c.title}`, 'event');
      for (const d of docs)
        add(d.assetId, refs.get(d.assetId) ?? null, d.caption ?? d.assetCaption ?? null, 'event');
    }

    const library = ability.has('media.library');
    const remaining = q.limit - out.length;
    if (remaining > 0) {
      const own = and(eq(assets.purpose, 'bumper'), eq(assets.createdBy, principal.id));
      const rows = await this.db
        .select()
        .from(assets)
        .where(
          and(
            isImage,
            match,
            library ? undefined : own,
            seen.size ? notInArray(assets.id, [...seen]) : undefined,
          ),
        )
        .orderBy(
          desc(sql`(${assets.purpose} = 'bumper' and ${assets.createdBy} = ${principal.id})`),
          desc(assets.createdAt),
        )
        .limit(remaining);
      for (const r of rows)
        add(
          r.id,
          this.refs.image(r),
          r.caption ?? r.alt ?? null,
          r.purpose === 'bumper' && r.createdBy === principal.id ? 'upload' : 'library',
        );
    }
    return out;
  }
}
