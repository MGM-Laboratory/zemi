import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TMP_ROOT } from '../../common/tmp.js';
import { AppConfig } from '../../config/app-config.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';

/**
 * Media library + processing. `AssetsService` is exported: import AssetsModule to call
 * `ingestFile()` from another module (e.g. recordings).
 */
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        // Disk storage in the OS tmp dir: a 4 GB video must never sit in memory.
        dest: join(TMP_ROOT, 'uploads'),
        limits: { fileSize: config.env.UPLOAD_MAX_BYTES, files: 1, fields: 20, fieldSize: 64 * 1024, parts: 30 },
      }),
    }),
  ],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
