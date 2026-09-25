import type { RecordingChapter, VideoRef } from '@zemi/shared';

/* Pure helpers for the player: time formatting, chapters and storyboard tile math. Server-safe. */

export type Storyboard = NonNullable<VideoRef['storyboard']>;

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Clock text for a position, formatted to the same width as `reference` (usually the duration),
 * so rolling digits keep their slots: 3:07 of 9:59, 03:07 of 12:00, 0:03:07 of 1:02:00.
 */
export function formatClock(sec: number, reference = sec): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const ref = Math.max(s, Math.floor(Number.isFinite(reference) ? reference : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (ref >= 3600) return `${h}:${pad2(m)}:${pad2(r)}`;
  const mm = ref >= 600 ? pad2(m + h * 60) : String(m + h * 60);
  return `${mm}:${pad2(r)}`;
}

/** "1 hour 2 minutes 5 seconds" for screen readers. */
export function spokenTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  if (r || parts.length === 0) parts.push(`${r} ${r === 1 ? 'second' : 'seconds'}`);
  return parts.join(' ');
}

export interface ChapterSpan {
  title: string;
  start: number;
  end: number;
  index: number;
}

/**
 * Sorted, de-duplicated chapters clipped to the duration, each with its end time.
 * A first chapter that starts late gets an implicit "Intro" span so every second belongs to one.
 */
export function chapterSpans(chapters: RecordingChapter[] | null | undefined, duration: number): ChapterSpan[] {
  if (!chapters?.length || !Number.isFinite(duration) || duration <= 0) return [];
  const sorted = chapters
    .filter((c) => c && typeof c.startSec === 'number' && c.startSec >= 0 && c.startSec < duration - 1)
    .map((c) => ({ title: (c.title ?? '').trim() || 'Untitled bit', start: c.startSec }))
    .sort((a, b) => a.start - b.start)
    .filter((c, i, arr) => i === 0 || c.start - arr[i - 1]!.start >= 1);
  if (!sorted.length) return [];
  if (sorted[0]!.start > 1) sorted.unshift({ title: 'Intro', start: 0 });
  else sorted[0]!.start = 0;
  return sorted.map((c, i) => ({ ...c, end: sorted[i + 1]?.start ?? duration, index: i }));
}

export function chapterAt(spans: ChapterSpan[], t: number): ChapterSpan | null {
  if (!spans.length) return null;
  for (let i = spans.length - 1; i >= 0; i--) if (t >= spans[i]!.start) return spans[i]!;
  return spans[0]!;
}

export interface StoryboardTile {
  url: string;
  /** Background position and size in px for a tile drawn at `scale`. */
  x: number;
  y: number;
  width: number;
  height: number;
  sheetWidth: number;
  sheetHeight: number;
}

/**
 * Which sprite tile shows time `t`. Thumbs are taken every `interval` seconds, laid out
 * left to right in `columns`, top to bottom. `scale` sizes the drawn tile.
 */
export function storyboardTile(sb: Storyboard | null | undefined, t: number, scale = 1): StoryboardTile | null {
  if (!sb || !sb.url || sb.count <= 0 || sb.columns <= 0 || sb.interval <= 0) return null;
  const index = Math.min(sb.count - 1, Math.max(0, Math.floor(t / sb.interval)));
  const col = index % sb.columns;
  const row = Math.floor(index / sb.columns);
  const rows = Math.ceil(sb.count / sb.columns);
  const w = sb.tileWidth * scale;
  const h = sb.tileHeight * scale;
  return {
    url: sb.url,
    x: -col * w,
    y: -row * h,
    width: w,
    height: h,
    sheetWidth: Math.min(sb.columns, sb.count) * w,
    sheetHeight: rows * h,
  };
}

/** Stable localStorage key for a source (query strings like signed tokens are dropped). */
export function sourceKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, 'http://local');
    return `${u.host}${u.pathname}`;
  } catch {
    return url.split('?')[0] ?? null;
  }
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const speedLabel = (r: number) => (r === 1 ? 'Normal' : `${r}x`);
