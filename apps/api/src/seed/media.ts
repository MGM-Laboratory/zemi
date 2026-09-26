import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetPurpose } from '@zemi/shared';
import { inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { assets } from '../db/schema.js';
import { ASSET_QUEUE, ASSET_VIDEO_QUEUE, AssetsService, type VideoMode } from '../modules/assets/assets.service.js';
import type { JobsService } from '../modules/jobs/jobs.service.js';

export interface ManifestItem {
  id: string;
  path: string;
  type: 'image' | 'video' | 'document';
  mime: string;
  width?: number;
  height?: number;
  bytes: number;
  credit?: string;
  gender?: 'female' | 'male';
  style?: string;
  accent?: 'blue' | 'yellow' | 'red' | 'green';
  scene?: string;
  alt?: string;
  title?: string;
  durationSec?: number;
  suggestedChapters?: Array<{ startSec: number; title: string }>;
  [key: string]: unknown;
}

export interface Manifest {
  sections: Record<string, { purpose: AssetPurpose; credit?: string; items: ManifestItem[] }>;
}

export async function readManifest(assetsDir: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(assetsDir, 'manifest.json'), 'utf8')) as Manifest;
}

interface Task {
  id: string;
  label: string;
  kind: 'image' | 'video' | 'document' | 'audio';
  videoMode: VideoMode | undefined;
  /** True when we cancelled the queued job and process it here. */
  local: boolean;
}

export interface IngestOptions {
  filePath: string;
  filename: string;
  purpose: AssetPurpose;
  mime?: string;
  alt?: string | null;
  caption?: string | null;
  credit?: string | null;
  videoMode?: VideoMode;
  label?: string;
}

/**
 * Seed media through the real asset pipeline. `ingestFile` stores the original and queues the normal
 * processing job; we then cancel that queued job and run `AssetsService.process()` ourselves with a
 * small concurrency, so the seeder doesn't depend on a worker being up and finishes predictably.
 * If a running API grabbed the job first (tiny window), we just wait for it to finish.
 */
export class SeedMedia {
  private readonly tasks: Task[] = [];
  private started: Promise<void> | null = null;
  private done = 0;

  constructor(
    private readonly db: Db,
    private readonly assetsService: AssetsService,
    private readonly jobs: JobsService,
    private readonly log: (line: string) => void,
    private readonly concurrency = 4,
  ) {}

  /** Uploads that failed (full disk, bucket down). The seed carries on without them. */
  readonly uploadFailures: Array<{ label: string; error: string }> = [];

  get count(): number {
    return this.tasks.length;
  }

  /** `ingest`, but a failed upload is logged and returns null so the rows still go in. */
  async tryIngest(opts: IngestOptions): Promise<string | null> {
    try {
      return await this.ingest(opts);
    } catch (err) {
      const label = opts.label ?? opts.filename;
      const error = (err as Error).message;
      if (this.uploadFailures.length < 3) this.log(`  upload failed for ${label}: ${error}`);
      this.uploadFailures.push({ label, error });
      return null;
    }
  }

  async ingest(opts: IngestOptions): Promise<string> {
    const row = await this.assetsService.ingestFile({
      filePath: opts.filePath,
      filename: opts.filename,
      purpose: opts.purpose,
      mime: opts.mime,
      createdBy: 'superadmin',
      alt: opts.alt ?? null,
      caption: opts.caption ?? null,
      credit: opts.credit ?? null,
      videoMode: opts.videoMode,
    });
    const queue = row.kind === 'video' ? ASSET_VIDEO_QUEUE : ASSET_QUEUE;
    const cancelled = await this.jobs.cancelByKey(queue, row.id).catch(() => 0);
    this.tasks.push({ id: row.id, label: opts.label ?? opts.filename, kind: row.kind, videoMode: opts.videoMode, local: cancelled > 0 });
    return row.id;
  }

  /** Start processing everything ingested so far (videos first, they take longest). */
  start(): Promise<void> {
    if (!this.started) this.started = this.run();
    return this.started;
  }

  private async run(): Promise<void> {
    const local = this.tasks.filter((t) => t.local).sort((a, b) => rank(a) - rank(b));
    let next = 0;
    const total = local.length;
    const startedAt = Date.now();
    const worker = async () => {
      while (next < local.length) {
        const task = local[next++];
        await this.assetsService.process({ assetId: task.id, videoMode: task.videoMode });
        this.done++;
        if (this.done % 20 === 0 || this.done === total) {
          this.log(`  media: ${this.done}/${total} processed (${Math.round((Date.now() - startedAt) / 1000)}s)`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, Math.max(1, local.length)) }, worker));
  }

  /**
   * Wait for every seeded asset to leave `processing`: ours are awaited directly, ones a running API
   * picked up are polled. After `timeoutMs` anything still processing is processed here.
   */
  async waitAll(timeoutMs = 15 * 60_000): Promise<{ ready: number; failed: Array<{ id: string; label: string; error: string | null }> }> {
    await this.start();
    const ids = this.tasks.map((t) => t.id);
    const deadline = Date.now() + timeoutMs;
    let rows = await this.statuses(ids);
    while (rows.some((r) => r.status === 'processing') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      rows = await this.statuses(ids);
    }
    const stuck = rows.filter((r) => r.status === 'processing');
    for (const r of stuck) {
      const task = this.tasks.find((t) => t.id === r.id)!;
      this.log(`  media: ${task.label} was still processing elsewhere, processing it here`);
      await this.assetsService.process({ assetId: task.id, videoMode: task.videoMode });
    }
    if (stuck.length) rows = await this.statuses(ids);
    const failed = rows
      .filter((r) => r.status !== 'ready')
      .map((r) => ({ id: r.id, label: this.tasks.find((t) => t.id === r.id)?.label ?? r.id, error: r.error }));
    return { ready: rows.length - failed.length, failed };
  }

  private async statuses(ids: string[]) {
    if (!ids.length) return [];
    return this.db.select({ id: assets.id, status: assets.status, error: assets.error }).from(assets).where(inArray(assets.id, ids));
  }
}

const rank = (t: Task) => (t.kind === 'video' ? 0 : t.kind === 'image' ? 1 : 2);
