import { createEvent, type EventAttributes } from 'ics';
import { formatJakarta, formatTimeRange, type EventMode } from '@zemi/shared';

export interface IcsEventInput {
  id: string;
  slug: string;
  number: number | null;
  title: string;
  summary: string | null;
  startsAt: Date;
  endsAt: Date;
  mode: EventMode;
  roomNote: string | null;
  mapsUrl: string | null;
  onlineNote: string | null;
  tags: string[];
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  venue: {
    name: string;
    building: string | null;
    floor: string | null;
    address: string | null;
    mapsUrl: string | null;
  } | null;
}

/** "Zemi #12: Robots that fold laundry" (titles that already say Zemi stay as they are). */
export function calendarTitle(e: Pick<IcsEventInput, 'number' | 'title'>): string {
  if (/^zemi\b/i.test(e.title.trim())) return e.title.trim();
  return e.number !== null ? `Zemi #${e.number}: ${e.title}` : `Zemi: ${e.title}`;
}

/** "Room 3.2, Gedung F, 3rd floor, Jl. Veteran" or "Online" for online-only events without a room. */
export function calendarLocation(
  e: Pick<IcsEventInput, 'mode' | 'roomNote' | 'venue'>,
): string | undefined {
  const parts = [
    e.venue?.name,
    e.roomNote,
    e.venue?.building,
    e.venue?.floor ? `floor ${e.venue.floor}` : null,
    e.venue?.address,
  ]
    .map((p) => (p ?? '').trim())
    .filter(Boolean);
  const unique = parts.filter(
    (p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i,
  );
  if (unique.length) return unique.join(', ');
  return e.mode === 'online' ? 'Online' : undefined;
}

/**
 * A single VEVENT calendar file for an event. Times are UTC in the file (calendar apps show them in
 * the viewer's zone); the description spells out the WIB time for humans. The UID is stable per
 * event and SEQUENCE grows with every edit, so re-importing updates the entry instead of duplicating it.
 */
export function buildEventIcs(e: IcsEventInput, webUrl: string): string {
  const url = `${webUrl.replace(/\/+$/, '')}/events/${e.slug}`;
  const maps = e.mapsUrl || e.venue?.mapsUrl || null;
  const lines = [
    e.cancelledAt ? 'Heads up: this one is cancelled.' : null,
    e.summary,
    `${formatJakarta(e.startsAt, 'date')}, ${formatTimeRange(e.startsAt, e.endsAt)}`,
    calendarLocation(e) && e.mode !== 'online' ? `Where: ${calendarLocation(e)}` : null,
    maps ? `Map: ${maps}` : null,
    e.mode !== 'offline' ? `Livestream: ${url}` : null,
    e.onlineNote,
    `Details: ${url}`,
  ].filter((l): l is string => !!l && !!l.trim());

  const attrs: EventAttributes = {
    uid: `event-${e.id}@zemi.labmgm.org`,
    productId: '-//MGM Laboratory//Zemi//EN',
    calName: 'Zemi',
    title: calendarTitle(e),
    description: lines.join('\n'),
    start: e.startsAt.getTime(),
    startInputType: 'utc',
    startOutputType: 'utc',
    end: e.endsAt.getTime(),
    endInputType: 'utc',
    endOutputType: 'utc',
    url,
    status: e.cancelledAt ? 'CANCELLED' : 'CONFIRMED',
    busyStatus: e.cancelledAt ? 'FREE' : 'BUSY',
    transp: e.cancelledAt ? 'TRANSPARENT' : 'OPAQUE',
    sequence: Math.max(0, Math.floor((e.updatedAt.getTime() - e.createdAt.getTime()) / 1000)),
    created: e.createdAt.getTime(),
    lastModified: e.updatedAt.getTime(),
    alarms: e.cancelledAt
      ? []
      : [
          {
            action: 'display',
            description: 'Zemi starts in 30 minutes',
            trigger: { minutes: 30, before: true },
          },
        ],
  };
  const location = calendarLocation(e);
  if (location) attrs.location = location;
  if (e.tags.length) attrs.categories = e.tags;

  const { error, value } = createEvent(attrs);
  if (error || !value) throw error ?? new Error('Could not build the calendar file');
  return value;
}

/** `zemi-12.ics`, or the slug when there is no number. */
export function icsFilename(e: Pick<IcsEventInput, 'number' | 'slug'>): string {
  return e.number !== null ? `zemi-${e.number}.ics` : `${e.slug}.ics`;
}
