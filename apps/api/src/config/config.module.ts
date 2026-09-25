import { Global, Module } from '@nestjs/common';
import { AppConfig, loadConfig } from './app-config.js';

/** Global: every provider can inject `AppConfig` without importing this module. */
@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => loadConfig() }],
  exports: [AppConfig],
})
export class ConfigModule {}
