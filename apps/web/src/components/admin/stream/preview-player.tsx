'use client';

import type { StreamPreviewToken } from '@zemi/shared';
import type HlsType from 'hls.js';
import { Maximize2, Minimize2, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Character } from '@/components/admin/characters/character';
import { adminFetch, isAbortError, isApiError } from '@/lib/admin/api';
import { cn } from '@/lib/admin/cn';
import type { RoomState } from './lib';
import { withPreviewToken } from './lib';

type Phase = 'off' | 'tuning' | 'playing' | 'stalled' | 'error';

/** Refresh the 10 minute preview token well before it runs out. */
const TOKEN_REFRESH_MS = 8 * 60_000;

/**
 * Admin-only preview of the incoming stream (HLS through the API proxy with a `?pt=` token).
 * Attaches on its own as soon as OBS is online, retries while MediaMTX warms up the first
 * playlist, and swaps the token in place (hls.js xhrSetup) so a long preview never breaks.
 * No heartbeats: admins watching the preview are not counted as viewers.
 */
export function PreviewPlayer({
  eventId,
  room,
  ingestOnline,
  className,
}: {
  eventId: string;
  room: RoomState;
  /** OBS is connected. After End it may still be: the preview keeps playing so admins can check before going live again. */
  ingestOnline: boolean;
  className?: string;
}) {
  const active = room === 'preview' || room === 'live' || (room === 'ended' && ingestOnline);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>('off');
  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [info, setInfo] = useState<{ height: number | null; latency: number | null }>({ height: null, latency: null });
  const [attempt, setAttempt] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let hls: HlsType | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let tokenTimer: ReturnType<typeof setInterval> | null = null;
    let statTimer: ReturnType<typeof setInterval> | null = null;
    let retries = 0;
    const ctrl = new AbortController();

    const fetchToken = async () => {
      const t = await adminFetch<StreamPreviewToken>(`/admin/events/${eventId}/stream/preview-token`, { signal: ctrl.signal });
      tokenRef.current = t.token;
      urlRef.current = t.hlsUrl;
      return t;
    };

    const teardown = () => {
      if (statTimer) clearInterval(statTimer);
      statTimer = null;
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        /* ignore */
      }
    };

    const scheduleRetry = (why: string | null, refreshToken = false) => {
      if (disposed) return;
      teardown();
      retries += 1;
      setPhase(retries > 10 ? 'error' : 'tuning');
      setErrorText(retries > 10 ? why : null);
      // The first playlist 404s for several seconds after OBS connects (the muxer warms up on the
      // first request). Retry every few seconds so the picture shows soon after it exists.
      const delay = Math.min(3000, 700 * 2 ** Math.min(retries, 3));
      retryTimer = setTimeout(() => void start(refreshToken), delay);
    };

    const start = async (refreshToken: boolean) => {
      if (disposed) return;
      setPhase((p) => (p === 'playing' ? p : 'tuning'));
      let url: string;
      try {
        const t = refreshToken || !tokenRef.current || !urlRef.current ? await fetchToken() : null;
        url = t ? t.hlsUrl : withPreviewToken(urlRef.current!, tokenRef.current!);
      } catch (err) {
        if (disposed || isAbortError(err)) return;
        if (isApiError(err) && err.isForbidden) {
          setPhase('error');
          setErrorText("You can't open the preview for this event.");
          return;
        }
        scheduleRetry("We couldn't get a preview pass from the server.", true);
        return;
      }
      if (disposed) return;

      const { default: Hls } = await import('hls.js');
      if (disposed) return;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 6,
          maxLiveSyncPlaybackRate: 1.5,
          backBufferLength: 20,
          // Keep the pass fresh on every request (child playlists and segments carry `pt` too).
          xhrSetup: (xhr, reqUrl) => {
            const tok = tokenRef.current;
            if (tok && reqUrl.includes('pt=')) xhr.open('GET', withPreviewToken(reqUrl, tok), true);
          },
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          retries = 0;
          void video.play().catch(() => {
            /* autoplay blocked: the big button shows */
          });
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          const level = hls?.levels[data.level];
          setInfo((i) => ({ ...i, height: level?.height || null }));
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal || disposed) return;
          const code = data.response?.code ?? 0;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries < 2) {
            retries += 1;
            hls?.recoverMediaError();
            return;
          }
          if (code === 403) {
            scheduleRetry('The preview pass ran out.', true);
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR || data.details === 'bufferAppendError') {
            scheduleRetry('This browser had trouble decoding the stream. Check the OBS encoder settings.');
            return;
          }
          scheduleRetry(code === 404 ? 'The media server has no picture yet.' : 'The preview dropped.');
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        statTimer = setInterval(() => {
          if (!hls) return;
          const latency = Number.isFinite(hls.latency) && hls.latency > 0 ? hls.latency : null;
          setInfo((i) => (i.latency === latency ? i : { ...i, latency }));
        }, 2000);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        void video.play().catch(() => {});
      } else {
        setPhase('error');
        setErrorText("This browser can't play HLS. Try Chrome, Edge, Firefox or Safari.");
      }
    };

    // Token refresh: xhrSetup picks up the new one. Native HLS needs a reload with the new URL.
    tokenTimer = setInterval(() => {
      void fetchToken()
        .then((t) => {
          if (!hls && video.src && !disposed) {
            video.src = t.hlsUrl;
            void video.play().catch(() => {});
          }
        })
        .catch(() => {
          /* the next 403 retries with a fresh one */
        });
    }, TOKEN_REFRESH_MS);

    const onPlaying = () => {
      if (disposed) return;
      retries = 0;
      setPhase('playing');
      setErrorText(null);
      if (video.videoHeight) setInfo((i) => ({ ...i, height: video.videoHeight }));
    };
    const onWaiting = () => !disposed && setPhase((p) => (p === 'playing' ? 'stalled' : p));
    const onNativeError = () => {
      if (!hls && !disposed && video.src) scheduleRetry('The preview dropped.', true);
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onNativeError);

    void start(!tokenRef.current);

    return () => {
      disposed = true;
      ctrl.abort();
      if (retryTimer) clearTimeout(retryTimer);
      if (tokenTimer) clearInterval(tokenTimer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onNativeError);
      teardown();
      setPhase('off');
      setInfo({ height: null, latency: null });
    };
  }, [active, eventId, attempt]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
    else (videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void } | null)?.webkitEnterFullscreen?.();
  }, []);

  const showVideo = active && (phase === 'playing' || phase === 'stalled');

  return (
    <div
      ref={wrapRef}
      className={cn(
        'group/player relative isolate aspect-video w-full overflow-hidden rounded-[20px] bg-surface-inverse text-ink-inverse sm:rounded-[24px]',
        fullscreen && 'rounded-none',
        className,
      )}
    >
      <video
        ref={videoRef}
        className={cn('absolute inset-0 size-full object-contain transition-opacity duration-500', showVideo ? 'opacity-100' : 'opacity-0')}
        playsInline
        muted={muted}
        autoPlay
        aria-label="Admin preview of the incoming stream"
      />

      <AnimatePresence initial={false}>
        {!showVideo ? (
          <motion.div
            key={active ? `tuning-${phase}` : `off-${room}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.35 }}
          >
            <Slate room={room} active={active} phase={phase} errorText={errorText} onRetry={() => setAttempt((a) => a + 1)} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Top-left badge: who can see this. */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2 sm:top-4 sm:left-4">
        {room === 'live' || room === 'lost' ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-red px-3 text-xs font-bold tracking-[0.08em] text-white uppercase shadow-sm">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/80 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-white" />
            </span>
            On air
          </span>
        ) : active ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-yellow px-3 text-xs font-bold tracking-[0.06em] text-ink uppercase shadow-sm">
            Preview, only admins
          </span>
        ) : null}
      </div>

      {showVideo ? (
        <>
          <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-2 sm:top-4 sm:right-4">
            {info.height ? (
              <span className="mono rounded-full bg-black/55 px-2.5 py-1 text-[0.6875rem] text-white backdrop-blur-sm">{info.height}p</span>
            ) : null}
            {info.latency != null ? (
              <span className="mono rounded-full bg-black/55 px-2.5 py-1 text-[0.6875rem] text-white backdrop-blur-sm" title="How far behind OBS this preview is">
                {info.latency.toFixed(1)}s behind
              </span>
            ) : null}
          </div>
          <div className="absolute right-3 bottom-3 flex items-center gap-2 sm:right-4 sm:bottom-4">
            <PlayerButton label={muted ? 'Unmute preview' : 'Mute preview'} onClick={() => setMuted((m) => !m)}>
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </PlayerButton>
            <PlayerButton label={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </PlayerButton>
          </div>
          {muted ? (
            <button
              type="button"
              onClick={() => setMuted(false)}
              className="absolute bottom-3 left-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/92 px-3 text-xs font-semibold text-ink shadow-sm transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 sm:bottom-4 sm:left-4"
            >
              <VolumeX className="size-3.5" aria-hidden="true" />
              Muted. Tap to check the mic
            </button>
          ) : null}
          {phase === 'stalled' ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
              <span className="rounded-full bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur-sm">Buffering...</span>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PlayerButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-90"
    >
      {children}
    </button>
  );
}

const BARS = ['#3a6dc5', '#f7bf33', '#f94141', '#0f8657', '#f5f6f8', '#3a6dc5', '#f7bf33'];

/** What the stage shows when there is no picture: brand color bars, a character, and a line of copy. */
function Slate({
  room,
  active,
  phase,
  errorText,
  onRetry,
}: {
  room: RoomState;
  active: boolean;
  phase: Phase;
  errorText: string | null;
  onRetry: () => void;
}) {
  const reduce = useReducedMotion();
  const tuning = active && phase !== 'error';
  const title =
    phase === 'error'
      ? "The preview won't play."
      : tuning
        ? 'Tuning in...'
        : room === 'lost'
          ? 'Signal lost.'
          : room === 'ended'
            ? "That's a wrap."
            : 'No signal yet.';
  const body =
    phase === 'error'
      ? (errorText ?? 'Give it another go.')
      : tuning
        ? 'OBS is connected. The first picture takes a few seconds.'
        : room === 'lost'
          ? 'Viewers see a "hang tight" card. Restart streaming in OBS and we pick it right back up.'
          : room === 'ended'
            ? 'The stream is over. Start OBS again if you need a second round.'
            : 'Start streaming in OBS and the picture shows up here, just for admins.';
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex h-[38%] w-full opacity-[0.22]" aria-hidden="true">
        {BARS.map((c, i) => (
          <motion.span
            key={i}
            className="h-full flex-1"
            style={{ background: c }}
            animate={reduce || !tuning ? undefined : { opacity: [1, 0.35, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-4 text-center sm:gap-3">
        <div className="-mt-10 flex items-end gap-1 sm:-mt-14" aria-hidden="true">
          <Character
            shape={room === 'lost' || phase === 'error' ? 'triangle' : 'circle'}
            mood={phase === 'error' ? 'oops' : tuning ? 'look' : room === 'ended' ? 'happy' : room === 'lost' ? 'oops' : 'sleep'}
            size={56}
            follow={tuning}
          />
          <Character shape="square" mood={tuning ? 'look' : 'sleep'} size={40} lookAt={{ x: -0.8, y: -0.2 }} />
        </div>
        <p className="font-display text-lg font-extrabold tracking-[-0.02em] text-white [font-variation-settings:'CASL'_0.4] sm:text-2xl">{title}</p>
        <p className="max-w-sm text-[0.8125rem] text-white/70 sm:text-sm">{body}</p>
        {phase === 'error' ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-ink transition hover:bg-ink-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
