/**
 * Small, server-safe helpers shared by the events index, the event page, the register flow and
 * the ticket page. No React, no browser APIs.
 */
import {
  formatJakarta,
  formatTimeRange,
  type Accent,
  type EventCard,
  type EventDetail,
  type EventMode,
  type ImageRef,
  type ShapeName,
} from '@zemi/shared';

export const ACCENT_SHAPE: Record<Accent, ShapeName> = {
  blue: 'circle',
  red: 'triangle',
  yellow: 'square',
  green: 'arch',
};

/** A second brand color that pops against an accent frame (stickers, sidekick characters). */
export const ACCENT_FRIEND: Record<Accent, Accent> = {
  blue: 'yellow',
  yellow: 'blue',
  red: 'green',
  green: 'red',
};

export const ACCENT_HEX: Record<Accent, string> = {
  blue: '#3a6dc5',
  red: '#f94141',
  yellow: '#f7bf33',
  green: '#0f8657',
};

/** Tint (50) for surfaces behind the accent. */
export const ACCENT_TINT: Record<Accent, string> = {
  blue: '#ecf1fa',
  red: '#fee5e5',
  yellow: '#fef6e0',
  green: '#e2f1ea',
};

/** Accessible text color for the accent on white (yellow never carries text). */
export const ACCENT_TEXT: Record<Accent, string> = {
  blue: '#2f5aa6',
  red: '#d92f2f',
  yellow: '#0e1116',
  green: '#0b6b45',
};

export function asAccent(v: string | null | undefined): Accent {
  return v === 'red' || v === 'yellow' || v === 'green' ? v : 'blue';
}

/** CSS custom properties for an accent, spread into `style`. */
export function accentVars(accent: Accent): Record<string, string> {
  return {
    '--accent': ACCENT_HEX[accent],
    '--accent-tint': ACCENT_TINT[accent],
    '--accent-text': ACCENT_TEXT[accent],
  };
}

export const MODE_LABEL: Record<EventMode, string> = {
  hybrid: 'In the room + online',
  offline: 'In the room only',
  online: 'Online only',
};

export function eventLabel(e: { number: number | null }): string {
  return e.number != null ? `Zemi #${e.number}` : 'Zemi';
}

/** "Zemi #97 · Title", without saying the number twice when the title already has it. */
export function labelAndTitle(e: { number: number | null; title: string }, sep = ' · '): string {
  if (e.number != null && e.title.toLowerCase().includes(`#${e.number}`)) return e.title;
  return `${eventLabel(e)}${sep}${e.title}`;
}

export function whenLine(e: { startsAt: string; endsAt: string }): string {
  return `${formatJakarta(e.startsAt, 'date')}, ${formatTimeRange(e.startsAt, e.endsAt)}`;
}

/** Smallest webp at least `min` px wide (thumbnails for the ribbon preview, JSON-LD, etc). */
export function imageAt(image: ImageRef | null | undefined, min = 320): string | null {
  if (!image) return null;
  const list = [...image.webp].sort((a, b) => a.width - b.width);
  return (list.find((s) => s.width >= min) ?? list[list.length - 1])?.url ?? image.src ?? null;
}

/** Google Maps link for a venue: explicit mapsUrl first, then a search on the address/name. */
export function mapsLink(e: Pick<EventDetail, 'mapsUrl' | 'venueFull'>): string | null {
  if (e.mapsUrl) return e.mapsUrl;
  if (e.venueFull?.mapsUrl) return e.venueFull.mapsUrl;
  const q = e.venueFull?.address || e.venueFull?.name;
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function venueLine(e: Pick<EventDetail, 'venueFull' | 'venue'>): string | null {
  const v = e.venueFull;
  if (!v) return e.venue?.name ?? null;
  const bits = [v.name, v.building, v.floor ? `floor ${v.floor}` : null].filter(Boolean);
  return bits.join(', ');
}

/** The slim shape the Friday ribbon needs (keeps 100+ events light on the wire). */
export interface RibbonEvent {
  slug: string;
  number: number | null;
  title: string;
  startsAt: string;
  status: EventCard['status'];
  accent: Accent;
  cover: string | null;
  color: string | null;
  hasRecording: boolean;
  isLive: boolean;
}

export function toRibbonEvent(e: EventCard): RibbonEvent {
  return {
    slug: e.slug,
    number: e.number,
    title: e.title,
    startsAt: e.startsAt,
    status: e.status,
    accent: e.accent,
    cover: imageAt(e.cover, 320),
    color: e.cover?.color ?? null,
    hasRecording: e.hasRecording,
    isLive: e.isLive,
  };
}

/** Human "in 3 days" / "tomorrow" / "today" for Jakarta calendar days. */
export function relativeDay(startsAt: string, now: Date): string {
  const day = (d: Date | string) => formatJakarta(d, 'iso-date');
  const a = Date.parse(`${day(now)}T00:00:00Z`);
  const b = Date.parse(`${day(startsAt)}T00:00:00Z`);
  const diff = Math.round((b - a) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff >= 7 && diff < 14) return 'Next week';
  if (diff >= 14) return `In ${Math.round(diff / 7)} weeks`;
  if (diff === -1) return 'Yesterday';
  return `${Math.abs(diff)} days ago`;
}

/**
 * The stream's last Go live belongs to this Friday, not a rehearsal or test from days before
 * (an `ended` stream keeps its old `liveStartedAt` until the next Go live).
 */
export function streamWentLiveThisFriday(
  e: Pick<EventDetail, 'startsAt'>,
  liveStartedAt: string | null | undefined,
): boolean {
  if (!liveStartedAt) return false;
  return Date.parse(liveStartedAt) >= Date.parse(e.startsAt) - 3600_000;
}

/** Stream ended recently and no recording is public yet: "the recording is on its way". */
export function recordingPending(
  e: Pick<EventDetail, 'recordings' | 'startsAt' | 'endsAt'>,
  streamState: string | null | undefined,
  liveStartedAt: string | null | undefined,
  now: Date | null,
): boolean {
  if (e.recordings.length > 0) return false;
  if (streamState !== 'ended' || !streamWentLiveThisFriday(e, liveStartedAt)) return false;
  const t = now?.getTime() ?? Date.now();
  // No liveEndedAt in the public payload: treat "ended within a day of the scheduled end" as recent.
  return t - Date.parse(e.endsAt) < 24 * 3600_000;
}

/** Per-event deterministic pseudo random (stable tilt / offsets between server and client). */
export function seeded(seed: string | number, salt = 0): number {
  const s = `${seed}:${salt}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Site URL for canonical links, JSON-LD and share. */
export function siteUrl(path = ''): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3300').replace(/\/+$/, '');
  return `${base}${path}`;
}

/** Link-only ("unlisted") Friday: reachable by URL, kept out of lists, and never indexed. */
export function isUnlisted(e: Pick<EventDetail, 'visibility'>): boolean {
  return e.visibility === 'unlisted';
}

/** Page and share title: "Zemi #97: Title" (the number once, even when the title already has it). */
export function eventTitle(e: { number: number | null; title: string }): string {
  return labelAndTitle(e, ': ');
}

/**
 * Extra class for a `<Chip tone={accent}>`. The shared red chip (red-600 on red-50) is 3.99:1, under
 * AA at chip size, so red chips get a darker red (#b42323, 5.48:1). The other tones pass.
 */
export function chipToneFix(tone: string): string | undefined {
  return tone === 'red' ? 'text-[#b42323]' : undefined;
}
