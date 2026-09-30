import { Inject, Injectable } from '@nestjs/common';
import {
  PUBLICATION_TYPE_LABELS,
  sanitizeLinkList,
  type Ability,
  type BumperData,
  type BumperEventData,
  type BumperPublicationData,
  type BumperResolveInput,
  type BumperSiteData,
  type BumperSlide,
  type BumperSpeakerData,
  type BumperTeamData,
  type BumperThreadData,
  type ImageRef,
  type LinkItem,
  type PublicationType,
} from '@zemi/shared';
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AssetRefsService } from '../../common/asset-refs.js';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db } from '../../db/client.js';
import {
  discussionThreads,
  eventPublications,
  eventStreams,
  events,
  publicationAuthors,
  publications,
  rundownItems,
  speakers,
  teamMembers,
  venues,
} from '../../db/schema.js';
import { eventStatus, registrationInfo } from '../events/event-logic.js';
import { EventsLoader } from '../events/events.loader.js';
import { SiteService } from '../site/site.service.js';
import type { GeneratorSource } from './generator.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids read out of jsonb are untrusted: anything that isn't a uuid would make Postgres throw on a uuid column. */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** Discussion threads anyone may see (hidden and deleted ones never reach a screen). */
export const VISIBLE_THREAD_STATUSES = ['open', 'locked', 'archived'] as const;

/** Featured questions default to the event's top voted threads (up to this many). */
const TOP_THREADS = 3;

/** Record ids a set of slides points at. */
export interface BundleWants {
  eventIds: Set<string>;
  speakerIds: Set<string>;
  publicationIds: Set<string>;
  teamIds: Set<string>;
  threadIds: Set<string>;
  assetIds: Set<string>;
  /** Events whose top questions go in (featured-question slides without picked threads). */
  questionEventIds: Set<string>;
  /** Every published team member (credits without picked people). */
  allTeam: boolean;
}

export function emptyWants(): BundleWants {
  return {
    eventIds: new Set(),
    speakerIds: new Set(),
    publicationIds: new Set(),
    teamIds: new Set(),
    threadIds: new Set(),
    assetIds: new Set(),
    questionEventIds: new Set(),
    allTeam: false,
  };
}

const addId = (set: Set<string>, v: unknown) => {
  if (isUuid(v)) set.add(v.toLowerCase());
};

/** Everything the slides reference: refs, backgrounds, item logos and image extras. */
export function wantsFromSlides(
  slides: readonly BumperSlide[],
  showEventId: string | null,
): BundleWants {
  const w = emptyWants();
  for (const s of slides) {
    const r = s.refs;
    addId(w.eventIds, r.eventId);
    addId(w.speakerIds, r.speakerId);
    r.speakerIds?.forEach((id) => addId(w.speakerIds, id));
    addId(w.teamIds, r.teamMemberId);
    r.teamMemberIds?.forEach((id) => addId(w.teamIds, id));
    addId(w.publicationIds, r.publicationId);
    r.threadIds?.forEach((id) => addId(w.threadIds, id));
    addId(w.assetIds, r.assetId);
    r.assetIds?.forEach((id) => addId(w.assetIds, id));
    addId(w.assetIds, s.style.backgroundAssetId);
    for (const item of s.items) addId(w.assetIds, item.assetId);
    for (const el of s.extras) addId(w.assetIds, el.props.assetId);
    if (s.kind === 'credits' && !r.teamMemberIds?.length) w.allTeam = true;
    if (s.kind === 'featured-question' && !r.threadIds?.length) {
      const ev = r.eventId ?? showEventId;
      if (isUuid(ev)) w.questionEventIds.add(ev);
    }
  }
  return w;
}

interface LoadPolicy {
  /** The show's event: next Friday is counted from it. */
  showEventId: string | null;
  /** Events read with the admin audience: draft speakers and every linked publication. Others only get public ones. */
  adminEvents: ReadonlySet<string>;
  /** Look up the next Friday (the show bundle does, the builder's resolve doesn't). */
  withNext: boolean;
  /** Extra visibility filters (resolve for scoped admins). Everything is kept when absent. */
  canSeeEvent?: (id: string, visibility: string) => boolean;
  canSeeSpeaker?: (id: string, visibility: string) => boolean;
  canSeePublication?: (id: string, visibility: string) => boolean;
}

/** The bundle without the site block (only whole-show bundles need it). */
type Bundle = Omit<BumperData, 'site'>;

interface Loaded {
  data: Bundle;
  /** Team ids in page order (a Record can't promise it). */
  teamOrder: string[];
}

const uniq = (xs: Iterable<string | null | undefined>): string[] => [
  ...new Set([...xs].filter((x): x is string => !!x)),
];

function excerpt(text: string, max = 220): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}...`;
}

/** Profile links without email addresses: the bundle is public-safe. */
function publicLinks(links: LinkItem[] | null | undefined): LinkItem[] {
  return sanitizeLinkList(links ?? []).filter(
    (l) => l.kind !== 'email' && !/^mailto:/i.test(l.url),
  );
}

/**
 * Builds the `BumperData` bundle: every record a show's slides can read, public-safe (no emails, no
 * registrant data), with absolute URLs. A fixed number of batch queries whatever the show size.
 */
@Injectable()
export class BumpersDataService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly refs: AssetRefsService,
    private readonly config: AppConfig,
    private readonly loader: EventsLoader,
    private readonly site: SiteService,
  ) {}

  /** https://zemi.ac (no trailing slash). */
  webUrl(): string {
    return this.config.env.PUBLIC_WEB_URL.replace(/\/+$/, '');
  }

  /** The bundle for a show (or a generate preview): its event, everything the slides point at, next Friday, the site. */
  async build(
    showEventId: string | null,
    slides: readonly BumperSlide[],
    now = new Date(),
  ): Promise<BumperData> {
    const w = wantsFromSlides(slides, showEventId);
    const [{ data }, site] = await Promise.all([
      this.load(
        w,
        { showEventId, adminEvents: new Set(showEventId ? [showEventId] : []), withNext: true },
        now,
      ),
      this.siteData(),
    ]);
    return { ...data, site };
  }

  /** What the generator reads for an event: lineup, rundown, papers, the published team, top questions, next Friday. Null when the event is gone. */
  async generatorSource(eventId: string, now = new Date()): Promise<GeneratorSource | null> {
    const w = emptyWants();
    w.questionEventIds.add(eventId);
    w.allTeam = true;
    const { data, teamOrder } = await this.load(
      w,
      { showEventId: eventId, adminEvents: new Set([eventId]), withNext: true },
      now,
    );
    const event = data.events[eventId];
    if (!event) return null;
    return {
      event,
      speakers: data.speakers,
      publications: data.publications,
      team: teamOrder.map((id) => data.team[id]).filter((t): t is BumperTeamData => !!t),
      threads: Object.values(data.threads)
        .filter((t) => t.eventId === eventId)
        .sort((a, b) => b.score - a.score),
      nextEvent: data.nextEventId ? (data.events[data.nextEventId] ?? null) : null,
    };
  }

  /**
   * POST /admin/bumpers/resolve: records picked in the builder. Drafts only when the principal may
   * view them (same rule as the pickers); threads only when visible.
   */
  async resolve(
    input: BumperResolveInput,
    ability: Ability,
    now = new Date(),
  ): Promise<Partial<BumperData>> {
    const w = emptyWants();
    input.eventIds.forEach((id) => addId(w.eventIds, id));
    input.speakerIds.forEach((id) => addId(w.speakerIds, id));
    input.publicationIds.forEach((id) => addId(w.publicationIds, id));
    input.teamMemberIds.forEach((id) => addId(w.teamIds, id));
    input.threadIds.forEach((id) => addId(w.threadIds, id));
    input.assetIds.forEach((id) => addId(w.assetIds, id));
    const adminEvents = new Set([...w.eventIds].filter((id) => ability.can('event', id, 'view')));
    const { data } = await this.load(
      w,
      {
        showEventId: null,
        adminEvents,
        withNext: false,
        canSeeEvent: (id, v) => v !== 'draft' || adminEvents.has(id),
        canSeeSpeaker: (id, v) => v !== 'draft' || ability.can('speaker', id, 'view'),
        canSeePublication: (id, v) => v !== 'draft' || ability.can('publication', id, 'view'),
      },
      now,
    );
    return {
      events: data.events,
      speakers: data.speakers,
      publications: data.publications,
      team: data.team,
      threads: data.threads,
      images: data.images,
      generatedAt: data.generatedAt,
    };
  }

  /** Speakers by id in the given order (pickers). */
  async speakersByIds(ids: string[]): Promise<BumperSpeakerData[]> {
    const w = emptyWants();
    ids.forEach((id) => addId(w.speakerIds, id));
    const { data } = await this.load(
      w,
      { showEventId: null, adminEvents: new Set(), withNext: false },
      new Date(),
    );
    return uniq(ids)
      .map((id) => data.speakers[id])
      .filter((s): s is BumperSpeakerData => !!s);
  }

  /** Publications by id in the given order (pickers). */
  async publicationsByIds(ids: string[]): Promise<BumperPublicationData[]> {
    const w = emptyWants();
    ids.forEach((id) => addId(w.publicationIds, id));
    const { data } = await this.load(
      w,
      { showEventId: null, adminEvents: new Set(), withNext: false },
      new Date(),
    );
    return uniq(ids)
      .map((id) => data.publications[id])
      .filter((p): p is BumperPublicationData => !!p);
  }

  /* ---------------------------------------------------------------- loading */

  private async load(w: BundleWants, policy: LoadPolicy, now: Date): Promise<Loaded> {
    const web = this.webUrl();
    const db = this.db;

    // Phase 1: next Friday, team and threads (independent of each other).
    const [nextEventId, teamRows, threadRows] = await Promise.all([
      policy.withNext ? this.nextEventId(policy.showEventId, now) : Promise.resolve(null),
      w.teamIds.size || w.allTeam
        ? db
            .select({
              id: teamMembers.id,
              name: teamMembers.name,
              role: teamMembers.role,
              avatarAssetId: teamMembers.avatarAssetId,
            })
            .from(teamMembers)
            .where(
              or(
                w.teamIds.size ? inArray(teamMembers.id, [...w.teamIds]) : undefined,
                w.allTeam ? eq(teamMembers.visibility, 'published') : undefined,
              ),
            )
            .orderBy(asc(teamMembers.sortOrder), asc(teamMembers.createdAt))
        : Promise.resolve([]),
      this.loadThreads(w.threadIds, w.questionEventIds),
    ]);

    // Phase 2: events and everything hanging off them.
    const eventIds = uniq([policy.showEventId, ...w.eventIds, nextEventId]).filter(isUuid);
    const none = !eventIds.length;
    const [eventRows, lineupMap, rundownRows, eventPubRows, counts] = await Promise.all([
      none
        ? []
        : db
            .select({
              id: events.id,
              slug: events.slug,
              number: events.number,
              title: events.title,
              summary: events.summary,
              coverAssetId: events.coverAssetId,
              startsAt: events.startsAt,
              endsAt: events.endsAt,
              accent: events.accent,
              mode: events.mode,
              tags: events.tags,
              visibility: events.visibility,
              roomNote: events.roomNote,
              onlineNote: events.onlineNote,
              registrationOpen: events.registrationOpen,
              registrationClosesAt: events.registrationClosesAt,
              capacity: events.capacity,
              cancelledAt: events.cancelledAt,
              streamState: eventStreams.state,
              venueName: venues.name,
              venueKind: venues.kind,
              venueBuilding: venues.building,
              venueFloor: venues.floor,
            })
            .from(events)
            .leftJoin(eventStreams, eq(eventStreams.eventId, events.id))
            .leftJoin(venues, eq(venues.id, events.venueId))
            .where(inArray(events.id, eventIds)),
      this.loader.speakersByEvent(eventIds, 'admin'),
      none
        ? []
        : db
            .select({
              eventId: rundownItems.eventId,
              time: rundownItems.time,
              endTime: rundownItems.endTime,
              agenda: rundownItems.agenda,
              note: rundownItems.note,
              speakerId: rundownItems.speakerId,
            })
            .from(rundownItems)
            .where(inArray(rundownItems.eventId, eventIds))
            .orderBy(
              asc(rundownItems.eventId),
              asc(rundownItems.sortOrder),
              asc(rundownItems.time),
            ),
      none
        ? []
        : db
            .select({
              eventId: eventPublications.eventId,
              publicationId: eventPublications.publicationId,
              visibility: publications.visibility,
            })
            .from(eventPublications)
            .innerJoin(publications, eq(publications.id, eventPublications.publicationId))
            .where(inArray(eventPublications.eventId, eventIds))
            .orderBy(asc(eventPublications.eventId), asc(eventPublications.sortOrder)),
      this.loader.countsByEvent(eventIds),
    ]);

    const visibleEvents = eventRows.filter(
      (e) =>
        !policy.canSeeEvent ||
        e.id === policy.showEventId ||
        policy.canSeeEvent(e.id, e.visibility),
    );
    const isAdminEvent = (id: string) => policy.adminEvents.has(id) || id === policy.showEventId;

    const lineups = new Map(
      visibleEvents.map((e) => {
        const list = lineupMap.get(e.id) ?? [];
        return [
          e.id,
          isAdminEvent(e.id) ? list : list.filter((s) => s.visibility !== 'draft'),
        ] as const;
      }),
    );
    const pubIdsByEvent = new Map<string, string[]>();
    for (const r of eventPubRows) {
      if (!isAdminEvent(r.eventId) && r.visibility === 'draft') continue;
      pubIdsByEvent.set(r.eventId, [...(pubIdsByEvent.get(r.eventId) ?? []), r.publicationId]);
    }
    const rundownByEvent = new Map<string, typeof rundownRows>();
    for (const r of rundownRows)
      rundownByEvent.set(r.eventId, [...(rundownByEvent.get(r.eventId) ?? []), r]);

    // Phase 3: publications of the show's event plus the referenced ones, with their authors.
    const pubIds = uniq([
      ...(policy.showEventId ? (pubIdsByEvent.get(policy.showEventId) ?? []) : []),
      ...w.publicationIds,
    ]);
    const [pubRows, authorRows] = pubIds.length
      ? await Promise.all([
          db
            .select({
              id: publications.id,
              slug: publications.slug,
              type: publications.type,
              title: publications.title,
              subtitle: publications.subtitle,
              containerTitle: publications.containerTitle,
              publishedYear: publications.publishedYear,
              doi: publications.doi,
              coverAssetId: publications.coverAssetId,
              keywords: publications.keywords,
              visibility: publications.visibility,
            })
            .from(publications)
            .where(inArray(publications.id, pubIds)),
          db
            .select({
              publicationId: publicationAuthors.publicationId,
              speakerId: publicationAuthors.speakerId,
              fullName: publicationAuthors.fullName,
              avatarAssetId: publicationAuthors.avatarAssetId,
              organization: publicationAuthors.organization,
              speakerName: speakers.fullName,
              speakerAvatarId: speakers.avatarAssetId,
              speakerOrg: speakers.defaultOrganization,
            })
            .from(publicationAuthors)
            .leftJoin(speakers, eq(speakers.id, publicationAuthors.speakerId))
            .where(inArray(publicationAuthors.publicationId, pubIds))
            .orderBy(
              asc(publicationAuthors.publicationId),
              asc(publicationAuthors.sortOrder),
              asc(publicationAuthors.id),
            ),
        ])
      : [[], []];
    const visiblePubs = pubRows.filter(
      (p) => !policy.canSeePublication || policy.canSeePublication(p.id, p.visibility),
    );

    // Phase 4: every speaker someone may show (lineups, rundowns, picks, paper authors).
    const strong = new Set<string>([...w.speakerIds]);
    const weak = new Set<string>();
    for (const e of visibleEvents) {
      for (const s of lineups.get(e.id) ?? []) strong.add(s.speakerId);
      for (const r of rundownByEvent.get(e.id) ?? [])
        if (r.speakerId) (isAdminEvent(e.id) ? strong : weak).add(r.speakerId);
    }
    for (const a of authorRows) if (a.speakerId) strong.add(a.speakerId);
    const speakerIds = uniq([...strong, ...weak]);
    const speakerRows = speakerIds.length
      ? await db
          .select({
            id: speakers.id,
            slug: speakers.slug,
            fullName: speakers.fullName,
            nickname: speakers.nickname,
            headline: speakers.headline,
            avatarAssetId: speakers.avatarAssetId,
            links: speakers.links,
            defaultOrganization: speakers.defaultOrganization,
            defaultPosition: speakers.defaultPosition,
            visibility: speakers.visibility,
          })
          .from(speakers)
          .where(inArray(speakers.id, speakerIds))
      : [];
    const keptSpeakers = speakerRows.filter((s) => {
      if (policy.canSeeSpeaker && !policy.canSeeSpeaker(s.id, s.visibility)) return false;
      // A draft speaker who only shows up in another event's rundown stays unannounced.
      return strong.has(s.id) || s.visibility !== 'draft';
    });
    const speakerSet = new Set(keptSpeakers.map((s) => s.id));

    // Phase 5: one asset query for every image in the bundle.
    const images = await this.refs.imageRefs([
      ...visibleEvents.map((e) => e.coverAssetId),
      ...keptSpeakers.map((s) => s.avatarAssetId),
      ...visiblePubs.map((p) => p.coverAssetId),
      ...authorRows.flatMap((a) => [a.speakerAvatarId, a.avatarAssetId]),
      ...teamRows.map((t) => t.avatarAssetId),
      ...w.assetIds,
    ]);
    const img = (id: string | null | undefined): ImageRef | null =>
      id ? (images.get(id) ?? null) : null;

    const outEvents: Record<string, BumperEventData> = {};
    for (const e of visibleEvents) {
      const lineup = lineups.get(e.id) ?? [];
      const c = counts.get(e.id);
      outEvents[e.id] = {
        id: e.id,
        slug: e.slug,
        number: e.number ?? null,
        title: e.title,
        summary: e.summary ?? null,
        cover: img(e.coverAssetId),
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        accent: e.accent,
        mode: e.mode,
        tags: e.tags ?? [],
        status: eventStatus(e, e.streamState, now),
        venue: e.venueName
          ? {
              name: e.venueName,
              kind: e.venueKind ?? 'other',
              building: e.venueBuilding ?? null,
              floor: e.venueFloor ?? null,
            }
          : null,
        roomNote: e.roomNote ?? null,
        onlineNote: e.onlineNote ?? null,
        url: `${web}/events/${e.slug}`,
        speakers: lineup.map((s) => ({
          speakerId: s.speakerId,
          role: s.role,
          organization: s.organization ?? s.defaultOrganization ?? null,
          position: s.position ?? s.defaultPosition ?? null,
          talkTitle: s.talkTitle ?? null,
        })),
        rundown: (rundownByEvent.get(e.id) ?? []).map((r) => ({
          time: r.time,
          endTime: r.endTime ?? null,
          agenda: r.agenda,
          note: r.note ?? null,
          speakerId: r.speakerId && speakerSet.has(r.speakerId) ? r.speakerId : null,
        })),
        publicationIds: pubIdsByEvent.get(e.id) ?? [],
        registrationOpen: registrationInfo(
          {
            registrationOpen: e.registrationOpen,
            cancelledAt: e.cancelledAt,
            startsAt: e.startsAt,
            endsAt: e.endsAt,
            registrationClosesAt: e.registrationClosesAt,
            capacity: e.capacity,
            mode: e.mode,
            visibility: e.visibility,
          },
          c?.registrations ?? 0,
          now,
        ).open,
      };
    }

    const outSpeakers: Record<string, BumperSpeakerData> = {};
    for (const s of keptSpeakers) {
      outSpeakers[s.id] = {
        id: s.id,
        slug: s.slug,
        fullName: s.fullName,
        nickname: s.nickname ?? null,
        headline: s.headline ?? null,
        avatar: img(s.avatarAssetId),
        organization: s.defaultOrganization ?? null,
        position: s.defaultPosition ?? null,
        links: publicLinks(s.links),
        url: `${web}/speakers/${s.slug}`,
      };
    }

    const authorsByPub = new Map<string, BumperPublicationData['authors']>();
    for (const a of authorRows) {
      const list = authorsByPub.get(a.publicationId) ?? [];
      list.push({
        name: a.speakerName ?? a.fullName ?? 'Unnamed author',
        speakerId: a.speakerId && speakerSet.has(a.speakerId) ? a.speakerId : null,
        avatar: img(a.speakerAvatarId ?? a.avatarAssetId),
        organization: a.organization ?? a.speakerOrg ?? null,
      });
      authorsByPub.set(a.publicationId, list);
    }
    const outPubs: Record<string, BumperPublicationData> = {};
    for (const p of visiblePubs) {
      const type = (p.type in PUBLICATION_TYPE_LABELS ? p.type : 'other') as PublicationType;
      outPubs[p.id] = {
        id: p.id,
        slug: p.slug,
        type,
        typeLabel: PUBLICATION_TYPE_LABELS[type],
        title: p.title,
        subtitle: p.subtitle ?? null,
        containerTitle: p.containerTitle ?? null,
        publishedYear: p.publishedYear ?? null,
        doi: p.doi ?? null,
        cover: img(p.coverAssetId),
        authors: authorsByPub.get(p.id) ?? [],
        keywords: p.keywords ?? [],
        url: `${web}/publications/${p.slug}`,
      };
    }

    const outTeam: Record<string, BumperTeamData> = {};
    for (const t of teamRows)
      outTeam[t.id] = {
        id: t.id,
        name: t.name,
        role: t.role ?? null,
        avatar: img(t.avatarAssetId),
      };

    const outThreads: Record<string, BumperThreadData> = {};
    for (const t of threadRows) outThreads[t.id] = t;

    const outImages: Record<string, ImageRef> = {};
    for (const id of w.assetIds) {
      const ref = images.get(id);
      if (ref) outImages[id] = ref;
    }

    return {
      data: {
        events: outEvents,
        speakers: outSpeakers,
        publications: outPubs,
        team: outTeam,
        threads: outThreads,
        images: outImages,
        nextEventId: nextEventId && outEvents[nextEventId] ? nextEventId : null,
        generatedAt: now.toISOString(),
      },
      teamOrder: teamRows.map((t) => t.id),
    };
  }

  /**
   * The next published, not cancelled Friday that starts after the show's event (or after now for
   * a standalone show).
   */
  private async nextEventId(showEventId: string | null, now: Date): Promise<string | null> {
    const base = and(eq(events.visibility, 'published'), isNull(events.cancelledAt));
    if (!showEventId) {
      const [row] = await this.db
        .select({ id: events.id })
        .from(events)
        .where(and(base, gt(events.startsAt, now)))
        .orderBy(asc(events.startsAt), asc(events.id))
        .limit(1);
      return row?.id ?? null;
    }
    const show = alias(events, 'show_event');
    const [row] = await this.db
      .select({ id: events.id })
      .from(events)
      .innerJoin(show, eq(show.id, showEventId))
      .where(
        and(
          base,
          ne(events.id, showEventId),
          or(
            gt(events.startsAt, show.startsAt),
            and(eq(events.startsAt, show.startsAt), gt(events.id, show.id)),
          ),
        ),
      )
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(1);
    return row?.id ?? null;
  }

  /** Picked threads (when still visible) plus the top voted visible threads of some events. */
  private async loadThreads(
    ids: ReadonlySet<string>,
    questionEventIds: ReadonlySet<string>,
  ): Promise<BumperThreadData[]> {
    const t = discussionThreads;
    const cols = {
      id: t.id,
      title: t.title,
      bodyText: t.bodyText,
      authorLabel: t.authorLabel,
      score: t.score,
      commentCount: t.commentCount,
      eventId: t.eventId,
      createdAt: t.createdAt,
    };
    const visible = inArray(t.status, [...VISIBLE_THREAD_STATUSES]);
    const [picked, top] = await Promise.all([
      ids.size
        ? this.db
            .select(cols)
            .from(t)
            .where(and(inArray(t.id, [...ids]), visible))
        : Promise.resolve([]),
      questionEventIds.size
        ? (() => {
            const ranked = this.db
              .select({
                ...cols,
                rn: sql<number>`row_number() over (partition by ${t.eventId} order by ${t.score} desc, ${t.createdAt} desc)`.as(
                  'rn',
                ),
              })
              .from(t)
              .where(and(inArray(t.eventId, [...questionEventIds]), visible))
              .as('ranked');
            return this.db
              .select({
                id: ranked.id,
                title: ranked.title,
                bodyText: ranked.bodyText,
                authorLabel: ranked.authorLabel,
                score: ranked.score,
                commentCount: ranked.commentCount,
                eventId: ranked.eventId,
                createdAt: ranked.createdAt,
              })
              .from(ranked)
              .where(lte(ranked.rn, TOP_THREADS))
              .orderBy(desc(ranked.score));
          })()
        : Promise.resolve([]),
    ]);
    const out = new Map<string, BumperThreadData>();
    for (const r of [...picked, ...top]) {
      out.set(r.id, {
        id: r.id,
        title: r.title,
        excerpt: excerpt(r.bodyText),
        authorLabel: r.authorLabel,
        score: r.score,
        commentCount: r.commentCount,
        eventId: r.eventId ?? null,
        createdAt: r.createdAt.toISOString(),
      });
    }
    return [...out.values()];
  }

  /** Site name, socials, the Q and A link and the home page numbers (SiteService caches them for 30 s). */
  async siteData(): Promise<BumperSiteData> {
    const pub = await this.site.getPublic();
    const web = this.webUrl();
    let shortUrl = web.replace(/^https?:\/\//, '');
    try {
      const u = new URL(web);
      shortUrl = `${u.host}${u.pathname.replace(/\/+$/, '')}`;
    } catch {
      /* keep the stripped string */
    }
    const g = pub.settings.general;
    const contact = pub.settings.contact;
    return {
      name: g.siteName || 'Zemi',
      tagline: g.tagline || null,
      labName: g.labName || null,
      webUrl: web,
      shortUrl,
      qnaUrl: `${web}/q`,
      qnaShort: `${shortUrl}/q`,
      socials: sanitizeLinkList(contact.socials),
      email: contact.email && contact.email.includes('@') ? contact.email : null,
      stats: {
        sessions: pub.stats.sessions,
        talks: pub.stats.talks,
        speakers: pub.stats.speakers,
        hoursOfTalk: pub.stats.hoursOfTalk,
      },
    };
  }
}
