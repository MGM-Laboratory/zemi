import { z } from 'zod';
import type { StreamState } from '../status.js';
import type { VideoRef } from './common.js';

export interface StreamConfig {
  eventId: string;
  state: StreamState;
  ingestOnline: boolean;
  ingestOnlineAt: string | null;
  liveStartedAt: string | null;
  liveEndedAt: string | null;
  /**
   * OBS server and keys. Only for principals with `stream.control` on the event (the keys let anyone
   * take over the live feed). Null for `stream.view`, which still gets state, health and preview.
   */
  obs: {
    server: string; // rtmp://host:port/live
    streamKey: string; // path id
    privateKey: string;
    obsStreamKey: string; // `${streamKey}?key=${privateKey}` paste into OBS "Stream Key"
  } | null;
  viewers: number;
  peakViewers: number;
  currentSessionId: string | null;
}

export interface StreamHealth {
  online: boolean;
  since: string | null;
  bitrateKbps: number | null;
  video: { codec: string; width: number | null; height: number | null } | null;
  audio: { codec: string; sampleRate: number | null; channels: number | null } | null;
  bytesReceived: number;
  readers: number;
}

export type RecordingStatus = 'recording' | 'waiting' | 'processing' | 'ready' | 'failed' | 'none';

export interface StreamSessionAdmin {
  id: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  recordingStatus: RecordingStatus;
  visibility: 'public' | 'hidden';
  isPrimary: boolean;
  peakViewers: number;
  error: string | null;
  video: VideoRef | null;
  durationSec: number | null;
  sizeBytes: number | null;
}

export const recordingUpdateInput = z.object({
  title: z.string().max(200).optional().nullable(),
  visibility: z.enum(['public', 'hidden']).optional(),
  isPrimary: z.boolean().optional(),
});

export const attachRecordingInput = z.object({
  assetId: z.uuid(),
  title: z.string().max(200).optional().nullable(),
});

export const heartbeatInput = z.object({ viewerId: z.string().min(8).max(64) });
export const reactionInput = z.object({ kind: z.enum(['clap', 'heart', 'fire', 'idea', 'laugh']) });

/** MediaMTX authHTTP payload. */
export const mediaAuthPayload = z.object({
  user: z.string().optional().default(''),
  password: z.string().optional().default(''),
  token: z.string().optional().default(''),
  ip: z.string().optional().default(''),
  action: z.string(),
  path: z.string().optional().default(''),
  protocol: z.string().optional().default(''),
  id: z.string().optional().nullable(),
  query: z.string().optional().default(''),
});
export type MediaAuthPayload = z.infer<typeof mediaAuthPayload>;

export const mediaPathHook = z.object({
  path: z.string(),
  query: z.string().optional().default(''),
  sourceType: z.string().optional().default(''),
  sourceId: z.string().optional().default(''),
});

/** GET /admin/events/:id/stream/preview-token */
export interface StreamPreviewToken {
  token: string;
  expiresAt: string;
  /** Absolute HLS URL with `?pt=` already appended (plays in preview and live). */
  hlsUrl: string;
}

/** Stream state without the OBS keys (what the admin SSE pushes). */
export type StreamStatusSnapshot = Omit<StreamConfig, 'obs'>;

/**
 * Admin SSE on GET /admin/events/:id/stream/events (channel `event:<id>:stream`).
 * `state` on every change, `health` every few seconds while someone watches, `viewers` every 5s
 * while live, `recording` when a session's recording status changes, `keys-rotated` after a rotate
 * (refetch GET /admin/events/:id/stream for the new keys).
 */
export type StreamAdminEvent =
  | { type: 'state'; stream: StreamStatusSnapshot }
  | { type: 'health'; health: StreamHealth }
  | { type: 'viewers'; viewers: number; peakViewers: number }
  | { type: 'recording'; session: StreamSessionAdmin }
  | { type: 'recording-removed'; sessionId: string }
  | { type: 'keys-rotated'; at: string; streamKeyChanged: boolean }
  | { type: 'ping'; t: string };
