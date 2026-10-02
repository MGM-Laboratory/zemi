import { jakartaParts, type Blocks, type ImageRef } from '@zemi/shared';

export interface Identity { id: string; name: string; tag: string; label: string }
export interface EventOption { id: string; slug: string; title: string; number: number | null; startsAt: string; endsAt: string; summary?: string | null; speakers?: string[]; lineup?: DiscussionSpeaker[]; accent?: string; featured?: boolean; current?: boolean; cover?: EventCover | null }
/** A speaker on an event's lineup: who a question can be addressed to. */
export interface DiscussionSpeaker {
  id: string; slug: string; fullName: string; nickname: string | null; headline: string | null;
  avatar: ImageRef | null; role: string; organization: string | null; position: string | null; talkTitle: string | null;
  /** Their rundown slot, Jakarta wall clock ("13:30"). */
  slot: { time: string; endTime: string | null; agenda: string } | null;
}
/** The event cover as the API sends it (an ImageRef). Thumbnails use the smallest variant, see `coverThumb`. */
export interface EventCover { src: string; alt: string | null; width: number; height: number; webp?: Array<{ width: number; url: string }>; avif?: Array<{ width: number; url: string }> }
export interface Thread {
  id: string; author: string; authorId: string | null; mine: boolean; title: string; body: Blocks; excerpt: string;
  tags: string[]; status: string; pinned: boolean; score: number; myVote: number; myReactions: string[];
  commentCount: number; acceptedCommentId: string | null; event: EventOption | null; speaker: DiscussionSpeaker | null; featured: boolean;
  createdAt: string; updatedAt: string;
}
export interface Reply { id: string; parentId: string | null; author: string; authorId: string | null; mine: boolean; body: string; status: string; score: number; myVote: number; createdAt: string }
export interface ThreadDetail extends Thread { comments: Reply[] }
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

/**
 * The smallest stored variant that still looks sharp at `px` CSS pixels (2x screens), instead of
 * the 1600px original: a feed of 15 cards would otherwise download and decode 15 full covers.
 */
export function coverThumb(cover: EventCover, px = 80): string {
  const list = [...(cover.webp ?? [])].sort((a, b) => a.width - b.width);
  return (list.find(v => v.width >= px * 2) ?? list[list.length - 1])?.url ?? cover.src;
}

export async function discussionRequest<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/public/discussion${path}`, {
    method, credentials: 'same-origin', cache: 'no-store', signal,
    headers: { accept: 'application/json', ...(method !== 'GET' ? { 'x-zemi-csrf': '1' } : {}), ...(data !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw Object.assign(new Error(json?.error?.message || `Request failed (${response.status}).`), { status: response.status });
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function uploadDiscussionImage(file: File, challenge: string): Promise<string> {
  const data = new FormData();
  data.append('file', file);
  data.append('challenge', challenge);
  const response = await fetch('/api/v1/public/discussion/images', { method: 'POST', credentials: 'same-origin', headers: { 'x-zemi-csrf': '1' }, body: data });
  if (!response.ok) {
    const json = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message || 'The image could not be uploaded.');
  }
  return (await response.json() as { url: string }).url;
}

export const ROLE_LABEL: Record<string, string> = { speaker: 'Speaker', keynote: 'Keynote', moderator: 'Moderator', panelist: 'Panelist' };

/** "13:30 to 14:00" (or just the start). */
export function slotLabel(slot: DiscussionSpeaker['slot']): string | null {
  if (!slot) return null;
  return slot.endTime ? `${slot.time} to ${slot.endTime}` : slot.time;
}

const minutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
};

/**
 * Where a speaker is on the day, from their rundown slot and the Jakarta clock: on stage now, up
 * next (their slot starts within the hour), done, or unknown. Only meaningful on the event's day.
 */
export function speakerTiming(speaker: DiscussionSpeaker, event: Pick<EventOption, 'startsAt' | 'endsAt'>, now: Date | null): 'now' | 'next' | 'done' | null {
  if (!now || !speaker.slot) return null;
  const start = Date.parse(event.startsAt), end = Date.parse(event.endsAt);
  const day = jakartaParts(start), today = jakartaParts(now);
  if (day.year !== today.year || day.month !== today.month || day.day !== today.day) return null;
  if (now.getTime() > end + 30 * 60_000) return 'done';
  const t = today.hour * 60 + today.minute;
  const a = minutes(speaker.slot.time);
  const b = speaker.slot.endTime ? minutes(speaker.slot.endTime) : a + 30;
  if (Number.isNaN(a)) return null;
  if (t >= a && t < b) return 'now';
  if (t < a && a - t <= 60) return 'next';
  return t >= b ? 'done' : null;
}
