import { Controller, Get, HttpCode, Param, Post, Req, Res, Sse, type MessageEvent } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { heartbeatInput, reactionInput } from '@zemi/shared';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { Public } from '../../auth/decorators.js';
import { AppError, notFound } from '../../common/errors.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { Ip } from '../../common/request.js';
import { UuidParam, ZodBody } from '../../common/zod.pipe.js';
import { channels, RealtimeService } from '../realtime/realtime.service.js';
import { AudienceService } from './audience.service.js';
import { HlsProxyService } from './hls-proxy.service.js';
import { StreamService } from './stream.service.js';
import { isPlaylistPath, isSafeHlsPath, rewritePlaylist } from './stream.util.js';

const uuid = z.uuid();

/** Where `/public/live/:eventId/` ends in the raw URL (Express 5 splits `*path` into segments). */
function restOf(req: Request, eventId: string): string {
  const marker = `/live/${eventId}/`;
  const path = req.path;
  const i = path.indexOf(marker);
  return i >= 0 ? path.slice(i + marker.length) : '';
}

/** LL-HLS delivery directives a playlist request may carry (and what their values look like). */
const HLS_DIRECTIVES: Record<string, RegExp> = { _HLS_msn: /^\d{1,10}$/, _HLS_part: /^\d{1,6}$/, _HLS_skip: /^(YES|v2)$/ };

/**
 * Query string for MediaMTX. Segments and init files never need one; playlists only pass valid
 * LL-HLS directives. Everything else (our `pt`, cache busters) is dropped, so a random query
 * can't bypass the cache or reach the media server.
 */
function upstreamQuery(req: Request, rest: string): string {
  if (!isPlaylistPath(rest)) return '';
  const raw = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
  if (!raw) return '';
  const q = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(raw)) if (HLS_DIRECTIVES[k]?.test(v) && !q.has(k)) q.append(k, v);
  q.sort();
  return q.toString();
}

/**
 * Public live endpoints (SPEC 7, 9): the HLS proxy, heartbeats, reactions and the public SSE.
 * CORS `*` for GET comes from main.ts (PUBLIC_READ_PATHS); compression is off for /public/live.
 */
@ApiTags('public: live')
@Public()
@Controller('public')
export class PublicLiveController {
  constructor(
    private readonly stream: StreamService,
    private readonly audience: AudienceService,
    private readonly hls: HlsProxyService,
    private readonly realtime: RealtimeService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /**
   * GET /public/live/:eventId/<file> (index.m3u8, variant playlists, init + media segments).
   * Public while the stream is live; with `?pt=<preview token>` also in preview (admins).
   */
  @Get('live/:eventId/*path')
  async hlsFile(@Param('eventId') eventId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const notLive = () => new AppError(404, 'not_live', "This stream isn't live right now.");
    if (!uuid.safeParse(eventId).success) throw notLive();
    const rest = restOf(req, eventId);
    if (!isSafeHlsPath(rest)) throw notFound("We couldn't find that file.");

    const pt = typeof req.query.pt === 'string' ? req.query.pt : null;
    const gate = await this.stream.gate(eventId);
    if (!gate.exists || !gate.streamKey) throw notLive();
    const preview = !!pt && this.stream.verifyPreviewToken(eventId, pt);
    if (pt && !preview) throw new AppError(403, 'preview_expired', "That preview link doesn't work anymore. Refresh the dashboard for a new one.");
    const publicOk = gate.state === 'live' && gate.visibility !== 'draft';
    const previewOk = preview && (gate.state !== 'idle' || gate.ingestOnline);
    if (!publicOk && !previewOk) throw notLive();

    const result = await this.hls.get(gate.streamKey, rest, upstreamQuery(req, rest));
    if (result.status === 404) throw new AppError(404, 'no_signal', 'No signal right now. Hang tight, we are on it.');
    if (result.status !== 200) throw new AppError(502, 'media_unavailable', "The video server isn't answering. Try again in a moment.");

    const playlist = isPlaylistPath(rest);
    const body = playlist && preview && pt ? Buffer.from(rewritePlaylist(result.body.toString('utf8'), pt), 'utf8') : result.body;
    const scope = preview ? 'private' : 'public';
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', String(body.byteLength));
    res.setHeader('Cache-Control', playlist ? `${scope}, max-age=1` : `${scope}, max-age=60`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Cache', result.cached ? 'HIT' : 'MISS');
    res.status(200).end(body);
  }

  /** POST /public/events/:id/heartbeat { viewerId } every ~15s while watching. */
  @Post('events/:id/heartbeat')
  @HttpCode(200)
  async heartbeat(
    @UuidParam() id: string,
    @ZodBody(heartbeatInput) body: z.infer<typeof heartbeatInput>,
    @Ip() ip: string | null,
  ): Promise<{ live: boolean; viewers: number }> {
    // A whole campus can share one IP: roomy, but a script can't invent thousands of viewers.
    this.rateLimit.consume(`heartbeat:${ip ?? 'unknown'}`, { limit: 600, windowMs: 60_000 });
    const gate = await this.stream.gate(id);
    if (!gate.exists || gate.visibility === 'draft') throw notFound("We couldn't find that event.");
    if (gate.state !== 'live') return { live: false, viewers: 0 };
    return { live: true, viewers: this.audience.heartbeat(id, body.viewerId) };
  }

  /** POST /public/events/:id/reactions { kind }: aggregated per second into the public SSE. */
  @Post('events/:id/reactions')
  @HttpCode(202)
  async react(@UuidParam() id: string, @ZodBody(reactionInput) body: z.infer<typeof reactionInput>, @Ip() ip: string | null): Promise<{ ok: true }> {
    this.rateLimit.consume(`react:${ip ?? 'unknown'}:${id}`, { limit: 20, windowMs: 10_000 }, 'Easy on the applause. Try again in a few seconds.');
    const gate = await this.stream.gate(id);
    if (!gate.exists || gate.visibility === 'draft') throw notFound("We couldn't find that event.");
    if (gate.state !== 'live') throw new AppError(409, 'not_live', 'Reactions open when we go live.');
    this.audience.react(id, body.kind);
    return { ok: true };
  }

  /** GET /public/events/:id/live: SSE of LiveEvent (state on change, viewers every 5s, reactions, pings). */
  @Sse('events/:id/live')
  async live(@UuidParam() id: string): Promise<Observable<MessageEvent>> {
    // Resolve before subscribing so an unknown or draft event is a plain 404, not an open stream.
    const first = await this.stream.liveSnapshot(id);
    return this.realtime.stream(channels.live(id), { initial: () => first });
  }
}
