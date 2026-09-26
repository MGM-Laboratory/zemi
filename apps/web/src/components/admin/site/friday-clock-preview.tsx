'use client';

import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { IconButton } from '@/components/admin/ui';
import { cn } from '@/lib/admin/cn';

export const SESSION_START = 13 * 60 + 15;
export const SESSION_END = 15 * 60 + 15;

export function toMinutes(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export interface Beat {
  time: string;
  title: string;
  body: string;
}

/** Tiny analog face: the hands sweep to the beat's time (spring), like the public clock pill. */
export function ClockFace({ minutes, size = 30, className }: { minutes: number; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const hour = ((minutes / 60) % 12) * 30;
  // Keep counting past 360 so the minute hand never runs backwards across 12.
  const minute = minutes * 6;
  const t = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 120, damping: 16 };
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill="white" stroke="currentColor" strokeWidth="1.5" />
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1="16" y1="3.8" x2="16" y2="5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${a} 16 16)`} />
      ))}
      {/* Each hand sits in a group with an invisible full-size circle, so the group's box (and its rotation origin) is the face center. */}
      <motion.g initial={false} animate={{ rotate: hour }} transition={t}>
        <circle cx="16" cy="16" r="16" fill="none" />
        <line x1="16" y1="16" x2="16" y2="9.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </motion.g>
      <motion.g initial={false} animate={{ rotate: minute }} transition={t}>
        <circle cx="16" cy="16" r="16" fill="none" />
        <line x1="16" y1="16" x2="16" y2="6" stroke="var(--color-red)" strokeWidth="1.6" strokeLinecap="round" />
      </motion.g>
      <circle cx="16" cy="16" r="1.6" fill="currentColor" />
    </svg>
  );
}

/**
 * Live mini version of the home page's Friday clock: a rail from 13:15 to 15:15 with a stop per
 * beat, the clock pill, and the beat card. Click a stop, use the arrows, or press play.
 */
export function FridayClockPreview({ beats, active, onActiveChange }: { beats: Beat[]; active: number; onActiveChange: (i: number) => void }) {
  const reduce = useReducedMotion();
  const [playRequested, setPlaying] = useState(false);
  // Autoplay needs at least two beats; fewer simply reads as paused.
  const count = beats.length;
  const playing = playRequested && count >= 2;
  const idx = count ? Math.min(Math.max(active, 0), count - 1) : -1;
  const beat = idx >= 0 ? beats[idx]! : null;
  const minutes = beat ? (toMinutes(beat.time) ?? SESSION_START) : SESSION_START;

  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setInterval(() => onActiveChange((idx + 1) % count), 2600);
    return () => clearInterval(t);
  }, [playing, idx, count, onActiveChange]);

  const pos = (b: Beat) => {
    const m = toMinutes(b.time);
    if (m == null) return null;
    return Math.min(1, Math.max(0, (m - SESSION_START) / (SESSION_END - SESSION_START)));
  };

  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[var(--shadow-1)]" aria-label="Friday clock preview" role="group">
      <div className="bg-[linear-gradient(var(--color-graph)_1px,transparent_1px),linear-gradient(90deg,var(--color-graph)_1px,transparent_1px)] bg-[size:24px_24px] px-4 pt-4 pb-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white py-1 pr-3.5 pl-1.5 text-ink shadow-[var(--shadow-1)]">
            <ClockFace minutes={minutes} size={28} />
            <span className="mono text-[1.0625rem] font-semibold tabular-nums" aria-live="polite">
              {beat ? beat.time || '--:--' : '13:15'}
            </span>
            <span className="mono text-[0.6875rem] text-ink-4">WIB</span>
          </span>
          <span className="flex items-center gap-1">
            <IconButton label="Previous beat" size="sm" variant="secondary" disabled={idx <= 0} onClick={() => onActiveChange(idx - 1)}>
              <ChevronLeft />
            </IconButton>
            <IconButton label={playing ? 'Pause' : 'Play through the beats'} size="sm" variant="secondary" disabled={count < 2} onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause /> : <Play />}
            </IconButton>
            <IconButton label="Next beat" size="sm" variant="secondary" disabled={idx >= count - 1} onClick={() => onActiveChange(idx + 1)}>
              <ChevronRight />
            </IconButton>
          </span>
        </div>

        <div className="relative mt-6 mb-1 h-8">
          <div className="absolute inset-x-0 top-3.5 h-1 rounded-full bg-line" aria-hidden="true" />
          {beat && pos(beat) != null ? (
            <motion.div
              className="absolute top-3.5 left-0 h-1 rounded-full bg-ink"
              initial={false}
              animate={{ width: `${(pos(beat) ?? 0) * 100}%` }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 24 }}
              aria-hidden="true"
            />
          ) : null}
          {beats.map((b, i) => {
            const p = pos(b);
            if (p == null) return null;
            const on = i === idx;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onActiveChange(i)}
                aria-label={`${b.time} ${b.title || 'Untitled beat'}`}
                aria-current={on ? 'step' : undefined}
                className="group absolute top-0 -translate-x-1/2 rounded-full p-1.5 focus-visible:outline-2 focus-visible:outline-focus"
                style={{ left: `${p * 100}%` }}
              >
                <span className={cn('block size-5 rounded-full border-2 transition-[transform,background-color,border-color] duration-200 group-hover:scale-110', on ? 'scale-110 border-ink bg-yellow' : i < idx ? 'border-ink bg-ink' : 'border-line-strong bg-white')} />
              </button>
            );
          })}
        </div>
        <div className="mono flex justify-between text-[0.6875rem] text-ink-4" aria-hidden="true">
          <span>13:15</span>
          <span>14:15</span>
          <span>15:15</span>
        </div>
      </div>

      <div className="min-h-[10rem] border-t border-line px-4 py-5 sm:px-6">
        <AnimatePresence mode="wait" initial={false}>
          {beat ? (
            <motion.div
              key={`${idx}-${beat.time}`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="mono text-[0.75rem] tracking-[0.08em] text-ink-3 uppercase">
                {beat.time || '--:--'} · beat {idx + 1} of {count}
              </p>
              <p className="mt-2 font-display text-[1.5rem] leading-[1.02] font-black tracking-[-0.035em] text-ink [font-variation-settings:'CASL'_0.6]">
                {beat.title || 'Untitled beat'}
              </p>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{beat.body || <span className="text-ink-4">No words yet.</span>}</p>
            </motion.div>
          ) : (
            <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-ink-3">
              No beats yet. Add one and the clock starts ticking.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
