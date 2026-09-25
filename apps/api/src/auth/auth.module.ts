import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfGuard } from '../common/csrf.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { PassphraseService } from './passphrase.service.js';
import { PermissionsService } from './permissions.service.js';
import { SessionService } from './session.service.js';

/**
 * Global auth: passphrase login, cookie sessions, and the global guards (CSRF first, then auth).
 * `SessionService`, `PassphraseService` and `PermissionsService` can be injected anywhere.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    PassphraseService,
    SessionService,
    PermissionsService,
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [PassphraseService, SessionService, PermissionsService],
})
export class AuthModule {}
