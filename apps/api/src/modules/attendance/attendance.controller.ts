import { Controller, Get, HttpCode, Post, Sse, type MessageEvent } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { rosterQuery, scanInput, type AttendanceSummary, type CheckinResult, type Paginated, type RosterRow, type ScanResult } from '@zemi/shared';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { CurrentAuth } from '../../auth/decorators.js';
import { Ip, type RequestAuth } from '../../common/request.js';
import { UuidParam, ZodBody, ZodQuery } from '../../common/zod.pipe.js';
import { AttendanceService, type DoorActor } from './attendance.service.js';

const manualInput = z.object({ device: z.string().max(80).optional() }).optional().default({});

const actorOf = (auth: RequestAuth, ip: string | null): DoorActor => ({ principal: auth.principal, ability: auth.ability, ip });

/** Door endpoints. Mounted at /api/v1/admin. */
@ApiTags('admin: attendance')
@Controller('admin')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('events/:id/attendance/scan')
  @HttpCode(200)
  scan(
    @UuidParam() id: string,
    @ZodBody(scanInput) body: z.infer<typeof scanInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<ScanResult> {
    return this.attendance.scan(id, body.payload, body.device?.trim() || null, actorOf(auth, ip));
  }

  @Post('registrations/:id/check-in')
  @HttpCode(200)
  checkIn(
    @UuidParam() id: string,
    @ZodBody(manualInput) body: z.infer<typeof manualInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<CheckinResult> {
    return this.attendance.checkIn(id, actorOf(auth, ip), body.device?.trim() || null);
  }

  @Post('registrations/:id/undo-check-in')
  @HttpCode(200)
  undo(
    @UuidParam() id: string,
    @ZodBody(manualInput) body: z.infer<typeof manualInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<CheckinResult> {
    return this.attendance.undo(id, actorOf(auth, ip), body.device?.trim() || null);
  }

  @Get('events/:id/attendance')
  summary(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth): Promise<AttendanceSummary> {
    return this.attendance.summary(id, auth.ability, auth.principal);
  }

  @Get('events/:id/attendance/roster')
  roster(@UuidParam() id: string, @ZodQuery(rosterQuery) q: z.infer<typeof rosterQuery>, @CurrentAuth() auth: RequestAuth): Promise<Paginated<RosterRow>> {
    return this.attendance.roster(id, q, auth.ability);
  }

  @Sse('events/:id/attendance/stream')
  stream(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth): Promise<Observable<MessageEvent>> {
    return this.attendance.stream(id, auth.ability, auth.principal);
  }
}
