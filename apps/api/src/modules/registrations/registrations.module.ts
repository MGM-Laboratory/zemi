import { Module } from '@nestjs/common';
import { AdminRegistrationsController } from './admin-registrations.controller.js';
import { AdminRegistrationsService } from './admin-registrations.service.js';
import { AudienceService } from './audience.service.js';
import { CheckinService } from './checkin.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { PeopleContext } from './people-context.service.js';
import { PeopleMailer } from './people-mail.service.js';
import { PublicTicketsController } from './public-tickets.controller.js';
import { TicketAssets } from './ticket-assets.service.js';
import { TicketsService } from './tickets.service.js';

/**
 * People (api-people workstream): public sign-up + tickets (QR, .ics), admin registrations, exports, the
 * attendance sheet PDF, audience, broadcasts, lifecycle emails (pg-boss cron) and the `event.cancelled.notify`
 * worker. Check-in state changes live here too (CheckinService) so walk-ins and bulk actions share them with
 * the door; AttendanceModule imports this module for its controllers. See docs/features/api-people.md.
 */
@Module({
  controllers: [PublicTicketsController, AdminRegistrationsController],
  providers: [PeopleContext, TicketAssets, PeopleMailer, CheckinService, TicketsService, AdminRegistrationsService, AudienceService, LifecycleService],
  exports: [PeopleContext, TicketAssets, PeopleMailer, CheckinService, TicketsService, AdminRegistrationsService, LifecycleService],
})
export class RegistrationsModule {}
