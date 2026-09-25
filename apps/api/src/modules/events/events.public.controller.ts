import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { eventListQuery, type EventCard, type EventDetail, type Paginated } from '@zemi/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import { Public } from '../../auth/index.js';
import { UuidParam, ZodQuery } from '../../common/index.js';
import { EventsPublicService } from './events.public.service.js';

/**
 * Public events: /api/v1/public/events. No auth. Other workstreams mount more routes under the same
 * prefix (`:id/live`, `:id/heartbeat`, `:id/reactions`, `:id/registrations`); they don't clash with
 * these because they have more path segments.
 */
@ApiTags('public: events')
@Public()
@Controller('public/events')
export class EventsPublicController {
  constructor(private readonly events: EventsPublicService) {}

  /** GET /public/events?when=upcoming|past|live|all&search&tag&speaker&year&page&pageSize */
  @Get()
  list(@ZodQuery(eventListQuery) q: z.infer<typeof eventListQuery>): Promise<Paginated<EventCard>> {
    return this.events.list(q);
  }

  /** GET /public/events/next: the live event, else the next one, else `null` (a JSON null, not an empty body). */
  @Get('next')
  async next(@Res() res: Response): Promise<void> {
    res.json(await this.events.next());
  }

  /** GET /public/events/:id/calendar.ics */
  @Get(':id/calendar.ics')
  async calendar(@UuidParam() id: string, @Res() res: Response): Promise<void> {
    const { filename, body } = await this.events.calendar(id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(body);
  }

  /** GET /public/events/:slug: EventDetail, or `{ redirect: newSlug }` (200) for an old slug. */
  @Get(':slug')
  bySlug(@Param('slug') slug: string): Promise<EventDetail | { redirect: string }> {
    return this.events.bySlug(slug);
  }
}
