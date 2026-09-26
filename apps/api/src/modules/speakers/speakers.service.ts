import { Inject, Injectable } from '@nestjs/common';
import {
  CONTENT_ACTIONS,
  type Ability,
  computeEventStatus,
  type ContentAction,
  type ImageRef,
  type Paginated,
  type SpeakerAdmin,
  type SpeakerAdminRow,
  type SpeakerCard,
  type SpeakerCreateInput,
  type SpeakerDeleteResult,
  type SpeakerPublic,
  type SpeakerRef,
  type SpeakerTalk,
  type speakerListQuery,
  type speakerUpdateInput,
} from '@zemi/shared';
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { assertCan, visibleIds } from '../../auth/permissions.service.js';
import { PermissionsService } from '../../auth/permissions.service.js';
import { AssetRefsService } from '../../common/asset-refs.js';
import { blocksToPlainText } from '../../common/blocks.js';
import { ensureFound, notFound } from '../../common/errors.js';
import { pageToLimitOffset, paginated, searchPattern } from '../../common/pagination.js';
import { SlugService } from '../../common/slug.service.js';
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import { eventSpeakers, events, eventStreams, publicationAuthors, publications, rundownItems, speakers } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { RevalidateService, tags } from '../revalidate/revalidate.service.js';
import { assertAssets, assertNotBlank, blankToNull, dropUnchanged, has, isUniqueViolation, iso, slugTaken, type ContentCtx } from './content.util.js';

const NAME_REQUIRED = 'Every speaker needs a name. Spaces alone do not count.';

export type SpeakerRow = typeof speakers.$inferSelect;
type ListQuery = z.infer<typeof speakerListQuery>;
type UpdateInput = Partial<z.infer<typeof speakerUpdateInput>>;

/** `SpeakerRef` from a row and a batch of avatar refs. */
export function toSpeakerRef(row: SpeakerRow, avatars: Map<string, ImageRef>): SpeakerRef {
  return {
    id: row.id,
    slug: row.slug,
    fullName: row.fullName,
    nickname: row.nickname ?? null,
    headline: row.headline ?? null,
    avatar: avatars.get(row.avatarAssetId ?? '') ?? null,
    defaultOrganization: row.defaultOrganization ?? null,
    defaultPosition: row.defaultPosition ?? null,
  };
}

/** Link kinds that make a good "about this author" link when a speaker becomes a manual author. */
const AUTHOR_LINK_KINDS = ['website', 'scholar', 'orcid', 'researchgate', 'linkedin', 'github'];

/** ISO string straight from SQL (aggregates over timestamptz come back as text through drizzle). */
const isoMax = (col: SQL | typeof events.startsAt) =>
  sql<string | null>`to_char(max(${col}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

@Injectable()
export class SpeakersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly refs: AssetRefsService,
    private readonly slugs: SlugService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
  ) {}

  /* ------------------------------------------------------------------ builders (also used by other modules) */

  /**
   * SpeakerRef for many ids in two queries. `publicOnly` drops draft speakers (use it for public pages,
   * where a draft speaker's page would 404).
   */
  async refsByIds(ids: Iterable<string | null | undefined>, opts: { publicOnly?: boolean } = {}, db: DbOrTx = this.db): Promise<Map<string, SpeakerRef>> {
    const list = [...new Set([...ids].filter((x): x is string => !!x))];
    if (!list.length) return new Map();
    const rows = await db.select().from(speakers).where(inArray(speakers.id, list));
    const visible = opts.publicOnly ? rows.filter((r) => r.visibility !== 'draft') : rows;
    const avatars = await this.refs.imageRefs(visible.map((r) => r.avatarAssetId), db);
    return new Map(visible.map((r) => [r.id, toSpeakerRef(r, avatars)]));
  }

  /** Talk aggregates per speaker: distinct events and latest start. Public: published, not cancelled. */
  private talkAgg(publicOnly: boolean) {
    return this.db
      .select({
        speakerId: eventSpeakers.speakerId,
        talkCount: sql<number>`count(distinct ${eventSpeakers.eventId})::int`.as('talk_count'),
        latestTalkAt: isoMax(events.startsAt).as('latest_talk_at'),
      })
      .from(eventSpeakers)
      .innerJoin(events, eq(events.id, eventSpeakers.eventId))
      .where(publicOnly ? and(eq(events.visibility, 'published'), isNull(events.cancelledAt)) : undefined)
      .groupBy(eventSpeakers.speakerId)
      .as('talk_agg');
  }

  private searchWhere(search: string | undefined): SQL | undefined {
    const p = searchPattern(search);
    if (!p) return undefined;
    return or(
      ilike(speakers.fullName, p),
      ilike(speakers.nickname, p),
      ilike(speakers.defaultOrganization, p),
      ilike(speakers.headline, p),
    );
  }

  /** Talks of one speaker, newest first, one entry per event. */
  /**
   * `ability` (admin views): draft and unlisted events only show when the caller can view that event,
   * so a speaker-only grant never leaks unannounced Fridays.
   */
  private async talksOf(row: SpeakerRow, publicOnly: boolean, ability?: Ability, db: DbOrTx = this.db): Promise<SpeakerTalk[]> {
    const rows = await db
      .select({
        es: eventSpeakers,
        e: {
          id: events.id,
          slug: events.slug,
          title: events.title,
          number: events.number,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          cancelledAt: events.cancelledAt,
          visibility: events.visibility,
          coverAssetId: events.coverAssetId,
        },
        state: eventStreams.state,
      })
      .from(eventSpeakers)
      .innerJoin(events, eq(events.id, eventSpeakers.eventId))
      .leftJoin(eventStreams, eq(eventStreams.eventId, events.id))
      .where(and(eq(eventSpeakers.speakerId, row.id), publicOnly ? eq(events.visibility, 'published') : undefined))
      .orderBy(desc(events.startsAt), asc(eventSpeakers.sortOrder));
    // Someone can be on an event twice (speaker + moderator). Keep one entry, preferring the one with a talk title.
    const byEvent = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const prev = byEvent.get(r.e.id);
      if (!prev || (!prev.es.talkTitle && r.es.talkTitle)) byEvent.set(r.e.id, r);
    }
    const list = [...byEvent.values()].filter(
      (r) => !ability || r.e.visibility === 'published' || ability.can('event', r.e.id, 'view'),
    );
    const covers = await this.refs.imageRefs(list.map((r) => r.e.coverAssetId), db);
    const now = new Date();
    return list.map((r) => ({
      eventId: r.e.id,
      eventSlug: r.e.slug,
      eventTitle: r.e.title,
      eventNumber: r.e.number ?? null,
      startsAt: iso(r.e.startsAt),
      status: computeEventStatus(r.e, r.state ?? null, now),
      role: r.es.role,
      talkTitle: r.es.talkTitle ?? null,
      organization: r.es.organization ?? row.defaultOrganization ?? null,
      position: r.es.position ?? row.defaultPosition ?? null,
      cover: covers.get(r.e.coverAssetId ?? '') ?? null,
    }));
  }

  /** Publications where this speaker is an author. */
  private async publicationsOf(speakerId: string, publicOnly: boolean, db: DbOrTx = this.db): Promise<SpeakerPublic['publications']> {
    const rows = await db
      .select({
        id: publications.id,
        slug: publications.slug,
        title: publications.title,
        type: publications.type,
        year: publications.publishedYear,
      })
      .from(publicationAuthors)
      .innerJoin(publications, eq(publications.id, publicationAuthors.publicationId))
      .where(and(eq(publicationAuthors.speakerId, speakerId), publicOnly ? eq(publications.visibility, 'published') : undefined))
      .orderBy(sql`${publications.publishedYear} desc nulls last`, sql`${publications.publishedMonth} desc nulls last`, asc(publications.title));
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).map((r) => ({ ...r, year: r.year ?? null }));
  }

  private async load(id: string, db: DbOrTx = this.db): Promise<SpeakerRow> {
    const [row] = await db.select().from(speakers).where(eq(speakers.id, id)).limit(1);
    return ensureFound(row, "We couldn't find that speaker.");
  }

  private async toPublic(row: SpeakerRow, publicOnly: boolean, ability?: Ability): Promise<SpeakerPublic> {
    const [avatars, talks, pubs] = await Promise.all([
      this.refs.imageRefs([row.avatarAssetId]),
      this.talksOf(row, publicOnly, ability),
      this.publicationsOf(row.id, publicOnly),
    ]);
    const counted = talks.filter((t) => !publicOnly || t.status !== 'cancelled');
    return {
      ...toSpeakerRef(row, avatars),
      bio: row.bio ?? [],
      links: row.links ?? [],
      talks,
      publications: pubs,
      talkCount: counted.length,
    };
  }

  private async toAdmin(row: SpeakerRow, permissions: ContentAction[], ability: Ability): Promise<SpeakerAdmin> {
    return {
      ...(await this.toPublic(row, false, ability)),
      email: row.email ?? null,
      visibility: row.visibility,
      avatarAssetId: row.avatarAssetId ?? null,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      permissions,
    };
  }

  /** Tags for pages that show this speaker: their page, events they're on (lineup or rundown), papers they wrote. */
  private async relatedTags(id: string, db: DbOrTx = this.db): Promise<string[]> {
    const [lineup, rundown, pubs] = await Promise.all([
      db.selectDistinct({ id: eventSpeakers.eventId }).from(eventSpeakers).where(eq(eventSpeakers.speakerId, id)),
      db.selectDistinct({ id: rundownItems.eventId }).from(rundownItems).where(eq(rundownItems.speakerId, id)),
      db
        .selectDistinct({ id: publicationAuthors.publicationId })
        .from(publicationAuthors)
        .where(eq(publicationAuthors.speakerId, id)),
    ]);
    const evs = [...new Set([...lineup, ...rundown].map((e) => e.id))].map((eventId) => ({ id: eventId }));
    return [
      tags.speakers,
      tags.speaker(id),
      ...(evs.length ? [tags.events, ...evs.map((e) => tags.event(e.id))] : []),
      ...(pubs.length ? [tags.publications, ...pubs.map((p) => tags.publication(p.id))] : []),
    ];
  }

  /* ------------------------------------------------------------------ admin */

  async list(q: ListQuery, ability: ContentCtx['ability']): Promise<Paginated<SpeakerAdminRow>> {
    const ids = visibleIds(ability, 'speaker');
    const where = and(
      ids === 'all' ? undefined : ids.length ? inArray(speakers.id, ids) : sql`false`,
      q.visibility ? eq(speakers.visibility, q.visibility) : undefined,
      this.searchWhere(q.search),
    );
    const agg = this.talkAgg(false);
    const pubAgg = this.db
      .select({
        speakerId: publicationAuthors.speakerId,
        publicationCount: sql<number>`count(distinct ${publicationAuthors.publicationId})::int`.as('publication_count'),
      })
      .from(publicationAuthors)
      .where(isNotNull(publicationAuthors.speakerId))
      .groupBy(publicationAuthors.speakerId)
      .as('pub_agg');
    const talkCount = sql<number>`coalesce(${agg.talkCount}, 0)`;
    const order =
      q.sort === 'talks'
        ? [desc(talkCount), asc(sql`lower(${speakers.fullName})`)]
        : q.sort === 'recent'
          ? [desc(speakers.updatedAt), desc(speakers.createdAt)]
          : [asc(sql`lower(${speakers.fullName})`), asc(speakers.id)];
    const { limit, offset } = pageToLimitOffset(q);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          s: speakers,
          talkCount,
          latestTalkAt: agg.latestTalkAt,
          publicationCount: sql<number>`coalesce(${pubAgg.publicationCount}, 0)`,
        })
        .from(speakers)
        .leftJoin(agg, eq(agg.speakerId, speakers.id))
        .leftJoin(pubAgg, eq(pubAgg.speakerId, speakers.id))
        .where(where)
        .orderBy(...order)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(speakers).where(where),
    ]);
    const avatars = await this.refs.imageRefs(rows.map((r) => r.s.avatarAssetId));
    const items = rows.map(
      (r): SpeakerAdminRow => ({
        ...toSpeakerRef(r.s, avatars),
        visibility: r.s.visibility,
        avatarAssetId: r.s.avatarAssetId ?? null,
        talkCount: Number(r.talkCount) || 0,
        latestTalkAt: r.latestTalkAt ?? null,
        publicationCount: Number(r.publicationCount) || 0,
        createdAt: iso(r.s.createdAt),
        updatedAt: iso(r.s.updatedAt),
        permissions: ability.actionsOn('speaker', r.s.id),
      }),
    );
    return paginated(items, total, q);
  }

  /** Picker search over every speaker (any admin). Prefix matches first. */
  async lookup(q: string | undefined, limit = 20): Promise<SpeakerRef[]> {
    const term = (q ?? '').trim();
    const where = this.searchWhere(term);
    const prefix = term ? `${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
    const rows = await this.db
      .select()
      .from(speakers)
      .where(where)
      .orderBy(
        ...(prefix
          ? [asc(sql`case when ${speakers.fullName} ilike ${prefix} or ${speakers.nickname} ilike ${prefix} then 0 else 1 end`)]
          : []),
        asc(sql`lower(${speakers.fullName})`),
      )
      .limit(Math.min(20, Math.max(1, limit)));
    const avatars = await this.refs.imageRefs(rows.map((r) => r.avatarAssetId));
    return rows.map((r) => toSpeakerRef(r, avatars));
  }

  async get(id: string, ability: ContentCtx['ability']): Promise<SpeakerAdmin> {
    const row = await this.load(id);
    assertCan(ability, 'speaker', id, 'view');
    return this.toAdmin(row, ability.actionsOn('speaker', id), ability);
  }

  async create(input: SpeakerCreateInput, ctx: ContentCtx): Promise<SpeakerAdmin> {
    assertNotBlank(input.fullName, ['fullName'], NAME_REQUIRED);
    const slug = input.slug ? input.slug : await this.slugs.uniqueSlug('speaker', input.fullName);
    if (input.slug) await this.slugs.ensureUniqueSlug('speaker', slug);
    await assertAssets(this.db, [{ id: input.avatarAssetId, path: ['avatarAssetId'], kinds: ['image'], label: 'photo' }]);
    let row: SpeakerRow;
    try {
      row = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(speakers)
          .values({
            slug,
            fullName: input.fullName.trim(),
            nickname: blankToNull(input.nickname),
            headline: blankToNull(input.headline),
            bio: input.bio ?? [],
            bioText: blocksToPlainText(input.bio ?? []),
            avatarAssetId: input.avatarAssetId ?? null,
            links: input.links ?? [],
            defaultOrganization: blankToNull(input.defaultOrganization),
            defaultPosition: blankToNull(input.defaultPosition),
            email: blankToNull(input.email)?.toLowerCase() ?? null,
            visibility: input.visibility ?? 'published',
          })
          .returning();
        await this.permissions.grantOwnership(ctx.principal, 'speaker', created.id, tx);
        await this.audit.log(
          {
            principal: ctx.principal,
            action: 'speaker.create',
            resourceType: 'speaker',
            resourceId: created.id,
            summary: `Added speaker "${created.fullName}"`,
            meta: { slug: created.slug, visibility: created.visibility },
            ip: ctx.ip,
          },
          tx,
        );
        return created;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'slug')) throw slugTaken(slug);
      throw err;
    }
    void this.revalidate.revalidate([tags.speakers, tags.speaker(row.id)]);
    // The creator's ability predates the owner grant, so hand them the full set.
    return this.toAdmin(row, [...CONTENT_ACTIONS], ctx.ability);
  }

  async update(id: string, patch: UpdateInput, ctx: ContentCtx): Promise<SpeakerAdmin> {
    const current = await this.load(id);
    assertCan(ctx.ability, 'speaker', id, 'edit');
    if (has(patch, 'fullName')) assertNotBlank(patch.fullName, ['fullName'], NAME_REQUIRED);
    if (has(patch, 'visibility') && patch.visibility && patch.visibility !== current.visibility) {
      assertCan(ctx.ability, 'speaker', id, 'publish', "You can edit this speaker, but showing or hiding them needs publish access.");
    }
    const nextSlug = has(patch, 'slug') && patch.slug ? patch.slug : current.slug;
    if (nextSlug !== current.slug) await this.slugs.ensureUniqueSlug('speaker', nextSlug, id);
    if (has(patch, 'avatarAssetId') && patch.avatarAssetId) {
      await assertAssets(this.db, [{ id: patch.avatarAssetId, path: ['avatarAssetId'], kinds: ['image'], label: 'photo' }]);
    }

    const set: Partial<typeof speakers.$inferInsert> = {};
    if (nextSlug !== current.slug) set.slug = nextSlug;
    if (has(patch, 'fullName') && patch.fullName) set.fullName = patch.fullName.trim();
    if (has(patch, 'nickname')) set.nickname = blankToNull(patch.nickname);
    if (has(patch, 'headline')) set.headline = blankToNull(patch.headline);
    if (has(patch, 'bio')) {
      set.bio = patch.bio ?? [];
      set.bioText = blocksToPlainText(patch.bio ?? []);
    }
    if (has(patch, 'avatarAssetId')) set.avatarAssetId = patch.avatarAssetId ?? null;
    if (has(patch, 'links')) set.links = patch.links ?? [];
    if (has(patch, 'defaultOrganization')) set.defaultOrganization = blankToNull(patch.defaultOrganization);
    if (has(patch, 'defaultPosition')) set.defaultPosition = blankToNull(patch.defaultPosition);
    if (has(patch, 'email')) set.email = blankToNull(patch.email)?.toLowerCase() ?? null;
    if (has(patch, 'visibility') && patch.visibility) set.visibility = patch.visibility;

    dropUnchanged(set, current);
    const fields = Object.keys(set);
    if (!fields.length) return this.toAdmin(current, ctx.ability.actionsOn('speaker', id), ctx.ability);

    let row: SpeakerRow;
    try {
      row = await this.db.transaction(async (tx) => {
        const [updated] = await tx.update(speakers).set(set).where(eq(speakers.id, id)).returning();
        if (set.slug) await this.slugs.recordSlugChange('speaker', id, current.slug, set.slug, tx);
        const renamed = set.fullName && set.fullName !== current.fullName;
        await this.audit.log(
          {
            principal: ctx.principal,
            action: 'speaker.update',
            resourceType: 'speaker',
            resourceId: id,
            summary: renamed ? `Renamed speaker "${current.fullName}" to "${updated.fullName}"` : `Updated speaker "${updated.fullName}"`,
            meta: {
              fields,
              ...(set.slug ? { slug: { from: current.slug, to: set.slug } } : {}),
              ...(set.visibility && set.visibility !== current.visibility ? { visibility: { from: current.visibility, to: set.visibility } } : {}),
            },
            ip: ctx.ip,
          },
          tx,
        );
        return updated;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'slug')) throw slugTaken(nextSlug);
      throw err;
    }
    void this.relatedTags(id).then((t) => this.revalidate.revalidate(t));
    return this.toAdmin(row, ctx.ability.actionsOn('speaker', id), ctx.ability);
  }

  /**
   * Delete a speaker. Their event_speakers rows go with them (FK cascade); publication authorships
   * become manual authors so papers keep the name, photo and organization.
   */
  async remove(id: string, ctx: ContentCtx): Promise<SpeakerDeleteResult> {
    const row = await this.load(id);
    assertCan(ctx.ability, 'speaker', id, 'delete');
    const relatedTags = await this.relatedTags(id);
    const authorUrl = (row.links ?? []).find((l) => AUTHOR_LINK_KINDS.includes(l.kind))?.url ?? null;
    const result = await this.db.transaction(async (tx) => {
      const talks = await tx.select({ eventId: eventSpeakers.eventId }).from(eventSpeakers).where(eq(eventSpeakers.speakerId, id));
      const kept = await tx
        .update(publicationAuthors)
        .set({ fullName: row.fullName, avatarAssetId: row.avatarAssetId })
        .where(eq(publicationAuthors.speakerId, id))
        .returning({ id: publicationAuthors.id });
      if (row.defaultOrganization) {
        await tx
          .update(publicationAuthors)
          .set({ organization: row.defaultOrganization })
          .where(and(eq(publicationAuthors.speakerId, id), isNull(publicationAuthors.organization)));
      }
      if (authorUrl) {
        await tx
          .update(publicationAuthors)
          .set({ url: authorUrl })
          .where(and(eq(publicationAuthors.speakerId, id), isNull(publicationAuthors.url)));
      }
      await this.permissions.removeResourceGrants('speaker', id, tx);
      await this.slugs.forgetResource('speaker', id, tx);
      await tx.delete(speakers).where(eq(speakers.id, id));
      const affectedEvents = new Set(talks.map((t) => t.eventId)).size;
      await this.audit.log(
        {
          principal: ctx.principal,
          action: 'speaker.delete',
          resourceType: 'speaker',
          resourceId: id,
          summary: `Deleted speaker "${row.fullName}"${talks.length ? ` (removed from ${affectedEvents} event${affectedEvents === 1 ? '' : 's'})` : ''}`,
          meta: { slug: row.slug, affectedTalks: talks.length, affectedEvents, authorshipsKept: kept.length },
          ip: ctx.ip,
        },
        tx,
      );
      return { ok: true as const, affectedTalks: talks.length, affectedEvents, authorshipsKept: kept.length };
    });
    void this.revalidate.revalidate(relatedTags);
    return result;
  }

  /* ------------------------------------------------------------------ public */

  async publicList(q: ListQuery): Promise<Paginated<SpeakerCard>> {
    const where = and(eq(speakers.visibility, 'published'), this.searchWhere(q.search));
    const agg = this.talkAgg(true);
    const talkCount = sql<number>`coalesce(${agg.talkCount}, 0)`;
    const order =
      q.sort === 'talks'
        ? [desc(talkCount), asc(sql`lower(${speakers.fullName})`)]
        : q.sort === 'recent'
          ? [sql`${agg.latestTalkAt} desc nulls last`, desc(speakers.createdAt)]
          : [asc(sql`lower(${speakers.fullName})`), asc(speakers.id)];
    const { limit, offset } = pageToLimitOffset(q);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ s: speakers, talkCount, latestTalkAt: agg.latestTalkAt })
        .from(speakers)
        .leftJoin(agg, eq(agg.speakerId, speakers.id))
        .where(where)
        .orderBy(...order)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(speakers).where(where),
    ]);
    const avatars = await this.refs.imageRefs(rows.map((r) => r.s.avatarAssetId));
    return paginated(
      rows.map((r) => ({ ...toSpeakerRef(r.s, avatars), talkCount: Number(r.talkCount) || 0, latestTalkAt: r.latestTalkAt ?? null })),
      total,
      q,
    );
  }

  /** Published or unlisted speakers by slug. Old slugs answer `{ redirect }`. */
  async publicBySlug(slug: string): Promise<SpeakerPublic | { redirect: string }> {
    const missing = () => notFound("We couldn't find that speaker. Maybe they changed their name?");
    const resolved = await this.slugs.resolveSlug('speaker', slug);
    if (!resolved) throw missing();
    if ('redirect' in resolved) {
      const [target] = await this.db
        .select({ visibility: speakers.visibility })
        .from(speakers)
        .where(eq(speakers.slug, resolved.redirect))
        .limit(1);
      if (!target || target.visibility === 'draft') throw missing();
      return resolved;
    }
    const row = await this.load(resolved.id).catch(() => null);
    if (!row || row.visibility === 'draft') throw missing();
    return this.toPublic(row, true);
  }
}
