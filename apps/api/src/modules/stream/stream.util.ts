import { randomBase62 } from '../../common/crypto.js';

/**
 * Pure helpers for the livestream engine (no Nest, no I/O), so they are easy to unit test.
 */

/** Stream keys are the MediaMTX path id: `zm` + 16 base62. */
export const STREAM_KEY_RE = /^zm[0-9A-Za-z]{16}$/;
/** What MediaMTX may send as a path for our live streams (any safe id, we look it up anyway). */
const LIVE_PATH_RE = /^live\/([A-Za-z0-9_-]{1,64})$/;

export const newStreamKey = (): string => `zm${randomBase62(16)}`;
export const newPrivateKey = (): string => randomBase62(32);

/** `live/<key>` -> `<key>`, anything else -> null. */
export function parseLivePath(path: string | null | undefined): string | null {
  const m = LIVE_PATH_RE.exec((path ?? '').replace(/^\/+/, ''));
  return m ? m[1]! : null;
}

/** One value from a raw query string (`key=abc&x=1`), or null. */
export function queryParam(query: string | null | undefined, name: string): string | null {
  if (!query) return null;
  try {
    return new URLSearchParams(query.replace(/^\?/, '')).get(name);
  } catch {
    return null;
  }
}

/** MediaMTX `recordPath: %Y-%m-%d_%H-%M-%S-%f` (container TZ is UTC). */
const SEGMENT_FILENAME_RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{6})\.mp4$/;

export const isSegmentFilename = (name: string): boolean => SEGMENT_FILENAME_RE.test(name);

/** Segment start time from its filename, as UTC. Microseconds are kept to the millisecond. */
export function parseSegmentFilename(name: string): Date | null {
  const m = SEGMENT_FILENAME_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, us] = m.map(Number) as [number, number, number, number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi, s, Math.floor(us / 1000));
  const date = new Date(ms);
  // Reject impossible dates that Date.UTC would silently roll over (2026-02-31).
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  return date;
}

/**
 * Duration in seconds from MediaMTX (`60.0123`), a Go duration (`1m0.012s`, `500ms`), or empty.
 * Returns null when it can't be read (the caller falls back to ffprobe).
 */
export function parseDurationSec(raw: string | null | undefined): number | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const units: Record<string, number> = { h: 3600, m: 60, s: 1, ms: 0.001, us: 1e-6, 'µs': 1e-6, ns: 1e-9 };
  const re = /(\d+(?:\.\d+)?)(h|ms|m|s|us|µs|ns)/g;
  let total = 0;
  let consumed = 0;
  for (const m of v.matchAll(re)) {
    total += Number(m[1]) * units[m[2]!]!;
    consumed += m[0].length;
  }
  return consumed === v.length && total > 0 ? total : null;
}

/* ---------------------------------------------------------------------------------- HLS */

const HLS_SEGMENT_RE = /^[A-Za-z0-9_.-]+$/;

/**
 * The part after `/public/live/:eventId/`. Only plain file names (and at most a couple of
 * sub-folders) with a known extension, no `..`, no empty segments, so a request can never
 * climb out of `live/<streamKey>/` upstream.
 */
export function isSafeHlsPath(rest: string): boolean {
  if (!rest || rest.length > 256) return false;
  const parts = rest.split('/');
  if (parts.length > 3) return false;
  for (const p of parts) {
    if (!p || p === '.' || p === '..' || !HLS_SEGMENT_RE.test(p)) return false;
  }
  return /\.(m3u8|mp4|m4s|ts|aac|vtt)$/i.test(rest);
}

export const isPlaylistPath = (rest: string): boolean => /\.m3u8$/i.test(rest);

export function hlsContentType(rest: string): string {
  const ext = rest.slice(rest.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'm3u8':
      return 'application/vnd.apple.mpegurl';
    case 'mp4':
      return 'video/mp4';
    case 'm4s':
      return 'video/iso.segment';
    case 'ts':
      return 'video/mp2t';
    case 'aac':
      return 'audio/aac';
    case 'vtt':
      return 'text/vtt';
    default:
      return 'application/octet-stream';
  }
}

function withParam(uri: string, name: string, value: string): string {
  // Absolute URIs (another host) are left alone: the token is only for us.
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith('//')) return uri;
  const hash = uri.indexOf('#');
  const base = hash >= 0 ? uri.slice(0, hash) : uri;
  const frag = hash >= 0 ? uri.slice(hash) : '';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${name}=${encodeURIComponent(value)}${frag}`;
}

/**
 * Append `pt=<token>` to every URI in a playlist: bare URI lines (variants, segments) and
 * `URI="..."` attributes (EXT-X-MAP, EXT-X-MEDIA, EXT-X-PART, EXT-X-PRELOAD-HINT, ...).
 */
export function rewritePlaylist(body: string, pt: string): string {
  return body
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]*)"/g, (_m, uri: string) => `URI="${withParam(uri, 'pt', pt)}"`);
      }
      return withParam(trimmed, 'pt', pt) + (line.endsWith('\r') ? '\r' : '');
    })
    .join('\n');
}

/* ------------------------------------------------------------------------------ bitrate */

export interface ByteSample {
  t: number;
  bytes: number;
}

/**
 * Add a sample and keep the last `windowMs` of them. A counter that went backwards (the publisher
 * reconnected) starts a fresh window.
 */
export function pushSample(samples: ByteSample[], sample: ByteSample, windowMs = 20_000): ByteSample[] {
  const last = samples[samples.length - 1];
  if (last && sample.bytes < last.bytes) return [sample];
  const next = [...samples, sample].filter((s) => sample.t - s.t <= windowMs);
  return next.slice(-20);
}

/** kbit/s over the sample window, or null with less than ~1s of data. */
export function bitrateFromSamples(samples: ByteSample[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.9) return null;
  return Math.max(0, Math.round(((last.bytes - first.bytes) * 8) / dt / 1000));
}

/* ----------------------------------------------------------------------------- recording */

export interface SegmentSpan {
  id: string;
  startedAt: Date;
  durationSec: number;
}

export interface CutPlan<T extends SegmentSpan> {
  segment: T;
  /** Seconds into this segment where the kept part starts (0 = from the top). */
  from: number;
  /** Seconds into this segment where the kept part ends (null = to the end). */
  to: number | null;
}

/**
 * Which part of each overlapping segment belongs to `[start, end]`. Each segment is cut on its own
 * (by wall clock inside that segment), so gaps between segments (OBS dropped and came back) never
 * shift the cut points. Pieces shorter than `minSec` at either edge are dropped.
 */
export function planCuts<T extends SegmentSpan>(segments: T[], start: Date, end: Date, minSec = 0.5): Array<CutPlan<T>> {
  const s = start.getTime();
  const e = end.getTime();
  const out: Array<CutPlan<T>> = [];
  const sorted = [...segments].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const starts = alignedStarts(sorted);
  for (const [i, seg] of sorted.entries()) {
    const a = starts[i]!;
    const b = a + seg.durationSec * 1000;
    if (b <= s || a >= e) continue;
    const from = Math.max(0, (s - a) / 1000);
    const toAbs = Math.min(b, e);
    const to = toAbs < b - 1 ? (toAbs - a) / 1000 : null; // within 1ms of the end: keep all of it
    const kept = (to ?? seg.durationSec) - from;
    if (kept < minSec) continue;
    out.push({ segment: seg, from: from < 0.05 ? 0 : from, to });
  }
  return out;
}

/**
 * Start times (ms) to cut by. MediaMTX names the first segment of a publish a couple of seconds
 * late (its start + duration runs past the next segment's start). When a segment overlaps the one
 * after it by less than 10s, the next start is the reliable clock: this one began `duration` earlier.
 * Real gaps (OBS dropped) are left alone.
 */
export function alignedStarts(sorted: SegmentSpan[]): number[] {
  const starts = sorted.map((s) => s.startedAt.getTime());
  for (let i = sorted.length - 2; i >= 0; i--) {
    const end = starts[i]! + sorted[i]!.durationSec * 1000;
    const overlap = end - starts[i + 1]!;
    if (overlap > 250 && overlap < 10_000) starts[i] = starts[i + 1]! - sorted[i]!.durationSec * 1000;
  }
  return starts;
}

/**
 * Holes longer than `tolSec` inside `[start, end]` that no segment covers: OBS dropped for a while,
 * or a segment the media server hasn't managed to upload yet. Uses the same start times as planCuts.
 */
export function coverageGaps(segments: SegmentSpan[], start: Date, end: Date, tolSec = 3): Array<{ from: Date; to: Date }> {
  const s = start.getTime();
  const e = end.getTime();
  const tol = tolSec * 1000;
  const sorted = [...segments].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const starts = alignedStarts(sorted);
  const gaps: Array<{ from: Date; to: Date }> = [];
  let cursor = s;
  for (const [i, seg] of sorted.entries()) {
    const a = starts[i]!;
    const b = a + seg.durationSec * 1000;
    if (b <= cursor) continue;
    if (a >= e) break;
    if (a - cursor > tol) gaps.push({ from: new Date(cursor), to: new Date(a) });
    cursor = Math.max(cursor, b);
  }
  if (e - cursor > tol) gaps.push({ from: new Date(cursor), to: new Date(e) });
  return gaps;
}

/** Seconds of video a set of cuts keeps. */
export function keptSeconds(plans: Array<CutPlan<SegmentSpan>>): number {
  return plans.reduce((sum, p) => sum + ((p.to ?? p.segment.durationSec) - p.from), 0);
}

/** True once some segment reaches `end` (with a little slack for keyframe rounding). */
export function segmentsCover(segments: SegmentSpan[], end: Date, slackSec = 1): boolean {
  const e = end.getTime() - slackSec * 1000;
  return segments.some((seg) => seg.startedAt.getTime() + seg.durationSec * 1000 >= e);
}

/** Wait before re-checking a recording that isn't complete yet: 10s, 15s, 20s, 30s... */
export function finalizeBackoffSec(attempt: number): number {
  return [10, 15, 20, 30][Math.min(attempt, 3)]!;
}
