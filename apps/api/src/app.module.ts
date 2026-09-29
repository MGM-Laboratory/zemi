import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { ConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { DiscussionModule } from './modules/discussion/discussion.module.js';
import { HealthController } from './health.controller.js';
import { AdminsModule } from './modules/admins/admins.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { MediaServeModule } from './modules/media-serve/media-serve.module.js';
import { OverviewModule } from './modules/overview/overview.module.js';
import { PublicationsModule } from './modules/publications/publications.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { RegistrationsModule } from './modules/registrations/registrations.module.js';
import { RevalidateModule } from './modules/revalidate/revalidate.module.js';
import { SiteModule } from './modules/site/site.module.js';
import { SpeakersModule } from './modules/speakers/speakers.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { StreamModule } from './modules/stream/stream.module.js';
import { VenuesModule } from './modules/venues/venues.module.js';

@Module({
  imports: [
    // Global infrastructure (inject anywhere, no imports needed in feature modules).
    ConfigModule,
    DbModule,
    CommonModule,
    AuditModule,
    AuthModule,
    StorageModule,
    JobsModule,
    RealtimeModule,
    MailModule,
    RevalidateModule,
    // Platform features owned by api-core.
    MediaServeModule,
    AssetsModule,
    AdminsModule,
    // Feature modules (owned by their workstreams).
    VenuesModule,
    SpeakersModule,
    PublicationsModule,
    EventsModule,
    RegistrationsModule,
    AttendanceModule,
    StreamModule,
    SiteModule,
    OverviewModule,
    DiscussionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
