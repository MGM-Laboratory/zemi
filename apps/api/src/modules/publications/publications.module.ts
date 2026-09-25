import { Module } from '@nestjs/common';
import { SpeakersModule } from '../speakers/speakers.module.js';
import { AdminPublicationsController, PublicPublicationsController } from './publications.controller.js';
import { PublicationsService } from './publications.service.js';

/**
 * Publications (api-content workstream): admin CRUD, lookup, quick stubs, Crossref DOI prefill,
 * public list and detail. Exports PublicationsService for event pages:
 *
 *   imports: [PublicationsModule]
 *   const cards = await this.publications.cardsByIds(ids, { publicOnly: true });   // Map<id, PublicationCard>
 */
@Module({
  imports: [SpeakersModule],
  controllers: [AdminPublicationsController, PublicPublicationsController],
  providers: [PublicationsService],
  exports: [PublicationsService],
})
export class PublicationsModule {}
