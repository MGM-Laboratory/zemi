import { Module } from '@nestjs/common';
import { AdminsController } from './admins.controller.js';
import { AdminsService } from './admins.service.js';
import { SystemService } from './system.service.js';

/** Superadmin area: admins, sessions, audit log, system status. */
@Module({
  controllers: [AdminsController],
  providers: [AdminsService, SystemService],
  exports: [AdminsService],
})
export class AdminsModule {}
