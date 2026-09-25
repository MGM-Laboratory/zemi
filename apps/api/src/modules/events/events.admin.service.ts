import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createAbility,
  formatJakarta,
  generalSettings,
  SLUG_MAX,
  slugify,
  withOwnerGrant,
  type Ability,
  type EventAdmin,
  type EventAdminRow,
  type EventCreateInput,
  type EventUpdateInput,
  type Paginated,
  type Visibility,
} from '@zemi/shared';
import { and, asc, count, desc, eq, gte, inArray, like, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  eventCancelInput,
  eventListQuery,
  eventPublicationsInput,
  eventSpeakersInput,
  rundownInput,
} from '@zemi/shared';
import { assertCan, assertCapability, PermissionsService, visibleIds } from '../../auth/index.js';
import {
  blocksToPlainText,
  notFound,
  pageToLimitOffset,
  paginated,
  SlugService,
  validationError,
  type RequestAuth,
} from '../../common/index.js';
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import {
  eventPublications,
  eventSpeakers,
  eventStreams,
  events,
  publications,
  registrations,
  rundownItems,
  siteSettings,
  slugRedirects,
  speakers,
  venues,
  assets,
} from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { RevalidateService, tags } from '../revalidate/revalidate.service.js';
import {
  cleanTags,
  cleanText,
  firstFreeFriday,
  nextAccent,
  sessionOn,
  shiftToDate,
  sortRundown,
} from './event-logic.js';
import { EventsLoader, selectEventList, type EventRow } from './events.loader.js';
import {
  searchCondition,
  speakerCondition,
  streamJoin,
  tagCondition,
  whenCondition,
  yearCondition,
} from './events.sql.js';

export type EventListQuery = z.infer<typeof eventListQuery>;
export type EventCancelInput = z.infer<typeof eventCancelInput>;
export type EventSpeakersInput = z.infer<typeof eventSpeakersInput>;
export type RundownInput = z.infer<typeof rundownInput>;
export type EventPublicationsInput = z.infer<typeof eventPublicationsInput>;

/** Who is acting (from `@CurrentAuth()`) and from where. */
export interface Actor {
  auth: RequestAuth;
  ip: string | null;
}

/** Queue the registrations workstream consumes to email everyone about a cancellation. */
export const EVENT_CANCELLED_QUEUE = 'event.cancelled.notify';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TWO_HOURS = 2 * 3600_000;
const issue = (path: (string | number)[], message: string) => ({
  path,
  message,
  code: 'custom' as const,
});

const VISIBILITY_WORD: Record<Visibility, string> = {
  draft: 'draft',
  published: 'published',
  unlisted: 'unlisted',
};

/**
 * Admin side of events: list, create, edit, publish, cancel, duplicate, delete and the
 * speakers/rundown/publications editors. Every mutation writes an audit entry (resourceType
 * `event`, resourceId = event id) and revalidates the web.
 */
@Injectable()
export class EventsAdminService {
  private readonly logger = new Logger('Events');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly loader: EventsLoader,
    private readonly slugs: SlugService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
    private readonly jobs: JobsService,
  ) {}

  /* ---------------------------------------------------------------- reads */

  async list(q: EventListQuery, ability: Ability): Promise<Paginated<EventAdminRow>> {
    const now = new Date();
    const ids = visibleIds(ability, 'event');
    const scoped = ids === 'all' ? null : ids.filter((id) => UUID.test(id));
    if (scoped && !scoped.length) return paginated([], 0, q);
    const where = and(
      scoped ? inArray(events.id, scoped) : undefined,
      whenCondition(q.when, now, 'admin'),
      searchCondition(q.search, 'admin'),
      tagCondition(q.tag),
      speakerCondition(q.speaker, 'admin'),
      yearCondition(q.year),
      q.visibility ? eq(events.visibility, q.visibility) : undefined,
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
    return paginated(await this.loader.toAdminRows(rows, ability, now), totals[0]?.n ?? 0, q);
  }

  /** 403 before 404, so scoped admins can't probe which ids exist. */
  async get(id: string, ability: Ability): Promise<EventAdmin> {
    assertCan(ability, 'event', id, 'view');
    const out = await this.loader.adminDetail(id, ability);
    if (!out) throw notFound("We couldn't find that event.");
    return out;
  }

  /* ---------------------------------------------------------------- create */

  async create(input: EventCreateInput, actor: Actor): Promise<EventAdmin> {
    const { principal, ability } = actor.auth;
    assertCapability(ability, 'events.create', "You don't have permission to create events.");
    const defaults = await this.generalDefaults();
    const now = new Date();

    const row = await this.db.transaction(async (tx) => {
      // Serialize creates so number = max + 1 and the generated slug can't collide.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('zemi:events:create'))`);
      const last = await this.lastNumbered(tx);
      const number = input.number !== undefined ? input.number : (last?.number ?? 0) + 1;
      const title = cleanText(input.title) ?? (number !== null ? `Zemi #${number}` : 'New Friday');

      let slug: string;
      if (input.slug) {
        await this.slugs.ensureUniqueSlug('event', input.slug, null, tx);
        slug = input.slug;
      } else {
        slug = await this.generateSlug(title, tx);
      }

      let startsAt: Date;
      let endsAt: Date;
      if (input.startsAt) {
        startsAt = new Date(input.startsAt);
        endsAt = input.endsAt ? new Date(input.endsAt) : new Date(startsAt.getTime() + TWO_HOURS);
      } else {
        const date = firstFreeFriday(await this.takenDates(now, tx), now);
        ({ startsAt, endsAt } = sessionOn(date, defaults.defaultStart, defaults.defaultEnd));
        if (input.endsAt) endsAt = new Date(input.endsAt);
      }
      this.assertTimes(startsAt, endsAt);

      const venueId =
        input.venueId !== undefined
          ? input.venueId
          : await this.existingVenue(defaults.defaultVenueId ?? null, tx);
      if (input.venueId) await this.assertVenue(input.venueId, tx);
      if (input.coverAssetId) await this.assertCover(input.coverAssetId, tx);
      const description = input.description ?? [];
      const visibility = input.visibility ?? 'draft';

      const [created] = await tx
        .insert(events)
        .values({
          slug,
          number,
          title,
          summary: cleanText(input.summary),
          coverAssetId: input.coverAssetId ?? null,
          description,
          descriptionText: blocksToPlainText(description),
          startsAt,
          endsAt,
          venueId,
          roomNote: cleanText(input.roomNote),
          mapsUrl: cleanText(input.mapsUrl),
          onlineNote: cleanText(input.onlineNote),
          mode: input.mode ?? 'hybrid',
          accent: input.accent ?? nextAccent(last?.accent ?? null),
          tags: cleanTags(input.tags ?? []),
          visibility,
          registrationOpen: input.registrationOpen ?? true,
          capacity:
            input.capacity !== undefined ? input.capacity : (defaults.defaultCapacity ?? null),
          registrationClosesAt: input.registrationClosesAt
            ? new Date(input.registrationClosesAt)
            : null,
          showRegistrantCount: input.showRegistrantCount ?? true,
          publishedAt: visibility === 'published' ? now : null,
          createdBy: principal.id,
        })
        .returning();
      // A typed slug may claim another event's old slug (SlugService semantics): drop that redirect.
      if (input.slug) await this.slugs.recordSlugChange('event', created.id, '', slug, tx);
      await this.permissions.grantOwnership(principal, 'event', created.id, tx);
      return created;
    });

    await this.audit.log({
      principal,
      action: 'event.create',
      resourceType: 'event',
      resourceId: row.id,
      summary: `Created "${row.title}" for ${this.when(row)}`,
      meta: { number: row.number, slug: row.slug, visibility: row.visibility },
      ip: actor.ip,
    });
    void this.revalidate.revalidate([tags.events, tags.event(row.id)]);
    return this.adminAfterCreate(row.id, actor);
  }

  /* ---------------------------------------------------------------- update */

  async update(id: string, patch: EventUpdateInput, actor: Actor): Promise<EventAdmin> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', id, 'edit');
    const current = await this.mustFind(id);

    const startsAt = patch.startsAt ? new Date(patch.startsAt) : current.startsAt;
    const endsAt = patch.endsAt ? new Date(patch.endsAt) : current.endsAt;
    this.assertTimes(startsAt, endsAt);
    if (patch.venueId) await this.assertVenue(patch.venueId);
    if (patch.coverAssetId) await this.assertCover(patch.coverAssetId);

    const set: Partial<typeof events.$inferInsert> = {};
    if (patch.slug !== undefined && patch.slug !== current.slug) set.slug = patch.slug;
    if (patch.number !== undefined) set.number = patch.number;
    if (patch.title !== undefined) set.title = patch.title.trim() || current.title;
    if (patch.summary !== undefined) set.summary = cleanText(patch.summary);
    if (patch.coverAssetId !== undefined) set.coverAssetId = patch.coverAssetId;
    if (patch.description !== undefined) {
      set.description = patch.description;
      set.descriptionText = blocksToPlainText(patch.description);
    }
    if (patch.startsAt !== undefined) set.startsAt = startsAt;
    if (patch.endsAt !== undefined) set.endsAt = endsAt;
    if (patch.venueId !== undefined) set.venueId = patch.venueId;
    if (patch.roomNote !== undefined) set.roomNote = cleanText(patch.roomNote);
    if (patch.mapsUrl !== undefined) set.mapsUrl = cleanText(patch.mapsUrl);
    if (patch.onlineNote !== undefined) set.onlineNote = cleanText(patch.onlineNote);
    if (patch.mode !== undefined) set.mode = patch.mode;
    if (patch.accent !== undefined) set.accent = patch.accent;
    if (patch.tags !== undefined) set.tags = cleanTags(patch.tags);
    if (patch.registrationOpen !== undefined) set.registrationOpen = patch.registrationOpen;
    if (patch.capacity !== undefined) set.capacity = patch.capacity;
    if (patch.registrationClosesAt !== undefined) {
      set.registrationClosesAt = patch.registrationClosesAt
        ? new Date(patch.registrationClosesAt)
        : null;
    }
    if (patch.showRegistrantCount !== undefined)
      set.showRegistrantCount = patch.showRegistrantCount;

    const fields = Object.keys(set).filter((k) => k !== 'descriptionText');
    if (!fields.length) return this.get(id, ability);

    await this.db.transaction(async (tx) => {
      if (set.slug) {
        await this.slugs.ensureUniqueSlug('event', set.slug, id, tx);
        await this.slugs.recordSlugChange('event', id, current.slug, set.slug, tx);
      }
      await tx.update(events).set(set).where(eq(events.id, id));
    });

    const title = set.title ?? current.title;
    await this.audit.log({
      principal,
      action: 'event.update',
      resourceType: 'event',
      resourceId: id,
      summary: set.slug
        ? `Updated "${title}" and moved it to /events/${set.slug}`
        : `Updated "${title}"`,
      meta: { fields, ...(set.slug ? { fromSlug: current.slug, toSlug: set.slug } : {}) },
      ip: actor.ip,
    });
    void this.revalidateEvent(id);
    return this.get(id, ability);
  }

  /* ---------------------------------------------------------------- lifecycle */

  async publish(id: string, visibility: Visibility, actor: Actor): Promise<EventAdmin> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', id, 'publish');
    const current = await this.mustFind(id);
    if (current.visibility !== visibility) {
      await this.db
        .update(events)
        .set({
          visibility,
          ...(visibility === 'published' && !current.publishedAt
            ? { publishedAt: new Date() }
            : {}),
        })
        .where(eq(events.id, id));
      const action =
        visibility === 'published'
          ? 'event.publish'
          : visibility === 'draft'
            ? 'event.unpublish'
            : 'event.unlist';
      const summary =
        visibility === 'published'
          ? `Published "${current.title}"`
          : visibility === 'draft'
            ? `Moved "${current.title}" back to draft`
            : `Made "${current.title}" unlisted (link only)`;
      await this.audit.log({
        principal,
        action,
        resourceType: 'event',
        resourceId: id,
        summary,
        meta: { from: VISIBILITY_WORD[current.visibility], to: VISIBILITY_WORD[visibility] },
        ip: actor.ip,
      });
      void this.revalidateEvent(id);
    }
    return this.get(id, ability);
  }

  async cancel(id: string, input: EventCancelInput, actor: Actor): Promise<EventAdmin> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', id, 'publish');
    const current = await this.mustFind(id);
    const reason = cleanText(input.reason);
    await this.db
      .update(events)
      .set({ cancelledAt: current.cancelledAt ?? new Date(), cancelReason: reason })
      .where(eq(events.id, id));

    // After the write is committed, so the worker sees the cancelled row.
    let queued = false;
    if (input.notify) {
      try {
        // Replaces a still-queued notice (double clicks), so people get one email.
        await this.jobs.reschedule(
          EVENT_CANCELLED_QUEUE,
          `event-cancelled:${id}`,
          { eventId: id },
          new Date(),
        );
        queued = true;
      } catch (err) {
        this.logger.error(
          `Could not queue the cancellation emails for ${id}: ${(err as Error).message}`,
        );
      }
    }
    await this.audit.log({
      principal,
      action: current.cancelledAt ? 'event.cancel-update' : 'event.cancel',
      resourceType: 'event',
      resourceId: id,
      summary: current.cancelledAt
        ? `Updated the cancellation note on "${current.title}"`
        : `Cancelled "${current.title}"${queued ? ' and told everyone who registered' : ''}`,
      meta: { reason, notify: input.notify, queued },
      ip: actor.ip,
    });
    void this.revalidateEvent(id);
    return this.get(id, ability);
  }

  async restore(id: string, actor: Actor): Promise<EventAdmin> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', id, 'publish');
    const current = await this.mustFind(id);
    if (current.cancelledAt) {
      await this.db
        .update(events)
        .set({ cancelledAt: null, cancelReason: null })
        .where(eq(events.id, id));
      // A cancellation notice that hasn't gone out yet must not go out now.
      await this.jobs
        .cancelByKey(EVENT_CANCELLED_QUEUE, `event-cancelled:${id}`)
        .catch((err: unknown) =>
          this.logger.warn(
            `Could not drop the queued cancellation emails for ${id}: ${(err as Error).message}`,
          ),
        );
      await this.audit.log({
        principal,
        action: 'event.restore',
        resourceType: 'event',
        resourceId: id,
        summary: `Brought "${current.title}" back from cancelled`,
        ip: actor.ip,
      });
      void this.revalidateEvent(id);
    }
    return this.get(id, ability);
  }

  /** Copy content, speakers, rundown and publications to the next free Friday as a draft. */
  async duplicate(id: string, actor: Actor): Promise<EventAdmin> {
    const { principal, ability } = actor.auth;
    assertCapability(ability, 'events.create', "You don't have permission to create events.");
    assertCan(ability, 'event', id, 'view');
    const src = await this.mustFind(id);
    const now = new Date();

    const row = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('zemi:events:create'))`);
      const last = await this.lastNumbered(tx);
      const number = src.number !== null ? (last?.number ?? 0) + 1 : null;
      const slug = await this.generateSlug(src.title, tx);
      const date = firstFreeFriday(await this.takenDates(now, tx), now);
      const { startsAt, endsAt, deltaMs } = shiftToDate(src, date);

      const [created] = await tx
        .insert(events)
        .values({
          slug,
          number,
          title: src.title,
          summary: src.summary,
          coverAssetId: src.coverAssetId,
          description: src.description,
          descriptionText: src.descriptionText,
          startsAt,
          endsAt,
          venueId: src.venueId,
          roomNote: src.roomNote,
          mapsUrl: src.mapsUrl,
          onlineNote: src.onlineNote,
          mode: src.mode,
          accent: nextAccent(last?.accent ?? src.accent),
          tags: src.tags,
          visibility: 'draft',
          registrationOpen: src.registrationOpen,
          capacity: src.capacity,
          registrationClosesAt: src.registrationClosesAt
            ? new Date(src.registrationClosesAt.getTime() + deltaMs)
            : null,
          showRegistrantCount: src.showRegistrantCount,
          createdBy: principal.id,
        })
        .returning();
      const newId = created.id;

      const [sp, rd, pb] = await Promise.all([
        tx
          .select()
          .from(eventSpeakers)
          .where(eq(eventSpeakers.eventId, id))
          .orderBy(asc(eventSpeakers.sortOrder)),
        tx
          .select()
          .from(rundownItems)
          .where(eq(rundownItems.eventId, id))
          .orderBy(asc(rundownItems.sortOrder)),
        tx
          .select()
          .from(eventPublications)
          .where(eq(eventPublications.eventId, id))
          .orderBy(asc(eventPublications.sortOrder)),
      ]);
      if (sp.length) {
        await tx
          .insert(eventSpeakers)
          .values(sp.map(({ id: _id, eventId: _e, ...rest }) => ({ ...rest, eventId: newId })));
      }
      if (rd.length) {
        await tx
          .insert(rundownItems)
          .values(rd.map(({ id: _id, eventId: _e, ...rest }) => ({ ...rest, eventId: newId })));
      }
      if (pb.length) {
        await tx
          .insert(eventPublications)
          .values(pb.map(({ eventId: _e, ...rest }) => ({ ...rest, eventId: newId })));
      }
      await this.permissions.grantOwnership(principal, 'event', newId, tx);
      return created;
    });

    await this.audit.log({
      principal,
      action: 'event.duplicate',
      resourceType: 'event',
      resourceId: row.id,
      summary: `Duplicated "${src.title}" to ${this.when(row)} as a draft`,
      meta: { sourceId: id, sourceSlug: src.slug, slug: row.slug },
      ip: actor.ip,
    });
    void this.revalidate.revalidate([tags.events, tags.event(row.id)]);
    return this.adminAfterCreate(row.id, actor);
  }

  async remove(
    id: string,
    actor: Actor,
  ): Promise<{ ok: true; removed: { registrations: number } }> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', id, 'delete');
    const current = await this.mustFind(id);
    const linked = await this.linkedTags(id);
    const [regs] = await this.db
      .select({ n: count() })
      .from(registrations)
      .where(eq(registrations.eventId, id));
    await this.db.transaction(async (tx) => {
      await tx.delete(events).where(eq(events.id, id));
      await this.permissions.removeResourceGrants('event', id, tx);
      await this.slugs.forgetResource('event', id, tx);
    });
    await this.audit.log({
      principal,
      action: 'event.delete',
      resourceType: 'event',
      resourceId: id,
      summary: `Deleted "${current.title}"${regs?.n ? ` and its ${regs.n} registrations` : ''}`,
      meta: { slug: current.slug, number: current.number, registrations: regs?.n ?? 0 },
      ip: actor.ip,
    });
    void this.revalidate.revalidate([tags.events, tags.event(id), ...linked]);
    return { ok: true, removed: { registrations: regs?.n ?? 0 } };
  }

  /* ---------------------------------------------------------------- relations */

  async setSpeakers(id: string, input: EventSpeakersInput, actor: Actor): Promise<EventAdmin> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', id, 'edit');
    const current = await this.mustFind(id);

    const seen = new Set<string>();
    const list = input.speakers.filter((s) => {
      const key = `${s.speakerId}:${s.role}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await this.assertExist(
      speakers,
      list.map((s) => s.speakerId),
      (i) => ['speakers', input.speakers.indexOf(list[i]), 'speakerId'],
      "We couldn't find that speaker. Maybe it was deleted?",
    );

    const before = await this.db
      .select({ id: eventSpeakers.speakerId })
      .from(eventSpeakers)
      .where(eq(eventSpeakers.eventId, id));
    await this.db.transaction(async (tx) => {
      await tx.delete(eventSpeakers).where(eq(eventSpeakers.eventId, id));
      await this.touch(id, tx);
      if (list.length) {
        await tx.insert(eventSpeakers).values(
          list.map((s, i) => ({
            eventId: id,
            speakerId: s.speakerId,
            role: s.role,
            organization: cleanText(s.organization),
            position: cleanText(s.position),
            talkTitle: cleanText(s.talkTitle),
            sortOrder: i,
          })),
        );
      }
    });

    await this.audit.log({
      principal,
      action: 'event.speakers',
      resourceType: 'event',
      resourceId: id,
      summary: `Updated the speakers on "${current.title}" (${list.length === 1 ? '1 person' : `${list.length} people`})`,
      meta: { speakerIds: list.map((s) => s.speakerId) },
      ip: actor.ip,
    });
    const touched = new Set([...before.map((b) => b.id), ...list.map((s) => s.speakerId)]);
    void this.revalidateEvent(id, [tags.speakers, ...[...touched].map(tags.speaker)]);
    return this.get(id, ability);
  }

  async setRundown(id: string, input: RundownInput, actor: Actor): Promise<EventAdmin> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', id, 'edit');
    const current = await this.mustFind(id);

    const bad = input.items
      .map((item, i) =>
        item.endTime && item.endTime < item.time
          ? issue(['items', i, 'endTime'], 'This ends before it starts.')
          : null,
      )
      .filter((x) => x !== null);
    if (bad.length)
      throw validationError(
        bad.length === 1
          ? `items.${bad[0].path[1]}.endTime: ${bad[0].message}`
          : 'Some rundown items end before they start.',
        bad,
      );

    const withSpeaker = input.items
      .map((item, i) => ({ id: item.speakerId, i }))
      .filter((x): x is { id: string; i: number } => !!x.id);
    await this.assertExist(
      speakers,
      withSpeaker.map((x) => x.id),
      (k) => ['items', withSpeaker[k].i, 'speakerId'],
      "We couldn't find that speaker. Maybe it was deleted?",
    );

    const sorted = sortRundown(input.items);
    await this.db.transaction(async (tx) => {
      await tx.delete(rundownItems).where(eq(rundownItems.eventId, id));
      await this.touch(id, tx);
      if (sorted.length) {
        await tx.insert(rundownItems).values(
          sorted.map((item, i) => ({
            eventId: id,
            time: item.time,
            endTime: item.endTime ?? null,
            agenda: item.agenda.trim(),
            note: cleanText(item.note),
            speakerId: item.speakerId ?? null,
            sortOrder: i,
          })),
        );
      }
    });

    await this.audit.log({
      principal,
      action: 'event.rundown',
      resourceType: 'event',
      resourceId: id,
      summary: `Updated the rundown of "${current.title}" (${sorted.length} ${sorted.length === 1 ? 'item' : 'items'})`,
      meta: { items: sorted.length },
      ip: actor.ip,
    });
    void this.revalidateEvent(id);
    return this.get(id, ability);
  }

  async setPublications(
    id: string,
    input: EventPublicationsInput,
    actor: Actor,
  ): Promise<EventAdmin> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', id, 'edit');
    const current = await this.mustFind(id);

    const seen = new Set<string>();
    const list = input.items.filter((p) =>
      seen.has(p.publicationId) ? false : (seen.add(p.publicationId), true),
    );
    await this.assertExist(
      publications,
      list.map((p) => p.publicationId),
      (i) => ['items', input.items.indexOf(list[i]), 'publicationId'],
      "We couldn't find that publication. Maybe it was deleted?",
    );

    const before = await this.db
      .select({ id: eventPublications.publicationId })
      .from(eventPublications)
      .where(eq(eventPublications.eventId, id));
    await this.db.transaction(async (tx) => {
      await tx.delete(eventPublications).where(eq(eventPublications.eventId, id));
      await this.touch(id, tx);
      if (list.length) {
        await tx
          .insert(eventPublications)
          .values(
            list.map((p, i) => ({
              eventId: id,
              publicationId: p.publicationId,
              note: cleanText(p.note),
              sortOrder: i,
            })),
          );
      }
    });

    await this.audit.log({
      principal,
      action: 'event.publications',
      resourceType: 'event',
      resourceId: id,
      summary: `Updated the papers linked to "${current.title}" (${list.length})`,
      meta: { publicationIds: list.map((p) => p.publicationId) },
      ip: actor.ip,
    });
    const touched = new Set([...before.map((b) => b.id), ...list.map((p) => p.publicationId)]);
    void this.revalidateEvent(id, [tags.publications, ...[...touched].map(tags.publication)]);
    return this.get(id, ability);
  }

  /* ---------------------------------------------------------------- helpers */

  async mustFind(id: string, db: DbOrTx = this.db): Promise<EventRow> {
    const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!row) throw notFound("We couldn't find that event.");
    return row;
  }

  /** Bump `updated_at` after a change to related rows (speakers, rundown, media...), so `EventDetail.updatedAt` and the ICS SEQUENCE move. */
  async touch(id: string, db: DbOrTx = this.db): Promise<void> {
    await db.update(events).set({ updatedAt: new Date() }).where(eq(events.id, id));
  }

  /**
   * Revalidate the event, plus speaker and publication pages that show it (they embed its title,
   * cover and status), plus any extra tags.
   */
  async revalidateEvent(id: string, extra: string[] = []): Promise<void> {
    const linked = await this.linkedTags(id).catch(() => [] as string[]);
    await this.revalidate.revalidate([tags.events, tags.event(id), ...linked, ...extra]);
  }

  private async linkedTags(id: string): Promise<string[]> {
    const [sp, pb] = await Promise.all([
      this.db
        .select({ id: eventSpeakers.speakerId })
        .from(eventSpeakers)
        .where(eq(eventSpeakers.eventId, id)),
      this.db
        .select({ id: eventPublications.publicationId })
        .from(eventPublications)
        .where(eq(eventPublications.eventId, id)),
    ]);
    const out: string[] = [];
    if (sp.length) out.push(tags.speakers, ...sp.map((s) => tags.speaker(s.id)));
    if (pb.length) out.push(tags.publications, ...pb.map((p) => tags.publication(p.id)));
    return out;
  }

  /** The create response: the creator's fresh owner grant isn't in the request's ability yet. */
  private async adminAfterCreate(id: string, actor: Actor): Promise<EventAdmin> {
    const { principal, policy } = actor.auth;
    const ability =
      principal.kind === 'admin'
        ? createAbility(principal, withOwnerGrant(policy, 'event', id))
        : actor.auth.ability;
    const out = await this.loader.adminDetail(id, ability);
    if (!out) throw notFound("We couldn't find that event.");
    return out;
  }

  private assertTimes(startsAt: Date, endsAt: Date): void {
    if (!(endsAt.getTime() > startsAt.getTime())) {
      const message = 'The event has to end after it starts.';
      throw validationError(`endsAt: ${message}`, [issue(['endsAt'], message)]);
    }
  }

  private async assertVenue(venueId: string, db: DbOrTx = this.db): Promise<void> {
    const [v] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (!v) {
      const message = "We couldn't find that room. Maybe it was deleted?";
      throw validationError(`venueId: ${message}`, [issue(['venueId'], message)]);
    }
  }

  private async existingVenue(venueId: string | null, db: DbOrTx): Promise<string | null> {
    if (!venueId) return null;
    const [v] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    return v?.id ?? null;
  }

  private async assertCover(assetId: string, db: DbOrTx = this.db): Promise<void> {
    const [a] = await db
      .select({ kind: assets.kind, status: assets.status })
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);
    let message: string | null = null;
    if (!a) message = "We couldn't find that photo. Try uploading it again.";
    else if (a.kind !== 'image') message = 'The cover has to be a photo.';
    else if (a.status === 'failed') message = "That photo didn't process. Try uploading it again.";
    if (message)
      throw validationError(`coverAssetId: ${message}`, [issue(['coverAssetId'], message)]);
  }

  /** 400 with a field issue for every id that doesn't exist in `table`. */
  private async assertExist(
    table: typeof speakers | typeof publications,
    ids: string[],
    pathFor: (index: number) => (string | number)[],
    message: string,
  ): Promise<void> {
    if (!ids.length) return;
    const found = await this.db
      .select({ id: table.id })
      .from(table)
      .where(inArray(table.id, [...new Set(ids)]));
    const ok = new Set(found.map((f) => f.id));
    const bad = ids
      .map((id, i) => (ok.has(id) ? null : issue(pathFor(i), message)))
      .filter((x) => x !== null);
    if (bad.length)
      throw validationError(
        bad.length === 1 ? message : 'Some of those no longer exist. Refresh and try again.',
        bad,
      );
  }

  /**
   * First free slug for a title: not used by any event now, and not an old slug that still redirects
   * to another event (taking it would silently break that event's old links).
   */
  private async generateSlug(title: string, db: DbOrTx): Promise<string> {
    const root = slugify(title, SLUG_MAX - 5);
    const family = (col: typeof events.slug | typeof slugRedirects.oldSlug) =>
      or(eq(col, root), like(col, `${root}-%`));
    const [current, old] = await Promise.all([
      db.select({ slug: events.slug }).from(events).where(family(events.slug)),
      db
        .select({ slug: slugRedirects.oldSlug })
        .from(slugRedirects)
        .where(and(eq(slugRedirects.resourceType, 'event'), family(slugRedirects.oldSlug))),
    ]);
    const used = new Set([...current, ...old].map((r) => r.slug));
    if (!used.has(root)) return root;
    for (let n = 2; n < 10_000; n++) if (!used.has(`${root}-${n}`)) return `${root}-${n}`;
    return `${root}-${Date.now().toString(36)}`;
  }

  /** The event with the highest number (for number = max + 1 and the accent rotation). */
  private async lastNumbered(
    db: DbOrTx,
  ): Promise<{ number: number | null; accent: EventRow['accent'] } | undefined> {
    const [last] = await db
      .select({ number: events.number, accent: events.accent })
      .from(events)
      .orderBy(sql`${events.number} desc nulls last`, desc(events.createdAt))
      .limit(1);
    return last;
  }

  /** Jakarta dates that already have an event (cancelled ones too), from yesterday on. */
  async takenDates(now: Date, db: DbOrTx = this.db): Promise<Set<string>> {
    const rows = await db
      .select({
        date: sql<string>`to_char(${events.startsAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`,
      })
      .from(events)
      .where(gte(events.startsAt, new Date(now.getTime() - 86_400_000)));
    return new Set(rows.map((r) => r.date));
  }

  /** Room, capacity and times from site settings (general), falling back to 13:15 to 15:15. */
  private async generalDefaults() {
    const [row] = await this.db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, 'general'))
      .limit(1);
    const parsed = generalSettings.safeParse(row?.value ?? {});
    return parsed.success ? parsed.data : generalSettings.parse({});
  }

  /** "Fri, 2 Oct 2026, 13:15 WIB" */
  private when(row: { startsAt: Date }): string {
    return `${formatJakarta(row.startsAt, 'datetime')} WIB`;
  }
}
