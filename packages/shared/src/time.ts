import { JAKARTA_OFFSET_MINUTES, TIMEZONE, DEFAULT_SESSION } from './constants.js';

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

export function formatJakarta(d: DateLike, format: JakartaFormat = 'datetime'): string {
  const date = toDate(d);
  const base: Intl.DateTimeFormatOptions = { timeZone: TIMEZONE };
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { ...base, ...o }).format(date);
  switch (format) {
    case 'date':
      return fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    case 'date-long':
      return fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    case 'date-short':
      return fmt({ day: 'numeric', month: 'short' });
    case 'time':
      return jakartaTimeInput(date);
    case 'weekday':
      return fmt({ weekday: 'long' });
    case 'month-year':
      return fmt({ month: 'long', year: 'numeric' });
    case 'iso-date':
      return jakartaDateInput(date);
    case 'datetime':
    default:
      return `${fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${jakartaTimeInput(date)}`;
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
