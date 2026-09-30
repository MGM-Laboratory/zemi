import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  bumperPermissions,
  bumperPlayable,
  bumperThemeSchema,
  type Ability,
  type BumperEventSummary,
  type BumperGenerateInput,
  type BumperGeneratePreview,
  type BumperListQuery,
  type BumperOrigin,
  type BumperOutputLinks,
  type BumperPublicShow,
  type BumperRevision,
  type BumperRevisionDetail,
  type BumperShowCreateInput,
  type BumperShowDetail,
  type BumperShowRow,
  type BumperShowUpdateInput,
  type BumperSlide,
  type BumperTheme,
  type Paginated,
  type Principal,
} from '@zemi/shared';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AssetRefsService } from '../../common/asset-refs.js';
import { CryptoService } from '../../common/crypto.service.js';
import { AppError, notFound } from '../../common/errors.js';
import { pageToLimitOffset, paginated, searchPattern } from '../../common/pagination.js';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import { bumperRevisions, bumperShows, events, eventStreams } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { eventStatus } from '../events/event-logic.js';
import { assertCanBuild, assertCanUseBumpers, seesAllShows, showAccess } from './access.js';
import type { BumperDuplicateInput, BumperRotateInput } from './bumpers.schemas.js';
import { BumpersDataService } from './data.service.js';
import { generateShow } from './generator.js';
import {
  controlKeyHash,
  isUniqueViolation,
  newControlKey,
  newOutputKey,
  newShowKeys,
} from './keys.js';
import { currentSlide, planSlidesChange } from './live-logic.js';
import { BumpersLiveService, type ShowRow } from './live.service.js';

/** Revisions: a new one when the latest is older than this (autosaves are coalesced). */
const REVISION_WINDOW_MS = 5 * 60_000;
const KEEP_REVISIONS = 40;

type RevisionReason = 'save' | 'checkpoint' | 'generate' | 'restore' | 'duplicate';

export interface Actor {
  principal: Principal;
  ability: Ability;
  ip: string | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** "Zemi #98" or the event title, for audit lines. */
const eventLabel = (e: { number: number | null; title: string } | null | undefined) =>
  e ? (e.number !== null ? `Zemi #${e.number}` : `"${e.title}"`) : null;

export const archivedLinkError = () =>
  new AppError(
    404,
    'archived',
    'This show is archived. Restore it in Zemi Studio to put it back on air.',
  );
const unknownLink = () =>
  notFound("We couldn't find that link. It may have been replaced in Zemi Studio.");

/**
 * Bumper shows: list, detail, create, generate, save (versioned, with coalesced revisions),
 * archive, delete, duplicate, revisions, and the OBS links (keys). Playback lives in
 * BumpersLiveService; the data bundle in BumpersDataService.
 */
@Injectable()
export class BumperShowsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: CryptoService,
    private readonly config: AppConfig,
    private readonly refs: AssetRefsService,
    private readonly audit: AuditService,
    private readonly data: BumpersDataService,
    private readonly live: BumpersLiveService,
  ) {}

  /* ---------------------------------------------------------------- lookups */

  async find(id: string, db: DbOrTx = this.db): Promise<ShowRow | null> {
    const [row] = await db.select().from(bumperShows).where(eq(bumperShows.id, id)).limit(1);
    return row ?? null;
  }

  /** The show, or 403/404 (403 first for scoped admins) unless the ability has `need` on it. */
  async access(id: string, ability: Ability, need: 'run' | 'edit'): Promise<ShowRow> {
    const row = await this.find(id);
    showAccess(ability, row, need);
    return row!;
  }

  /** OBS output lookup: 404 for unknown or rotated keys, 404 `archived` for archived shows. */
  async byOutputKey(key: string): Promise<ShowRow> {
    const [row] = await this.db
      .select()
      .from(bumperShows)
      .where(eq(bumperShows.outputKey, key))
      .limit(1);
    if (!row) throw unknownLink();
    if (row.status === 'archived') throw archivedLinkError();
    return row;
  }

  /** Dock / Companion lookup by the control key's hash. */
  async byControlKey(key: string): Promise<ShowRow> {
    const [row] = await this.db
      .select()
      .from(bumperShows)
      .where(eq(bumperShows.controlKeyHash, controlKeyHash(key)))
      .limit(1);
    if (!row) throw unknownLink();
    if (row.status === 'archived') throw archivedLinkError();
    return row;
  }

  private async assertEvent(
    eventId: string | null | undefined,
  ): Promise<{ id: string; number: number | null; title: string } | null> {
    if (!eventId) return null;
    const [e] = await this.db
      .select({ id: events.id, number: events.number, title: events.title })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!e) throw notFound("We couldn't find that event.");
    return e;
  }

  /* ---------------------------------------------------------------- DTOs */

  private async eventSummaries(
    ids: Array<string | null>,
    now = new Date(),
  ): Promise<Map<string, BumperEventSummary>> {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    if (!list.length) return new Map();
    const rows = await this.db
      .select({
        id: events.id,
        slug: events.slug,
        number: events.number,
        title: events.title,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        accent: events.accent,
        coverAssetId: events.coverAssetId,
        cancelledAt: events.cancelledAt,
        streamState: eventStreams.state,
      })
      .from(events)
      .leftJoin(eventStreams, eq(eventStreams.eventId, events.id))
      .where(inArray(events.id, list));
    const covers = await this.refs.imageRefs(rows.map((r) => r.coverAssetId));
    return new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          slug: r.slug,
          number: r.number ?? null,
          title: r.title,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
          accent: r.accent,
          cover: covers.get(r.coverAssetId ?? '') ?? null,
          status: eventStatus(r, r.streamState, now),
        },
      ]),
    );
  }

  private toRow(row: ShowRow, event: BumperEventSummary | null, ability: Ability): BumperShowRow {
    const playable = bumperPlayable(row.slides);
    const cur = currentSlide(row.slides, row.liveSlideId);
    const outputs = this.live.outputs(row.id);
    return {
      id: row.id,
      title: row.title,
      eventId: row.eventId,
      event,
      status: row.status,
      origin: row.origin,
      slideCount: row.slides.length,
      autoRuntimeSec: playable.reduce((sum, s) => sum + (s.timing.autoAdvanceSec ?? 0), 0),
      cover: playable[0] ?? null,
      theme: row.theme,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdByName: row.createdByName,
      updatedByName: row.updatedByName,
      lastPlayedAt: iso(row.lastPlayedAt),
      archivedAt: iso(row.archivedAt),
      live: {
        slideId: cur?.id ?? null,
        position: cur ? playable.indexOf(cur) : -1,
        mode: row.liveMode,
        outputs,
        onAir: outputs > 0,
      },
      permissions: bumperPermissions(ability, row.eventId),
    };
  }

  async detail(row: ShowRow, ability: Ability): Promise<BumperShowDetail> {
    const [events, data] = await Promise.all([
      this.eventSummaries([row.eventId]),
      this.data.build(row.eventId, row.slides),
    ]);
    return {
      ...this.toRow(row, row.eventId ? (events.get(row.eventId) ?? null) : null, ability),
      slides: row.slides,
      data,
      state: this.live.state(row),
    };
  }

  /** The OBS output and dock payload: hidden slides (and what only they reference) are left out. */
  async publicShow(row: ShowRow, canControl: boolean): Promise<BumperPublicShow> {
    const slides = bumperPlayable(row.slides);
    return {
      id: row.id,
      title: row.title,
      eventId: row.eventId,
      theme: row.theme,
      slides,
      version: row.version,
      data: await this.data.build(row.eventId, slides),
      state: this.live.state(row),
      canControl,
    };
  }

  /* ---------------------------------------------------------------- list */

  async list(q: BumperListQuery, ability: Ability): Promise<Paginated<BumperShowRow>> {
    assertCanUseBumpers(ability);
    const where: Array<SQL | undefined> = [];
    if (!seesAllShows(ability)) {
      // Standalone shows need bumpers.manage, so scoped admins only ever see event shows.
      if (ability.canAll('event', 'bumpers.run')) where.push(isNotNull(bumperShows.eventId));
      else {
        const ids = ability.idsWith('event', 'bumpers.run');
        where.push(ids.length ? inArray(bumperShows.eventId, ids) : sql`false`);
      }
    }
    if (q.status !== 'all') where.push(eq(bumperShows.status, q.status));
    if (q.eventId) where.push(eq(bumperShows.eventId, q.eventId));
    const p = searchPattern(q.search);
    if (p) {
      const n = (q.search ?? '').trim().match(/^#?(\d{1,6})$/);
      where.push(
        or(
          ilike(bumperShows.title, p),
          sql`exists (select 1 from ${events} where ${events.id} = ${bumperShows.eventId} and (${events.title} ilike ${p}${n ? sql` or ${events.number} = ${Number(n[1])}` : sql``}))`,
        ),
      );
    }
    const cond = and(...where);
    const { limit, offset } = pageToLimitOffset(q);
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(bumperShows)
        .where(cond)
        .orderBy(desc(bumperShows.updatedAt), desc(bumperShows.id))
        .limit(limit)
        .offset(offset),
      this.db.select({ n: count() }).from(bumperShows).where(cond),
    ]);
    const summaries = await this.eventSummaries(rows.map((r) => r.eventId));
    return paginated(
      rows.map((r) =>
        this.toRow(r, r.eventId ? (summaries.get(r.eventId) ?? null) : null, ability),
      ),
      total?.n ?? 0,
      q,
    );
  }

  /* ---------------------------------------------------------------- create */

  /**
   * Insert a show with fresh keys (a key collision retries with new ones). The live slide starts on
   * the first playable slide. `revision` writes the first revision in the same transaction.
   */
  private async insertShow(
    values: {
      title: string;
      eventId: string | null;
      origin: BumperOrigin;
      theme: BumperTheme;
      slides: BumperSlide[];
    },
    principal: Principal,
    revision: RevisionReason | null,
  ): Promise<ShowRow> {
    for (let attempt = 0; ; attempt++) {
      const id = randomUUID();
      try {
        return await this.db.transaction(async (tx) => {
          const [row] = await tx
            .insert(bumperShows)
            .values({
              id,
              ...values,
              ...newShowKeys((plain, aad) => this.crypto.encrypt(plain, aad), id),
              liveSlideId: bumperPlayable(values.slides)[0]?.id ?? null,
              createdBy: principal.id,
              createdByName: principal.name,
              updatedBy: principal.id,
              updatedByName: principal.name,
            })
            .returning();
          if (revision) await this.writeRevision(tx, row, revision, principal);
          return row;
        });
      } catch (err) {
        if (attempt < 3 && isUniqueViolation(err)) continue;
        throw err;
      }
    }
  }

  async create(input: BumperShowCreateInput, actor: Actor): Promise<BumperShowDetail> {
    const eventId = input.eventId ?? null;
    assertCanBuild(actor.ability, eventId);
    const event = await this.assertEvent(eventId);
    const row = await this.insertShow(
      {
        title: input.title,
        eventId,
        origin: input.origin,
        theme: bumperThemeSchema.parse(input.theme ?? {}),
        slides: input.slides ?? [],
      },
      actor.principal,
      null,
    );
    await this.audit.log({
      principal: actor.principal,
      action: 'bumper.create',
      resourceType: 'bumper',
      resourceId: row.id,
      summary: `Created the bumper show "${row.title}"${event ? ` for ${eventLabel(event)}` : ''}`,
      meta: { eventId, origin: row.origin, slides: row.slides.length },
      ip: actor.ip,
    });
    return this.detail(row, actor.ability);
  }

  /** POST /admin/bumpers/generate. `create: false` answers a preview and saves nothing. */
  async generate(
    input: BumperGenerateInput,
    actor: Actor,
  ): Promise<
    { created: true; detail: BumperShowDetail } | { created: false; preview: BumperGeneratePreview }
  > {
    assertCanBuild(actor.ability, input.eventId);
    const source = await this.data.generatorSource(input.eventId);
    if (!source) throw notFound("We couldn't find that event.");
    const show = generateShow(input, source);
    if (!input.create) {
      const data = await this.data.build(input.eventId, show.slides);
      return {
        created: false,
        preview: {
          title: show.title,
          eventId: input.eventId,
          theme: show.theme,
          slides: show.slides,
          data,
          notes: show.notes,
        },
      };
    }
    const row = await this.insertShow(
      {
        title: show.title,
        eventId: input.eventId,
        origin: 'generated',
        theme: show.theme,
        slides: show.slides,
      },
      actor.principal,
      'generate',
    );
    await this.audit.log({
      principal: actor.principal,
      action: 'bumper.generate',
      resourceType: 'bumper',
      resourceId: row.id,
      summary: `Generated "${row.title}" from ${eventLabel(source.event)} (${row.slides.length} bumpers)`,
      meta: {
        eventId: input.eventId,
        slides: row.slides.length,
        qna: input.qna,
        host: input.host.mode,
      },
      ip: actor.ip,
    });
    return { created: true, detail: await this.detail(row, actor.ability) };
  }

  /* ---------------------------------------------------------------- update */

  private versionConflict(cur: ShowRow): AppError {
    return new AppError(
      409,
      'version_conflict',
      'Someone else saved this show a moment ago. Keep your version or load theirs.',
      {
        details: {
          version: cur.version,
          updatedAt: cur.updatedAt.toISOString(),
          updatedByName: cur.updatedByName,
        },
      },
    );
  }

  /**
   * PATCH /admin/bumpers/:id. Needs `baseVersion` to match (unless `force`), bumps the version,
   * writes a revision at most every 5 minutes (or on a checkpoint), tells every screen to refetch,
   * and moves playback off a slide that was deleted or hidden.
   */
  async update(id: string, input: BumperShowUpdateInput, actor: Actor): Promise<BumperShowDetail> {
    const before = await this.access(id, actor.ability, 'edit');
    const moving = input.eventId !== undefined && input.eventId !== before.eventId;
    let targetEvent: Awaited<ReturnType<BumperShowsService['assertEvent']>> = null;
    if (moving) {
      assertCanBuild(actor.ability, input.eventId ?? null);
      targetEvent = await this.assertEvent(input.eventId);
    }
    const { principal } = actor;
    const now = new Date();
    const result = await this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(bumperShows).where(eq(bumperShows.id, id)).for('update');
      if (!cur) throw notFound("We couldn't find that show. Maybe someone deleted it?");
      if (!input.force && input.baseVersion !== cur.version) throw this.versionConflict(cur);

      const slides = input.slides ?? cur.slides;
      const set: Partial<typeof bumperShows.$inferInsert> = {
        version: cur.version + 1,
        updatedBy: principal.id,
        updatedByName: principal.name,
        updatedAt: now,
      };
      const fields: string[] = [];
      if (input.title !== undefined && input.title !== cur.title) {
        set.title = input.title;
        fields.push('title');
      }
      if (moving) {
        set.eventId = input.eventId ?? null;
        fields.push('event');
      }
      if (input.theme !== undefined) {
        set.theme = input.theme;
        fields.push('theme');
      }
      if (input.slides !== undefined) {
        set.slides = input.slides;
        fields.push('slides');
      }
      const statusChange =
        input.status !== undefined && input.status !== cur.status ? input.status : null;
      if (statusChange) set.status = statusChange;
      // Nothing to save: no new version, no refetch on every screen.
      if (!fields.length && !statusChange && input.checkpoint === undefined)
        return {
          row: cur,
          cur,
          fields,
          statusChange,
          livePatch: false,
          noop: true,
        };

      const livePatch = input.slides ? planSlidesChange(cur, slides, now) : null;
      const liveWrite = {
        liveSeq: sql`${bumperShows.liveSeq} + 1`,
        liveUpdatedAt: now,
        liveVia: 'system',
        liveBy: null,
      };
      if (livePatch) Object.assign(set, livePatch, liveWrite);
      if (statusChange === 'archived') {
        // Archived shows stop: no auto-advance, and screens get a final state before the outputs close.
        Object.assign(set, liveWrite, { archivedAt: now, liveAdvanceAt: null });
      } else if (statusChange === 'active') {
        set.archivedAt = null;
      }

      const [row] = await tx.update(bumperShows).set(set).where(eq(bumperShows.id, id)).returning();
      const content =
        input.slides !== undefined ||
        input.theme !== undefined ||
        (input.title !== undefined && input.title !== cur.title);
      if (input.checkpoint !== undefined) {
        await this.writeRevision(tx, row, 'checkpoint', principal, input.checkpoint);
      } else if (content) {
        const [latest] = await tx
          .select({ at: bumperRevisions.createdAt })
          .from(bumperRevisions)
          .where(eq(bumperRevisions.showId, id))
          .orderBy(desc(bumperRevisions.createdAt))
          .limit(1);
        if (!latest || now.getTime() - latest.at.getTime() >= REVISION_WINDOW_MS) {
          await this.writeRevision(tx, row, 'save', principal);
        }
      }
      return {
        row: row,
        cur,
        fields,
        statusChange,
        livePatch: !!livePatch || statusChange === 'archived',
        noop: false,
      };
    });

    const { row, cur } = result;
    if (result.noop) return this.detail(row, actor.ability);
    this.live.schedule(row);
    this.live.publishShow(row);
    if (result.livePatch) this.live.publishState(row);
    if (result.statusChange === 'archived') this.live.revoke(row.id, 'archived');

    const meta = {
      eventId: row.eventId,
      version: row.version,
      fields: result.fields,
      force: !!input.force,
    };
    if (result.statusChange) {
      await this.audit.log({
        principal,
        action: result.statusChange === 'archived' ? 'bumper.archive' : 'bumper.restore',
        resourceType: 'bumper',
        resourceId: row.id,
        summary:
          result.statusChange === 'archived'
            ? `Archived the bumper show "${row.title}"`
            : `Brought back the bumper show "${row.title}"`,
        meta,
        ip: actor.ip,
      });
    }
    // Every save that made a new version (autosaves included) gets its entry; playback is not audited.
    if (result.fields.length || input.checkpoint !== undefined) {
      const what =
        input.checkpoint !== undefined
          ? `Saved a checkpoint${input.checkpoint ? ` "${input.checkpoint}"` : ''} of "${row.title}"`
          : moving
            ? `Moved "${row.title}" to ${eventLabel(targetEvent) ?? 'no event'}`
            : cur.title !== row.title
              ? `Renamed the bumper show "${cur.title}" to "${row.title}"`
              : `Saved "${row.title}" (version ${row.version}${input.force ? ', over a newer version' : ''})`;
      await this.audit.log({
        principal,
        action: 'bumper.update',
        resourceType: 'bumper',
        resourceId: row.id,
        summary: what,
        meta,
        ip: actor.ip,
      });
    }
    return this.detail(row, actor.ability);
  }

  /* ---------------------------------------------------------------- delete, duplicate */

  async remove(id: string, actor: Actor): Promise<void> {
    const row = await this.access(id, actor.ability, 'edit');
    await this.db.delete(bumperShows).where(eq(bumperShows.id, id));
    this.live.revoke(id, 'deleted');
    await this.audit.log({
      principal: actor.principal,
      action: 'bumper.delete',
      resourceType: 'bumper',
      resourceId: id,
      summary: `Deleted the bumper show "${row.title}" (${row.slides.length} bumpers)`,
      meta: { eventId: row.eventId },
      ip: actor.ip,
    });
  }

  /** A copy with new keys. Needs `run` on the source and `edit` where the copy goes. */
  async duplicate(
    id: string,
    input: BumperDuplicateInput,
    actor: Actor,
  ): Promise<BumperShowDetail> {
    const src = await this.access(id, actor.ability, 'run');
    const eventId = input.eventId !== undefined ? input.eventId : src.eventId;
    assertCanBuild(actor.ability, eventId);
    await this.assertEvent(eventId);
    const title = (input.title ?? `${src.title} (copy)`).slice(0, 120);
    const row = await this.insertShow(
      { title, eventId, origin: 'duplicate', theme: src.theme, slides: src.slides },
      actor.principal,
      'duplicate',
    );
    await this.audit.log({
      principal: actor.principal,
      action: 'bumper.duplicate',
      resourceType: 'bumper',
      resourceId: row.id,
      summary: `Duplicated "${src.title}" as "${row.title}"`,
      meta: { eventId, sourceId: src.id, sourceEventId: src.eventId },
      ip: actor.ip,
    });
    return this.detail(row, actor.ability);
  }

  /* ---------------------------------------------------------------- revisions */

  private async writeRevision(
    tx: DbOrTx,
    row: ShowRow,
    reason: RevisionReason,
    principal: Principal,
    name?: string,
  ): Promise<void> {
    await tx.insert(bumperRevisions).values({
      showId: row.id,
      version: row.version,
      title: row.title,
      theme: row.theme,
      slides: row.slides,
      // A named checkpoint keeps its name: "checkpoint:Before the rehearsal".
      reason: reason === 'checkpoint' && name ? `checkpoint:${name}` : reason,
      createdBy: principal.id,
      createdByName: principal.name,
    });
    const keep = tx
      .select({ id: bumperRevisions.id })
      .from(bumperRevisions)
      .where(eq(bumperRevisions.showId, row.id))
      .orderBy(desc(bumperRevisions.createdAt), desc(bumperRevisions.version))
      .limit(KEEP_REVISIONS);
    await tx
      .delete(bumperRevisions)
      .where(and(eq(bumperRevisions.showId, row.id), notInArray(bumperRevisions.id, keep)));
  }

  async revisions(id: string, ability: Ability): Promise<BumperRevision[]> {
    await this.access(id, ability, 'run');
    const rows = await this.db
      .select({
        id: bumperRevisions.id,
        version: bumperRevisions.version,
        title: bumperRevisions.title,
        slideCount: sql<number>`jsonb_array_length(${bumperRevisions.slides})`.mapWith(Number),
        reason: bumperRevisions.reason,
        createdAt: bumperRevisions.createdAt,
        createdByName: bumperRevisions.createdByName,
      })
      .from(bumperRevisions)
      .where(eq(bumperRevisions.showId, id))
      .orderBy(desc(bumperRevisions.createdAt), desc(bumperRevisions.version));
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      createdByName: r.createdByName ?? null,
    }));
  }

  private async loadRevision(showId: string, revId: string, db: DbOrTx = this.db) {
    const [rev] = await db
      .select()
      .from(bumperRevisions)
      .where(and(eq(bumperRevisions.id, revId), eq(bumperRevisions.showId, showId)))
      .limit(1);
    if (!rev) throw notFound("We couldn't find that version of the show.");
    return rev;
  }

  async revision(id: string, revId: string, ability: Ability): Promise<BumperRevisionDetail> {
    await this.access(id, ability, 'run');
    const r = await this.loadRevision(id, revId);
    return {
      id: r.id,
      version: r.version,
      title: r.title,
      slideCount: r.slides.length,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      createdByName: r.createdByName ?? null,
      slides: r.slides,
      theme: bumperThemeSchema.parse(r.theme ?? {}),
    };
  }

  /** Put an older version back. The current document is saved as a revision first, so nothing is lost. */
  async restoreRevision(
    id: string,
    revId: string,
    baseVersion: number,
    actor: Actor,
  ): Promise<BumperShowDetail> {
    await this.access(id, actor.ability, 'edit');
    const now = new Date();
    const { row, rev, livePatch } = await this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(bumperShows).where(eq(bumperShows.id, id)).for('update');
      if (!cur) throw notFound("We couldn't find that show. Maybe someone deleted it?");
      if (baseVersion !== cur.version) throw this.versionConflict(cur);
      const rev = await this.loadRevision(id, revId, tx);
      await this.writeRevision(tx, cur, 'restore', actor.principal);
      const patch = planSlidesChange(cur, rev.slides, now);
      const [row] = await tx
        .update(bumperShows)
        .set({
          title: rev.title,
          theme: bumperThemeSchema.parse(rev.theme ?? {}),
          slides: rev.slides,
          version: cur.version + 1,
          updatedBy: actor.principal.id,
          updatedByName: actor.principal.name,
          updatedAt: now,
          ...(patch
            ? {
                ...patch,
                liveSeq: sql`${bumperShows.liveSeq} + 1`,
                liveUpdatedAt: now,
                liveVia: 'system',
                liveBy: null,
              }
            : {}),
        })
        .where(eq(bumperShows.id, id))
        .returning();
      return { row: row, rev, livePatch: !!patch };
    });
    this.live.schedule(row);
    this.live.publishShow(row);
    if (livePatch) this.live.publishState(row);
    await this.audit.log({
      principal: actor.principal,
      action: 'bumper.revision.restore',
      resourceType: 'bumper',
      resourceId: row.id,
      summary: `Restored "${row.title}" to version ${rev.version}`,
      meta: {
        eventId: row.eventId,
        revisionId: rev.id,
        restoredVersion: rev.version,
        version: row.version,
      },
      ip: actor.ip,
    });
    return this.detail(row, actor.ability);
  }

  /* ---------------------------------------------------------------- OBS links */

  links(row: ShowRow): BumperOutputLinks {
    const web = this.data.webUrl();
    const api = this.config.env.PUBLIC_API_URL.replace(/\/+$/, '');
    const controlKey = this.crypto.decrypt(row.controlKeyEnc, row.id);
    return {
      outputUrl: `${web}/bumpers/out/${row.outputKey}`,
      dockUrl: `${web}/bumpers/dock/${controlKey}`,
      controlApiUrl: `${api}/api/v1/public/bumpers/control/${controlKey}`,
      outputKey: row.outputKey,
      controlKey,
      rotatedAt: row.keysRotatedAt.toISOString(),
    };
  }

  /** GET /admin/bumpers/:id/output (run). */
  async output(id: string, ability: Ability): Promise<BumperOutputLinks> {
    return this.links(await this.access(id, ability, 'run'));
  }

  /** New key(s). Screens holding an old one get `revoked` and stop; the new links work right away. */
  async rotate(
    id: string,
    which: BumperRotateInput['which'],
    actor: Actor,
  ): Promise<BumperOutputLinks> {
    const before = await this.access(id, actor.ability, 'edit');
    for (let attempt = 0; ; attempt++) {
      try {
        const [row] = await this.db
          .update(bumperShows)
          .set({
            ...(which !== 'control' ? { outputKey: newOutputKey() } : {}),
            ...(which !== 'output'
              ? newControlKey((plain, aad) => this.crypto.encrypt(plain, aad), id)
              : {}),
            keysRotatedAt: new Date(),
            updatedAt: before.updatedAt,
          })
          .where(eq(bumperShows.id, id))
          .returning();
        if (!row) throw notFound("We couldn't find that show. Maybe someone deleted it?");
        this.live.rotated(row, which);
        const label =
          which === 'both'
            ? 'OBS links'
            : which === 'output'
              ? 'OBS output link'
              : 'dock and control link';
        await this.audit.log({
          principal: actor.principal,
          action: 'bumper.rotate',
          resourceType: 'bumper',
          resourceId: id,
          summary: `Replaced the ${label} for "${row.title}"`,
          meta: { eventId: row.eventId, which },
          ip: actor.ip,
        });
        return this.links(row);
      } catch (err) {
        if (attempt < 3 && isUniqueViolation(err)) continue;
        throw err;
      }
    }
  }
}
