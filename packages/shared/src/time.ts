import { JAKARTA_OFFSET_MINUTES, DEFAULT_SESSION } from './constants.js';

const OFFSET_MS = JAKARTA_OFFSET_MINUTES * 60_000;

type DateLike = Date | string | number;
const toDate = (d: DateLike) => (d instanceof Date ? d : new Date(d));

/** Wall-clock parts in Jakarta for an instant. */
export function jakartaParts(d: DateLike) {
  const shifted = new Date(toDate(d).getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in Jakarta (for <input type="date">). */
export function jakartaDateInput(d: DateLike): string {
  const p = jakartaParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `HH:mm` in Jakarta (for <input type="time">). */
export function jakartaTimeInput(d: DateLike): string {
  const p = jakartaParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Build a UTC Date from a Jakarta wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`). */
export function fromJakartaInput(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0) - OFFSET_MS);
}

export type JakartaFormat =
  | 'date' // Fri, 3 Oct 2026
  | 'date-long' // Friday, 3 October 2026
  | 'date-short' // 3 Oct
  | 'time' // 13:15
  | 'datetime' // Fri, 3 Oct 2026, 13:15
  | 'weekday' // Friday
  | 'month-year' // October 2026
  | 'iso-date'; // 2026-10-03

// British English names, spelled out here instead of asking Intl. Browsers and Node ship
// different ICU data ("Friday, 2 October" in Node 24, "Friday 2 October" in Chrome 141), and a
// server-rendered date that differs from the browser's by one comma is a hydration error that
// makes React throw away the server HTML and render the page again on the client.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

/** Jakarta wall-clock formatting, identical on the server and in every browser. */
export function formatJakarta(d: DateLike, format: JakartaFormat = 'datetime'): string {
  // Same contract as Intl: an invalid date is an error, never "NaN undefined" in an email.
  if (Number.isNaN(toDate(d).getTime())) throw new RangeError('Invalid time value');
  const p = jakartaParts(d);
  const day = `${WEEKDAYS_SHORT[p.weekday]}, ${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year}`;
  switch (format) {
    case 'date':
      return day;
    case 'date-long':
      return `${WEEKDAYS[p.weekday]}, ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
    case 'date-short':
      return `${p.day} ${MONTHS_SHORT[p.month - 1]}`;
    case 'time':
      return `${pad(p.hour)}:${pad(p.minute)}`;
    case 'weekday':
      return WEEKDAYS[p.weekday]!;
    case 'month-year':
      return `${MONTHS[p.month - 1]} ${p.year}`;
    case 'iso-date':
      return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    case 'datetime':
    default:
      return `${day}, ${pad(p.hour)}:${pad(p.minute)}`;
  }
}

/** "13:15 to 15:15 WIB" */
export function formatTimeRange(start: DateLike, end: DateLike): string {
  return `${jakartaTimeInput(start)} to ${jakartaTimeInput(end)} WIB`;
}

/** Next occurrence of the default Friday session strictly after `from` (default now). */
export function nextFridaySession(from: DateLike = new Date(), weeksAhead = 0) {
  const p = jakartaParts(from);
  const todayUtcMidnight = Date.UTC(p.year, p.month - 1, p.day);
  let delta = (DEFAULT_SESSION.weekday - p.weekday + 7) % 7;
  const start = fromJakartaInput(isoFromUtcMs(todayUtcMidnight + delta * 86_400_000), DEFAULT_SESSION.start);
  if (start.getTime() <= toDate(from).getTime()) delta += 7;
  delta += weeksAhead * 7;
  const dateStr = isoFromUtcMs(todayUtcMidnight + delta * 86_400_000);
  return {
    startsAt: fromJakartaInput(dateStr, DEFAULT_SESSION.start),
    endsAt: fromJakartaInput(dateStr, DEFAULT_SESSION.end),
  };
}

function isoFromUtcMs(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Minutes between a Jakarta `HH:mm` on the day of `anchor` and the anchor instant (can be negative). */
export function minutesFromAnchor(anchor: DateLike, hhmm: string): number {
  const dateStr = jakartaDateInput(anchor);
  const t = fromJakartaInput(dateStr, hhmm).getTime();
  return Math.round((t - toDate(anchor).getTime()) / 60_000);
}

/** Humanized countdown parts. */
export function countdownParts(target: DateLike, now: DateLike = new Date()) {
  const ms = Math.max(0, toDate(target).getTime() - toDate(now).getTime());
  const s = Math.floor(ms / 1000);
  return {
    totalMs: ms,
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}
