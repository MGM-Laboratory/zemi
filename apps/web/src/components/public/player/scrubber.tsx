'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import type { ShapeName } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { clamp, cn } from '@/lib/utils';
import { chapterAt, formatClock, spokenTime, storyboardTile, type ChapterSpan, type Storyboard } from './format';
import styles from './player.module.css';

export interface ScrubberProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  duration: number;
  /** Whole seconds, for aria-valuenow. */
  time: number;
  paused: boolean;
  buffered: Array<[number, number]>;
  spans: ChapterSpan[];
  storyboard: Storyboard | null;
  knobShape: ShapeName;
  /** Player width in px, used to size the preview thumbnail. */
  playerWidth: number;
  onSeek(t: number, final: boolean): void;
  onScrubbingChange(scrubbing: boolean): void;
}

interface Hover {
  t: number;
  x: number;
  /** Track width when measured. */
  w: number;
  source: 'pointer' | 'keyboard';
}

const KEY_STEP = 5;

/**
 * VOD timeline: buffered ranges, played fill, chapter notches, a brand-shape knob, and a
 * hover/drag preview with the storyboard thumbnail, chapter title and time. The played fill
 * is driven by a CSS variable written from rAF, so playback never re-renders React.
 * Keyboard: a real slider (arrows 5s, PageUp/PageDown 10%, Home/End).
 */
export function Scrubber({
  videoRef,
  duration,
  time,
  paused,
  buffered,
  spans,
  storyboard,
  knobShape,
  playerWidth,
  onSeek,
  onScrubbingChange,
}: ScrubberProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const scrubT = useRef<number | null>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valid = Number.isFinite(duration) && duration > 0;

  const writeProgress = useCallback(
    (t: number) => {
      const el = rootRef.current;
      if (!el || !valid) return;
      el.style.setProperty('--p', String(clamp(t / duration)));
    },
    [duration, valid],
  );

  // Smooth playhead: rAF while playing, event-driven while paused.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !valid) return;
    let raf = 0;
    const tick = () => {
      if (scrubT.current === null) writeProgress(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    const once = () => {
      if (scrubT.current === null) writeProgress(v.currentTime);
    };
    once();
    if (!paused) raf = requestAnimationFrame(tick);
    v.addEventListener('seeked', once);
    v.addEventListener('timeupdate', once);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('seeked', once);
      v.removeEventListener('timeupdate', once);
    };
  }, [videoRef, paused, valid, writeProgress]);

  const timeAt = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || !valid) return null;
      const r = track.getBoundingClientRect();
      const f = clamp((clientX - r.left) / (r.width || 1));
      return { t: f * duration, x: f * r.width, w: r.width };
    },
    [duration, valid],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !valid) return;
    const hit = timeAt(e.clientX);
    if (!hit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubT.current = hit.t;
    setScrubbing(true);
    onScrubbingChange(true);
    writeProgress(hit.t);
    setHover({ ...hit, source: 'pointer' });
    onSeek(hit.t, false);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const hit = timeAt(e.clientX);
    if (!hit) return;
    if (scrubT.current !== null) {
      scrubT.current = hit.t;
      writeProgress(hit.t);
      onSeek(hit.t, false);
      setHover({ ...hit, source: 'pointer' });
    } else if (e.pointerType === 'mouse') {
      setHover({ ...hit, source: 'pointer' });
    }
  };

  const endScrub = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (scrubT.current === null) return;
    const t = scrubT.current;
    scrubT.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setScrubbing(false);
    onScrubbingChange(false);
    if (commit) onSeek(t, true);
    if (e.pointerType !== 'mouse') setHover(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!valid || e.altKey || e.ctrlKey || e.metaKey) return;
    const v = videoRef.current;
    const cur = v?.currentTime ?? 0;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = cur - KEY_STEP;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = cur + KEY_STEP;
        break;
      case 'PageDown':
        next = cur - duration * 0.1;
        break;
      case 'PageUp':
        next = cur + duration * 0.1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = duration - 0.25;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    const t = clamp(next, 0, duration);
    onSeek(t, true);
    writeProgress(t);
    const w = trackRef.current?.getBoundingClientRect().width ?? 0;
    setHover({ t, x: (t / duration) * w, w, source: 'keyboard' });
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(() => setHover((h) => (h?.source === 'keyboard' ? null : h)), 900);
  };

  useEffect(
    () => () => {
      if (keyTimer.current) clearTimeout(keyTimer.current);
    },
    [],
  );

  const hoverChapter = hover ? chapterAt(spans, hover.t) : null;
  const nowChapter = chapterAt(spans, time);
  const thumbScale = clamp(playerWidth / 1000, 0.72, 1.35);
  const tile = hover ? storyboardTile(storyboard, hover.t, thumbScale) : null;
  const trackW = hover?.w ?? 0;
  const tipW = tile ? tile.width : 96;
  const tipX = hover ? clamp(hover.x, tipW / 2, Math.max(tipW / 2, trackW - tipW / 2)) : 0;

  const valueText = valid
    ? `${spokenTime(time)} of ${spokenTime(duration)}${nowChapter ? `, chapter: ${nowChapter.title}` : ''}`
    : 'Loading';

  return (
    <div
      ref={rootRef}
      className={styles.scrubber}
      data-hover={hover?.source === 'pointer' ? 'true' : undefined}
      data-scrubbing={scrubbing ? 'true' : undefined}
    >
      <div
        className={styles.scrubHit}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={valid ? Math.floor(duration) : 0}
        aria-valuenow={valid ? Math.min(time, Math.floor(duration)) : 0}
        aria-valuetext={valueText}
        aria-disabled={!valid || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endScrub(e, true)}
        onPointerCancel={(e) => endScrub(e, false)}
        onPointerLeave={() => {
          if (scrubT.current === null) setHover(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setHover((h) => (h?.source === 'keyboard' ? null : h))}
      >
        <div ref={trackRef} className={styles.track}>
          <div className={styles.trackBase} />
          {valid
            ? buffered.map(([s, e], i) => (
                <div
                  key={i}
                  className={styles.trackBuffered}
                  style={{ left: `${(clamp(s / duration) * 100).toFixed(3)}%`, width: `${(clamp((e - s) / duration) * 100).toFixed(3)}%` }}
                />
              ))
            : null}
          {hover && hoverChapter && valid ? (
            <div
              className={styles.trackChapterHover}
              style={{
                left: `${((hoverChapter.start / duration) * 100).toFixed(3)}%`,
                width: `${(((hoverChapter.end - hoverChapter.start) / duration) * 100).toFixed(3)}%`,
              }}
            />
          ) : null}
          {hover && valid ? <div className={styles.trackHover} style={{ width: `${((hover.t / duration) * 100).toFixed(3)}%` }} /> : null}
          <div className={styles.trackPlayed} />
          {valid
            ? spans.slice(1).map((s) => (
                <div key={s.index} className={styles.trackNotch} style={{ left: `${((s.start / duration) * 100).toFixed(3)}%` }} />
              ))
            : null}
        </div>
        <div className={styles.knob} aria-hidden="true">
          <ShapeIcon shape={knobShape} size="100%" color="var(--player-accent)" />
        </div>
      </div>

      <AnimatePresence>
        {hover && valid ? (
          <motion.div
            key="tip"
            className={cn(styles.preview, !tile && styles.previewBare)}
            style={{ left: tipX, width: tile ? tile.width : undefined }}
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}
            aria-hidden="true"
          >
            {tile ? (
              <div
                className={styles.previewThumb}
                style={{
                  width: tile.width,
                  height: tile.height,
                  backgroundImage: `url("${tile.url}")`,
                  backgroundPosition: `${tile.x}px ${tile.y}px`,
                  backgroundSize: `${tile.sheetWidth}px ${tile.sheetHeight}px`,
                }}
              />
            ) : null}
            {hoverChapter ? <span className={styles.previewChapter}>{hoverChapter.title}</span> : null}
            <span className={cn(styles.previewTime, 'mono')}>{formatClock(hover.t, duration)}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
