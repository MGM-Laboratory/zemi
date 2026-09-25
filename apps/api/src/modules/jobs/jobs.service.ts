import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { PgBoss, type Job, type QueueResult } from 'pg-boss';
import { AppConfig } from '../../config/app-config.js';

/** What a handler receives: one job (we fetch batches of 1). `signal` aborts on shutdown/expiry. */
export interface JobContext<T> {
  id: string;
  name: string;
  data: T;
  signal: AbortSignal;
}

export type JobHandler<T> = (job: JobContext<T>) => Promise<unknown>;

export interface QueueSettings {
  /** Retries after the first failure (default 2). */
  retryLimit?: number;
  /** Seconds between retries (default 30, exponential when `retryBackoff`). */
  retryDelay?: number;
  retryBackoff?: boolean;
  /** How long one run may take before pg-boss fails it (default 15 min). Raise for video work. */
  expireInSeconds?: number;
  /** Keep completed jobs this long (default 3 days). */
  deleteAfterSeconds?: number;
  /** pg-boss queue policy (default 'standard'). */
  policy?: 'standard' | 'short' | 'singleton' | 'stately' | 'exclusive';
}

export interface RegisterOptions extends QueueSettings {
  /** Parallel workers in this process (default 1). */
  concurrency?: number;
  /** Poll interval in seconds (default 2). */
  pollingIntervalSeconds?: number;
}

export interface SendOptions {
  /** Run later: a Date, ISO string, or seconds from now. */
  startAfter?: Date | string | number;
  /**
   * Job key for `cancelByKey` / `reschedule`. On a 'standard' queue it does NOT dedupe (verified: a second
   * send gets its own id). Register the queue with policy 'short' (one queued job per key) or 'singleton'
   * (one active job per key) when you need that, or use `reschedule()` which cancels queued jobs first.
   */
  singletonKey?: string;
  retryLimit?: number;
  retryDelay?: number;
  expireInSeconds?: number;
  priority?: number;
}

interface Registration {
  handler: JobHandler<unknown>;
  opts: RegisterOptions;
  workerId?: string;
}

const DEFAULT_QUEUE: QueueSettings = { retryLimit: 2, retryDelay: 30, retryBackoff: true, deleteAfterSeconds: 3 * 86_400 };

/**
 * Background jobs on pg-boss 12 (Postgres, schema `pgboss`).
 *
 * Register handlers in your module's `onModuleInit` (they start once the app has booted):
 *
 *   this.jobs.register<{ assetId: string }>('asset.process', async (job) => { ... }, { expireInSeconds: 6 * 3600 });
 *
 * Send from anywhere (queues are created on first use):
 *
 *   await this.jobs.send('reminder.send', { eventId }, { startAfter: date, singletonKey: `reminder:${eventId}` });
 *   await this.jobs.cancelByKey('reminder.send', `reminder:${eventId}`);
 *
 * Queue names use `<area>.<verb>`: `asset.process`, `recording.finalize`, `mail.reminder`...
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  readonly boss: PgBoss;
  private readonly registrations = new Map<string, Registration>();
  private readonly queues = new Set<string>();
  private readonly queueSettings = new Map<string, QueueSettings>();
  private started = false;
  private stopping = false;
  private resolveReady!: () => void;
  private rejectReady!: (err: unknown) => void;
  /** Resolves once pg-boss is running. `send()` awaits it, so sending during boot is safe. */
  readonly ready: Promise<void>;

  constructor(private readonly config: AppConfig) {
    this.boss = new PgBoss({
      connectionString: config.env.DATABASE_URL,
      schema: 'pgboss',
      application_name: 'zemi-jobs',
      max: 4,
      // Only the worker process needs cron + maintenance; harmless when a single process does both.
      schedule: config.env.JOBS_ENABLED,
      supervise: config.env.JOBS_ENABLED,
    });
    this.boss.on('error', (err: Error) => this.logger.error(`pg-boss: ${err.message}`));
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // Avoid unhandled rejections when nobody awaits `ready`.
    this.ready.catch(() => undefined);
  }

  get isRunning(): boolean {
    return this.started && !this.stopping;
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.boss.start();
      this.started = true;
      this.resolveReady();
      this.logger.log(`pg-boss started${this.config.env.JOBS_ENABLED ? '' : ' (workers disabled by JOBS_ENABLED=false)'}`);
    } catch (err) {
      this.rejectReady(err);
      this.logger.error(`pg-boss failed to start: ${(err as Error).message}`);
      return;
    }
    for (const [name, reg] of this.registrations) await this.startWorker(name, reg);
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.started) return;
    this.stopping = true;
    try {
      await this.boss.stop({ graceful: true, timeout: 15_000 });
      this.logger.log('pg-boss stopped');
    } catch (err) {
      this.logger.warn(`pg-boss stop: ${(err as Error).message}`);
    }
  }

  /**
   * Register a handler for a queue. Throwing fails the job (retried per `retryLimit`).
   * Safe to call before or after boot. One handler per queue per process.
   */
  register<T>(queue: string, handler: JobHandler<T>, opts: RegisterOptions = {}): void {
    if (this.registrations.has(queue)) throw new Error(`A handler for "${queue}" is already registered`);
    const reg: Registration = { handler: handler as JobHandler<unknown>, opts };
    this.registrations.set(queue, reg);
    this.queueSettings.set(queue, { ...DEFAULT_QUEUE, ...pickQueue(opts) });
    if (this.started) void this.startWorker(queue, reg);
  }

  /** Enqueue a job. Returns the job id, or null when a singletonKey deduped it. */
  async send<T extends object>(queue: string, data: T, opts: SendOptions = {}): Promise<string | null> {
    await this.ready;
    await this.ensureQueue(queue);
    // pg-boss validates present keys, so never pass `undefined` values.
    const options = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
    return this.boss.send(queue, data, options);
  }

  /** Enqueue for a specific time (Date) or after N seconds. */
  sendAt<T extends object>(queue: string, data: T, when: Date | number, opts: Omit<SendOptions, 'startAfter'> = {}) {
    return this.send(queue, data, { ...opts, startAfter: when });
  }

  /**
   * Replace any queued job with this key by a new one (e.g. reschedule a reminder when an event
   * moves). Cancels queued jobs with the key, then sends.
   */
  async reschedule<T extends object>(queue: string, key: string, data: T, when: Date | number, opts: Omit<SendOptions, 'startAfter' | 'singletonKey'> = {}) {
    await this.cancelByKey(queue, key);
    return this.send(queue, data, { ...opts, startAfter: when, singletonKey: key });
  }

  /** Cancel queued (not yet active) jobs with this singletonKey. Returns how many were cancelled. */
  async cancelByKey(queue: string, key: string): Promise<number> {
    await this.ready;
    await this.ensureQueue(queue);
    const jobs = await this.boss.findJobs(queue, { key, queued: true });
    if (!jobs.length) return 0;
    await this.boss.cancel(
      queue,
      jobs.map((j) => j.id),
    );
    return jobs.length;
  }

  async cancel(queue: string, id: string): Promise<void> {
    await this.ready;
    await this.boss.cancel(queue, id);
  }

  /**
   * Recurring job on a cron expression, in Asia/Jakarta by default.
   *   await jobs.schedule('mail.digest', '0 9 * * 5', {}, { key: 'weekly' }); // Fridays 09:00 WIB
   */
  async schedule<T extends object>(queue: string, cron: string, data: T = {} as T, opts: { key?: string; tz?: string } = {}): Promise<void> {
    await this.ready;
    await this.ensureQueue(queue);
    await this.boss.schedule(queue, cron, data, { tz: opts.tz ?? 'Asia/Jakarta', ...(opts.key ? { key: opts.key } : {}) });
  }

  async unschedule(queue: string, key?: string): Promise<void> {
    await this.ready;
    await this.boss.unschedule(queue, key);
  }

  /** Queue counts for /admin/system. */
  async stats(): Promise<{ ok: boolean; queued: number; active: number; failed: number; queues: QueueResult[] }> {
    if (!this.isRunning) return { ok: false, queued: 0, active: 0, failed: 0, queues: [] };
    const queues = await this.boss.getQueues();
    return {
      ok: true,
      queued: queues.reduce((n, q) => n + (q.queuedCount ?? 0), 0),
      active: queues.reduce((n, q) => n + (q.activeCount ?? 0), 0),
      failed: queues.reduce((n, q) => n + (q.failedCount ?? 0), 0),
      queues,
    };
  }

  /** Create the queue once per process (idempotent in pg-boss too). */
  async ensureQueue(queue: string): Promise<void> {
    if (this.queues.has(queue)) return;
    const settings = this.queueSettings.get(queue) ?? DEFAULT_QUEUE;
    const existing = await this.boss.getQueue(queue);
    if (!existing) {
      await this.boss.createQueue(queue, { ...settings });
    } else if (this.queueSettings.has(queue)) {
      // Keep retry/expiry in sync with the code that owns the handler.
      const rest: QueueSettings = { ...settings };
      delete rest.policy;
      await this.boss.updateQueue(queue, rest).catch((err: unknown) => this.logger.warn(`updateQueue ${queue}: ${(err as Error).message}`));
    }
    this.queues.add(queue);
  }

  private async startWorker(queue: string, reg: Registration): Promise<void> {
    if (!this.config.env.JOBS_ENABLED || reg.workerId) return;
    try {
      await this.ensureQueue(queue);
      reg.workerId = await this.boss.work<unknown>(
        queue,
        {
          batchSize: 1,
          localConcurrency: reg.opts.concurrency ?? 1,
          pollingIntervalSeconds: reg.opts.pollingIntervalSeconds ?? 2,
        },
        async (jobs: Job<unknown>[]) => {
          for (const job of jobs) await this.runOne(queue, reg, job);
        },
      );
      this.logger.log(`Worker ready for "${queue}"`);
    } catch (err) {
      this.logger.error(`Could not start worker for "${queue}": ${(err as Error).message}`);
    }
  }

  private async runOne(queue: string, reg: Registration, job: Job<unknown>): Promise<void> {
    const started = Date.now();
    try {
      await reg.handler({ id: job.id, name: job.name, data: job.data, signal: job.signal });
      this.logger.debug(`${queue} ${job.id} done in ${Date.now() - started}ms`);
    } catch (err) {
      this.logger.warn(`${queue} ${job.id} failed after ${Date.now() - started}ms: ${(err as Error).message}`);
      throw err;
    }
  }
}

function pickQueue(o: RegisterOptions): QueueSettings {
  const out: QueueSettings = {};
  if (o.retryLimit !== undefined) out.retryLimit = o.retryLimit;
  if (o.retryDelay !== undefined) out.retryDelay = o.retryDelay;
  if (o.retryBackoff !== undefined) out.retryBackoff = o.retryBackoff;
  if (o.expireInSeconds !== undefined) out.expireInSeconds = o.expireInSeconds;
  if (o.deleteAfterSeconds !== undefined) out.deleteAfterSeconds = o.deleteAfterSeconds;
  if (o.policy !== undefined) out.policy = o.policy;
  return out;
}
