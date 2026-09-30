import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { PublicationsModule } from '../publications/publications.module.js';
import { SiteModule } from '../site/site.module.js';
import { SpeakersModule } from '../speakers/speakers.module.js';
import { BumpersAdminController } from './bumpers.admin.controller.js';
import { BumpersPublicController } from './bumpers.public.controller.js';
import { BumpersDataService } from './data.service.js';
import { BumpersLiveService } from './live.service.js';
import { BumperShowsService } from './shows.service.js';
import { BumperSourcesService } from './sources.service.js';

/**
 * Bumper shows (docs/features/bumpers.md): builder CRUD, generation from an event, live playback
 * with server-side auto-advance, the OBS output and dock (token links), and the builder pickers.
 *
 *   shows.service.ts    list, detail, create, generate, save, revisions, duplicate, keys
 *   data.service.ts     the public-safe BumperData bundle (batch queries)
 *   sources.service.ts  pickers for events, speakers, papers, team, threads and images
 *   live.service.ts     playback state, control, auto-advance ticker, presence, SSE
 *   generator.ts        the pure show generator (unit tested)
 */
@Module({
  imports: [EventsModule, SpeakersModule, PublicationsModule, SiteModule],
  controllers: [BumpersAdminController, BumpersPublicController],
  providers: [BumperShowsService, BumpersDataService, BumperSourcesService, BumpersLiveService],
})
export class BumpersModule {}
