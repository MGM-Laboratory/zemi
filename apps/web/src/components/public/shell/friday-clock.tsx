'use client';

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

export interface ClockBeat {
  /** 'HH:mm' */
  time: string;
  label: string;
}

/** The real sequence of a Zemi Friday (DESIGN.md section 2). */
export const FRIDAY_BEATS: ClockBeat[] = [
  { time: '13:15', label: 'doors open' },
  { time: '13:30', label: 'first talk' },
  { time: '14:30', label: 'questions' },
  { time: '14:50', label: 'coffee' },
  { time: '15:15', label: 'see you next week' },
];

export interface FridayClockProps {
  /**
   * 0..1 mapped onto start..end (13:15 to 15:15). A number, or a MotionValue for per-frame
   * scroll wiring (no re-renders, hands sweep smoothly). null hides the clock.
   */
  progress?: number | MotionValue<number> | null;
  /** 'HH:mm'. Overrides progress. */
  time?: string | null;
  /** Label next to the digits. Default: the latest beat at or before the current time. */
  label?: string | null;
  /** Beats used for the automatic label. false = no automatic label. */
  beats?: ClockBeat[] | false;
  start?: string;
  end?: string;
  /** 'auto' = bottom-left on desktop, top-center under the nav on mobile. */
  position?: 'auto' | 'bottom-left' | 'top-center' | 'static';
  className?: string;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const fmt = (mins: number) => {
  const m = Math.max(0, Math.floor(mins + 1e-6));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const isMotionValue = (v: unknown): v is MotionValue<number> =>
  !!v && typeof v === 'object' && 'get' in v && 'on' in v;

/**
 * The Friday clock: a sticky pill with rolling mono digits and a tiny analog face whose hands
 * sweep with the story. The home page wires `progress` to scroll.
 *
 * @example
 * const { scrollYProgress } = useScroll({ target: storyRef });
 * <FridayClock progress={scrollYProgress} />
 * @example <FridayClock time="14:50" label="coffee" />
 */
export function FridayClock({
  progress,
  time,
  label,
  beats = FRIDAY_BEATS,
  start = '13:15',
  end = '15:15',
  position = 'auto',
  className,
}: FridayClockProps) {
  const s = toMin(start);
  const total = Math.max(1, toMin(end) - s);
  const visible = time != null || progress != null;

  const p = useMotionValue(0);
  useEffect(() => {
    if (time != null) {
      p.set(Math.min(1, Math.max(0, (toMin(time) - s) / total)));
      return;
    }
    if (typeof progress === 'number') {
      p.set(Math.min(1, Math.max(0, progress)));
      return;
    }
    if (isMotionValue(progress)) {
      p.set(Math.min(1, Math.max(0, progress.get())));
      return progress.on('change', (v) => p.set(Math.min(1, Math.max(0, v))));
    }
  }, [progress, time, s, total, p]);

  const minutes = useTransform(p, (v) => s + v * total);
  const smooth = useSpring(minutes, { stiffness: 140, damping: 24, mass: 0.6 });
  const hourRef = useRef<SVGLineElement>(null);
  const minuteRef = useRef<SVGLineElement>(null);
  useMotionValueEvent(smooth, 'change', (m) => {
    hourRef.current?.setAttribute('transform', `rotate(${(m / 2).toFixed(2)} 20 20)`);
    minuteRef.current?.setAttribute('transform', `rotate(${(m * 6).toFixed(2)} 20 20)`);
  });

  const initialMin = time != null ? toMin(time) : s + (typeof progress === 'number' ? progress : 0) * total;
  const [display, setDisplay] = useState(() => fmt(initialMin));
  useMotionValueEvent(minutes, 'change', (m) => {
    const next = fmt(m);
    setDisplay((d) => (d === next ? d : next));
  });

  const nowMin = toMin(display);
  const autoLabel = beats ? [...beats].reverse().find((b) => toMin(b.time) <= nowMin)?.label ?? null : null;
  const shownLabel = label === undefined ? autoLabel : label;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="friday-clock"
          className={cn(position !== 'static' && styles.clock, className)}
          data-pos={position}
          initial={{ opacity: 0, y: 18, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        >
          <div
            className={cn(
              styles.clockPill,
              'inline-flex h-12 items-center gap-3 rounded-full border border-ink/[0.08] bg-white/90 pl-1.5 pr-4 text-ink shadow-2 backdrop-blur-md',
            )}
            role="img"
            aria-label={`Friday, ${display}${shownLabel ? `, ${shownLabel}` : ''}`}
          >
            <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true" className="flex-none">
              <g transform="translate(20 20)">
                <circle r="18.5" fill="#fff" stroke="rgb(14 17 22 / 0.14)" strokeWidth="1.5" />
                {Array.from({ length: 12 }, (_, i) => (
                  <line
                    key={i}
                    x1="0"
                    y1={i % 3 === 0 ? -15.5 : -16}
                    x2="0"
                    y2="-13.5"
                    stroke="#0e1116"
                    strokeOpacity={i % 3 === 0 ? 0.6 : 0.22}
                    strokeWidth={i % 3 === 0 ? 1.6 : 1}
                    strokeLinecap="round"
                    transform={`rotate(${i * 30})`}
                  />
                ))}
              </g>
              {/* Hands rotate around the face center (20,20) in viewBox space. */}
              <line ref={hourRef} x1="20" y1="22" x2="20" y2="11.5" stroke="#0e1116" strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${initialMin / 2} 20 20)`} />
              <line ref={minuteRef} x1="20" y1="22.5" x2="20" y2="7" stroke="#0e1116" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${initialMin * 6} 20 20)`} />
              <circle cx="20" cy="20" r="2.2" fill="#f94141" />
            </svg>
            <TickingDigits value={display} className="text-[1.125rem] font-semibold tracking-[0.02em]" label={display} />
            <AnimatePresence mode="popLayout" initial={false}>
              {shownLabel ? (
                <motion.span
                  key={shownLabel}
                  className="label whitespace-nowrap text-ink-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {shownLabel}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
