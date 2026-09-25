import { jakartaDateInput, jakartaParts, jakartaTimeInput } from '@zemi/shared';

/**
 * Pure time-series helpers for registration stats and the door dashboard. Everything is bucketed in
 * Asia/Jakarta wall-clock time (fixed UTC+7).
 */

const MIN = 60_000;
const DAY = 86_400_000;
const OFFSET = 7 * 60 * MIN;

/** Cumulative sign-ups per Jakarta day, with empty days filled in, from the first sign-up to `until`. */
export function timeline(createdAt: Date[], until: Date): Array<{ date: string; count: number; cumulative: number }> {
  if (!createdAt.length) return [];
  const perDay = new Map<string, number>();
  for (const d of createdAt) {
    const key = jakartaDateInput(d);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const first = Math.min(...createdAt.map((d) => d.getTime()));
  const last = Math.max(...createdAt.map((d) => d.getTime()));
  const endMs = Math.max(last, Math.min(until.getTime(), last + 60 * DAY));
  // Walk Jakarta midnights (UTC ms shifted), capped at 400 days so a stray row can't blow it up.
  const startDay = Math.floor((first + OFFSET) / DAY);
  const endDay = Math.min(Math.floor((endMs + OFFSET) / DAY), startDay + 400);
  const out: Array<{ date: string; count: number; cumulative: number }> = [];
  let cumulative = 0;
  for (let day = startDay; day <= endDay; day++) {
    const date = jakartaDateInput(day * DAY - OFFSET + 12 * 3_600_000);
    const count = perDay.get(date) ?? 0;
    cumulative += count;
    out.push({ date, count, cumulative });
  }
  return out;
}

/**
 * Check-ins per 5 minutes on the event's Jakarta day, "HH:mm" labels, zero-filled. The window covers
 * 30 minutes either side of the start and stretches to include every check-in of that day.
 */
export function arrivals(checkedInAt: Date[], startsAt: Date): Array<{ time: string; count: number }> {
  const day = jakartaDateInput(startsAt);
  const sameDay = checkedInAt.filter((d) => jakartaDateInput(d) === day);
  if (!sameDay.length) return [];
  const bucket = (ms: number) => Math.floor(ms / (5 * MIN)) * 5 * MIN;
  const times = sameDay.map((d) => d.getTime());
  const from = bucket(Math.min(Math.min(...times), startsAt.getTime() - 30 * MIN));
  const to = bucket(Math.max(Math.max(...times), startsAt.getTime() + 30 * MIN));
  const counts = new Map<number, number>();
  for (const t of times) counts.set(bucket(t), (counts.get(bucket(t)) ?? 0) + 1);
  const out: Array<{ time: string; count: number }> = [];
  for (let t = from; t <= to && out.length < 288; t += 5 * MIN) out.push({ time: jakartaTimeInput(t), count: counts.get(t) ?? 0 });
  return out;
}

/** Sign-ups by Jakarta hour of day, all 24 hours. */
export function byHour(createdAt: Date[]): Array<{ hour: number; count: number }> {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const d of createdAt) out[jakartaParts(d).hour]!.count += 1;
  return out;
}

export function topDomains(emails: string[], limit = 8): Array<{ domain: string; count: number }> {
  const m = new Map<string, number>();
  for (const e of emails) {
    const domain = e.split('@')[1]?.toLowerCase();
    if (domain) m.set(domain, (m.get(domain) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}

export function tally<T extends string>(values: T[]): Array<{ source: T; count: number }> {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
}
