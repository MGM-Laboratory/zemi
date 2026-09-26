import { Controller, Delete, Get, HttpCode, Patch, Post, Sse, type MessageEvent } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  attachRecordingInput,
  recordingUpdateInput,
  type Ability,
  type Principal,
  type StreamAdminEvent,
  type StreamConfig,
  type StreamHealth,
  type StreamPreviewToken,
  type StreamSessionAdmin,
} from '@zemi/shared';
import type { Observable } from 'rxjs';
import type { z } from 'zod';
import { CurrentAbility, CurrentPrincipal } from '../../auth/decorators.js';
import { assertCan } from '../../auth/permissions.service.js';
import { Ip } from '../../common/request.js';
import { UuidParam, ZodBody } from '../../common/zod.pipe.js';
import { channels, RealtimeService } from '../realtime/realtime.service.js';
import { RecordingsService } from './recordings.service.js';
import { StreamService } from './stream.service.js';

/**
 * Admin stream control (SPEC 9). `stream.view` sees state, health, preview and recordings (no OBS keys);
 * `stream.control` also gets the OBS keys, goes live, ends, rotates keys and manages recordings.
 */
@ApiTags('admin: stream')
@Controller('admin')
export class AdminStreamController {
  constructor(
    private readonly stream: StreamService,
    private readonly recordings: RecordingsService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * GET /admin/events/:id/stream: state, plus the OBS keys for `stream.control` (`obs: null` for
   * `stream.view`, since the private key could take over the live feed). Creates the row on first call.
   */
  @Get('events/:id/stream')
  config(@UuidParam() id: string, @CurrentAbility() ability: Ability): Promise<StreamConfig> {
    assertCan(ability, 'event', id, 'stream.view');
    return this.stream.streamConfig(id, { withKeys: ability.can('event', id, 'stream.control') });
  }

  @Post('events/:id/stream/rotate')
  @HttpCode(200)
  rotate(@UuidParam() id: string, @CurrentAbility() ability: Ability, @CurrentPrincipal() principal: Principal, @Ip() ip: string | null): Promise<StreamConfig> {
    assertCan(ability, 'event', id, 'stream.control');
    return this.stream.rotate(id, principal, ip);
  }

  @Post('events/:id/stream/live')
  @HttpCode(200)
  live(@UuidParam() id: string, @CurrentAbility() ability: Ability, @CurrentPrincipal() principal: Principal, @Ip() ip: string | null): Promise<StreamConfig> {
    assertCan(ability, 'event', id, 'stream.control');
    return this.stream.goLive(id, principal, ip);
  }

  @Post('events/:id/stream/end')
  @HttpCode(200)
  end(@UuidParam() id: string, @CurrentAbility() ability: Ability, @CurrentPrincipal() principal: Principal, @Ip() ip: string | null): Promise<StreamConfig> {
    assertCan(ability, 'event', id, 'stream.control');
    return this.stream.end(id, principal, ip);
  }

  @Get('events/:id/stream/health')
  health(@UuidParam() id: string, @CurrentAbility() ability: Ability): Promise<StreamHealth> {
    assertCan(ability, 'event', id, 'stream.view');
    return this.stream.health(id);
  }

  /** A 10 minute `pt` token for the admin preview player (works in preview and live). */
  @Get('events/:id/stream/preview-token')
  previewToken(@UuidParam() id: string, @CurrentAbility() ability: Ability): Promise<StreamPreviewToken> {
    assertCan(ability, 'event', id, 'stream.view');
    return this.stream.previewToken(id);
  }

  /** SSE for the stream dashboard: StreamAdminEvent (state, health, viewers, recording, keys-rotated). */
  @Sse('events/:id/stream/events')
  async events(@UuidParam() id: string, @CurrentAbility() ability: Ability): Promise<Observable<MessageEvent>> {
    assertCan(ability, 'event', id, 'stream.view');
    await this.stream.event(id);
    return this.realtime.stream(channels.stream(id), {
      initial: async (): Promise<StreamAdminEvent> => ({ type: 'state', stream: await this.stream.statusSnapshot(id) }),
    });
  }

  /* --------------------------------------------------------------------------- recordings */

  @Get('events/:id/recordings')
  async listRecordings(@UuidParam() id: string, @CurrentAbility() ability: Ability): Promise<StreamSessionAdmin[]> {
    assertCan(ability, 'event', id, 'stream.view');
    await this.stream.event(id);
    return this.recordings.list(id);
  }

  /** Attach an uploaded video (POST /admin/assets purpose=recording) as a public recording. */
  @Post('events/:id/recordings')
  @HttpCode(201)
  async attach(
    @UuidParam() id: string,
    @ZodBody(attachRecordingInput) body: z.infer<typeof attachRecordingInput>,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
    @Ip() ip: string | null,
  ): Promise<StreamSessionAdmin> {
    assertCan(ability, 'event', id, 'stream.control');
    const event = await this.stream.event(id);
    return this.recordings.attach(event, body, principal, ability, ip);
  }

  @Patch('recordings/:id')
  async updateRecording(
    @UuidParam() id: string,
    @ZodBody(recordingUpdateInput) body: z.infer<typeof recordingUpdateInput>,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
    @Ip() ip: string | null,
  ): Promise<StreamSessionAdmin> {
    const session = await this.recordings.get(id);
    assertCan(ability, 'event', session.eventId, 'stream.control');
    return this.recordings.update(session, body, principal, ip);
  }

  @Delete('recordings/:id')
  @HttpCode(204)
  async removeRecording(
    @UuidParam() id: string,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
    @Ip() ip: string | null,
  ): Promise<void> {
    const session = await this.recordings.get(id);
    assertCan(ability, 'event', session.eventId, 'stream.control');
    await this.recordings.remove(session, principal, ip);
  }

  @Post('recordings/:id/reprocess')
  @HttpCode(202)
  async reprocess(
    @UuidParam() id: string,
    @CurrentAbility() ability: Ability,
    @CurrentPrincipal() principal: Principal,
    @Ip() ip: string | null,
  ): Promise<StreamSessionAdmin> {
    const session = await this.recordings.get(id);
    assertCan(ability, 'event', session.eventId, 'stream.control');
    return this.recordings.reprocess(session, principal, ip);
  }
}
