/**
 * Pure event rules (no Nest, no DB), shared by the events, overview and registrations modules.
 * Everything here is unit tested in event-logic.spec.ts.
 */
import {
  ACCENTS,
  computeEventStatus,
  formatJakarta,
  fromJakartaInput,
  jakartaDateInput,
  jakartaTimeInput,
  nextFridaySession,
  type Accent,
  type EventMode,
  type EventRegistrationInfo,
  type EventStatus,
  type EventStreamPublic,
  type RecordingChapter,
  type StreamState,
} from '@zemi/shared';

type DateLike = Date | string;
const toDate = (d: DateLike) => (d instanceof Date ? d : new Date(d));

/* ------------------------------------------------------------------ status */

/** `computeEventStatus` with the stream state read from `event_streams` (null when no row yet). */
export function eventStatus(
  e: { startsAt: DateLike; endsAt: DateLike; cancelledAt?: DateLike | null },
  streamState: StreamState | null | undefined,
  now: Date = new Date(),
): EventStatus {
  return computeEventStatus(e, streamState ?? 'idle', now);
}

/* ------------------------------------------------------------------ registration */

export interface RegistrationRuleInput {
  registrationOpen: boolean;
  cancelledAt: DateLike | null;
  startsAt: DateLike;
  endsAt: DateLike;
  registrationClosesAt: DateLike | null;
  capacity: number | null;
  mode: EventMode;
  /** Drafts are never open (the admin preview says so). */
  visibility?: 'draft' | 'published' | 'unlisted';
}

/**
 * Can people sign up right now? `registered` is the number of registrations with
 * `status = 'registered'` (in-person and online together: capacity caps the whole list).
 *
 * Same rules as the registrations module's `registrationWindow` (which enforces them on POST), so
 * the page never shows an open form that the API then refuses:
 * draft, cancelled, over (`now >= endsAt`, even if the stream runs long), switched off, deadline
 * passed, full. An event that is happening right now stays open, so latecomers can grab a ticket.
 */
export function registrationInfo(
  e: RegistrationRuleInput,
  registered: number,
  now: Date = new Date(),
): EventRegistrationInfo {
  const closesAt = e.registrationClosesAt ? toDate(e.registrationClosesAt) : null;
  const spotsLeft =
    e.capacity === null || e.capacity === undefined
      ? null
      : Math.max(0, e.capacity - Math.max(0, registered));
  const base = { closesAt: closesAt ? closesAt.toISOString() : null, spotsLeft };
  const closed = (reason: string): EventRegistrationInfo => ({ ...base, open: false, reason });

  if (e.visibility === 'draft') return closed("This one isn't open for sign ups yet.");
  if (e.cancelledAt)
    return closed('This Friday got cancelled, so sign ups are off. See you next week?');
  if (now.getTime() >= toDate(e.endsAt).getTime())
    return closed("This one's a wrap, so sign ups are closed.");
  if (!e.registrationOpen) return closed("Sign ups aren't open for this one. Check back soon.");
  if (closesAt && now.getTime() >= closesAt.getTime()) {
    return closed(`Sign ups closed on ${formatJakarta(closesAt, 'datetime')} WIB.`);
  }
  if (spotsLeft !== null && spotsLeft <= 0) {
    return closed(
      e.mode === 'hybrid'
        ? 'Every seat is taken. You can still watch the livestream, though.'
        : "We're full this time. Sorry, every spot is taken.",
    );
  }
  return { ...base, open: true, reason: null };
}

/* ------------------------------------------------------------------ stream */

/** Public stream state. `hlsUrl` only while live; viewer counts arrive over SSE, so 0 here. */
export function streamPublic(
  row: { state: StreamState; ingestOnline: boolean; liveStartedAt: Date | null } | null | undefined,
  eventId: string,
  publicApiUrl: string,
): EventStreamPublic {
  const state = row?.state ?? 'idle';
  return {
    state,
    ingestOnline: row?.ingestOnline ?? false,
    liveStartedAt: row?.liveStartedAt ? row.liveStartedAt.toISOString() : null,
    hlsUrl:
      state === 'live'
        ? `${publicApiUrl.replace(/\/+$/, '')}/api/v1/public/live/${eventId}/index.m3u8`
        : null,
    viewers: 0,
  };
}

/* ------------------------------------------------------------------ chapters */

/**
 * Chapters for one recording, from the rundown. Rundown times are Jakarta wall-clock `HH:mm` on the
 * event's day; each becomes seconds after the session's `startedAt`. Items before the recording
 * started (negative offsets) and after it ended (when the duration is known) are skipped.
 * Sorted by time, one chapter per second offset (the first agenda item at a time wins).
 */
export function recordingChapters(
  rundown: ReadonlyArray<{ time: string; agenda: string }>,
  session: { startedAt: DateLike; durationSec?: number | null },
  eventStartsAt: DateLike,
): RecordingChapter[] {
  const started = toDate(session.startedAt).getTime();
  const day = jakartaDateInput(eventStartsAt);
  const duration = session.durationSec && session.durationSec > 0 ? session.durationSec : null;
  const seen = new Set<number>();
  const out: RecordingChapter[] = [];
  const items = rundown
    .map((item, index) => ({ item, index, at: fromJakartaInput(day, item.time).getTime() }))
    .sort((a, b) => a.at - b.at || a.index - b.index);
  for (const { item, at } of items) {
    const startSec = Math.floor((at - started) / 1000);
    if (!Number.isFinite(startSec) || startSec < 0) continue;
    if (duration !== null && startSec >= duration) continue;
    if (seen.has(startSec)) continue;
    const title = item.agenda.trim();
    if (!title) continue;
    seen.add(startSec);
    out.push({ title, startSec });
  }
  return out;
}

/* ------------------------------------------------------------------ accents */

/** The accent after `prev` in brand order (blue, yellow, red, green). Blue when there is none. */
export function nextAccent(prev: Accent | null | undefined): Accent {
  if (!prev) return ACCENTS[0];
  const i = ACCENTS.indexOf(prev);
  return ACCENTS[(i + 1) % ACCENTS.length] ?? ACCENTS[0];
}

/* ------------------------------------------------------------------ Fridays */

/** The next `count` Friday session dates (Jakarta `YYYY-MM-DD`), starting with the next session after `from`. */
export function upcomingFridays(from: Date, count: number): string[] {
  const out: string[] = [];
  for (let k = 0; k < count; k++) out.push(jakartaDateInput(nextFridaySession(from, k).startsAt));
  return out;
}

/**
 * The first Friday (after `from`) whose Jakarta date is not in `taken`. Any event on a date takes it,
 * cancelled ones included, so a Friday that was called off on purpose (a holiday) is not offered again.
 */
export function firstFreeFriday(taken: ReadonlySet<string>, from: Date, maxWeeks = 156): string {
  for (let k = 0; k < maxWeeks; k++) {
    const date = jakartaDateInput(nextFridaySession(from, k).startsAt);
    if (!taken.has(date)) return date;
  }
  return jakartaDateInput(nextFridaySession(from, maxWeeks).startsAt);
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A session on a Jakarta date. `start`/`end` are `HH:mm`; invalid or non-increasing times fall back to
 * 13:15 to 15:15.
 */
export function sessionOn(
  date: string,
  start = '13:15',
  end = '15:15',
): { startsAt: Date; endsAt: Date } {
  const s = HHMM.test(start) ? start : '13:15';
  const e = HHMM.test(end) ? end : '15:15';
  const startsAt = fromJakartaInput(date, s);
  let endsAt = fromJakartaInput(date, e);
  if (endsAt.getTime() <= startsAt.getTime()) endsAt = new Date(startsAt.getTime() + 2 * 3600_000);
  return { startsAt, endsAt };
}

/**
 * Move an event to another Jakarta date, keeping its wall-clock start time and its length
 * (used by duplicate).
 */
export function shiftToDate(
  src: { startsAt: DateLike; endsAt: DateLike },
  date: string,
): { startsAt: Date; endsAt: Date; deltaMs: number } {
  const start = toDate(src.startsAt);
  const length = Math.max(60_000, toDate(src.endsAt).getTime() - start.getTime());
  const startsAt = fromJakartaInput(date, jakartaTimeInput(start));
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + length),
    deltaMs: startsAt.getTime() - start.getTime(),
  };
}

/* ------------------------------------------------------------------ rundown */

/** Sort rundown items by start time, then end time, keeping input order for ties. */
export function sortRundown<T extends { time: string; endTime?: string | null }>(
  items: readonly T[],
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.time.localeCompare(b.item.time) ||
        (a.item.endTime ?? '').localeCompare(b.item.endTime ?? '') ||
        a.index - b.index,
    )
    .map((x) => x.item);
}

/* ------------------------------------------------------------------ text */

/** Trimmed text or null (empty strings from forms become null). */
export function cleanText(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t ? t : null;
}

/** Trim, drop empties and dedupe tags case-insensitively (first spelling wins). */
export function cleanTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** "Zemi #12" style label, or the Jakarta short date when there is no number. */
export function eventLabel(e: { number: number | null; startsAt: DateLike }): string {
  return e.number !== null && e.number !== undefined
    ? `#${e.number}`
    : formatJakarta(e.startsAt, 'date-short');
}
