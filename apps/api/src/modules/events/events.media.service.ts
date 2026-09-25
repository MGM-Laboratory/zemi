import { Inject, Injectable } from '@nestjs/common';
import type {
  Ability,
  EventMediaAdminItem,
  eventMediaInput,
  eventMediaUpdateInput,
} from '@zemi/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { assertCan } from '../../auth/index.js';
import { conflict, forbidden, notFound, validationError } from '../../common/index.js';
import { DB, type Db } from '../../db/client.js';
import { assets, eventMedia } from '../../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { EventsAdminService, type Actor } from './events.admin.service.js';
import { EventsLoader } from './events.loader.js';

export type EventMediaInput = z.infer<typeof eventMediaInput>;
export type EventMediaUpdateInput = z.infer<typeof eventMediaUpdateInput>;

const issue = (path: (string | number)[], message: string) => ({
  path,
  message,
  code: 'custom' as const,
});

/**
 * Documentation photos and videos of an event (`event_media`). The files themselves are uploaded
 * through POST /admin/assets (purpose `documentation`); this attaches, captions, features, orders
 * and detaches them. Detaching keeps the asset in the media library.
 */
@Injectable()
export class EventsMediaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly loader: EventsLoader,
    private readonly events: EventsAdminService,
    private readonly audit: AuditService,
  ) {}

  async list(eventId: string, ability: Ability): Promise<EventMediaAdminItem[]> {
    assertCan(ability, 'event', eventId, 'view');
    await this.events.mustFind(eventId);
    return this.items(eventId);
  }

  async add(eventId: string, input: EventMediaInput, actor: Actor): Promise<EventMediaAdminItem> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', eventId, 'media.manage');
    const event = await this.events.mustFind(eventId);

    const [asset] = await this.db
      .select()
      .from(assets)
      .where(eq(assets.id, input.assetId))
      .limit(1);
    const bad = (message: string) =>
      validationError(`assetId: ${message}`, [issue(['assetId'], message)]);
    if (!asset) throw bad("We couldn't find that file. Try uploading it again.");
    if (asset.kind !== 'image' && asset.kind !== 'video')
      throw bad('Documentation takes photos and videos only.');
    if (asset.status === 'failed') throw bad("That file didn't process. Try uploading it again.");
    const mayUse =
      ability.isSuperadmin ||
      ability.has('media.library') ||
      (!!asset.createdBy && asset.createdBy === principal.id);
    if (!mayUse) throw forbidden('You can only add files you uploaded yourself.');

    const [dupe] = await this.db
      .select({ id: eventMedia.id })
      .from(eventMedia)
      .where(and(eq(eventMedia.eventId, eventId), eq(eventMedia.assetId, input.assetId)))
      .limit(1);
    if (dupe) {
      const message = 'That one is already in the gallery.';
      throw conflict(message, {
        details: { field: 'assetId', issues: [issue(['assetId'], message)] },
      });
    }

    const [row] = await this.db
      .insert(eventMedia)
      .values({
        eventId,
        assetId: input.assetId,
        caption: input.caption?.trim() || null,
        featured: input.featured,
        sortOrder: sql`coalesce((select max(${eventMedia.sortOrder}) + 1 from ${eventMedia} where ${eventMedia.eventId} = ${eventId}), 0)`,
      })
      .returning();

    await this.audit.log({
      principal,
      action: 'event.media.add',
      resourceType: 'event',
      resourceId: eventId,
      summary: `Added a ${asset.kind === 'video' ? 'video' : 'photo'} to the gallery of "${event.title}"`,
      meta: { mediaId: row.id, assetId: asset.id },
      ip: actor.ip,
    });
    await this.events.touch(eventId);
    void this.events.revalidateEvent(eventId);
    return this.loader.mediaItem(row, asset, 'admin');
  }

  async update(
    eventId: string,
    mediaId: string,
    input: EventMediaUpdateInput,
    actor: Actor,
  ): Promise<EventMediaAdminItem> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', eventId, 'media.manage');
    const event = await this.events.mustFind(eventId);
    await this.mustFindMedia(eventId, mediaId);

    const set: Partial<typeof eventMedia.$inferInsert> = {};
    if (input.caption !== undefined) set.caption = input.caption?.trim() || null;
    if (input.featured !== undefined) set.featured = input.featured;
    if (Object.keys(set).length) {
      await this.db.update(eventMedia).set(set).where(eq(eventMedia.id, mediaId));
      await this.audit.log({
        principal,
        action: 'event.media.update',
        resourceType: 'event',
        resourceId: eventId,
        summary:
          input.featured !== undefined && input.caption === undefined
            ? `${input.featured ? 'Featured' : 'Unfeatured'} a gallery item on "${event.title}"`
            : `Edited a gallery item on "${event.title}"`,
        meta: { mediaId, fields: Object.keys(set) },
        ip: actor.ip,
      });
      await this.events.touch(eventId);
      void this.events.revalidateEvent(eventId);
    }
    const found = await this.mustFindMedia(eventId, mediaId);
    return this.loader.mediaItem(found.media, found.asset, 'admin');
  }

  async remove(eventId: string, mediaId: string, actor: Actor): Promise<{ ok: true }> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', eventId, 'media.manage');
    const event = await this.events.mustFind(eventId);
    const found = await this.mustFindMedia(eventId, mediaId);
    await this.db.delete(eventMedia).where(eq(eventMedia.id, mediaId));
    await this.audit.log({
      principal,
      action: 'event.media.remove',
      resourceType: 'event',
      resourceId: eventId,
      summary: `Took a ${found.asset.kind === 'video' ? 'video' : 'photo'} out of the gallery of "${event.title}"`,
      meta: { mediaId, assetId: found.asset.id },
      ip: actor.ip,
    });
    await this.events.touch(eventId);
    void this.events.revalidateEvent(eventId);
    return { ok: true };
  }

  /** `ids` must be exactly the event's media ids, in the new order. */
  async reorder(eventId: string, ids: string[], actor: Actor): Promise<EventMediaAdminItem[]> {
    const { principal, ability } = actor.auth;
    assertCan(ability, 'event', eventId, 'media.manage');
    const event = await this.events.mustFind(eventId);
    const current = await this.db
      .select({ id: eventMedia.id })
      .from(eventMedia)
      .where(eq(eventMedia.eventId, eventId));
    const have = new Set(current.map((c) => c.id));
    const given = new Set(ids);
    if (given.size !== ids.length || given.size !== have.size || ids.some((id) => !have.has(id))) {
      throw validationError('The gallery changed while you were sorting. Refresh and try again.', [
        issue(['ids'], 'Send every gallery item exactly once.'),
      ]);
    }
    if (ids.length) {
      await this.db.transaction(async (tx) => {
        for (const [i, id] of ids.entries()) {
          await tx.update(eventMedia).set({ sortOrder: i }).where(eq(eventMedia.id, id));
        }
      });
      await this.audit.log({
        principal,
        action: 'event.media.reorder',
        resourceType: 'event',
        resourceId: eventId,
        summary: `Reordered the gallery of "${event.title}"`,
        meta: { count: ids.length },
        ip: actor.ip,
      });
      await this.events.touch(eventId);
      void this.events.revalidateEvent(eventId);
    }
    return this.items(eventId);
  }

  private async items(eventId: string): Promise<EventMediaAdminItem[]> {
    const rows = await this.db
      .select({ media: eventMedia, asset: assets })
      .from(eventMedia)
      .innerJoin(assets, eq(assets.id, eventMedia.assetId))
      .where(eq(eventMedia.eventId, eventId))
      .orderBy(asc(eventMedia.sortOrder), asc(eventMedia.createdAt));
    return rows.map((r) => this.loader.mediaItem(r.media, r.asset, 'admin'));
  }

  private async mustFindMedia(eventId: string, mediaId: string) {
    const [row] = await this.db
      .select({ media: eventMedia, asset: assets })
      .from(eventMedia)
      .innerJoin(assets, eq(assets.id, eventMedia.assetId))
      .where(and(eq(eventMedia.id, mediaId), eq(eventMedia.eventId, eventId)))
      .limit(1);
    if (!row) throw notFound("We couldn't find that gallery item.");
    return row;
  }
}
