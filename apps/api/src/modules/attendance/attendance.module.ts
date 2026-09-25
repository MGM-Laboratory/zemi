import { Module } from '@nestjs/common';
import { RegistrationsModule } from '../registrations/registrations.module.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

/**
 * The door: QR scan, manual check-in/undo, summary, masked roster, SSE feed. Check-in state changes come from
 * RegistrationsModule's CheckinService (shared with walk-ins and bulk actions). See docs/features/api-people.md.
 */
@Module({
  imports: [RegistrationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
