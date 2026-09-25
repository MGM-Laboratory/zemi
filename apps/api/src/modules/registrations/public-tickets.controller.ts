import { Body, Controller, Get, Header, HttpCode, Logger, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { registerInput, type RegisterResult, type Ticket } from '@zemi/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../../auth/decorators.js';
import { AppError } from '../../common/errors.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { Ip, UserAgent } from '../../common/request.js';
import { parseOrThrow, UuidParam, ZodParam } from '../../common/zod.pipe.js';
import { icsFilename } from './calendar.js';
import { TicketAssets } from './ticket-assets.service.js';
import { TicketsService } from './tickets.service.js';

const tokenParam = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "That ticket link looks off. Double check it?");

const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Public sign-up and ticket endpoints (no session). Mounted at /api/v1/public.
 * Rate limits: sign-up 5 per minute and 20 per hour per IP.
 */
@ApiTags('public: registrations')
@Public()
@Controller('public')
export class PublicTicketsController {
  private readonly logger = new Logger('Register');

  constructor(
    private readonly tickets: TicketsService,
    private readonly assets: TicketAssets,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post('events/:id/registrations')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async register(
    @UuidParam() id: string,
    @Body() body: unknown,
    @Ip() ip: string | null,
    @UserAgent() ua: string | null,
  ): Promise<RegisterResult> {
    const who = ip ?? 'unknown';
    this.rateLimit.consume(`register:${who}`, { limit: 5, windowMs: 60_000 }, 'Easy there. Give it a minute and try again.');
    this.rateLimit.consume(`register-h:${who}`, { limit: 20, windowMs: 3_600_000 }, "That's a lot of sign-ups from here. Try again in a bit.");

    // Honeypot: checked before validation so bots don't learn which field tripped them.
    const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const { website, ...rest } = raw;
    if (typeof website === 'string' ? website.trim() !== '' : website != null) {
      this.logger.warn(`Honeypot filled from ${who}, ignoring the sign-up`);
      throw new AppError(400, 'rejected', "That didn't go through. Mind trying again?");
    }
    const input = parseOrThrow(registerInput, rest);
    return this.tickets.register(id, input, { ip, userAgent: ua });
  }

  @Get('tickets/:token')
  @Header('Cache-Control', 'no-store')
  getTicket(@ZodParam('token', tokenParam) token: string): Promise<Ticket> {
    return this.tickets.getTicket(token);
  }

  @Post('tickets/:token/cancel')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  cancel(@ZodParam('token', tokenParam) token: string, @Ip() ip: string | null, @UserAgent() ua: string | null): Promise<Ticket> {
    this.rateLimit.consume(`ticket-cancel:${ip ?? 'unknown'}`, { limit: 10, windowMs: 60_000 });
    return this.tickets.cancel(token, { ip, userAgent: ua });
  }

  @Get('tickets/:token/qr.svg')
  async qrSvg(@ZodParam('token', tokenParam) token: string, @Res() res: Response): Promise<void> {
    await this.tickets.byToken(token);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', IMMUTABLE);
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.send(this.assets.qrSvg(token));
  }

  @Get('tickets/:token/qr.png')
  async qrPng(@ZodParam('token', tokenParam) token: string, @Res() res: Response): Promise<void> {
    const { reg } = await this.tickets.byToken(token);
    const png = await this.assets.qrPng(token, 1024);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', IMMUTABLE);
    res.setHeader('Content-Disposition', `inline; filename="zemi-ticket-${reg.ticketCode}.png"`);
    res.send(png);
  }

  @Get('tickets/:token/calendar.ics')
  async calendar(@ZodParam('token', tokenParam) token: string, @Res() res: Response): Promise<void> {
    const { reg, event } = await this.tickets.byToken(token);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    // Times and rooms can change, so calendars re-fetch rather than cache forever.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Disposition', `attachment; filename="${icsFilename(event.row.number ?? null, event.row.slug)}"`);
    res.send(this.assets.ics(reg, event));
  }
}
