'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StreamAdminEvent,
  StreamConfig,
  StreamHealth,
  StreamSessionAdmin,
} from '@zemi/shared';
import { useEffect, useRef, useState } from 'react';
import { notify } from '@/components/admin/ui/toast';
import { adminFetch, api, apiPath, isApiError } from '@/lib/admin/api';
import { useAdminMutation } from '@/lib/admin/hooks';
import { eventDetailKey, eventListKeys } from '../events/use-event';
import { isRecordingBusy, mergeSnapshot, patchEventStream, streamKeys, upsertRecording } from './lib';

/* ------------------------------------------------------------------ queries */

/** GET /admin/events/:id/stream (creates the keys on first call). */
export function useStreamConfig(eventId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: streamKeys.config(eventId),
    queryFn: ({ signal }) => adminFetch<StreamConfig>(`/admin/events/${eventId}/stream`, { signal }),
    // SSE keeps it fresh; this is only a safety net for a dropped connection.
    refetchInterval: 60_000,
    staleTime: 10_000,
  });
  const data = query.data;
  useEffect(() => {
    if (data) patchEventStream(qc, eventId, data);
  }, [data, eventId, qc]);
  return query;
}

export interface HealthSample {
  t: number;
  kbps: number;
}

const HEALTH_POINTS = 40;

/** GET /admin/events/:id/stream/health every 3 s, plus a short client-side bitrate history. */
export function useStreamHealth(eventId: string, opts: { enabled?: boolean; online?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const query = useQuery({
    queryKey: streamKeys.health(eventId),
    queryFn: ({ signal }) => adminFetch<StreamHealth>(`/admin/events/${eventId}/stream/health`, { signal }),
    enabled,
    refetchInterval: (q) => (q.state.status === 'error' && isApiError(q.state.error) && q.state.error.isForbidden ? false : 3000),
    refetchIntervalInBackground: false,
    retry: false,
  });
  const [history, setHistory] = useState<HealthSample[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const data = query.data;
  const updatedAt = query.dataUpdatedAt;
  // New sample: extend the history during render (React's "adjust state on prop change" pattern).
  if (data && updatedAt !== seenAt) {
    setSeenAt(updatedAt);
    if (!data.online) {
      if (history.length) setHistory([]);
    } else {
      setHistory([...history, { t: updatedAt, kbps: data.bitrateKbps ?? 0 }].slice(-HEALTH_POINTS));
    }
  }
  return { ...query, history };
}

/** GET /admin/events/:id/recordings. Polls while anything is still recording or processing. */
export function useRecordings(eventId: string) {
  return useQuery({
    queryKey: streamKeys.recordings(eventId),
    queryFn: ({ signal }) => adminFetch<StreamSessionAdmin[]>(`/admin/events/${eventId}/recordings`, { signal }),
    refetchInterval: (q) => (q.state.data?.some((r) => isRecordingBusy(r.recordingStatus)) ? 4000 : false),
  });
}

/* ------------------------------------------------------------------ SSE */

export type SseStatus = 'connecting' | 'open' | 'reconnecting' | 'forbidden';

/**
 * Admin stream SSE (`GET /admin/events/:id/stream/events`, same origin, cookie auth).
 * Writes straight into the React Query cache: state and viewers into the stream config (and the
 * workspace event), recordings into the recordings list. Health messages are ignored, the panel
 * polls on its own. Reconnect logic mirrors the attendance stream.
 */
export function useStreamEvents(eventId: string, opts: { onKeysRotated?: (streamKeyChanged: boolean) => void } = {}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<SseStatus>('connecting');
  const onKeysRotated = useRef(opts.onKeysRotated);
  useEffect(() => {
    onKeysRotated.current = opts.onKeysRotated;
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;
    const url = apiPath(`/admin/events/${eventId}/stream/events`);
    const configKey = streamKeys.config(eventId);
    const recKey = streamKeys.recordings(eventId);

    const handle = (raw: string) => {
      let msg: StreamAdminEvent;
      try {
        msg = JSON.parse(raw) as StreamAdminEvent;
      } catch {
        return;
      }
      attempt = 0;
      switch (msg.type) {
        case 'state': {
          const prev = qc.getQueryData<StreamConfig>(configKey);
          const wasState = prev?.state;
          qc.setQueryData<StreamConfig>(configKey, (p) => mergeSnapshot(p, msg.stream));
          patchEventStream(qc, eventId, msg.stream);
          // A state flip changes lists, the overview and the public site badge.
          if (wasState && wasState !== msg.stream.state) {
            for (const key of eventListKeys()) void qc.invalidateQueries({ queryKey: key });
          }
          // Go live (from any tab or device) starts a session; End moves it to "waiting".
          if (
            (wasState && wasState !== msg.stream.state && (msg.stream.state === 'live' || wasState === 'live')) ||
            (prev && prev.currentSessionId !== msg.stream.currentSessionId)
          ) {
            void qc.invalidateQueries({ queryKey: recKey });
          }
          break;
        }
        case 'viewers':
          qc.setQueryData<StreamConfig>(configKey, (p) => (p ? { ...p, viewers: msg.viewers, peakViewers: msg.peakViewers } : p));
          patchEventStream(qc, eventId, { viewers: msg.viewers });
          break;
        case 'recording':
          qc.setQueryData<StreamSessionAdmin[]>(recKey, (list) => upsertRecording(list, msg.session));
          if (!qc.getQueryData(recKey)) void qc.invalidateQueries({ queryKey: recKey });
          break;
        case 'recording-removed':
          qc.setQueryData<StreamSessionAdmin[]>(recKey, (list) => list?.filter((r) => r.id !== msg.sessionId));
          break;
        case 'keys-rotated':
          void qc.invalidateQueries({ queryKey: configKey });
          onKeysRotated.current?.(msg.streamKeyChanged);
          break;
        default:
          break;
      }
    };

    const connect = () => {
      if (disposed) return;
      es = new EventSource(url, { withCredentials: true });
      es.onopen = () => {
        if (disposed) return;
        setStatus('open');
        // Anything we missed while disconnected.
        if (attempt > 0) {
          void qc.invalidateQueries({ queryKey: configKey });
          void qc.invalidateQueries({ queryKey: recKey });
        }
      };
      es.onmessage = (e) => {
        setStatus('open');
        handle(e.data as string);
      };
      es.onerror = () => {
        if (disposed || !es) return;
        if (es.readyState === EventSource.CONNECTING) {
          setStatus('reconnecting');
          attempt += 1;
          return;
        }
        es.close();
        es = null;
        setStatus('reconnecting');
        void adminFetch(`/admin/events/${eventId}/stream`)
          .then(() => schedule())
          .catch((err) => {
            if (disposed) return;
            if (isApiError(err) && (err.status === 403 || err.status === 404)) {
              setStatus('forbidden');
              return;
            }
            schedule();
          });
      };
    };

    const schedule = () => {
      if (disposed) return;
      attempt += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      retryTimer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      es = null;
    };
  }, [eventId, qc]);

  return status;
}

/* ------------------------------------------------------------------ mutations */

/** Go live, end, rotate. Each returns the fresh StreamConfig, written straight into the cache. */
export function useStreamActions(eventId: string) {
  const qc = useQueryClient();
  const accept = (cfg: StreamConfig) => {
    qc.setQueryData(streamKeys.config(eventId), cfg);
    patchEventStream(qc, eventId, cfg);
  };
  const refreshAfterError = () => void qc.invalidateQueries({ queryKey: streamKeys.config(eventId) });
  const invalidate = [eventDetailKey(eventId), ...eventListKeys()];

  const goLive = useAdminMutation({
    mutationFn: () => api.post<StreamConfig>(`/admin/events/${eventId}/stream/live`),
    onSuccess: (cfg) => {
      accept(cfg);
      void qc.invalidateQueries({ queryKey: streamKeys.recordings(eventId) });
    },
    invalidate,
    successMessage: "You're live. Wave at the camera.",
    celebrate: true,
    onError: refreshAfterError,
  });

  const end = useAdminMutation({
    mutationFn: () => api.post<StreamConfig>(`/admin/events/${eventId}/stream/end`),
    onSuccess: (cfg) => {
      accept(cfg);
      void qc.invalidateQueries({ queryKey: streamKeys.recordings(eventId) });
    },
    invalidate,
    successMessage: 'Stream ended. We are stitching the recording now.',
    onError: refreshAfterError,
  });

  const rotate = useAdminMutation({
    mutationFn: () => api.post<StreamConfig>(`/admin/events/${eventId}/stream/rotate`),
    onSuccess: (cfg) => accept(cfg),
    successMessage: 'Fresh keys. Paste the new stream key into OBS.',
    onError: refreshAfterError,
  });

  return { goLive, end, rotate };
}

/** Title, visibility, primary, reprocess, delete, attach. */
export function useRecordingActions(eventId: string) {
  const qc = useQueryClient();
  const key = streamKeys.recordings(eventId);
  const put = (s: StreamSessionAdmin) => qc.setQueryData<StreamSessionAdmin[]>(key, (list) => upsertRecording(list, s));
  const invalidate = [key, eventDetailKey(eventId)];

  const update = useAdminMutation({
    mutationFn: (v: { id: string; patch: { title?: string | null; visibility?: 'public' | 'hidden'; isPrimary?: boolean } }) =>
      api.patch<StreamSessionAdmin>(`/admin/recordings/${v.id}`, v.patch),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<StreamSessionAdmin[]>(key);
      const cur = prev?.find((r) => r.id === v.id);
      if (cur) put({ ...cur, ...v.patch, title: v.patch.title !== undefined ? v.patch.title : cur.title });
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (s) => put(s),
    invalidate,
    successMessage: (_s, v) =>
      v.patch.isPrimary
        ? 'That one plays first on the event page now.'
        : v.patch.visibility === 'hidden'
          ? 'Hidden from the event page.'
          : v.patch.visibility === 'public'
            ? 'Visible on the event page.'
            : 'Saved.',
  });

  const reprocess = useAdminMutation({
    mutationFn: (id: string) => api.post<StreamSessionAdmin>(`/admin/recordings/${id}/reprocess`),
    onSuccess: (s) => put(s),
    invalidate: [key],
    successMessage: 'Rebuilding it. Grab a coffee.',
  });

  const remove = useAdminMutation({
    mutationFn: (id: string) => api.delete(`/admin/recordings/${id}`),
    onSuccess: (_d, id) => qc.setQueryData<StreamSessionAdmin[]>(key, (list) => list?.filter((r) => r.id !== id)),
    invalidate,
    successMessage: 'Recording deleted.',
  });

  const attach = useAdminMutation({
    mutationFn: (v: { assetId: string; title: string | null }) =>
      api.post<StreamSessionAdmin>(`/admin/events/${eventId}/recordings`, v),
    onSuccess: (s) => put(s),
    invalidate,
    successMessage: (s) =>
      s.recordingStatus === 'ready' ? 'Recording attached. It is on the event page.' : 'Attached. It shows up on the event page once it finishes processing.',
    celebrate: true,
  });

  return { update, reprocess, remove, attach };
}

/** Toast when someone else rotated the keys while this page was open. */
export function keysRotatedToast(streamKeyChanged: boolean) {
  notify.info(
    streamKeyChanged
      ? 'The stream keys were rotated. Copy the new key into OBS.'
      : 'The private key was rotated. Paste the new key into OBS to reconnect.',
  );
}
