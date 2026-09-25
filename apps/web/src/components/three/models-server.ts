import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Names of the GLBs present in apps/web/public/models (without ".glb"). Server-only (reads the
 * filesystem). Pass the result down so <ModelProp available={...}> skips files that aren't there.
 *
 * @example const models = availableModels(); <ModelProp name="coffee-cup" available={models.includes('coffee-cup')} />
 */
export function availableModels(): string[] {
  try {
    return readdirSync(join(process.cwd(), 'public', 'models'))
      .filter((f) => f.endsWith('.glb'))
      .map((f) => f.slice(0, -4));
  } catch {
    return [];
  }
}
