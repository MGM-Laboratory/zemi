import { Module } from '@nestjs/common';
import { ContentResetService } from './content-reset.service.js';
import { InboxService } from './inbox.service.js';
import { AdminContentResetController, AdminInboxController, AdminSiteController, PublicSiteController } from './site.controller.js';
import { SiteService } from './site.service.js';

/**
 * Site CMS (settings, FAQ, team), the public site payload + contact form, the admin inbox and the
 * superadmin content reset. See docs/features/api-site-seed.md.
 */
@Module({
  controllers: [AdminSiteController, AdminInboxController, AdminContentResetController, PublicSiteController],
  providers: [SiteService, InboxService, ContentResetService],
  exports: [SiteService, InboxService, ContentResetService],
})
export class SiteModule {}
