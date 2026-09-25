import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service.js';

/** Global: inject `JobsService` anywhere. */
@Global()
@Module({ providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
