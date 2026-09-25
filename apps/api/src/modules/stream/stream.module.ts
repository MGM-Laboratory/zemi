import { Module } from '@nestjs/common';
import { AdminStreamController } from './admin-stream.controller.js';
import { AudienceService } from './audience.service.js';
import { HlsProxyService } from './hls-proxy.service.js';
import { InternalMediaController } from './internal-media.controller.js';
import { MediaSecretGuard } from './media-secret.guard.js';
import { MediaMtxClient } from './mediamtx.client.js';
import { PublicLiveController } from './public-live.controller.js';
import { RecordingsService } from './recordings.service.js';
import { StreamService } from './stream.service.js';

/**
 * Livestream engine (SPEC 9): MediaMTX auth + hooks + segment uploads, OBS keys, go live / end /
 * rotate, health, the public HLS proxy, viewers + reactions, SSE, and recordings.
 *
 * Exported for the events module (EventDetail.stream / recordings, EventCard.isLive):
 *   StreamService.publicStreams(ids), StreamService.liveEventIds(), RecordingsService.publicRecordings(ids)
 * Import StreamModule to use them (StreamModule imports no feature module, so there is no cycle).
 */
@Module({
  controllers: [InternalMediaController, AdminStreamController, PublicLiveController],
  providers: [MediaMtxClient, AudienceService, HlsProxyService, RecordingsService, StreamService, MediaSecretGuard],
  exports: [StreamService, RecordingsService],
})
export class StreamModule {}
