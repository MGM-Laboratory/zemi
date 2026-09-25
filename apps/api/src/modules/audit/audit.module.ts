import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/** Global: inject `AuditService` anywhere. The read endpoint lives in the admins module. */
@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
