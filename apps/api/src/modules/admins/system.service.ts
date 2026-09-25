import { readFileSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import type { SystemStatus } from '@zemi/shared';
import { count } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Sql } from 'postgres';
import { AppConfig } from '../../config/app-config.js';
import { apiPath } from '../../config/paths.js';
import { DB, PG, type Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { JobsService } from '../jobs/jobs.service.js';
import { MailService } from '../mail/mail.service.js';
import { StorageService } from '../storage/storage.service.js';

const startedAt = Date.now();

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(apiPath('package.json'), 'utf8')) as { version?: string };
    const sha = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7);
    return `${pkg.version ?? '0.0.0'}${sha ? `+${sha}` : ''}`;
  } catch {
    return 'unknown';
  }
}

const COUNTED: Record<string, PgTable> = {
  admins: t.admins,
  events: t.events,
  speakers: t.speakers,
  publications: t.publications,
  venues: t.venues,
  registrations: t.registrations,
  checkins: t.checkins,
  assets: t.assets,
  emailLogs: t.emailLogs,
  auditLogs: t.auditLogs,
  contactMessages: t.contactMessages,
  streamSessions: t.streamSessions,
};

/** Integrations and health for GET /admin/system (superadmin). */
@Injectable()
export class SystemService {
  private readonly version = readVersion();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PG) private readonly sql: Sql,
    private readonly config: AppConfig,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly mail: MailService,
  ) {}

  async status(): Promise<SystemStatus> {
    const [database, storageOk, media, jobs, counts] = await Promise.all([
      this.database(),
      this.storage.ping(),
      this.media(),
      this.jobs.stats().catch(() => ({ ok: false, queued: 0, active: 0, failed: 0, queues: [] })),
      this.counts(),
    ]);
    return {
      version: this.version,
      now: new Date().toISOString(),
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      database,
      storage: { ok: storageOk, bucket: this.config.env.S3_BUCKET, endpoint: this.config.env.S3_ENDPOINT ?? 'aws' },
      email: { provider: this.mail.provider, from: this.mail.from, ok: this.mail.provider === 'outbox' || !!this.config.env.RESEND_API_KEY },
      media,
      jobs: { ok: jobs.ok, queued: jobs.queued, failed24h: jobs.failed },
      counts,
    };
  }

  private async database(): Promise<SystemStatus['database']> {
    const t0 = performance.now();
    try {
      await this.sql`select 1`;
      return { ok: true, latencyMs: Math.round((performance.now() - t0) * 10) / 10 };
    } catch {
      return { ok: false, latencyMs: null };
    }
  }

  private async media(): Promise<SystemStatus['media']> {
    const rtmpUrl = this.config.env.RTMP_PUBLIC_URL;
    try {
      const res = await fetch(`${this.config.env.MEDIA_API_URL}/v3/paths/list?itemsPerPage=1000`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return { ok: false, rtmpUrl, activePaths: 0 };
      const body = (await res.json()) as { itemCount?: number; items?: Array<{ ready?: boolean }> };
      const activePaths = body.items ? body.items.filter((p) => p.ready !== false).length : (body.itemCount ?? 0);
      return { ok: true, rtmpUrl, activePaths };
    } catch {
      return { ok: false, rtmpUrl, activePaths: 0 };
    }
  }

  private async counts(): Promise<Record<string, number>> {
    const entries = await Promise.all(
      Object.entries(COUNTED).map(async ([name, table]) => {
        try {
          const [row] = await this.db.select({ n: count() }).from(table);
          return [name, row?.n ?? 0] as const;
        } catch {
          return [name, -1] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }
}
