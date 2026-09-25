import { Global, Module } from '@nestjs/common';
import { AssetRefsService } from './asset-refs.js';
import { CryptoService } from './crypto.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { SlugService } from './slug.service.js';

/** Global cross-cutting helpers: inject them anywhere without importing a module. */
@Global()
@Module({
  providers: [RateLimitService, SlugService, AssetRefsService, CryptoService],
  exports: [RateLimitService, SlugService, AssetRefsService, CryptoService],
})
export class CommonModule {}
