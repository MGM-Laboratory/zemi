import { Controller, Delete, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  adminCreateInput,
  adminPassphraseInput,
  adminUpdateInput,
  auditQuery,
  formatJakarta,
  paginationQuery,
  type AdminSummary,
  type AuditEntry,
  type Paginated,
  type SessionSummary,
  type SystemStatus,
} from '@zemi/shared';
import type { Response } from 'express';
import { createElement } from 'react';
import { z } from 'zod';
import { CurrentAuth, RequireCapability, RequireSuperadmin } from '../../auth/decorators.js';
import { notFound } from '../../common/errors.js';
import { Ip, type RequestAuth } from '../../common/request.js';
import { UuidParam, ZodBody, ZodParam, ZodQuery } from '../../common/zod.pipe.js';
import { MailService, PREVIEW_KEY, type EmailPreviewSummary } from '../mail/mail.service.js';
import { AdminTestEmail } from '../mail/templates/admin-test.js';
import { AdminsService } from './admins.service.js';
import { SystemService } from './system.service.js';

const listQuery = paginationQuery.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'expired', 'disabled']).optional(),
});

const sessionOwner = z.union([z.literal('superadmin'), z.uuid({ error: 'That id looks off.' })]);
const testEmailInput = z.object({ to: z.email({ error: 'That email looks off. Mind checking it?' }) });
const previewKey = z.string().max(80).regex(PREVIEW_KEY, 'Template keys look like "registration-confirmed".');
const previewQuery = z.object({ format: z.enum(['html', 'text', 'json']).default('html') });

/**
 * Rendered emails are untrusted-ish HTML shown on the web origin (through the rewrite): sandbox them so
 * nothing in a template can run script or reach the admin session. Images, inline styles and Google Fonts still work.
 */
const PREVIEW_CSP = [
  'sandbox',
  "default-src 'none'",
  'img-src https: http: data:',
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
].join('; ');

/** Admins, sessions and system (superadmin only). Mounted at /api/v1/admin. */
@ApiTags('admin: admins')
@Controller('admin')
export class AdminsController {
  constructor(
    private readonly admins: AdminsService,
    private readonly system: SystemService,
    private readonly mail: MailService,
  ) {}

  @Get('admins')
  @RequireSuperadmin()
  list(@ZodQuery(listQuery) q: z.infer<typeof listQuery>): Promise<Paginated<AdminSummary>> {
    return this.admins.list(q);
  }

  @Post('admins')
  @RequireSuperadmin()
  create(@ZodBody(adminCreateInput) body: z.infer<typeof adminCreateInput>, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null) {
    return this.admins.create(body, { principal: auth.principal, ip });
  }

  @Get('admins/:id')
  @RequireSuperadmin()
  get(@UuidParam() id: string): Promise<AdminSummary> {
    return this.admins.get(id);
  }

  @Patch('admins/:id')
  @RequireSuperadmin()
  update(
    @UuidParam() id: string,
    @ZodBody(adminUpdateInput) body: z.infer<typeof adminUpdateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<AdminSummary> {
    return this.admins.update(id, body, { principal: auth.principal, ip });
  }

  @Delete('admins/:id')
  @RequireSuperadmin()
  async remove(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null) {
    await this.admins.remove(id, { principal: auth.principal, ip });
    return { ok: true };
  }

  /** POST /admin/admins/:id/passphrase { passphrase } -> { ok } (ends that admin's sessions) */
  @Post('admins/:id/passphrase')
  @HttpCode(200)
  @RequireSuperadmin()
  async setPassphrase(
    @UuidParam() id: string,
    @ZodBody(adminPassphraseInput) body: z.infer<typeof adminPassphraseInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ) {
    await this.admins.setPassphrase(id, body.passphrase, { principal: auth.principal, ip });
    return { ok: true };
  }

  /** GET /admin/passphrase/generate -> { passphrase } (not stored, show it once) */
  @Get('passphrase/generate')
  @RequireSuperadmin()
  async generate() {
    return { passphrase: await this.admins.generatePassphrase() };
  }

  /** GET /admin/admins/:id/sessions (`superadmin` as id lists the superadmin's sessions). */
  @Get('admins/:id/sessions')
  @RequireSuperadmin()
  sessions(@ZodParam('id', sessionOwner) id: string, @CurrentAuth() auth: RequestAuth): Promise<SessionSummary[]> {
    return this.admins.listSessions(id, auth.session.id);
  }

  @Delete('sessions/:id')
  @RequireSuperadmin()
  async revokeSession(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null) {
    await this.admins.revokeSession(id, { principal: auth.principal, ip });
    return { ok: true };
  }

  /** GET /admin/audit?actor&resourceType&resourceId&action&page&pageSize (superadmin or audit.view) */
  @Get('audit')
  @RequireCapability('audit.view')
  audit(@ZodQuery(auditQuery) q: z.infer<typeof auditQuery>): Promise<Paginated<AuditEntry>> {
    return this.admins.auditLog(q);
  }

  @Get('system')
  @RequireSuperadmin()
  status(): Promise<SystemStatus> {
    return this.system.status();
  }

  /** GET /admin/system/email-preview -> { items: [{ template, subject, description }] } (registered previews). */
  @Get('system/email-preview')
  @RequireSuperadmin()
  emailPreviews(): { items: EmailPreviewSummary[] } {
    return { items: this.mail.listPreviews() };
  }

  /**
   * GET /admin/system/email-preview/:template?format=html|text|json
   * Renders a registered template with its sample props. `html` (default) opens straight in a browser tab
   * (sandboxed), `json` gives { template, subject, html, text } for an iframe `srcdoc`.
   */
  @Get('system/email-preview/:template')
  @RequireSuperadmin()
  async emailPreview(
    @ZodParam('template', previewKey) template: string,
    @ZodQuery(previewQuery) q: z.infer<typeof previewQuery>,
    @Res() res: Response,
  ): Promise<void> {
    const out = await this.mail.renderPreview(template);
    if (!out) throw notFound("We don't have a preview for that email yet.");
    res.setHeader('Cache-Control', 'no-store');
    if (q.format === 'json') {
      res.json(out);
      return;
    }
    res.setHeader('Content-Security-Policy', PREVIEW_CSP);
    if (q.format === 'text') res.type('text/plain; charset=utf-8').send(out.text);
    else res.type('text/html; charset=utf-8').send(out.html);
  }

  /** POST /admin/system/test-email { to }: sends the branded test email (or writes it to the outbox). */
  @Post('system/test-email')
  @HttpCode(200)
  @RequireSuperadmin()
  async testEmail(@ZodBody(testEmailInput) body: z.infer<typeof testEmailInput>) {
    const result = await this.mail.send({
      to: body.to,
      subject: 'Zemi can send email',
      template: 'admin-test',
      react: createElement(AdminTestEmail, { sentAt: `${formatJakarta(new Date(), 'datetime')} WIB` }),
    });
    return { status: result.status, providerId: result.providerId, error: result.error, outboxFile: result.outboxFile ?? null };
  }
}

