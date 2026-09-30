'use client';

import {
  BUMPER_SAFE_INSET,
  BUMPER_TRANSITION_META,
  bumperAutoNext,
  bumperPlayable,
  jakartaParts,
  pickBumperTransition,
  type BumperData,
  type BumperLiveState,
  type BumperPresence,
  type BumperSlide,
  type BumperTheme,
  type BumperTransitionKey,
} from '@zemi/shared';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { slideTitle } from '../library/labels';
import type { LiveStatus } from './use-live';

/* ---------------------------------------------------------------- playback info */

export interface PlaybackInfo {
  /** Slides in playback order (hidden ones skipped). */
  playable: BumperSlide[];
  /** 0-based position of the current slide in `playable`, -1 when none. */
  index: number;
  current: BumperSlide | null;
  /** Where Next goes. */
  next: BumperSlide | null;
  prev: BumperSlide | null;
  /** Where auto-advance goes when it differs from `next` (a loop). */
  loopTo: BumperSlide | null;
  /** The transition Next would play. */
  nextTransition: BumperTransitionKey | null;
  /** Friendly names by slide id (label, or the template's description from data). */
  titles: Map<string, string>;
}

export function usePlaybackInfo(slides: readonly BumperSlide[], currentId: string | null, theme: BumperTheme, data: BumperData, showEventId: string | null): PlaybackInfo {
  const titles = useMemo(() => new Map(slides.map((s) => [s.id, slideTitle(s, theme, data, showEventId)])), [slides, theme, data, showEventId]);
  return useMemo(() => {
    const playable = bumperPlayable(slides);
    const index = currentId ? playable.findIndex((s) => s.id === currentId) : -1;
    const current = index >= 0 ? playable[index]! : null;
    const next = index >= 0 ? (playable[index + 1] ?? null) : (playable[0] ?? null);
    const prev = index > 0 ? playable[index - 1]! : null;
    const auto = current && current.timing.autoAdvanceSec ? bumperAutoNext(slides, current.id) : null;
    const loopTo = auto && auto.id !== next?.id ? auto : null;
    const nextTransition = next ? pickBumperTransition(current, next, { motion: theme.motion }) : null;
    return { playable, index, current, next, prev, loopTo, nextTransition, titles };
  }, [slides, currentId, theme.motion, titles]);
}

export const transitionLabel = (key: BumperTransitionKey | null | undefined) => (key ? BUMPER_TRANSITION_META[key].label : '');

/* ---------------------------------------------------------------- status words */

export const STATUS_LABEL: Record<LiveStatus, string> = {
  connecting: 'Connecting',
  open: 'Live link',
  reconnecting: 'Reconnecting',
  forbidden: 'No access',
  revoked: 'Link replaced',
};

export function statusTone(status: LiveStatus): 'ok' | 'wait' | 'bad' {
  if (status === 'open') return 'ok';
  if (status === 'connecting' || status === 'reconnecting') return 'wait';
  return 'bad';
}

/** A small connection dot. Green when the stream is up, yellow while (re)connecting, red when it gave up. */
export function StatusDot({ status, className = '' }: { status: LiveStatus; className?: string }) {
  const tone = statusTone(status);
  return (
    <span className={`relative inline-flex size-2.5 shrink-0 ${className}`} aria-hidden="true">
      {tone !== 'bad' ? <span className={`absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping ${tone === 'ok' ? 'bg-green' : 'bg-yellow'}`} style={{ animationDuration: tone === 'ok' ? '2.4s' : '1.2s' }} /> : null}
      <span className={`relative size-2.5 rounded-full ${tone === 'ok' ? 'bg-[#1fb872]' : tone === 'wait' ? 'bg-yellow' : 'bg-red'}`} />
    </span>
  );
}

export function outputsLabel(presence: BumperPresence | null): string {
  const n = presence?.outputs ?? 0;
  if (!n) return 'No outputs';
  const obs = presence?.clients.some((c) => c.kind === 'output' && c.obs);
  return `${n} output${n === 1 ? '' : 's'}${obs ? ', OBS connected' : ''}`;
}

/* ---------------------------------------------------------------- time */

const pad = (n: number) => String(n).padStart(2, '0');

/** "13:14:59" in WIB. */
export function wibClock(ms: number): string {
  const p = jakartaParts(ms);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** "4:05" or "1:02:10". */
export function formatSpan(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Seconds until auto-advance (server corrected), or null. */
export function advanceLeft(state: BumperLiveState | null, now: number): number | null {
  if (!state?.advanceAt || state.mode !== 'show' || !state.autoplay) return null;
  const t = Date.parse(state.advanceAt);
  return Number.isFinite(t) ? Math.max(0, (t - now) / 1000) : null;
}

/* ---------------------------------------------------------------- environment */

/** Force the brand fonts to load (nothing may have asked for them yet), then wait for them. Capped. */
export function useFontsReady(capMs = 2500): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const done = () => {
      if (alive) setReady(true);
    };
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) {
      void Promise.resolve().then(done);
      return () => {
        alive = false;
      };
    }
    const css = getComputedStyle(document.documentElement);
    const families = ['--font-recursive', '--font-atkinson'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
    const loads = families.flatMap((f) => ['900 96px', '600 40px', '500 32px'].map((w) => fonts.load(`${w} ${f}`).catch(() => [])));
    const cap = new Promise((r) => setTimeout(r, capMs));
    void Promise.race([Promise.all(loads).then(() => fonts.ready), cap]).then(done, done);
    return () => {
      alive = false;
    };
  }, [capMs]);
  return ready;
}

/** Keep the screen awake while the page is open (re-acquired when the tab comes back). */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let alive = true;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (!alive) void l.release().catch(() => undefined);
        else lock = l;
      } catch {
        /* denied (battery saver, headless): the screen may sleep, nothing else breaks */
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) void request();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

function subscribeFullscreen(cb: () => void) {
  document.addEventListener('fullscreenchange', cb);
  return () => document.removeEventListener('fullscreenchange', cb);
}

/** Browser fullscreen (the Fullscreen API), for the player's `f` key and button. */
export function useFullscreen(): [boolean, () => void] {
  const on = useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenElement,
    () => false,
  );
  const toggle = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
    } catch {
      /* not allowed here */
    }
  };
  return [on, toggle];
}

/* ---------------------------------------------------------------- keyboard */

export interface PlaybackKeys {
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  /** 1-based position. */
  goto(position: number): void;
  black(): void;
  clear(): void;
  replay(): void;
  autoplay(): void;
  fullscreen?(): void;
  grid?(): void;
  help(): void;
  cut?(): void;
  /** Esc with nothing to cancel. */
  escape?(): void;
}

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

/** Focus sits on something that uses these keys itself (buttons use Space and Enter, sliders use arrows). */
function ownsKey(el: Element | null, key: string): boolean {
  if (!el?.closest) return false;
  if (el.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]')) return true;
  if ((key === ' ' || key === 'Enter') && el.closest('button,a[href],summary,[role="button"],[role="switch"],[role="tab"],[role="checkbox"],[role="option"]')) return true;
  if (key.startsWith('Arrow') && el.closest('[role="slider"],[role="radiogroup"],[role="tablist"],[data-own-arrows]')) return true;
  return false;
}

/**
 * The playback keyboard shared by the player, the controller and the dock. Presenter clickers
 * send PageDown/PageUp (and '.' or 'b' for a black screen), so those work too. Digits collect
 * into a jump buffer: "12" then Enter goes to bumper 12. Returns the buffer so the page can show it.
 */
export function usePlaybackKeys(keys: PlaybackKeys, enabled = true): string {
  const [buffer, setBuffer] = useState('');
  const ref = useRef({ keys, buffer });
  useEffect(() => {
    ref.current = { keys, buffer };
  });

  useEffect(() => {
    if (!enabled || !buffer) return;
    const t = setTimeout(() => setBuffer(''), 2500);
    return () => clearTimeout(t);
  }, [buffer, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (isTyping(target) || ownsKey(target, e.key)) return;
      const { keys: k, buffer: buf } = ref.current;
      const handled = () => e.preventDefault();
      if (/^[0-9]$/.test(e.key)) {
        handled();
        setBuffer((b) => (b + e.key).replace(/^0+/, '').slice(0, 3));
        return;
      }
      switch (e.key) {
        case 'Enter':
          handled();
          if (buf) {
            k.goto(Number(buf));
            setBuffer('');
          } else k.next();
          return;
        case 'Backspace':
          handled();
          if (buf) setBuffer(buf.slice(0, -1));
          else k.prev();
          return;
        case 'Escape':
          if (buf) {
            handled();
            setBuffer('');
          } else if (k.escape) {
            handled();
            k.escape();
          }
          return;
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          handled();
          k.next();
          return;
        case 'ArrowLeft':
        case 'PageUp':
          handled();
          k.prev();
          return;
        case 'Home':
          handled();
          k.first();
          return;
        case 'End':
          handled();
          k.last();
          return;
        default:
          break;
      }
      switch (e.key.toLowerCase()) {
        case 'b':
        case '.':
          handled();
          k.black();
          return;
        case 'c':
          handled();
          k.clear();
          return;
        case 'r':
          handled();
          k.replay();
          return;
        case 'p':
          handled();
          k.autoplay();
          return;
        case 'f':
          if (k.fullscreen) {
            handled();
            k.fullscreen();
          }
          return;
        case 'g':
          if (k.grid) {
            handled();
            k.grid();
          }
          return;
        case 'x':
          if (k.cut) {
            handled();
            k.cut();
          }
          return;
        case '?':
          handled();
          k.help();
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  return enabled ? buffer : '';
}

/** The keyboard, in words, for the help overlays. */
export const KEY_HELP: Array<{ keys: string[]; label: string; only?: 'player' | 'controller' }> = [
  { keys: ['→', 'Space', 'Page Down', 'Enter'], label: 'Next bumper' },
  { keys: ['←', 'Page Up', 'Backspace'], label: 'Previous bumper' },
  { keys: ['Home', 'End'], label: 'First or last bumper' },
  { keys: ['1', '2', 'Enter'], label: 'Jump to a number (type it, then Enter)' },
  { keys: ['B'], label: 'Black screen on or off' },
  { keys: ['C'], label: 'Clear (transparent in OBS) on or off' },
  { keys: ['R'], label: 'Replay the entrance' },
  { keys: ['P'], label: 'Pause or resume auto-advance' },
  { keys: ['X'], label: 'Cut: the next change skips its transition' },
  { keys: ['G'], label: 'All bumpers, to jump', only: 'player' },
  { keys: ['G'], label: 'Jump to the filmstrip', only: 'controller' },
  { keys: ['F'], label: 'Browser fullscreen' },
  { keys: ['?'], label: 'This help' },
  { keys: ['Esc'], label: 'Close this, or go back to the builder' },
];

/* ---------------------------------------------------------------- title-safe guides */

/** Setup guides on the 1920x1080 canvas (output `?safe=1`): title safe, action safe, center, the bug corner. */
export function SafeGuides() {
  const { x, y } = BUMPER_SAFE_INSET;
  const ax = Math.round(1920 * 0.035);
  const ay = Math.round(1080 * 0.035);
  const stroke = { fill: 'none', strokeWidth: 3, vectorEffect: 'non-scaling-stroke' as const };
  const label = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 22, fontWeight: 700 };
  return (
    <svg viewBox="0 0 1920 1080" width={1920} height={1080} style={{ position: 'absolute', inset: 0, zIndex: 80, pointerEvents: 'none' }} aria-hidden="true" data-safe-guides="">
      <rect x={ax} y={ay} width={1920 - ax * 2} height={1080 - ay * 2} {...stroke} stroke="#f94141" strokeDasharray="14 10" />
      <rect x={x} y={y} width={1920 - x * 2} height={1080 - y * 2} {...stroke} stroke="#f7bf33" />
      <rect x={64} y={48} width={300} height={50} {...stroke} stroke="#3a6dc5" strokeDasharray="6 6" />
      <path d="M960 500 V580 M920 540 H1000" {...stroke} stroke="#ffffff" />
      <path d="M640 0 V1080 M1280 0 V1080 M0 360 H1920 M0 720 H1920" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="4 12" />
      <g style={label}>
        <text x={x + 12} y={y + 34} fill="#f7bf33" stroke="#0e1116" strokeWidth={5} paintOrder="stroke">TITLE SAFE</text>
        <text x={ax + 12} y={1080 - ay - 14} fill="#f94141" stroke="#0e1116" strokeWidth={5} paintOrder="stroke">ACTION SAFE</text>
        <text x={374} y={82} fill="#3a6dc5" stroke="#0e1116" strokeWidth={5} paintOrder="stroke">CORNER BUG</text>
        <text x={1920 - x - 12} y={y + 34} textAnchor="end" fill="#ffffff" stroke="#0e1116" strokeWidth={5} paintOrder="stroke">1920 x 1080</text>
      </g>
    </svg>
  );
}
