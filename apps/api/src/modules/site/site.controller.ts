import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  contactInput,
  contactMessageUpdate,
  faqInput,
  faqUpdateInput,
  inboxListQuery,
  orderInput,
  resetContentInput,
  teamMemberInput,
  teamMemberUpdateInput,
  type ContactMessage,
  type Faq,
  type InboxListQuery,
  type InboxUnreadCount,
  type Paginated,
  type PublicSite,
  type ResetContentResult,
  type SiteSettingKey,
  type SiteSettings,
  type TeamMember,
} from '@zemi/shared';
import { z } from 'zod';
import { CurrentAuth, Public, RequireCapability, RequireSuperadmin } from '../../auth/decorators.js';
import { notFound } from '../../common/errors.js';
import { Ip, UserAgent, type RequestAuth } from '../../common/request.js';
import { UuidParam, ZodBody, ZodQuery } from '../../common/zod.pipe.js';
import { ContentResetService } from './content-reset.service.js';
import { InboxService } from './inbox.service.js';
import { isSiteSettingKey } from './site-settings.js';
import { SiteService } from './site.service.js';

/** The honeypot is checked by hand (a bot that fills it gets a fake success, not a 400). */
const contactBody = contactInput.extend({ website: z.string().max(2000).optional() });

type OrderBody = z.infer<typeof orderInput>;

function settingKey(raw: string): SiteSettingKey {
  if (!isSiteSettingKey(raw)) throw notFound("We don't have a settings section with that name.");
  return raw;
}

/* ------------------------------------------------------------------------ /admin/site */

@ApiTags('admin: site')
@Controller('admin/site')
@RequireCapability('site.edit')
export class AdminSiteController {
  constructor(private readonly site: SiteService) {}

  /** Every section, stored values merged over the rich defaults. */
  @Get('settings')
  settings(): Promise<SiteSettings> {
    return this.site.getSettings();
  }

  @Get('settings/:key')
  setting(@Param('key') key: string): Promise<SiteSettings[SiteSettingKey]> {
    return this.site.getSetting(settingKey(key));
  }

  /** Body: the section (whole, or only the fields that changed). Returns the saved section. */
  @Put('settings/:key')
  updateSetting(@Param('key') key: string, @Body() body: unknown, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null) {
    return this.site.updateSetting(settingKey(key), body, { principal: auth.principal, ip });
  }

  /* FAQ */

  @Get('faqs')
  faqs(): Promise<Faq[]> {
    return this.site.listFaqs();
  }

  @Post('faqs')
  createFaq(@ZodBody(faqInput) body: z.infer<typeof faqInput>, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null): Promise<Faq> {
    return this.site.createFaq(body, { principal: auth.principal, ip });
  }

  @Put('faqs/order')
  orderFaqs(@ZodBody(orderInput) body: OrderBody, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null): Promise<Faq[]> {
    return this.site.orderFaqs(body.ids, { principal: auth.principal, ip });
  }

  @Patch('faqs/:id')
  updateFaq(
    @UuidParam() id: string,
    @ZodBody(faqUpdateInput) body: z.infer<typeof faqUpdateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<Faq> {
    return this.site.updateFaq(id, body, { principal: auth.principal, ip });
  }

  @Delete('faqs/:id')
  async removeFaq(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null) {
    await this.site.removeFaq(id, { principal: auth.principal, ip });
    return { ok: true };
  }

  /* Team */

  @Get('team')
  team(): Promise<TeamMember[]> {
    return this.site.listTeam();
  }

  @Post('team')
  createTeam(@ZodBody(teamMemberInput) body: z.infer<typeof teamMemberInput>, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null) {
    return this.site.createTeamMember(body, { principal: auth.principal, ip });
  }

  @Put('team/order')
  orderTeam(@ZodBody(orderInput) body: OrderBody, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null): Promise<TeamMember[]> {
    return this.site.orderTeam(body.ids, { principal: auth.principal, ip });
  }

  @Patch('team/:id')
  updateTeam(
    @UuidParam() id: string,
    @ZodBody(teamMemberUpdateInput) body: z.infer<typeof teamMemberUpdateInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<TeamMember> {
    return this.site.updateTeamMember(id, body, { principal: auth.principal, ip });
  }

  @Delete('team/:id')
  async removeTeam(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null) {
    await this.site.removeTeamMember(id, { principal: auth.principal, ip });
    return { ok: true };
  }
}

/* ------------------------------------------------------------------------ /admin/inbox */

@ApiTags('admin: inbox')
@Controller('admin/inbox')
@RequireCapability('inbox.view')
export class AdminInboxController {
  constructor(private readonly inbox: InboxService) {}

  /** ?status=new|read|replied|archived|open|all&search&topic&page&pageSize */
  @Get()
  list(@ZodQuery(inboxListQuery) q: InboxListQuery): Promise<Paginated<ContactMessage>> {
    return this.inbox.list(q);
  }

  @Get('unread-count')
  unread(): Promise<InboxUnreadCount> {
    return this.inbox.unreadCount();
  }

  @Get(':id')
  get(@UuidParam() id: string): Promise<ContactMessage> {
    return this.inbox.get(id);
  }

  @Patch(':id')
  update(
    @UuidParam() id: string,
    @ZodBody(contactMessageUpdate) body: z.infer<typeof contactMessageUpdate>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<ContactMessage> {
    return this.inbox.setStatus(id, body.status, { principal: auth.principal, ip });
  }

  @Delete(':id')
  async remove(@UuidParam() id: string, @CurrentAuth() auth: RequestAuth, @Ip() ip: string | null) {
    await this.inbox.remove(id, { principal: auth.principal, ip });
    return { ok: true };
  }
}

/* ------------------------------------------------------------------------ /admin/system */

@ApiTags('admin: system')
@Controller('admin/system')
export class AdminContentResetController {
  constructor(private readonly reset: ContentResetService) {}

  /** POST /admin/system/reset-content { confirm: "delete everything" } (superadmin). */
  @Post('reset-content')
  @HttpCode(200)
  @RequireSuperadmin()
  resetContent(
    @ZodBody(resetContentInput) _body: z.infer<typeof resetContentInput>,
    @CurrentAuth() auth: RequestAuth,
    @Ip() ip: string | null,
  ): Promise<ResetContentResult> {
    return this.reset.resetContent({ principal: auth.principal, ip });
  }
}

/* ------------------------------------------------------------------------ /public */

@ApiTags('public: site')
@Public()
@Controller('public')
export class PublicSiteController {
  constructor(
    private readonly site: SiteService,
    private readonly inbox: InboxService,
  ) {}

  /** Settings (without private bits), published FAQ and team, stats, og image. Cached 30s in memory. */
  @Get('site')
  getSite(): Promise<PublicSite> {
    return this.site.getPublic();
  }

  @Post('contact')
  @HttpCode(200)
  contact(@ZodBody(contactBody) body: z.infer<typeof contactBody>, @Ip() ip: string | null, @UserAgent() userAgent: string | null) {
    return this.inbox.submit(body, { ip, userAgent });
  }
}
