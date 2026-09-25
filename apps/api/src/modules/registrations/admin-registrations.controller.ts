import { Controller, Delete, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  adminRegistrationInput,
  attendanceSheetQuery,
  audienceQuery,
  broadcastInput,
  bulkRegistrationInput,
  emailLogQuery,
  registrationExportQuery,
  registrationListQuery,
  registrationUpdateInput,
  type AudienceRow,
  type BroadcastResult,
  type BulkRegistrationResult,
  type EmailLogRow,
  type Paginated,
  type RegistrationRow,
  type RegistrationStats,
  type ResendResult,
} from '@zemi/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import { CurrentAuth, RequireCapability } from '../../auth/decorators.js';
import { Ip, type RequestAuth } from '../../common/request.js';
import { UuidParam, ZodBody, ZodQuery } from '../../common/zod.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminRegistrationsService, type Actor } from './admin-registrations.service.js';
import { renderAttendanceSheet } from './attendance-sheet.js';
import { AudienceService } from './audience.service.js';
import { exportFilename, toCsv, toXlsx, type ExportRow } from './exports.js';
import { PeopleContext } from './people-context.service.js';

const actorOf = (auth: RequestAuth, ip: string | null): Actor => ({ principal: auth.principal, ability: auth.ability, ip });

/** Admin registrations, exports, the attendance sheet, audience and broadcasts. Mounted at /api/v1/admin. */
@ApiTags('admin: registrations')
@Controller('admin')
export class AdminRegistrationsController {
  constructor(
    private readonly regs: AdminRegistrationsService,
    private readonly audience: AudienceService,
    private readonly ctx: PeopleContext,
    private readonly audit: AuditService,
  ) {}

  @Get('events/:id/registrations')
  async list(
    @UuidParam() id: string,
    @ZodQuery(registrationListQuery) q: z.infer<typeof registrationListQuery>,
    @CurrentAuth() auth: RequestAuth,
  ): Promise<Paginated<RegistrationRow>> {
    await this.regs.eventFor(auth.ability, id, 'registrations.view');
    return this.regs.list(id, q);
  }

  @Get('events/:id/registrations/stats')
  async stats(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth): Promise<RegistrationStats> {
    const event = await this.regs.eventFor(auth.ability, id, 'registrations.view');
    return this.regs.stats(event);
  }

  @Get('events/:id/registrations/export')
  async export(
    @UuidParam() id: string,
    @ZodQuery(registrationExportQuery) q: z.infer<typeof registrationExportQuery>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
    @Res() res: Response,
  ): Promise<void> {
    const event = await this.regs.eventFor(auth.ability, id, 'registrations.export');
    const rows: ExportRow[] = (await this.regs.all(id, q)).map(({ r, otherEvents }) => ({
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      attendanceMode: r.attendanceMode,
      ticketCode: r.ticketCode,
      status: r.status,
      source: r.source,
      checkedInAt: r.checkedInAt,
      checkedInBy: r.checkedInBy,
      createdAt: r.createdAt,
      emailStatus: r.emailStatus,
      otherEvents,
      notes: r.notes,
    }));
    const e = event.row;
    const body =
      q.format === 'csv'
        ? toCsv(rows)
        : await toXlsx(rows, { title: e.title, number: e.number ?? null, startsAt: e.startsAt, endsAt: e.endsAt, venue: this.ctx.venueLabel(event) });
    await this.audit.log({
      principal: auth.principal,
      action: 'registration.export',
      resourceType: 'event',
      resourceId: id,
      summary: `Exported ${rows.length} ${rows.length === 1 ? 'registration' : 'registrations'} of "${e.title}" as ${q.format.toUpperCase()}`,
      meta: { format: q.format, rows: rows.length, filters: { status: q.status, checkedIn: q.checkedIn, mode: q.mode, source: q.source, search: q.search ?? null } },
      ip,
    });
    const filename = exportFilename({ number: e.number ?? null, slug: e.slug }, q.format);
    res.setHeader('Content-Type', q.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  }

  @Get('events/:id/attendance-sheet.pdf')
  async sheet(
    @UuidParam() id: string,
    @ZodQuery(attendanceSheetQuery) q: z.infer<typeof attendanceSheetQuery>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
    @Res() res: Response,
  ): Promise<void> {
    const event = await this.regs.eventFor(auth.ability, id, 'registrations.export');
    const all = await this.regs.all(id, { status: 'registered', checkedIn: 'all', mode: 'all', source: 'all', sort: q.sort === 'name' ? 'name' : 'createdAt' });
    const people = all
      .map(({ r }) => r)
      .filter((r) => q.mode === 'all' || r.attendanceMode === 'in-person')
      .map((r) => ({ fullName: r.fullName, ticketCode: r.ticketCode, phone: r.phone, attendanceMode: r.attendanceMode, checkedIn: !!r.checkedInAt }));
    const active = all.map(({ r }) => r);
    const e = event.row;
    const pdf = await renderAttendanceSheet({
      event: { title: e.title, number: e.number ?? null, startsAt: e.startsAt, endsAt: e.endsAt, venue: this.ctx.venueLabel(event), roomNote: e.roomNote ?? null, mode: e.mode },
      people,
      blankRows: q.blankRows,
      counts: {
        registered: active.length,
        inPerson: active.filter((r) => r.attendanceMode === 'in-person').length,
        online: active.filter((r) => r.attendanceMode === 'online').length,
        checkedIn: active.filter((r) => r.checkedInAt).length,
      },
      modeFilter: q.mode,
      printedAt: new Date(),
    });
    await this.audit.log({
      principal: auth.principal,
      action: 'registration.attendance-sheet',
      resourceType: 'event',
      resourceId: id,
      summary: `Printed the attendance sheet for "${e.title}" (${people.length} people, ${q.blankRows} blank rows)`,
      meta: { ...q, rows: people.length },
      ip,
    });
    const filename = exportFilename({ number: e.number ?? null, slug: e.slug }, 'pdf', 'kertas-absensi');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }

  @Post('events/:id/registrations')
  create(
    @UuidParam() id: string,
    @ZodBody(adminRegistrationInput) body: z.infer<typeof adminRegistrationInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<RegistrationRow> {
    return this.regs.create(id, body, actorOf(auth, ip));
  }

  @Post('events/:id/registrations/bulk')
  @HttpCode(200)
  bulk(
    @UuidParam() id: string,
    @ZodBody(bulkRegistrationInput) body: z.infer<typeof bulkRegistrationInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<BulkRegistrationResult> {
    return this.regs.bulk(id, body, actorOf(auth, ip));
  }

  @Patch('registrations/:id')
  update(
    @UuidParam() id: string,
    @ZodBody(registrationUpdateInput) body: z.infer<typeof registrationUpdateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<RegistrationRow> {
    return this.regs.update(id, body, actorOf(auth, ip));
  }

  @Delete('registrations/:id')
  remove(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null): Promise<{ ok: true }> {
    return this.regs.remove(id, actorOf(auth, ip));
  }

  @Post('registrations/:id/resend')
  @HttpCode(200)
  resend(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null): Promise<ResendResult> {
    return this.regs.resend(id, actorOf(auth, ip));
  }

  @Get('audience')
  @RequireCapability('audience.view')
  listAudience(@ZodQuery(audienceQuery) q: z.infer<typeof audienceQuery>): Promise<Paginated<AudienceRow>> {
    return this.audience.audience(q);
  }

  @Post('events/:id/broadcast')
  @HttpCode(200)
  async broadcast(
    @UuidParam() id: string,
    @ZodBody(broadcastInput) body: z.infer<typeof broadcastInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<BroadcastResult> {
    const event = await this.regs.eventFor(auth.ability, id, 'emails.send');
    return this.audience.broadcast(event, body, actorOf(auth, ip));
  }

  @Get('events/:id/emails')
  async emails(
    @UuidParam() id: string,
    @ZodQuery(emailLogQuery) q: z.infer<typeof emailLogQuery>,
    @CurrentAuth() auth: RequestAuth,
  ): Promise<Paginated<EmailLogRow>> {
    await this.regs.eventFor(auth.ability, id, ['emails.send', 'registrations.view']);
    return this.audience.emailLog(id, q, auth.ability.can('event', id, 'registrations.view'));
  }
}
