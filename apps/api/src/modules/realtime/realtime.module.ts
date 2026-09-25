import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service.js';

/** Global: inject `RealtimeService` anywhere. */
@Global()
@Module({ providers: [RealtimeService], exports: [RealtimeService] })
export class RealtimeModule {}
