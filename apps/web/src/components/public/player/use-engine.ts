'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type HlsType from 'hls.js';
import type { ErrorData, Level, LevelSwitchedData, ManifestParsedData } from 'hls.js';
import type { PlayerError, PlayerSources, QualityLevel } from './types';

export type EngineKind = 'hls.js' | 'native-hls' | 'file' | 'none';

export interface EngineState {
  kind: EngineKind;
  /** Quality levels, highest first (hls.js only). */
  levels: QualityLevel[];
  /** Selected level index, -1 = auto. */
  level: number;
  /** Level actually playing (useful to label "Auto (720p)"). */
  playingLevel: number;
  error: PlayerError | null;
  /** Live: a load failed and the engine is retrying quietly. */
  reconnecting: boolean;
}

interface Candidate {
  type: 'hls' | 'file';
  url: string;
}

interface Options {
  sources: PlayerSources;
  live: boolean;
  /** False detaches the media (live with ingest offline). */
  enabled: boolean;
}

const INITIAL: EngineState = { kind: 'none', levels: [], level: -1, playingLevel: -1, error: null, reconnecting: false };

const WEBM_TYPE = 'video/webm; codecs="vp9, opus"';

function buildCandidates(sources: PlayerSources, video: HTMLVideoElement | null): Candidate[] {
  const list: Candidate[] = [];
  if (sources.hls) list.push({ type: 'hls', url: sources.hls });
  const webmFirst = !!sources.webm && video?.canPlayType(WEBM_TYPE) === 'probably';
  if (webmFirst) list.push({ type: 'file', url: sources.webm! });
  if (sources.mp4) list.push({ type: 'file', url: sources.mp4 });
  if (sources.webm && !webmFirst && video?.canPlayType('video/webm')) list.push({ type: 'file', url: sources.webm });
  return list;
}

function levelLabel(l: Level, dupHeight: boolean): string {
  const kbps = Math.round((l.bitrate || 0) / 1000);
  if (!l.height) return `${kbps} kbps`;
  return dupHeight ? `${l.height}p · ${kbps} kbps` : `${l.height}p`;
}

function mapLevels(levels: Level[]): QualityLevel[] {
  const counts = new Map<number, number>();
  for (const l of levels) counts.set(l.height, (counts.get(l.height) ?? 0) + 1);
  return levels
    .map((l, index) => ({ index, height: l.height || 0, bitrate: l.bitrate || 0, label: levelLabel(l, (counts.get(l.height) ?? 0) > 1) }))
    .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
}

function mediaErrorCode(err: MediaError | null): PlayerError {
  switch (err?.code) {
    case 2:
      return { code: 'network', detail: err.message };
    case 3:
      return { code: 'media', detail: err.message };
    case 4:
      return { code: 'unsupported', detail: err.message };
    default:
      return { code: 'unknown', detail: err?.message };
  }
}

function detach(video: HTMLVideoElement) {
  if (!video.getAttribute('src') && !video.currentSrc) return;
  video.removeAttribute('src');
  try {
    video.load();
  } catch {
    /* ignore */
  }
}

/**
 * Attaches the best source to the <video>: hls.js when supported, native HLS (Safari) when not,
 * then MP4/WebM files. Falls through candidates on fatal errors (VOD), retries quietly with
 * backoff (live), carries the playhead across retries, and exposes quality levels.
 */
export function useEngine(videoRef: RefObject<HTMLVideoElement | null>, { sources, live, enabled }: Options) {
  const srcKey = `${sources.hls ?? ''}|${sources.mp4 ?? ''}|${sources.webm ?? ''}`;
  const [cursor, setCursor] = useState({ key: srcKey, candidate: 0, attempt: 0 });
  const candidateIndex = cursor.key === srcKey ? cursor.candidate : 0;
  const attempt = cursor.key === srcKey ? cursor.attempt : 0;
  const [state, setState] = useState<EngineState>(INITIAL);

  const hlsRef = useRef<HlsType | null>(null);
  const carry = useRef<{ key: string; t: number; playing: boolean } | null>(null);
  const liveRetries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(
    (next: { candidate?: number; resetCandidate?: boolean }) =>
      setCursor((c) => {
        const base = c.key === srcKey ? c : { key: srcKey, candidate: 0, attempt: 0 };
        return {
          key: srcKey,
          candidate: next.resetCandidate ? 0 : (next.candidate ?? base.candidate),
          attempt: base.attempt + 1,
        };
      }),
    [srcKey],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    if (!enabled) {
      detach(video);
      setState((s) => ({ ...INITIAL, reconnecting: s.reconnecting && live }));
      return;
    }

    const candidates = buildCandidates(sources, video);
    const c = candidates[candidateIndex];
    if (!c) {
      setState({ ...INITIAL, error: { code: 'unsupported', detail: candidates.length ? 'All sources failed' : 'No source' } });
      return;
    }

    let disposed = false;
    let hls: HlsType | null = null;
    let networkRecoveries = 0;
    let mediaRecoveries = 0;

    const scheduleLiveRetry = () => {
      if (disposed) return;
      liveRetries.current += 1;
      const delay = Math.min(8000, 1000 * 2 ** Math.min(liveRetries.current - 1, 3));
      setState((s) => ({ ...s, reconnecting: true }));
      retryTimer.current = setTimeout(() => bump({}), delay);
    };

    const fail = (err: PlayerError) => {
      if (disposed) return;
      if (live) {
        scheduleLiveRetry();
        return;
      }
      if (candidateIndex + 1 < candidates.length) {
        bump({ candidate: candidateIndex + 1 });
        return;
      }
      setState((s) => ({ ...s, error: err, reconnecting: false }));
    };

    // Carry the playhead across retries and fallbacks (VOD only).
    const carried = carry.current && carry.current.key === srcKey && !live ? carry.current : null;
    carry.current = null;
    const onMeta = () => {
      if (!carried) return;
      if (carried.t > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(carried.t, video.duration - 0.5);
      if (carried.playing) void video.play().catch(() => {});
    };
    const onPlaying = () => {
      liveRetries.current = 0;
      setState((s) => (s.reconnecting ? { ...s, reconnecting: false } : s));
    };
    const onError = () => {
      if (hls) return; // hls.js reports its own errors
      const e = video.error;
      if (!e || e.code === 1) return; // aborted
      fail(mediaErrorCode(e));
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);

    setState((s) => ({ ...INITIAL, reconnecting: s.reconnecting && live }));

    const attachFile = (url: string, kind: EngineKind) => {
      video.src = url;
      video.load();
      setState((s) => ({ ...s, kind }));
    };

    if (c.type === 'file') {
      attachFile(c.url, 'file');
    } else {
      void (async () => {
        let Hls: typeof HlsType | null = null;
        try {
          Hls = (await import('hls.js')).default;
        } catch {
          Hls = null;
        }
        if (disposed) return;
        if (Hls && Hls.isSupported()) {
          const instance = new Hls({
            enableWorker: true,
            capLevelToPlayerSize: true,
            backBufferLength: live ? 20 : 60,
            liveSyncDurationCount: 3,
            // Gentle automatic catch-up when a little behind; the "Back to live" button handles big gaps.
            maxLiveSyncPlaybackRate: live ? 1.15 : 1,
          });
          hls = instance;
          hlsRef.current = instance;
          instance.on(Hls.Events.MANIFEST_PARSED, (_e, data: ManifestParsedData) => {
            if (disposed) return;
            setState((s) => ({ ...s, kind: 'hls.js', levels: mapLevels(data.levels), level: -1 }));
          });
          instance.on(Hls.Events.LEVEL_SWITCHED, (_e, data: LevelSwitchedData) => {
            if (disposed) return;
            setState((s) => ({ ...s, playingLevel: data.level }));
          });
          instance.on(Hls.Events.ERROR, (_e, data: ErrorData) => {
            if (disposed || !data.fatal) return;
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              mediaRecoveries += 1;
              if (mediaRecoveries === 1) return instance.recoverMediaError();
              if (mediaRecoveries === 2) {
                instance.swapAudioCodec();
                return instance.recoverMediaError();
              }
              return fail({ code: 'media', detail: data.details });
            }
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              if (live) return scheduleLiveRetry();
              networkRecoveries += 1;
              if (networkRecoveries <= 1) return instance.startLoad();
              return fail({ code: 'network', detail: data.details });
            }
            fail({ code: 'unknown', detail: data.details });
          });
          instance.attachMedia(video);
          instance.loadSource(c.url);
          setState((s) => ({ ...s, kind: 'hls.js' }));
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          attachFile(c.url, 'native-hls');
        } else {
          fail({ code: 'unsupported', detail: 'HLS not supported' });
        }
      })();
    }

    return () => {
      disposed = true;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      if (!live && video.currentTime > 0) carry.current = { key: srcKey, t: video.currentTime, playing: !video.paused };
      if (hls) {
        hls.destroy();
        if (hlsRef.current === hls) hlsRef.current = null;
      }
      detach(video);
    };
    // sources are captured through srcKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey, candidateIndex, attempt, enabled, live, bump, videoRef]);

  const setLevel = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index;
    setState((s) => ({ ...s, level: index }));
  }, []);

  /** Manual retry from the error screen: start over from the best source, keep the playhead. */
  const retry = useCallback(() => {
    liveRetries.current = 0;
    setState((s) => ({ ...s, error: null }));
    bump({ resetCandidate: true });
  }, [bump]);

  /** Where "live" is right now (seconds on the media timeline), or null when unknown. */
  const liveEdge = useCallback((): number | null => {
    const video = videoRef.current;
    if (!video) return null;
    const hls = hlsRef.current;
    if (hls) {
      // null for a VOD playlist (a recorded stream played in live mode has no edge).
      if (!hls.latestLevelDetails?.live) return null;
      const sync = hls.liveSyncPosition;
      return typeof sync === 'number' && Number.isFinite(sync) ? sync : null;
    }
    if (Number.isFinite(video.duration)) return null; // native live reports Infinity
    const s = video.seekable;
    if (!s.length) return null;
    const end = s.end(s.length - 1);
    return Number.isFinite(end) ? Math.max(s.start(s.length - 1), end - 4) : null;
  }, [videoRef]);

  return useMemo(() => ({ state, setLevel, retry, liveEdge, hlsRef }), [state, setLevel, retry, liveEdge]);
}
