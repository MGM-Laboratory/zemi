import { createEvent, type EventAttributes } from 'ics';

export interface CalendarInput {
  eventId: string;
  title: string;
  number: number | null;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  eventUrl: string;
  cancelled: boolean;
  /** Extra lines for the description (ticket code, links). */
  lines: string[];
}

/**
 * One VEVENT for a Zemi session. The UID is per event (not per ticket), so re-importing after a change
 * updates the same calendar entry instead of adding a second one. Times are UTC (`Z`); calendars show them
 * in the viewer's zone, and the description spells out WIB.
 */
export function buildIcs(input: CalendarInput): string {
  const title = input.number != null ? `Zemi #${input.number}: ${input.title}` : `Zemi: ${input.title}`;
  const attrs: EventAttributes = {
    uid: `event-${input.eventId}@zemi.labmgm.org`,
    productId: 'labmgm.org/zemi',
    method: 'PUBLISH',
    title,
    start: input.startsAt.getTime(),
    startInputType: 'utc',
    startOutputType: 'utc',
    end: input.endsAt.getTime(),
    endInputType: 'utc',
    endOutputType: 'utc',
    description: input.lines.filter(Boolean).join('\n'),
    url: input.eventUrl,
    status: input.cancelled ? 'CANCELLED' : 'CONFIRMED',
    busyStatus: 'BUSY',
    calName: 'Zemi',
    alarms: input.cancelled ? [] : [{ action: 'display', description: `${title} starts in 30 minutes`, trigger: { minutes: 30, before: true } }],
  };
  if (input.location) attrs.location = input.location;
  const { error, value } = createEvent(attrs);
  if (error || !value) throw new Error(`Could not build the calendar file: ${error?.message ?? 'unknown error'}`);
  return value;
}

/** Safe download name, e.g. `zemi-12.ics`. */
export function icsFilename(number: number | null, slug: string): string {
  const base = number != null ? `zemi-${number}` : `zemi-${slug}`;
  return `${base.replace(/[^a-z0-9-]+/gi, '-').slice(0, 60)}.ics`;
}
