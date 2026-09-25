#!/usr/bin/env node
/**
 * Generate the seminar documentation photos with the local `codex` CLI (built-in image_gen tool,
 * ChatGPT login, no API key). One codex process per photo, a few in parallel, skips photos that exist.
 *
 *   node scripts/seed-media/gen-docs-photos.mjs [--raw <dir>] [--jobs 4] [--only doc-03,doc-07]
 *
 * Raw PNGs land in <raw> (default: $TMPDIR/zemi-seed-media/docs-raw). Then run
 * `node scripts/seed-media/build-docs.mjs --raw <dir>` to resize them into apps/api/seed/assets/docs.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const raw = arg('raw', join(tmpdir(), 'zemi-seed-media', 'docs-raw'));
const jobs = Number(arg('jobs', '4'));
const only = arg('only', '')?.split(',').filter(Boolean) ?? [];
const { common, shots } = JSON.parse(readFileSync(join(here, 'docs-prompts.json'), 'utf8'));

mkdirSync(raw, { recursive: true });
const todo = shots.filter((s) => (only.length ? only.includes(s.id) : true)).filter((s) => !existsSync(join(raw, `${s.id}.png`)));
console.log(`${todo.length} photo(s) to generate into ${raw} with ${jobs} worker(s)`);

function run(shot) {
  const prompt = [
    `Generate one image and save it as ${shot.id}.png in the current directory.`,
    shot.prompt,
    common.people,
    common.style,
    common.framing,
    common.constraints,
  ].join('\n');
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(
      'codex',
      ['exec', prompt, '--skip-git-repo-check', '-s', 'workspace-write', '-C', raw, '-o', join(raw, `${shot.id}.last.txt`)],
      { stdio: ['ignore', 'ignore', 'ignore'] },
    );
    const timer = setTimeout(() => child.kill('SIGTERM'), 9 * 60_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      const ok = existsSync(join(raw, `${shot.id}.png`));
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${shot.id} (exit ${code}, ${Math.round((Date.now() - started) / 1000)}s)`);
      resolve(ok);
    });
  });
}

let next = 0;
let failed = 0;
async function worker() {
  while (next < todo.length) {
    const shot = todo[next++];
    if (!(await run(shot))) failed++;
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, worker));
console.log(failed ? `${failed} failed, rerun to retry` : 'all done');
process.exit(failed ? 1 : 0);
