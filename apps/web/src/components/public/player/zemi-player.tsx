'use client';

import { AnimatePresence, motion, MotionConfig, type Variants } from 'motion/react';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { SHAPE_COLORS, type Accent, type ReactionKind, type ShapeName } from '@zemi/shared';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { isApiError } from '@/lib/api/errors';
import { react as sendReaction } from '@/lib/api/client';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { clamp, cn } from '@/lib/utils';
import { chapterAt, chapterSpans, formatClock, sourceKey, spokenTime, speedLabel, SPEEDS, type ChapterSpan } from './format';
import {
  CaptionsIcon,
  ChaptersIcon,
  FullscreenIcon,
  PipIcon,
  PlayPauseGlyph,
  SettingsIcon,
  SkipIcon,
  TheaterIcon,
  VolumeIcon,
} from './icons';
import { LiveStatus, useElapsed, useLiveFeed } from './live';
import {
  BigPlay,
  EndCard,
  ErrorState,
  FloatingChip,
  Loading,
  Osd,
  Poster,
  ShortcutsPanel,
  SignalSlate,
  TapRipple,
  type Flash,
  type Ripple,
  type SlateVariant,
} from './overlays';
import { ReactionBar, ReactionLayer, type ReactionLayerHandle } from './reactions';
import { Scrubber } from './scrubber';
import { SettingsMenu, type MenuPage, type TextTrackOption } from './settings-menu';
import type { ZemiPlayerProps } from './types';
import { useEngine } from './use-engine';
import { useMedia } from './use-media';
import styles from './player.module.css';

const ACCENT_SHAPE: Record<Accent, ShapeName> = { blue: 'circle', red: 'triangle', yellow: 'square', green: 'arch' };
const ACCENT_HEX: Record<Accent, string> = {
  blue: SHAPE_COLORS.circle,
  red: SHAPE_COLORS.triangle,
  yellow: SHAPE_COLORS.square,
  green: SHAPE_COLORS.arch,
};

const IDLE_MS = 2600;
const COMPACT_W = 560;
const PREFS_KEY = 'zemi:player:prefs';
const POS_PREFIX = 'zemi:player:pos:';
const POS_MAX_AGE = 1000 * 60 * 60 * 24 * 60;

type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture' | 'fullscreen') => void;
  webkitPresentationMode?: string;
};
type WebkitDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void; webkitFullscreenEnabled?: boolean };
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => void };

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full: fine */
  }
}

const barVariants: Variants = {
  hidden: { opacity: 0, y: 18, transition: { duration: 0.28, ease: [0.65, 0, 0.35, 1] } },
  shown: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 360, damping: 30, staggerChildren: 0.018 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.9 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 520, damping: 26 } },
};

interface CtrlProps {
  label: string;
  tip?: string;
  onClick(): void;
  children: ReactNode;
  className?: string;
  pressed?: boolean;
  expanded?: boolean;
  hasPopup?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  badge?: string | null;
}

function Ctrl({ label, tip, onClick, children, className, pressed, expanded, hasPopup, buttonRef, badge }: CtrlProps) {
  return (
    <motion.button
      ref={buttonRef}
      type="button"
      className={cn(styles.ctrl, className)}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={hasPopup ? 'menu' : undefined}
      data-tip={tip ?? label}
      onClick={onClick}
      variants={itemVariants}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.88 }}
    >
      <span className={styles.ctrlIcon}>{children}</span>
      {badge ? <span className={styles.ctrlBadge}>{badge}</span> : null}
    </motion.button>
  );
}

/**
 * The Zemi media player. HLS (hls.js, native on Safari), MP4 and WebM, live and VOD.
 * Client only: load it with next/dynamic (ssr: false), or use ZemiPlayerLazy from './lazy'.
 *
 * @example
 * <ZemiPlayer mode="vod" title={rec.title} sources={{ mp4: v.mp4, webm: v.webm, hls: v.hls }}
 *   poster={v.poster} storyboard={v.storyboard} chapters={rec.chapters} durationSec={v.durationSec} accent="blue" />
 * @example
 * <ZemiPlayer mode="live" eventId={event.id} title={event.title} sources={{ hls: event.stream.hlsUrl }}
 *   live={{ ingestOnline: event.stream.ingestOnline, viewers: event.stream.viewers, startedAt: event.stream.liveStartedAt }} />
 */
export function ZemiPlayer(props: ZemiPlayerProps) {
  const {
    mode,
    sources,
    poster,
    posterLqip,
    posterColor,
    title,
    subtitle,
    accent = 'blue',
    eventId,
    live,
    storyboard = null,
    chapters,
    durationSec,
    autoPlay = false,
    className,
    captions,
    rememberPosition = true,
    reactions: reactionsProp,
    onTheaterChange,
    showTheater: showTheaterProp,
    onPlay,
    onPause,
    onEnded,
    onStreamEnd,
    ref,
  } = props;

  const isLive = mode === 'live';
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const layerRef = useRef<ReactionLayerHandle>(null);
  const settingsBtn = useRef<HTMLButtonElement>(null);

  /* ---------------------------------------------------------------- live feed + reactions */

  const ownPending = useRef<Record<string, number[]>>({});
  const onIncomingReaction = useCallback((kind: string, count: number) => {
    const now = Date.now();
    const mine = (ownPending.current[kind] ?? []).filter((t) => now - t < 3000);
    const swallow = Math.min(mine.length, count);
    ownPending.current[kind] = mine.slice(swallow);
    const rest = count - swallow;
    if (rest > 0) layerRef.current?.burst(kind as ReactionKind, rest);
  }, []);

  // Heartbeats keep going while the video plays in a hidden tab or a PiP window (still watching).
  const isWatching = useCallback(() => {
    const v = videoRef.current;
    return !!v && !v.paused && !v.ended;
  }, []);
  const feed = useLiveFeed({ enabled: isLive, eventId, live, onReaction: onIncomingReaction, isWatching });

  // Live pages render before the event goes public (hlsUrl null); the SSE brings the url later.
  const hlsSrc = sources.hls || (isLive ? feed.hlsUrl : null) || null;
  const src = useMemo(() => ({ hls: hlsSrc, mp4: sources.mp4, webm: sources.webm }), [hlsSrc, sources.mp4, sources.webm]);
  const srcKey = `${src.hls ?? ''}|${src.mp4 ?? ''}|${src.webm ?? ''}`;
  const posKey = useMemo(() => {
    const k = sourceKey(src.hls || src.mp4 || src.webm);
    return k ? POS_PREFIX + k : null;
  }, [src.hls, src.mp4, src.webm]);

  // `preview` is admins only: the public url answers 403 until Go live (a ?pt= preview url plays).
  const previewOnly = isLive && feed.streamState === 'preview' && !/[?&]pt=/.test(src.hls ?? '');
  const streamEnded = isLive && feed.streamState === 'ended';
  const notOnAir = isLive && (feed.streamState === 'idle' || previewOnly);
  const engineEnabled = !isLive || (feed.ingestOnline && !streamEnded && !notOnAir && !!src.hls);

  const engine = useEngine(videoRef, { sources: src, live: isLive, enabled: engineEnabled });
  const media = useMedia(videoRef, srcKey);
  const elapsed = useElapsed(isLive ? feed.startedAt : null);

  /* ---------------------------------------------------------------- layout */

  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round((entry?.contentRect.width ?? 0) / 8) * 8;
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = width > 0 && width < COMPACT_W;

  /* ---------------------------------------------------------------- ui state */

  const [idle, setIdle] = useState(false);
  const [hoverControls, setHoverControls] = useState(false);
  const [focusInControls, setFocusInControls] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPage, setMenuPage] = useState<MenuPage>('main');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [theaterInner, setTheaterInner] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [ripple, setRipple] = useState<Ripple | null>(null);
  const [announcement, setAnnouncement] = useState<{ id: number; text: string }>({ id: 0, text: '' });
  const [behind, setBehind] = useState(false);
  const [behindSec, setBehindSec] = useState(0);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [mutedByAutoplay, setMutedByAutoplay] = useState(false);
  const [tracks, setTracks] = useState<TextTrackOption[]>([]);
  const [activeTrack, setActiveTrack] = useState(-1);
  const [pipSupported, setPipSupported] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [wantsPlay, setWantsPlay] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [stalledLong, setStalledLong] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const theater = props.theater ?? theaterInner;
  const showTheater = showTheaterProp ?? (onTheaterChange !== undefined || props.theater !== undefined);
  const wantsPlayRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuClosedAt = useRef(0);
  const lastPointerType = useRef<string>('mouse');
  const taps = useRef<{ t: number; side: 'left' | 'right' | 'center' } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekThrottle = useRef(0);
  const restoredFor = useRef<string | null>(null);

  const duration = isLive
    ? Number.POSITIVE_INFINITY
    : Number.isFinite(media.duration) && media.duration > 0
      ? media.duration
      : (durationSec ?? Number.NaN);
  const spans = useMemo(() => (isLive ? [] : chapterSpans(chapters, duration)), [chapters, duration, isLive]);
  const current: ChapterSpan | null = chapterAt(spans, media.time);

  const error = engine.state.error;
  const playing = !media.paused && !media.ended;
  const slateVisible = isLive && !error && (!engineEnabled || (engine.state.reconnecting && !playing) || stalledLong || recovering);
  const slateVariant: SlateVariant = streamEnded
    ? 'ended'
    : notOnAir || !src.hls
      ? 'waiting'
      : (!feed.ingestOnline && feed.startedAt) || media.started
        ? 'lost'
        : 'waiting';
  const ended = !isLive && media.ended;

  /* ---------------------------------------------------------------- helpers */

  const announce = useCallback((text: string) => setAnnouncement((a) => ({ id: a.id + 1, text })), []);
  const showFlash = useCallback((text: string, icon?: ReactNode, speak = true) => {
    setFlash({ id: Date.now() + Math.random(), text, icon });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 750);
    if (speak) setAnnouncement((a) => ({ id: a.id + 1, text }));
  }, []);

  const poke = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(
    () => () => {
      for (const t of [idleTimer, flashTimer, rippleTimer, tapTimer]) if (t.current) clearTimeout(t.current);
    },
    [],
  );

  const keepVisible =
    !media.started || media.paused || menuOpen || shortcutsOpen || scrubbing || focusInControls || hoverControls || !!error || slateVisible || ended;
  const controlsShown = keepVisible || !idle;

  /* ---------------------------------------------------------------- playback actions */

  const play = useCallback(
    async (auto = false) => {
      const v = videoRef.current;
      if (!v) return;
      wantsPlayRef.current = true;
      setWantsPlay(true);
      if (v.ended && !isLive) v.currentTime = 0;
      try {
        await v.play();
      } catch (e) {
        const name = (e as DOMException | undefined)?.name;
        if (name === 'NotAllowedError' && !v.muted) {
          // Autoplay with sound was blocked: go muted and offer to unmute.
          v.muted = true;
          setMutedByAutoplay(true);
          try {
            await v.play();
          } catch {
            wantsPlayRef.current = false;
            setWantsPlay(false);
          }
        } else if (name === 'NotAllowedError' || (auto && name !== 'AbortError')) {
          wantsPlayRef.current = false;
          setWantsPlay(false);
        }
      }
    },
    [isLive],
  );

  const pause = useCallback(() => {
    wantsPlayRef.current = false;
    setWantsPlay(false);
    videoRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (streamEnded) {
      showFlash('The stream has ended');
      return;
    }
    if (isLive && !engineEnabled) {
      // Nothing is attached (not on air yet, or OBS dropped): say so instead of "Playing".
      showFlash(slateVariant === 'lost' ? 'No signal right now. Hang tight.' : 'Not on air yet. It starts right here.');
      return;
    }
    if (v.paused || v.ended) {
      void play();
      announce('Playing');
    } else {
      pause();
      announce('Paused');
    }
  }, [announce, engineEnabled, isLive, pause, play, showFlash, slateVariant, streamEnded]);

  const seekTo = useCallback(
    (t: number, opts: { flash?: boolean } = {}) => {
      const v = videoRef.current;
      if (!v || isLive) return;
      const d = Number.isFinite(v.duration) ? v.duration : duration;
      if (!Number.isFinite(d)) return;
      v.currentTime = clamp(t, 0, Math.max(0, d - 0.1));
      if (opts.flash) showFlash(formatClock(v.currentTime, d), undefined, false);
    },
    [duration, isLive, showFlash],
  );

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      if (isLive) {
        showFlash(delta < 0 ? 'Live has no rewind. Yet.' : 'You’re as live as it gets.');
        return;
      }
      seekTo(v.currentTime + delta);
      const abs = Math.abs(delta);
      showFlash(`${delta < 0 ? 'Back' : 'Forward'} ${abs}s`, <SkipIcon dir={delta < 0 ? 'back' : 'forward'} />, false);
      announce(`${delta < 0 ? 'Back' : 'Forward'} ${abs} seconds, at ${spokenTime(v.currentTime)}`);
    },
    [announce, isLive, seekTo, showFlash],
  );

  const savePrefs = useCallback((v: HTMLVideoElement) => writeJSON(PREFS_KEY, { volume: v.volume, muted: v.muted }), []);

  const setVolume = useCallback(
    (vol: number, quiet = false) => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = clamp(vol);
      v.muted = v.volume === 0;
      setMutedByAutoplay(false);
      savePrefs(v);
      if (!quiet) showFlash(v.muted ? 'Muted' : `Volume ${Math.round(v.volume * 100)}%`, <VolumeIcon level={v.muted ? 0 : v.volume < 0.5 ? 1 : 2} />);
    },
    [savePrefs, showFlash],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.6;
    setMutedByAutoplay(false);
    savePrefs(v);
    showFlash(v.muted ? 'Muted' : 'Sound on', <VolumeIcon level={v.muted ? 0 : 2} />);
  }, [savePrefs, showFlash]);

  const setRate = useCallback(
    (r: number) => {
      const v = videoRef.current;
      if (!v || isLive) return;
      v.playbackRate = r;
      showFlash(r === 1 ? 'Normal speed' : `${r}x speed`);
    },
    [isLive, showFlash],
  );

  const stepRate = useCallback(
    (dir: 1 | -1) => {
      const v = videoRef.current;
      if (!v || isLive) return;
      const i = SPEEDS.findIndex((s) => s >= v.playbackRate - 0.01);
      const next = SPEEDS[clamp((i === -1 ? 1 : i) + dir, 0, SPEEDS.length - 1)]!;
      setRate(next);
    },
    [isLive, setRate],
  );

  const jumpToLive = useCallback(() => {
    const v = videoRef.current;
    if (!v || !isLive) return;
    // The pill, L, End and the right arrow all land here. Only jump when there is an edge to jump to.
    if (streamEnded) {
      showFlash('The stream has ended');
      return;
    }
    if (slateVisible || !engineEnabled) {
      showFlash(slateVariant === 'lost' ? 'No signal right now. Hang tight.' : 'Not on air yet. It starts right here.');
      return;
    }
    if (media.started && !v.paused && !behind) {
      showFlash('You’re as live as it gets.');
      return;
    }
    const edge = engine.liveEdge();
    if (edge !== null) v.currentTime = edge;
    void play();
    setBehind(false);
    showFlash('Back to live');
  }, [behind, engine, engineEnabled, isLive, media.started, play, showFlash, slateVariant, slateVisible, streamEnded]);

  /* ---------------------------------------------------------------- fullscreen, pip, theater */

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current as WebkitEl | null;
    const v = videoRef.current as WebkitVideo | null;
    const doc = document as WebkitDoc;
    if (!root || !v) return;
    const fsEl = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    try {
      if (fsEl) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else doc.webkitExitFullscreen?.();
        try {
          screen.orientation?.unlock?.();
        } catch {
          /* ignore */
        }
        return;
      }
      if (v.webkitDisplayingFullscreen) {
        v.webkitExitFullscreen?.();
        return;
      }
      if (root.requestFullscreen && doc.fullscreenEnabled !== false) {
        await root.requestFullscreen({ navigationUI: 'hide' });
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        if (o?.lock && window.matchMedia('(pointer: coarse)').matches && v.videoWidth > v.videoHeight) {
          o.lock('landscape').catch(() => {});
        }
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      } else if (v.webkitEnterFullscreen) {
        // iPhone: only the video element can go fullscreen (native controls take over).
        v.webkitEnterFullscreen();
      }
    } catch {
      if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const v = videoRef.current;
    if (!root || !v) return;
    const doc = document as WebkitDoc;
    const onChange = () => setFullscreen((doc.fullscreenElement ?? doc.webkitFullscreenElement) === root);
    const onBegin = () => setFullscreen(true);
    const onEnd = () => setFullscreen(false);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    v.addEventListener('webkitbeginfullscreen', onBegin);
    v.addEventListener('webkitendfullscreen', onEnd);
    const wv = v as WebkitVideo;
    setPipSupported(
      (!!document.pictureInPictureEnabled && !v.disablePictureInPicture) || !!wv.webkitSupportsPresentationMode?.('picture-in-picture'),
    );
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      v.removeEventListener('webkitbeginfullscreen', onBegin);
      v.removeEventListener('webkitendfullscreen', onEnd);
    };
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current as WebkitVideo | null;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v.requestPictureInPicture && document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
      } else if (v.webkitSetPresentationMode) {
        v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
      }
    } catch {
      showFlash('Picture in picture needs the video to be playing');
    }
  }, [showFlash]);

  const toggleTheater = useCallback(() => {
    const next = !theater;
    if (props.theater === undefined) setTheaterInner(next);
    onTheaterChange?.(next);
    showFlash(next ? 'Theater mode' : 'Default view', <TheaterIcon active={!next} />);
  }, [onTheaterChange, props.theater, showFlash, theater]);

  /* ---------------------------------------------------------------- captions */

  const needsCors = useMemo(() => {
    if (!captions?.length || typeof window === 'undefined') return false;
    return captions.some((c) => {
      if (/^(blob|data):/i.test(c.src)) return false;
      try {
        return new URL(c.src, window.location.href).origin !== window.location.origin;
      } catch {
        return false;
      }
    });
  }, [captions]);

  // Captions are drawn by the player (mode "hidden" + cuechange), so they sit above the controls,
  // use the brand type and show in fullscreen. A track the browser or hls.js turns on is adopted.
  const activeTrackRef = useRef(-1);
  const [cueLines, setCueLines] = useState<string[]>([]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const list = v.textTracks;
    const sync = () => {
      const opts: TextTrackOption[] = [];
      let active = -1;
      for (let i = 0; i < list.length; i++) {
        const t = list[i]!;
        if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
        opts.push({ index: i, label: t.label || t.language || `Track ${opts.length + 1}` });
        if (t.mode === 'showing') {
          t.mode = 'hidden';
          active = i;
        } else if (t.mode === 'hidden' && activeTrackRef.current === i) {
          active = i;
        }
      }
      setTracks((prev) => (prev.length === opts.length && prev.every((p, i) => p.index === opts[i]!.index && p.label === opts[i]!.label) ? prev : opts));
      activeTrackRef.current = active;
      setActiveTrack(active);
    };
    sync();
    list.addEventListener('addtrack', sync);
    list.addEventListener('removetrack', sync);
    list.addEventListener('change', sync);
    return () => {
      list.removeEventListener('addtrack', sync);
      list.removeEventListener('removetrack', sync);
      list.removeEventListener('change', sync);
    };
  }, [srcKey, captions]);

  useEffect(() => {
    const v = videoRef.current;
    const track = v && activeTrack >= 0 ? v.textTracks[activeTrack] : null;
    if (!track) {
      setCueLines([]);
      return;
    }
    if (track.mode === 'disabled') track.mode = 'hidden';
    const onCue = () => {
      const lines: string[] = [];
      const cues = track.activeCues;
      for (let i = 0; cues && i < cues.length; i++) {
        const text = (cues[i] as VTTCue).text ?? '';
        for (const line of text.replace(/<[^>]+>/g, '').split(/\r?\n/)) if (line.trim()) lines.push(line.trim());
      }
      setCueLines(lines);
    };
    onCue();
    track.addEventListener('cuechange', onCue);
    return () => track.removeEventListener('cuechange', onCue);
  }, [activeTrack, srcKey]);

  const selectTrack = useCallback(
    (index: number) => {
      const v = videoRef.current;
      if (!v) return;
      activeTrackRef.current = index;
      const list = v.textTracks;
      for (let i = 0; i < list.length; i++) {
        const t = list[i]!;
        if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
        t.mode = i === index ? 'hidden' : 'disabled';
      }
      setActiveTrack(index);
      const label = tracks.find((t) => t.index === index)?.label;
      showFlash(index === -1 ? 'Captions off' : `Captions: ${label ?? 'on'}`, <CaptionsIcon active={index !== -1} />);
    },
    [showFlash, tracks],
  );

  const lastTrack = useRef<number | null>(null);
  const toggleCaptions = useCallback(() => {
    if (!tracks.length) {
      showFlash('No captions for this one');
      return;
    }
    if (activeTrack !== -1) {
      lastTrack.current = activeTrack;
      selectTrack(-1);
    } else {
      selectTrack(lastTrack.current ?? tracks[0]!.index);
    }
  }, [activeTrack, selectTrack, showFlash, tracks]);

  /* ---------------------------------------------------------------- effects: prefs, autoplay, position */

  // Restore volume/mute once.
  useEffect(() => {
    const v = videoRef.current;
    const p = readJSON<{ volume?: number; muted?: boolean }>(PREFS_KEY);
    if (!v || !p) return;
    if (typeof p.volume === 'number') v.volume = clamp(p.volume);
    if (typeof p.muted === 'boolean') v.muted = p.muted;
  }, []);

  // Autoplay (and live auto-recover): play once media can play, if autoplay or the viewer was watching.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || engine.state.kind === 'none') return;
    const onCanPlay = () => {
      if (!v.paused) return;
      if (wantsPlayRef.current || (autoPlay && !media.started)) void play(true);
    };
    v.addEventListener('canplay', onCanPlay);
    if (v.readyState >= 3) onCanPlay();
    return () => v.removeEventListener('canplay', onCanPlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.state.kind, srcKey, autoPlay, play]);

  // A pause we didn't ask for (native iOS controls, PiP window, headset) clears the intent.
  const callbacks = useRef({ onPlay, onPause, onEnded });
  const onStreamEndRef = useRef(onStreamEnd);
  useEffect(() => {
    callbacks.current = { onPlay, onPause, onEnded };
    onStreamEndRef.current = onStreamEnd;
  });
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const handlePause = () => {
      if (v.currentSrc && v.readyState >= 2 && !v.ended && !v.seeking) {
        wantsPlayRef.current = false;
        setWantsPlay(false);
      }
      callbacks.current.onPause?.();
    };
    const handlePlay = () => {
      wantsPlayRef.current = true;
      setWantsPlay(true);
      callbacks.current.onPlay?.();
    };
    const handleEnded = () => {
      wantsPlayRef.current = false;
      setWantsPlay(false);
      if (posKey) writeJSON(posKey, null);
      callbacks.current.onEnded?.();
    };
    v.addEventListener('pause', handlePause);
    v.addEventListener('play', handlePlay);
    v.addEventListener('ended', handleEnded);
    return () => {
      v.removeEventListener('pause', handlePause);
      v.removeEventListener('play', handlePlay);
      v.removeEventListener('ended', handleEnded);
    };
  }, [posKey]);

  // Resume where you left off (VOD).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || isLive || !rememberPosition || !posKey) return;
    const onMeta = () => {
      if (restoredFor.current === posKey) return;
      restoredFor.current = posKey;
      const saved = readJSON<{ t: number; d: number; at: number }>(posKey);
      if (!saved || Date.now() - saved.at > POS_MAX_AGE) return;
      const d = Number.isFinite(v.duration) ? v.duration : saved.d;
      if (saved.t > 5 && saved.t < d - 15 && v.currentTime < 1) {
        v.currentTime = saved.t;
        setResumeAt(saved.t);
      }
    };
    v.addEventListener('loadedmetadata', onMeta);
    if (v.readyState >= 1) onMeta();
    return () => v.removeEventListener('loadedmetadata', onMeta);
  }, [isLive, posKey, rememberPosition, srcKey]);

  // Save the position every few seconds, on pause, and when the page hides.
  const lastSaved = useRef(0);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || isLive || !rememberPosition || !posKey) return;
    const save = () => {
      if (!Number.isFinite(v.duration) || v.ended) return;
      if (v.currentTime < 5) writeJSON(posKey, null);
      else writeJSON(posKey, { t: Math.floor(v.currentTime), d: Math.floor(v.duration), at: Date.now() });
    };
    const onTime = () => {
      if (Math.abs(v.currentTime - lastSaved.current) >= 5) {
        lastSaved.current = v.currentTime;
        save();
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('pause', save);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      save();
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('pause', save);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
    };
  }, [isLive, posKey, rememberPosition]);

  // Hide the resume chip after a bit.
  useEffect(() => {
    if (resumeAt === null) return;
    const t = setTimeout(() => setResumeAt(null), 7000);
    return () => clearTimeout(t);
  }, [resumeAt]);

  // Live, re-attaching after a drop: the viewer was watching, so show the wait, not a play button.
  const pendingLive = isLive && wantsPlay && media.paused && media.started;
  // Debounced spinner so quick seeks don't flash it.
  const loadingNow = !error && !slateVisible && !ended && (media.buffering || (wantsPlay && !media.started) || pendingLive);
  useEffect(() => {
    if (!loadingNow) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), 280);
    return () => clearTimeout(t);
  }, [loadingNow]);

  // Live: a long stall counts as a lost signal (the slate hides again once frames flow).
  useEffect(() => {
    if (!isLive || !media.buffering || !media.started) {
      setStalledLong(false);
      return;
    }
    const t = setTimeout(() => setStalledLong(true), 8000);
    return () => clearTimeout(t);
  }, [isLive, media.buffering, media.started]);

  // Live: while stalled with no word from the server, rebuild the stream every 10s until frames flow.
  useEffect(() => {
    if (!isLive || !engineEnabled) {
      setRecovering(false);
      return;
    }
    if (!stalledLong && !recovering) return;
    const id = setInterval(() => {
      setRecovering(true);
      engine.retry();
    }, 10_000);
    return () => clearInterval(id);
  }, [engine, engineEnabled, isLive, recovering, stalledLong]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlaying = () => setRecovering(false);
    v.addEventListener('playing', onPlaying);
    return () => v.removeEventListener('playing', onPlaying);
  }, []);

  // Live: how far behind the edge are we?
  useEffect(() => {
    if (!isLive || !engineEnabled) {
      setBehind(false);
      return;
    }
    const check = () => {
      const v = videoRef.current;
      const edge = engine.liveEdge();
      if (!v || edge === null || !media.started) return;
      const gap = edge - v.currentTime;
      setBehindSec(Math.max(0, Math.round(gap)));
      setBehind(v.paused || gap > 4);
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [engine, engineEnabled, isLive, media.started, media.paused]);

  // Announce live signal changes.
  const prevSlate = useRef(slateVisible);
  useEffect(() => {
    if (prevSlate.current === slateVisible) return;
    prevSlate.current = slateVisible;
    if (slateVisible) {
      if (slateVariant === 'lost') announce('Signal lost, hang tight.');
    } else if (isLive && media.started) showFlash('We’re back');
    else if (isLive) announce('We’re live.');
  }, [announce, isLive, media.started, showFlash, slateVariant, slateVisible]);

  // The stream ended: stop playback (the slate says so) and tell the page.
  const prevStreamState = useRef(feed.streamState);
  useEffect(() => {
    const prev = prevStreamState.current;
    prevStreamState.current = feed.streamState;
    if (!isLive || prev === feed.streamState || feed.streamState !== 'ended') return;
    wantsPlayRef.current = false;
    setWantsPlay(false);
    announce('That’s a wrap. The stream has ended.');
    onStreamEndRef.current?.();
  }, [announce, feed.streamState, isLive]);

  const [slateSince, setSlateSince] = useState<number | null>(null);
  useEffect(() => {
    setSlateSince(slateVisible ? Date.now() : null);
  }, [slateVisible]);

  // Keep the controls up while idle-hiding is on hold, and restart the timer when it ends.
  useEffect(() => {
    if (!keepVisible) poke();
  }, [keepVisible, poke]);

  /* ---------------------------------------------------------------- reactions */

  const onReact = useCallback(
    (kind: ReactionKind, from: DOMRect) => {
      const root = rootRef.current;
      if (root) {
        const r = root.getBoundingClientRect();
        layerRef.current?.burst(kind, 1, { x: from.left + from.width / 2 - r.left, y: from.top - r.top });
      }
      poke();
      if (!eventId) return;
      const sentAt = Date.now();
      (ownPending.current[kind] ??= []).push(sentAt);
      sendReaction(eventId, kind).catch((e: unknown) => {
        // Not sent, so no echo is coming: don't swallow someone else's reaction for it.
        const pending = ownPending.current[kind];
        const at = pending?.indexOf(sentAt) ?? -1;
        if (pending && at >= 0) pending.splice(at, 1);
        if (isApiError(e) && e.isRateLimited) {
          setCooling(true);
          showFlash('Easy there, one at a time');
          setTimeout(() => setCooling(false), 3000);
        }
      });
    },
    [eventId, poke, showFlash],
  );

  useImperativeHandle(
    ref,
    () => ({
      play: () => play(),
      pause,
      seek: (t: number) => seekTo(t),
      toggleFullscreen: () => void toggleFullscreen(),
      burst: (kind, count = 1) => layerRef.current?.burst(kind, count),
      get video() {
        return videoRef.current;
      },
    }),
    [pause, play, seekTo, toggleFullscreen],
  );

  /* ---------------------------------------------------------------- keyboard */

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('[role="menu"], [role="dialog"]')) return;
    const isRange = target instanceof HTMLInputElement && target.type === 'range';
    if (!isRange && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const onButton = !!target.closest('button, a[href], [role="button"]');
    const key = e.key;
    const v = videoRef.current;
    if (!v) return;
    let handled = true;
    switch (key) {
      case ' ':
        if (onButton) return;
        toggle();
        break;
      case 'k':
      case 'K':
        toggle();
        break;
      case 'j':
      case 'J':
        seekBy(-10);
        break;
      case 'l':
      case 'L':
        if (isLive) jumpToLive();
        else seekBy(10);
        break;
      case 'ArrowLeft':
        if (isRange) return;
        seekBy(-5);
        break;
      case 'ArrowRight':
        if (isRange) return;
        if (isLive) jumpToLive();
        else seekBy(5);
        break;
      case 'ArrowUp':
        if (isRange) return;
        setVolume((v.muted ? 0 : v.volume) + 0.05);
        break;
      case 'ArrowDown':
        if (isRange) return;
        setVolume((v.muted ? 0 : v.volume) - 0.05);
        break;
      case 'Home':
        if (isRange || isLive) return;
        seekTo(0, { flash: true });
        break;
      case 'End':
        if (isRange) return;
        if (isLive) jumpToLive();
        else seekTo(duration - 1, { flash: true });
        break;
      case 'm':
      case 'M':
        toggleMute();
        break;
      case 'f':
      case 'F':
        void toggleFullscreen();
        break;
      case 't':
      case 'T':
        if (!showTheater) return;
        toggleTheater();
        break;
      case 'c':
      case 'C':
        toggleCaptions();
        break;
      case 'i':
      case 'I':
        if (!pipSupported) return;
        void togglePip();
        break;
      case '<':
        stepRate(-1);
        break;
      case '>':
        stepRate(1);
        break;
      case '?':
        setShortcutsOpen((o) => !o);
        break;
      case 'Escape':
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (menuOpen) setMenuOpen(false);
        else handled = false;
        break;
      default:
        if (/^[0-9]$/.test(key) && !isLive && Number.isFinite(duration)) {
          seekTo((Number(key) / 10) * duration, { flash: true });
        } else {
          handled = false;
        }
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      poke();
    }
  };

  /* ---------------------------------------------------------------- pointer gestures on the video */

  const onSurfacePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    lastPointerType.current = e.pointerType;
    if (e.pointerType === 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / (r.width || 1);
    const side: 'left' | 'right' | 'center' = fx < 0.36 ? 'left' : fx > 0.64 ? 'right' : 'center';
    const now = Date.now();
    const prev = taps.current;
    const isDouble = prev && now - prev.t < 320 && prev.side === side;
    taps.current = { t: now, side };
    if (isDouble && side !== 'center' && !isLive && media.started) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      const delta = side === 'left' ? -10 : 10;
      seekTo((videoRef.current?.currentTime ?? 0) + delta);
      setRipple((rp) => ({
        id: rp && rp.side === side ? rp.id : now,
        side,
        seconds: rp && rp.side === side ? rp.seconds + 10 : 10,
      }));
      if (rippleTimer.current) clearTimeout(rippleTimer.current);
      rippleTimer.current = setTimeout(() => setRipple(null), 650);
      announce(`${delta < 0 ? 'Back' : 'Forward'} 10 seconds`);
      return;
    }
    if (isDouble && side === 'center') {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      void toggleFullscreen();
      return;
    }
    // Single tap: toggle the controls (after a beat, so a double tap can cancel it).
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      if (!media.started) {
        void play();
        return;
      }
      if (controlsShown && !keepVisible) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        setIdle(true);
      } else poke();
    }, 240);
  };

  const onSurfaceClick = () => {
    if (lastPointerType.current !== 'mouse') return;
    if (Date.now() - menuClosedAt.current < 300) return;
    if (menuOpen) return;
    toggle();
  };

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    menuClosedAt.current = Date.now();
    if (restoreFocus) requestAnimationFrame(() => settingsBtn.current?.focus({ preventScroll: true }));
  }, []);

  const openMenu = (page: MenuPage) => {
    if (menuOpen && menuPage === page) {
      closeMenu(false);
      return;
    }
    setMenuPage(page);
    setMenuOpen(true);
    poke();
  };

  /* ---------------------------------------------------------------- render */

  const volumeLevel: 0 | 1 | 2 = media.muted || media.volume === 0 ? 0 : media.volume < 0.5 ? 1 : 2;
  const qualityBadge = (() => {
    const lv = engine.state.levels;
    if (lv.length < 2) return null;
    const idx = engine.state.level === -1 ? engine.state.playingLevel : engine.state.level;
    const h = lv.find((l) => l.index === idx)?.height ?? 0;
    return h >= 2160 ? '4K' : h >= 720 ? 'HD' : null;
  })();
  const extras = compact
    ? [
        ...(pipSupported ? [{ key: 'pip', label: 'Picture in picture', value: media.pip ? 'On' : 'Off', onSelect: () => { closeMenu(true); void togglePip(); } }] : []),
        ...(showTheater ? [{ key: 'theater', label: 'Theater mode', value: theater ? 'On' : 'Off', onSelect: () => { closeMenu(true); toggleTheater(); } }] : []),
      ]
    : [];
  extras.push({ key: 'keys', label: 'Keyboard shortcuts', value: '?', onSelect: () => { closeMenu(false); setShortcutsOpen(true); } });

  const showBigPlay =
    !error && !slateVisible && !ended && !scrubbing && (!media.started ? !showSpinner : media.paused && !media.buffering && !pendingLive);
  // Small players hide the bar while the slate is up, so the slate copy stays readable.
  const showReactions = isLive && (reactionsProp ?? true) && !error && media.started && !streamEnded && !(compact && slateVisible);

  const style = {
    '--player-accent': ACCENT_HEX[accent],
    '--player-accent-ink': accent === 'yellow' ? '#0e1116' : '#ffffff',
  } as CSSProperties;

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={rootRef}
        className={cn(styles.root, 'zemi-player', theater && 'zemi-player-theater', className)}
        style={style}
        role="region"
        aria-roledescription="video player"
        aria-label={`${title}${isLive ? ', live' : ''}`}
        tabIndex={0}
        data-mode={mode}
        data-native-cursor=""
        data-accent={accent}
        data-theater={theater ? 'true' : undefined}
        data-fullscreen={fullscreen ? 'true' : undefined}
        data-controls={controlsShown ? 'shown' : 'hidden'}
        data-idle={!controlsShown ? 'true' : undefined}
        data-started={media.started ? 'true' : undefined}
        data-compact={compact ? 'true' : undefined}
        data-reduced={reduced ? 'true' : undefined}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          // Old engines without overflow: clip can still scroll a hidden box when a control takes focus.
          const el = e.currentTarget;
          if (el.scrollLeft || el.scrollTop) el.scrollTo(0, 0);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') poke();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse' && media.started && !media.paused) {
            if (idleTimer.current) clearTimeout(idleTimer.current);
            idleTimer.current = setTimeout(() => setIdle(true), 600);
          }
        }}
      >
        <video
          ref={videoRef}
          className={styles.video}
          playsInline
          preload={isLive ? 'auto' : 'metadata'}
          crossOrigin={needsCors ? 'anonymous' : undefined}
          aria-hidden="true"
          tabIndex={-1}
        >
          {captions?.map((c) => (
            <track key={c.src} kind={c.kind ?? 'subtitles'} src={c.src} srcLang={c.srclang} label={c.label} default={c.default} />
          ))}
        </video>

        <Poster src={poster} lqip={posterLqip} color={posterColor} hidden={media.started} />

        {/* Gesture surface: click to play, double click fullscreen, taps on touch. */}
        <div
          className={styles.surface}
          onPointerUp={onSurfacePointerUp}
          onClick={onSurfaceClick}
          onDoubleClick={() => {
            if (lastPointerType.current === 'mouse') void toggleFullscreen();
          }}
          aria-hidden="true"
        />

        <div className={styles.shadeTop} aria-hidden="true" />
        <div className={styles.shadeBottom} aria-hidden="true" />

        <Loading show={showSpinner} label={isLive && !media.started ? 'Tuning in' : undefined} />

        <AnimatePresence>
          {slateVisible ? (
            <SignalSlate key="slate" variant={slateVariant} since={slateVariant === 'lost' ? slateSince : null} />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {error ? (
            <ErrorState
              key="error"
              error={error}
              onRetry={() => {
                engine.retry();
                void play();
              }}
              download={src.mp4}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>{ended ? <EndCard key="end" onReplay={() => void play()} /> : null}</AnimatePresence>

        <BigPlay show={showBigPlay} playing={wantsPlay} onPress={() => void play()} label={media.started ? 'Play' : `Play ${title}`} />

        <TapRipple ripple={ripple} />
        <Osd flash={flash} />
        <ReactionLayer ref={layerRef} />

        {cueLines.length ? (
          <div className={styles.captions} data-lift={controlsShown ? 'true' : undefined} aria-hidden="true">
            {cueLines.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </div>
        ) : null}

        {/* Title bar */}
        <motion.div
          className={styles.top}
          initial={false}
          animate={controlsShown || !media.started ? 'shown' : 'hidden'}
          variants={{
            hidden: { opacity: 0, y: -12, transition: { duration: 0.25 } },
            shown: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 30 } },
          }}
        >
          <div className={styles.titleBlock}>
            <p className={styles.title}>{title}</p>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
        </motion.div>

        <FloatingChip
          show={resumeAt !== null && !ended}
          action="Start over"
          onAction={() => {
            seekTo(0);
            setResumeAt(null);
            void play();
          }}
          onDismiss={() => setResumeAt(null)}
        >
          Picked up at <span className="mono">{formatClock(resumeAt ?? 0, duration)}</span>
        </FloatingChip>
        <FloatingChip
          show={mutedByAutoplay && playing}
          position="top-right"
          action="Unmute"
          onAction={() => {
            const v = videoRef.current;
            if (!v) return;
            v.muted = false;
            if (v.volume === 0) v.volume = 0.8;
            setMutedByAutoplay(false);
          }}
        >
          Playing muted
        </FloatingChip>
        <FloatingChip show={isLive && behind && behindSec >= 8 && !slateVisible && playing} action="Jump to live" onAction={jumpToLive}>
          You’re <span className="mono">{behindSec}s</span> behind
        </FloatingChip>

        {showReactions ? (
          <motion.div
            className={styles.reactionDock}
            initial={false}
            animate={controlsShown ? { opacity: 1, y: 0 } : { opacity: 0.0, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            data-shown={controlsShown ? 'true' : undefined}
          >
            <ReactionBar onReact={onReact} cooling={cooling} compact={compact} />
          </motion.div>
        ) : null}

        {/* Controls */}
        <motion.div
          className={styles.controls}
          initial={false}
          animate={controlsShown ? 'shown' : 'hidden'}
          variants={barVariants}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') setHoverControls(true);
          }}
          onPointerLeave={() => setHoverControls(false)}
          onFocus={(e) => {
            if ((e.target as HTMLElement).matches(':focus-visible')) setFocusInControls(true);
            poke();
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusInControls(false);
          }}
        >
          <SettingsMenu
            open={menuOpen}
            page={menuPage}
            onPage={setMenuPage}
            onClose={closeMenu}
            triggerRef={settingsBtn}
            live={isLive}
            compact={compact}
            rate={media.rate}
            onRate={setRate}
            levels={engine.state.levels}
            level={engine.state.level}
            playingLevel={engine.state.playingLevel}
            onLevel={(i) => {
              engine.setLevel(i);
              const l = engine.state.levels.find((x) => x.index === i);
              showFlash(i === -1 ? 'Quality: Auto' : `Quality: ${l?.label ?? ''}`);
            }}
            tracks={tracks}
            activeTrack={activeTrack}
            onTrack={selectTrack}
            spans={spans}
            currentChapter={current?.index ?? -1}
            onChapter={(s) => {
              seekTo(s.start + 0.05);
              showFlash(s.title);
            }}
            storyboard={storyboard}
            duration={duration}
            extras={extras}
          />

          {!isLive ? (
            <motion.div variants={itemVariants} className={styles.scrubRow}>
              <Scrubber
                videoRef={videoRef}
                duration={duration}
                time={media.time}
                paused={media.paused}
                buffered={media.buffered}
                spans={spans}
                storyboard={storyboard}
                knobShape={ACCENT_SHAPE[accent]}
                playerWidth={width}
                onScrubbingChange={setScrubbing}
                onSeek={(t, final) => {
                  const now = performance.now();
                  if (final || now - seekThrottle.current > 120) {
                    seekThrottle.current = now;
                    seekTo(t);
                  }
                }}
              />
            </motion.div>
          ) : null}

          <div className={styles.bar}>
            <div className={styles.barLeft}>
              <Ctrl label={playing ? 'Pause' : 'Play'} tip={playing ? 'Pause (k)' : 'Play (k)'} onClick={toggle} className={styles.ctrlPlay}>
                <PlayPauseGlyph playing={playing} className={styles.playGlyph} />
              </Ctrl>
              {!isLive ? (
                <>
                  <Ctrl label="Back 10 seconds" tip="Back 10s (j)" onClick={() => seekBy(-10)} className={styles.hideNarrow}>
                    <SkipIcon dir="back" />
                  </Ctrl>
                  <Ctrl label="Forward 10 seconds" tip="Forward 10s (l)" onClick={() => seekBy(10)} className={styles.hideNarrow}>
                    <SkipIcon dir="forward" />
                  </Ctrl>
                </>
              ) : null}

              <motion.div className={styles.volume} variants={itemVariants}>
                <button
                  type="button"
                  className={styles.ctrl}
                  aria-label={volumeLevel === 0 ? 'Unmute' : 'Mute'}
                  data-tip={volumeLevel === 0 ? 'Unmute (m)' : 'Mute (m)'}
                  onClick={toggleMute}
                >
                  <span className={styles.ctrlIcon} data-level={volumeLevel}>
                    <VolumeIcon level={volumeLevel} />
                  </span>
                </button>
                <span className={styles.volumeSlot}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={media.muted ? 0 : media.volume}
                    aria-label="Volume"
                    aria-valuetext={`${Math.round((media.muted ? 0 : media.volume) * 100)}%`}
                    className={styles.volumeRange}
                    style={{ '--v': media.muted ? 0 : media.volume } as CSSProperties}
                    onChange={(e) => setVolume(Number(e.target.value), true)}
                  />
                </span>
              </motion.div>

              {isLive ? (
                <LiveStatus
                  state={slateVisible ? 'offline' : behind ? 'behind' : 'live'}
                  offlineLabel={slateVariant === 'waiting' ? 'Soon' : slateVariant === 'ended' ? 'Wrapped' : 'Live'}
                  onJump={jumpToLive}
                  viewers={feed.viewers}
                  elapsed={slateVariant === 'lost' || !slateVisible ? elapsed : null}
                  variants={itemVariants}
                />
              ) : (
                <motion.div className={styles.time} variants={itemVariants}>
                  <TickingDigits
                    value={formatClock(media.time, Number.isFinite(duration) ? duration : media.time)}
                    className={styles.timeNow}
                    label={`${spokenTime(media.time)} elapsed`}
                  />
                  {Number.isFinite(duration) ? (
                    <>
                      <span className={styles.timeSep} aria-hidden="true">
                        /
                      </span>
                      <span className={cn(styles.timeTotal, 'mono')} aria-label={`of ${spokenTime(duration)}`}>
                        {formatClock(duration)}
                      </span>
                    </>
                  ) : null}
                </motion.div>
              )}
            </div>

            {!isLive && current ? (
              <motion.button
                type="button"
                className={styles.chapterChip}
                variants={itemVariants}
                onClick={() => openMenu('chapters')}
                aria-label={`Chapter: ${current.title}. Show all chapters`}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={current.index}
                    className={styles.chapterChipText}
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  >
                    {current.title}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            ) : (
              <span className={styles.barSpacer} />
            )}

            <div className={styles.barRight}>
              {!isLive && spans.length ? (
                <Ctrl
                  label="Chapters"
                  onClick={() => openMenu('chapters')}
                  className={styles.hideNarrow}
                  expanded={menuOpen && menuPage === 'chapters'}
                  hasPopup
                >
                  <ChaptersIcon />
                </Ctrl>
              ) : null}
              {tracks.length ? (
                <Ctrl
                  label={activeTrack === -1 ? 'Turn captions on' : 'Turn captions off'}
                  tip="Captions (c)"
                  onClick={toggleCaptions}
                  pressed={activeTrack !== -1}
                >
                  <CaptionsIcon active={activeTrack !== -1} />
                </Ctrl>
              ) : null}
              <Ctrl
                label="Settings"
                onClick={() => openMenu('main')}
                expanded={menuOpen}
                hasPopup
                buttonRef={settingsBtn}
                badge={!isLive && media.rate !== 1 ? speedLabel(media.rate) : qualityBadge}
                className={cn(styles.ctrlSettings, menuOpen && styles.ctrlSettingsOpen)}
              >
                <SettingsIcon />
              </Ctrl>
              {pipSupported ? (
                <Ctrl
                  label={media.pip ? 'Exit picture in picture' : 'Picture in picture'}
                  tip="Picture in picture (i)"
                  onClick={() => void togglePip()}
                  pressed={media.pip}
                  className={styles.hideNarrow}
                >
                  <PipIcon />
                </Ctrl>
              ) : null}
              {showTheater ? (
                <Ctrl label="Theater mode" tip={theater ? 'Default view (t)' : 'Theater mode (t)'} onClick={toggleTheater} pressed={theater} className={styles.hideNarrow}>
                  <TheaterIcon active={theater} />
                </Ctrl>
              ) : null}
              <Ctrl
                label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                tip={fullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}
                onClick={() => void toggleFullscreen()}
              >
                <FullscreenIcon active={fullscreen} />
              </Ctrl>
            </div>
          </div>
        </motion.div>

        <ShortcutsPanel open={shortcutsOpen} live={isLive} onClose={() => { setShortcutsOpen(false); rootRef.current?.focus({ preventScroll: true }); }} />

        <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
          <span key={announcement.id}>{announcement.text}</span>
        </div>
      </div>
    </MotionConfig>
  );
}
