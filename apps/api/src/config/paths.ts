import { fileURLToPath } from 'node:url';

/**
 * Absolute path of `apps/api/`. Resolved from this file, so it is the same from `src/config`
 * (dev, vitest, tsx) and `dist/config` (prod), whatever the current working directory is.
 */
export const API_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Resolve a path relative to `apps/api/`. */
export function apiPath(...segments: string[]): string {
  return [API_ROOT.replace(/\/+$/, ''), ...segments].join('/');
}
