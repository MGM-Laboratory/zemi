import { Module } from '@nestjs/common';
import { EventsAdminController } from './events.admin.controller.js';
import { EventsAdminService } from './events.admin.service.js';
import { EventsLoader } from './events.loader.js';
import { EventsMediaService } from './events.media.service.js';
import { EventsPublicController } from './events.public.controller.js';
import { EventsPublicService } from './events.public.service.js';

/**
 * Events: admin CMS (/admin/events...), public pages (/public/events...), documentation media.
 * Cross-cutting services (DB, AppConfig, AuditService, JobsService, RevalidateService, PermissionsService,
 * SlugService, AssetRefsService) are global. `EventsLoader` (EventCard / EventAdminRow / EventDetail builders)
 * and `EventsAdminService` are exported for other modules (overview, registrations...).
 * Pure rules (status, registration open/closed, chapters, Fridays) live in `event-logic.ts`; the calendar
 * file builder in `ics.ts`. Both are plain functions you can import without this module.
 */
@Module({
  controllers: [EventsAdminController, EventsPublicController],
  providers: [EventsLoader, EventsAdminService, EventsPublicService, EventsMediaService],
  exports: [EventsLoader, EventsAdminService, EventsPublicService],
})
export class EventsModule {}
