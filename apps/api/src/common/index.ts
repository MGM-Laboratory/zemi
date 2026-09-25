/**
 * Barrel for cross-cutting helpers. Feature modules import from here:
 *
 *   import { ZodBody, UuidParam, notFound, paginated, SlugService, AssetRefsService } from '../../common/index.js';
 */
export * from './errors.js';
export * from './zod.pipe.js';
export * from './pagination.js';
export * from './request.js';
export * from './crypto.js';
export { CryptoService } from './crypto.service.js';
export { blocksToPlainText } from './blocks.js';
export { RateLimitService, type RateLimitRule, type RateLimitResult } from './rate-limit.service.js';
export { CsrfGuard, needsCsrf } from './csrf.guard.js';
export { SlugService, type SlugResolution, type SlugType } from './slug.service.js';
export * from './asset-refs.js';
export * from './mime.js';
export { withTmpDir, TMP_ROOT } from './tmp.js';
export { CommonModule } from './common.module.js';
