import type {
  EventAdmin,
  RecordingStatus,
  StreamConfig,
  StreamSessionAdmin,
  StreamState,
  StreamStatusSnapshot,
} from '@zemi/shared';
import type { QueryClient } from '@tanstack/react-query';
import { adminKeys } from '@/lib/admin/query-keys';
import { eventDetailKey } from '../events/use-event';

/**
 * Pure helpers for the stream control room (no React). Query keys live under the event detail
 * key, so invalidating the event also refreshes the control room.
 */

export const streamKeys = {
  config: (id: string) => adminKeys.events.part(id, 'stream'),
  health: (id: string) => adminKeys.events.part(id, 'stream-health'),
  recordings: (id: string) => adminKeys.events.part(id, 'recordings'),
};

/** What the header shows. `lost` is live with OBS gone (viewers see the "hang tight" slate). */
export type RoomState = 'idle' | 'preview' | 'live' | 'lost' | 'ended';

export function roomState(s: Pick<StreamStatusSnapshot, 'state' | 'ingestOnline'>): RoomState {
  if (s.state === 'live') return s.ingestOnline ? 'live' : 'lost';
  if (s.state === 'ended') return 'ended';
  // Preview without signal happens for a beat after a rotate; treat it as waiting.
  if (s.state === 'preview') return s.ingestOnline ? 'preview' : 'idle';
  return s.ingestOnline ? 'preview' : 'idle';
}

/** Go live is allowed whenever OBS is connected and we are not live already (after "ended" too). */
export function canGoLive(s: Pick<StreamStatusSnapshot, 'state' | 'ingestOnline'>): boolean {
  return s.state !== 'live' && s.ingestOnline;
}

/** Merge a pushed snapshot into the cached config, keeping the OBS keys. */
export function mergeSnapshot(prev: StreamConfig | undefined, snap: StreamStatusSnapshot): StreamConfig | undefined {
  if (!prev) return prev;
  return { ...prev, ...snap, obs: prev.obs };
}

/** Keep the workspace header, banner and tab dot in step with the stream (no refetch). */
export function patchEventStream(qc: QueryClient, eventId: string, snap: Partial<StreamStatusSnapshot>) {
  const key = eventDetailKey(eventId);
  const prev = qc.getQueryData<EventAdmin>(key);
  if (!prev) return;
  const state: StreamState = snap.state ?? prev.stream.state;
  const next: EventAdmin = {
    ...prev,
    isLive: state === 'live',
    stream: {
      ...prev.stream,
      state,
      ingestOnline: snap.ingestOnline ?? prev.stream.ingestOnline,
      liveStartedAt: snap.liveStartedAt !== undefined ? snap.liveStartedAt : prev.stream.liveStartedAt,
      viewers: snap.viewers ?? prev.stream.viewers,
    },
  };
  if (
    next.stream.state === prev.stream.state &&
    next.stream.ingestOnline === prev.stream.ingestOnline &&
    next.stream.liveStartedAt === prev.stream.liveStartedAt &&
    next.stream.viewers === prev.stream.viewers
  ) {
    return;
  }
  qc.setQueryData(key, next);
}

/** Upsert one recording into the cached list (newest first). */
export function upsertRecording(list: StreamSessionAdmin[] | undefined, s: StreamSessionAdmin): StreamSessionAdmin[] | undefined {
  if (!list) return list;
  let found = false;
  const next = list.map((r) => {
    if (r.id === s.id) {
      found = true;
      return s;
    }
    // One primary per event: the server flips the others off, mirror that here.
    return s.isPrimary && r.isPrimary ? { ...r, isPrimary: false } : r;
  });
  if (!found) next.push(s);
  return next.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/* ------------------------------------------------------------------ recording status */

export const RECORDING_BUSY: readonly RecordingStatus[] = ['recording', 'waiting', 'processing'];
export const isRecordingBusy = (s: RecordingStatus) => RECORDING_BUSY.includes(s);

export interface RecordingStatusMeta {
  label: string;
  /** Plain words for the row under the title. */
  hint: string;
  cls: string;
  glyph: 'live' | 'spin' | 'dots' | 'check' | 'triangle' | 'dash';
}

export const RECORDING_STATUS: Record<RecordingStatus, RecordingStatusMeta> = {
  recording: {
    label: 'Recording',
    hint: 'Rolling. Every minute of the stream lands here.',
    cls: 'bg-red text-white',
    glyph: 'live',
  },
  waiting: {
    label: 'Waiting',
    hint: 'Collecting the last minute from the media server.',
    cls: 'bg-yellow-50 text-[#7a5600]',
    glyph: 'dots',
  },
  processing: {
    label: 'Processing',
    hint: 'Stitching the pieces into one video. Usually a minute or two.',
    cls: 'bg-blue-50 text-blue-600',
    glyph: 'spin',
  },
  ready: {
    label: 'Ready',
    hint: 'Good to watch.',
    cls: 'bg-green-50 text-green-600',
    glyph: 'check',
  },
  failed: {
    label: 'Failed',
    hint: 'Something broke while stitching. Try reprocessing.',
    cls: 'bg-red-50 text-red-600',
    glyph: 'triangle',
  },
  none: {
    label: 'No recording',
    hint: 'Nothing was recorded for this session.',
    cls: 'bg-surface-muted text-ink-3',
    glyph: 'dash',
  },
};

/** Where a recording is in the pipeline (for the little stepper). */
export const PIPELINE: Array<{ status: RecordingStatus; label: string }> = [
  { status: 'recording', label: 'Recording' },
  { status: 'waiting', label: 'Last bits' },
  { status: 'processing', label: 'Stitching' },
  { status: 'ready', label: 'Ready' },
];

export function pipelineIndex(s: RecordingStatus): number {
  const i = PIPELINE.findIndex((p) => p.status === s);
  return i < 0 ? -1 : i;
}

/* ------------------------------------------------------------------ numbers */

/** 00:42:13 from seconds. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(r)}`;
}

export function secondsSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0;
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
}

/** "H264", "MPEG-4 Audio" to friendlier labels. */
export function codecLabel(codec: string | null | undefined): string {
  if (!codec) return 'Unknown';
  const c = codec.toLowerCase();
  if (c.startsWith('h264') || c.includes('avc')) return 'H.264';
  if (c.startsWith('h265') || c.startsWith('hevc')) return 'H.265';
  if (c.startsWith('av1')) return 'AV1';
  if (c.startsWith('vp9')) return 'VP9';
  if (c.startsWith('vp8')) return 'VP8';
  if (c.includes('mpeg-4 audio') || c.includes('mpeg4-audio') || c === 'aac') return 'AAC';
  if (c.startsWith('opus')) return 'Opus';
  return codec;
}

export type BitrateVerdict = 'none' | 'low' | 'ok' | 'high';

/** Rough verdict against our recommended 2500 to 4500 kbps. */
export function bitrateVerdict(kbps: number | null | undefined, height: number | null | undefined): BitrateVerdict {
  if (kbps == null || kbps <= 0) return 'none';
  const floor = (height ?? 1080) >= 1000 ? 2500 : 1500;
  if (kbps < floor * 0.6) return 'low';
  if (kbps > 8000) return 'high';
  return 'ok';
}

/** Replace (or add) the `pt` query param of an HLS URL. */
export function withPreviewToken(url: string, token: string): string {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    u.searchParams.set('pt', token);
    return u.toString();
  } catch {
    return url;
  }
}
