import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

/** Global: inject `MailService` anywhere. Templates live in ./templates (React Email). */
@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
