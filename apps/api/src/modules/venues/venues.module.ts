import { Module } from '@nestjs/common';
import { VenuesController } from './venues.controller.js';
import { VenuesService } from './venues.service.js';

/** Rooms: GET /admin/venues (any admin), POST/PATCH/DELETE (venues.manage). */
@Module({
  controllers: [VenuesController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
