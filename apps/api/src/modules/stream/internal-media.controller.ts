import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Body, Controller, HttpCode, Logger, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import { mediaAuthPayload, mediaPathHook, type MediaAuthPayload } from '@zemi/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../../auth/decorators.js';
import { AppError, badRequest } from '../../common/errors.js';
import { Ip } from '../../common/request.js';
import { TMP_ROOT } from '../../common/tmp.js';
import { parseOrThrow, ZodPipe } from '../../common/zod.pipe.js';
import { MediaSecretGuard } from './media-secret.guard.js';
import { RecordingsService } from './recordings.service.js';
import { StreamService } from './stream.service.js';

interface UploadedDiskFile {
  path: string;
  originalname: string;
  size: number;
}

const segmentFields = z.object({
  path: z.string().min(1).max(200),
  duration: z.string().max(64).optional(),
  filename: z.string().max(200).optional(),
});

/**
 * Called by the media server only (SPEC 7, "Internal"). `@Public()` for the session guard; the
 * MediaSecretGuard checks MEDIA_INTERNAL_SECRET (x-media-secret, Bearer, or Basic).
 */
@ApiExcludeController()
@Public()
@UseGuards(MediaSecretGuard)
@Controller('internal/media')
export class InternalMediaController {
  private readonly logger = new Logger('MediaHooks');

  constructor(
    private readonly stream: StreamService,
    private readonly recordings: RecordingsService,
  ) {}

  /** MediaMTX authHTTP. 200 allows, anything else denies. */
  @Post('auth')
  @HttpCode(200)
  async auth(@Body(new ZodPipe(mediaAuthPayload)) body: MediaAuthPayload, @Ip() ip: string | null): Promise<{ ok: true }> {
    const decision = await this.stream.authorize(body);
    if (!decision.allowed) {
      this.logger.warn(`Denied ${body.action} on "${body.path}" over ${body.protocol || '?'} from ${body.ip || ip || '?'}: ${decision.reason}`);
      throw new AppError(401, 'media_denied', 'Not allowed.');
    }
    if (body.action === 'publish') this.logger.log(`Allowed publish on "${body.path}" from ${body.ip || '?'}`);
    return { ok: true };
  }

  /** runOnOnline hook. */
  @Post('online')
  @HttpCode(200)
  online(@Body(new ZodPipe(mediaPathHook)) body: z.infer<typeof mediaPathHook>) {
    return this.stream.onIngestOnline(body.path, body.sourceType);
  }

  /** runOnOffline hook. */
  @Post('offline')
  @HttpCode(200)
  offline(@Body(new ZodPipe(mediaPathHook)) body: z.infer<typeof mediaPathHook>) {
    return this.stream.onIngestOffline(body.path);
  }

  /**
   * runOnRecordSegmentComplete upload (multipart: path, duration, filename, file). The file streams
   * to disk (never memory), then to the bucket, and we answer once both are safe.
   */
  @Post('segments')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      dest: join(TMP_ROOT, 'segments'),
      limits: { fileSize: 4 * 1024 ** 3, files: 1, fields: 10, fieldSize: 16 * 1024, parts: 14 },
    }),
  )
  async segment(@UploadedFile() file: UploadedDiskFile | undefined, @Req() req: Request) {
    try {
      if (!file) throw badRequest('Attach the segment in the "file" field.');
      const fields = parseOrThrow(segmentFields, req.body ?? {});
      return await this.recordings.ingestSegment({
        path: fields.path,
        duration: fields.duration,
        filename: fields.filename || file.originalname,
        filePath: file.path,
      });
    } finally {
      if (file?.path) await rm(file.path, { force: true });
    }
  }
}
