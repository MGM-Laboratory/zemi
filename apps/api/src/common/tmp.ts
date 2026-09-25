import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Base tmp folder for uploads and processing. */
export const TMP_ROOT = join(tmpdir(), 'zemi');

/** Run `fn` with a fresh temp directory that is always removed afterwards. */
export async function withTmpDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(TMP_ROOT, { recursive: true });
  const dir = await mkdtemp(join(TMP_ROOT, `${prefix}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
