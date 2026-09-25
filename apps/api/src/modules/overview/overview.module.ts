import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { OverviewController } from './overview.controller.js';
import { OverviewService } from './overview.service.js';

/** GET /admin/overview. Builds its event rows with the EventsLoader from EventsModule. */
@Module({
  imports: [EventsModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
