import {
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  bumperControlInput,
  type BumperControlInput,
  type BumperLiveState,
  type BumperPublicShow,
} from '@zemi/shared';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { Public } from '../../auth/decorators.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { Ip, UserAgent } from '../../common/request.js';
import { ZodBody, ZodParam, ZodQuery } from '../../common/zod.pipe.js';
import { AppConfig } from '../../config/app-config.js';
import { bumperKeySchema, bumperStreamQuery, type BumperStreamQuery } from './bumpers.schemas.js';
import { BumpersLiveService } from './live.service.js';
import { BumperShowsService } from './shows.service.js';

const MINUTE = 60_000;
const LIMITS = {
  get: {
    limit: 120,
    windowMs: MINUTE,
    message: 'This link is asking a lot right now. Give it a minute.',
  },
  stream: {
    limit: 60,
    windowMs: MINUTE,
    message: 'Too many reconnects on this link. Give it a minute.',
  },
  control: {
    limit: 240,
    windowMs: MINUTE,
    message: 'Easy on the buttons. Try again in a few seconds.',
  },
} as const;

/**
 * Token links for OBS (docs/features/bumpers.md section 4): the output key reads, the control key
 * also drives the show. No session, so no cookies and no CSRF: the global CsrfGuard only covers
 * /api/v1/admin and /api/v1/public/discussion. GETs get CORS `*` from main.ts (PUBLIC_READ_PATHS).
 * Everything is rate limited per ip + key; JSON answers are never cached.
 */
@ApiTags('public: bumpers')
@Public()
@Controller('public/bumpers')
export class BumpersPublicController {
  constructor(
    private readonly shows: BumperShowsService,
    private readonly live: BumpersLiveService,
    private readonly rateLimit: RateLimitService,
    private readonly config: AppConfig,
  ) {}

  private limit(kind: keyof typeof LIMITS, ip: string | null, key: string): void {
    const rule = LIMITS[kind];
    this.rateLimit.consume(`bumper-${kind}:${ip ?? 'unknown'}:${key}`, rule, rule.message);
  }

  /** The dock posts through the web's own origin; Companion, Stream Deck and curl come without one. */
  private fromDock(req: Request): boolean {
    const web = this.config.env.PUBLIC_WEB_URL.replace(/\/+$/, '');
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    return (
      origin === web || (typeof referer === 'string' && referer.startsWith(`${web}/bumpers/dock/`))
    );
  }

  @Get('out/:key')
  @Header('Cache-Control', 'no-store')
  async output(
    @ZodParam('key', bumperKeySchema) key: string,
    @Ip() ip: string | null,
  ): Promise<BumperPublicShow> {
    this.limit('get', ip, key);
    return this.shows.publicShow(await this.shows.byOutputKey(key), false);
  }

  /** SSE for the OBS browser source: state, show, revoked, ping. Registers an `output` client. */
  @Sse('out/:key/stream')
  async outputStream(
    @ZodParam('key', bumperKeySchema) key: string,
    @ZodQuery(bumperStreamQuery) q: BumperStreamQuery,
    @Ip() ip: string | null,
    @UserAgent() userAgent: string | null,
  ): Promise<Observable<MessageEvent>> {
    this.limit('stream', ip, key);
    const row = await this.shows.byOutputKey(key);
    return this.live.stream(row, { kind: 'output', cid: q.cid, obs: q.obs, userAgent });
  }

  @Get('control/:key')
  @Header('Cache-Control', 'no-store')
  async control(
    @ZodParam('key', bumperKeySchema) key: string,
    @Ip() ip: string | null,
  ): Promise<BumperPublicShow> {
    this.limit('get', ip, key);
    return this.shows.publicShow(await this.shows.byControlKey(key), true);
  }

  /** SSE for the dock: like the output stream plus presence. Registers a `dock` client. */
  @Sse('control/:key/stream')
  async controlStream(
    @ZodParam('key', bumperKeySchema) key: string,
    @ZodQuery(bumperStreamQuery) q: BumperStreamQuery,
    @Ip() ip: string | null,
    @UserAgent() userAgent: string | null,
  ): Promise<Observable<MessageEvent>> {
    this.limit('stream', ip, key);
    const row = await this.shows.byControlKey(key);
    return this.live.stream(row, { kind: 'dock', cid: q.cid, obs: q.obs, userAgent });
  }

  /** `{"action":"next"}` and friends from the dock, Companion or a Stream Deck. */
  @Post('control/:key')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async act(
    @ZodParam('key', bumperKeySchema) key: string,
    @ZodBody(bumperControlInput) body: BumperControlInput,
    @Ip() ip: string | null,
    @Req() req: Request,
  ): Promise<BumperLiveState> {
    this.limit('control', ip, key);
    const row = await this.shows.byControlKey(key);
    const dock = this.fromDock(req);
    const name = dock ? 'OBS dock' : 'Control link';
    return this.live.control(row.id, body, {
      via: dock ? 'dock' : 'api',
      by: name,
      principal: { kind: 'public', name },
      ip,
    });
  }
}
