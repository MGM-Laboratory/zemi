import { Module } from '@nestjs/common';
import { AdminSpeakersController, PublicSpeakersController } from './speakers.controller.js';
import { SpeakersService } from './speakers.service.js';

/**
 * Speakers (api-content workstream): admin CRUD + lookup, public directory and speaker pages.
 * Exports SpeakersService so other modules can build `SpeakerRef`s in batch:
 *
 *   imports: [SpeakersModule]
 *   const refs = await this.speakers.refsByIds(ids, { publicOnly: true });   // Map<id, SpeakerRef>
 */
@Module({
  controllers: [AdminSpeakersController, PublicSpeakersController],
  providers: [SpeakersService],
  exports: [SpeakersService],
})
export class SpeakersModule {}
