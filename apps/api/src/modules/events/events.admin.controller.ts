import { Controller, Delete, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  eventCancelInput,
  eventCreateInput,
  eventListQuery,
  eventMediaInput,
  eventMediaUpdateInput,
  eventPublicationsInput,
  eventPublishInput,
  eventSpeakersInput,
  eventUpdateInput,
  orderInput,
  rundownInput,
  type EventAdmin,
  type EventAdminRow,
  type EventMediaAdminItem,
  type Paginated,
} from '@zemi/shared';
import type { z } from 'zod';
import { CurrentAuth } from '../../auth/index.js';
import { Ip, UuidParam, ZodBody, ZodQuery, type RequestAuth } from '../../common/index.js';
import { EventsAdminService } from './events.admin.service.js';
import { EventsMediaService } from './events.media.service.js';

/**
 * Admin events: /api/v1/admin/events. Session + CSRF (non-GET) enforced globally. Per-event checks
 * happen in the services (403 before 404, so a scoped admin can't tell which ids exist).
 */
@ApiTags('admin: events')
@Controller('admin/events')
export class EventsAdminController {
  constructor(
    private readonly events: EventsAdminService,
    private readonly media: EventsMediaService,
  ) {}

  /** GET /admin/events?when&search&tag&speaker&year&visibility&page&pageSize (only events you can view) */
  @Get()
  list(
    @ZodQuery(eventListQuery) q: z.infer<typeof eventListQuery>,
    @CurrentAuth() auth: RequestAuth,
  ): Promise<Paginated<EventAdminRow>> {
    return this.events.list(q, auth.ability);
  }

  /** POST /admin/events (events.create). Any subset of fields; the rest gets Friday defaults. */
  @Post()
  create(
    @ZodBody(eventCreateInput) body: z.infer<typeof eventCreateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventAdmin> {
    return this.events.create(body, { auth, ip });
  }

  @Get(':id')
  get(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth): Promise<EventAdmin> {
    return this.events.get(id, auth.ability);
  }

  @Patch(':id')
  update(
    @UuidParam() id: string,
    @ZodBody(eventUpdateInput) body: z.infer<typeof eventUpdateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventAdmin> {
    return this.events.update(id, body, { auth, ip });
  }

  @Delete(':id')
  remove(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null) {
    return this.events.remove(id, { auth, ip });
  }

  /** POST /admin/events/:id/publish { visibility: draft | published | unlisted } */
  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @UuidParam() id: string,
    @ZodBody(eventPublishInput) body: z.infer<typeof eventPublishInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventAdmin> {
    return this.events.publish(id, body.visibility, { auth, ip });
  }

  /** POST /admin/events/:id/cancel { reason?, notify = true } */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @UuidParam() id: string,
    @ZodBody(eventCancelInput) body: z.infer<typeof eventCancelInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventAdmin> {
    return this.events.cancel(id, body, { auth, ip });
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(
    @UuidParam() id: string,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventAdmin> {
    return this.events.restore(id, { auth, ip });
  }

  /** POST /admin/events/:id/duplicate: a draft copy on the next free Friday (201). */
  @Post(':id/duplicate')
  duplicate(
    @UuidParam() id: string,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventAdmin> {
    return this.events.duplicate(id, { auth, ip });
  }

  @Put(':id/speakers')
  speakers(
    @UuidParam() id: string,
    @ZodBody(eventSpeakersInput) body: z.infer<typeof eventSpeakersInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventAdmin> {
    return this.events.setSpeakers(id, body, { auth, ip });
  }

  @Put(':id/rundown')
  rundown(
    @UuidParam() id: string,
    @ZodBody(rundownInput) body: z.infer<typeof rundownInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventAdmin> {
    return this.events.setRundown(id, body, { auth, ip });
  }

  @Put(':id/publications')
  publications(
    @UuidParam() id: string,
    @ZodBody(eventPublicationsInput) body: z.infer<typeof eventPublicationsInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventAdmin> {
    return this.events.setPublications(id, body, { auth, ip });
  }

  /* ---------------------------------------------------------------- documentation media */

  @Get(':id/media')
  mediaList(
    @UuidParam() id: string,
    @CurrentAuth() auth: RequestAuth,
  ): Promise<EventMediaAdminItem[]> {
    return this.media.list(id, auth.ability);
  }

  /** POST /admin/events/:id/media { assetId, caption?, featured? } (media.manage) */
  @Post(':id/media')
  mediaAdd(
    @UuidParam() id: string,
    @ZodBody(eventMediaInput) body: z.infer<typeof eventMediaInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventMediaAdminItem> {
    return this.media.add(id, body, { auth, ip });
  }

  /** PUT /admin/events/:id/media/order { ids } (every item, new order) */
  @Put(':id/media/order')
  mediaOrder(
    @UuidParam() id: string,
    @ZodBody(orderInput) body: z.infer<typeof orderInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventMediaAdminItem[]> {
    return this.media.reorder(id, body.ids, { auth, ip });
  }

  @Patch(':id/media/:mediaId')
  mediaUpdate(
    @UuidParam() id: string,
    @UuidParam('mediaId') mediaId: string,
    @ZodBody(eventMediaUpdateInput) body: z.infer<typeof eventMediaUpdateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<EventMediaAdminItem> {
    return this.media.update(id, mediaId, body, { auth, ip });
  }

  @Delete(':id/media/:mediaId')
  mediaRemove(
    @UuidParam() id: string,
    @UuidParam('mediaId') mediaId: string,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ) {
    return this.media.remove(id, mediaId, { auth, ip });
  }
}
