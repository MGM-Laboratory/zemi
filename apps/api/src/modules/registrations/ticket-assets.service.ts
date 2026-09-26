import { Injectable } from '@nestjs/common';
import { formatJakarta, formatTimeRange } from '@zemi/shared';
import { buildIcs } from './calendar.js';
import { PeopleContext, type EventCtx, type RegistrationRow } from './people-context.service.js';
import { QrCache, ticketQrPng, ticketQrSvg } from './qr.js';

/** QR images and calendar files for tickets (used by the public endpoints and the emails). */
@Injectable()
export class TicketAssets {
  private readonly pngCache = new QrCache(256);

  constructor(private readonly ctx: PeopleContext) {}

  qrSvg(token: string): string {
    return ticketQrSvg(this.ctx.qrPayload(token), { size: 1024 });
  }

  /** 1024px PNG by default; emails use 600px (sharp on retina, light attachment). */
  qrPng(token: string, size = 1024): Promise<Buffer> {
    return this.pngCache.get(`${token}:${size}`, () => ticketQrPng(this.ctx.qrPayload(token), size));
  }

  ics(reg: Pick<RegistrationRow, 'qrToken' | 'ticketCode' | 'attendanceMode'>, event: EventCtx): string {
    const e = event.row;
    const lines = [
      `${formatJakarta(e.startsAt, 'date-long')}, ${formatTimeRange(e.startsAt, e.endsAt)}`,
      e.summary ?? '',
      '',
      `Ticket: ${reg.ticketCode} (${reg.attendanceMode === 'online' ? 'joining online' : 'in person'})`,
      `Your ticket: ${this.ctx.ticketUrl(reg.qrToken)}`,
      e.mode !== 'offline' ? `Livestream: ${this.ctx.eventUrl(e.slug)}` : '',
      e.roomNote ? `Room: ${e.roomNote}` : '',
      this.ctx.mapsUrl(event) ? `Map: ${this.ctx.mapsUrl(event)}` : '',
    ];
    return buildIcs({
      eventId: e.id,
      title: e.title,
      number: e.number ?? null,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location: this.ctx.location(event),
      eventUrl: this.ctx.eventUrl(e.slug),
      cancelled: !!e.cancelledAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      lines,
    });
  }
}
