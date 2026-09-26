import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  computeEventStatus,
  emailSettings as emailSettingsSchema,
  formatJakarta,
  formatTimeRange,
  maskEmail,
  safeWebUrl,
  type Accent,
  type AttendanceCounts,
  type EventMode,
  type EventStatus,
  type SiteSettings,
  type StreamState,
  type Ticket,
} from '@zemi/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { AssetRefsService } from '../../common/asset-refs.js';
import { AppConfig } from '../../config/app-config.js';
import { DB, type Db, type DbOrTx } from '../../db/client.js';
import { events, eventStreams, registrations, siteSettings, venues } from '../../db/schema.js';
import type { EventEmailInfo } from '../mail/templates/people-parts.js';
import { RevalidateService, tags } from '../revalidate/revalidate.service.js';

export type EventRow = typeof events.$inferSelect;
export type VenueRow = typeof venues.$inferSelect;
export type RegistrationRow = typeof registrations.$inferSelect;

/** An event with what every people feature needs next to it. */
export interface EventCtx {
  row: EventRow;
  venue: VenueRow | null;
  streamState: StreamState | null;
}

export type EmailSettings = SiteSettings['email'];

/**
 * Shared plumbing for registrations, tickets, attendance and people emails: event lookups, public URLs,
 * the public `Ticket` shape, email-ready event info, site email settings, counts, debounced revalidation.
 */
@Injectable()
export class PeopleContext {
  private readonly logger = new Logger('People');
  private readonly pendingRevalidate = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: AppConfig,
    private readonly refs: AssetRefsService,
    private readonly revalidateService: RevalidateService,
  ) {}

  /* ------------------------------------------------------------ urls */

  get webUrl(): string {
    return this.config.env.PUBLIC_WEB_URL;
  }

  get apiUrl(): string {
    return this.config.env.PUBLIC_API_URL;
  }

  ticketUrl(token: string): string {
    return `${this.webUrl}/tickets/${encodeURIComponent(token)}`;
  }

  /** What the QR encodes: short, so the code stays small. The web redirects /t/<token> to /tickets/<token>. */
  qrPayload(token: string): string {
    return `${this.webUrl}/t/${encodeURIComponent(token)}`;
  }

  cancelUrl(token: string): string {
    return `${this.ticketUrl(token)}?cancel=1`;
  }

  eventUrl(slug: string): string {
    return `${this.webUrl}/events/${encodeURIComponent(slug)}`;
  }

  ticketFileUrl(token: string, file: 'qr.png' | 'qr.svg' | 'calendar.ics'): string {
    return `${this.apiUrl}/api/v1/public/tickets/${encodeURIComponent(token)}/${file}`;
  }

  /* ------------------------------------------------------------ events */

  async event(id: string, db: DbOrTx = this.db): Promise<EventCtx | null> {
    const [hit] = await this.eventsByIds([id], db);
    return hit ?? null;
  }

  async eventsByIds(ids: string[], db: DbOrTx = this.db): Promise<EventCtx[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    const rows = await db
      .select({ row: events, venue: venues, streamState: eventStreams.state })
      .from(events)
      .leftJoin(venues, eq(venues.id, events.venueId))
      .leftJoin(eventStreams, eq(eventStreams.eventId, events.id))
      .where(inArray(events.id, unique));
    return rows.map((r) => ({ row: r.row, venue: r.venue ?? null, streamState: r.streamState ?? null }));
  }

  status(ctx: EventCtx, now = new Date()): EventStatus {
    return computeEventStatus(ctx.row, ctx.streamState, now);
  }

  /** "Theater A, Building B, floor 3" (or null for online-only events without a venue). */
  venueLabel(ctx: EventCtx): string | null {
    const v = ctx.venue;
    if (!v) return null;
    const bits = [v.name, v.building, v.floor ? `floor ${v.floor}` : null].filter(Boolean);
    return bits.join(', ') || null;
  }

  /** Google Maps link: the event's own, the venue's, or a search for the address. */
  mapsUrl(ctx: EventCtx): string | null {
    // Links saved before the input checks may be anything: emails and calendars only get web links.
    const direct = safeWebUrl(ctx.row.mapsUrl) || safeWebUrl(ctx.venue?.mapsUrl);
    if (direct) return direct;
    const address = ctx.venue?.address?.trim();
    return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
  }

  /** One line for calendars: venue, room note, address. */
  location(ctx: EventCtx): string | null {
    if (ctx.row.mode === 'online') return this.eventUrl(ctx.row.slug);
    const bits = [this.venueLabel(ctx), ctx.row.roomNote, ctx.venue?.address].filter((b): b is string => !!b && !!b.trim());
    return bits.length ? bits.join(', ') : null;
  }

  displayTitle(row: Pick<EventRow, 'number' | 'title'>): string {
    return row.number != null ? `Zemi #${row.number}: ${row.title}` : row.title;
  }

  /** Everything a people email shows about an event, preformatted in WIB. */
  emailEvent(ctx: EventCtx): EventEmailInfo {
    const e = ctx.row;
    return {
      title: e.title,
      number: e.number ?? null,
      dateLabel: formatJakarta(e.startsAt, 'date-long'),
      timeLabel: formatTimeRange(e.startsAt, e.endsAt),
      startTime: formatJakarta(e.startsAt, 'time'),
      venueLabel: this.venueLabel(ctx),
      address: ctx.venue?.address ?? null,
      roomNote: e.roomNote ?? null,
      mapsUrl: this.mapsUrl(ctx),
      mode: e.mode as EventMode,
      onlineNote: e.onlineNote ?? null,
      eventUrl: this.eventUrl(e.slug),
      accent: e.accent as Accent,
    };
  }

  /* ------------------------------------------------------------ tickets */

  async ticket(reg: RegistrationRow, ctx: EventCtx): Promise<Ticket> {
    const cover = await this.refs.imageRef(ctx.row.coverAssetId);
    const e = ctx.row;
    return {
      token: reg.qrToken,
      code: reg.ticketCode,
      fullName: reg.fullName,
      email: maskEmail(reg.email),
      attendanceMode: reg.attendanceMode,
      status: reg.status,
      checkedInAt: reg.checkedInAt?.toISOString() ?? null,
      createdAt: reg.createdAt.toISOString(),
      qrSvgUrl: this.ticketFileUrl(reg.qrToken, 'qr.svg'),
      qrPngUrl: this.ticketFileUrl(reg.qrToken, 'qr.png'),
      calendarUrl: this.ticketFileUrl(reg.qrToken, 'calendar.ics'),
      ticketUrl: this.ticketUrl(reg.qrToken),
      event: {
        id: e.id,
        slug: e.slug,
        title: e.title,
        number: e.number ?? null,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        status: this.status(ctx),
        venue: this.venueLabel(ctx),
        roomNote: e.roomNote ?? null,
        mapsUrl: this.mapsUrl(ctx),
        cover,
        accent: e.accent,
      },
    };
  }

  /* ------------------------------------------------------------ counts */

  async counts(eventId: string, db: DbOrTx = this.db): Promise<AttendanceCounts> {
    const active = sql`${registrations.status} = 'registered'`;
    const [row] = await db
      .select({
        registered: sql<number>`count(*) filter (where ${active})`.mapWith(Number),
        checkedIn: sql<number>`count(*) filter (where ${active} and ${registrations.checkedInAt} is not null)`.mapWith(Number),
        inPersonRegistered: sql<number>`count(*) filter (where ${active} and ${registrations.attendanceMode} = 'in-person')`.mapWith(Number),
        walkIns: sql<number>`count(*) filter (where ${active} and ${registrations.source} = 'walk-in')`.mapWith(Number),
      })
      .from(registrations)
      .where(eq(registrations.eventId, eventId));
    return row ?? { registered: 0, checkedIn: 0, inPersonRegistered: 0, walkIns: 0 };
  }

  /* ------------------------------------------------------------ settings */

  /** `site_settings.email` parsed with shared defaults (toggles default to true). Never throws. */
  async emailSettings(): Promise<EmailSettings> {
    try {
      const [row] = await this.db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'email'));
      const parsed = emailSettingsSchema.safeParse(row?.value ?? {});
      if (parsed.success) return parsed.data;
      this.logger.warn('site_settings.email is invalid, using defaults');
    } catch (err) {
      this.logger.warn(`Could not read email settings: ${(err as Error).message}`);
    }
    return emailSettingsSchema.parse({});
  }

  /* ------------------------------------------------------------ revalidate */

  /**
   * Seat counts show on public event pages (spots left, registrant count). Debounced per event so a burst
   * of sign-ups sends one revalidate, not fifty.
   */
  revalidateEvent(eventId: string): void {
    if (this.pendingRevalidate.has(eventId)) return;
    const timer = setTimeout(() => {
      this.pendingRevalidate.delete(eventId);
      void this.revalidateService.revalidate([tags.events, tags.event(eventId)]);
    }, 2000);
    timer.unref();
    this.pendingRevalidate.set(eventId, timer);
  }
}
