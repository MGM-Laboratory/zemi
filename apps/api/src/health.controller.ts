import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Sql } from 'postgres';
import { Public } from './auth/decorators.js';
import { PG } from './db/client.js';

const startedAt = Date.now();

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(PG) private readonly sql: Sql) {}

  /** GET /api/v1/health: 200 when the API and database answer, 503 otherwise (Railway healthcheck). */
  @Get()
  @ApiOperation({ summary: 'Check API health' })
  @ApiOkResponse({ description: 'The API and database are available.' })
  async check(@Res({ passthrough: true }) res: Response) {
    const t0 = performance.now();
    let db: { ok: boolean; latencyMs: number | null; error?: string };
    try {
      await Promise.race([
        this.sql`select 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000).unref()),
      ]);
      db = { ok: true, latencyMs: Math.round((performance.now() - t0) * 10) / 10 };
    } catch (err) {
      db = { ok: false, latencyMs: null, error: (err as Error).message };
    }
    res.setHeader('Cache-Control', 'no-store');
    if (!db.ok) res.status(503);
    return {
      status: db.ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      db,
    };
  }
}
