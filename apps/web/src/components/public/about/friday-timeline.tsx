'use client';

import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react';
import { useRef, useState } from 'react';
import type { ShapeName } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { FRIDAY_BEATS } from '@/components/public/shell/friday-clock';
import { SectionHeader } from '@/components/public/ui/section-header';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './about.module.css';

/** What happens at each real beat of a session (times from the shared Friday clock). */
const DETAILS: Record<string, { shape: ShapeName; title: string; body: string }> = {
  '13:15': {
    shape: 'arch',
    title: 'Doors open',
    body: 'Grab any seat, there is no wrong row. The stream goes live for everyone watching online.',
  },
  '13:30': {
    shape: 'circle',
    title: 'First talk',
    body: 'One to three people present, 20 to 40 minutes each. Slides optional, curiosity required.',
  },
  '14:30': {
    shape: 'triangle',
    title: 'Questions',
    body: 'The room asks. Some questions are polite, some make the speaker open a new notebook.',
  },
  '14:50': { shape: 'square', title: 'Coffee', body: 'The good part. Half the collaborations here started next to the snacks.' },
  '15:15': {
    shape: 'arch',
    title: 'See you next week',
    body: 'We wrap on time, mostly. The recording goes up on the event page.',
  },
};

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const START = toMin('13:15');

/** Tiny analog face that sweeps to the active beat. */
function MiniClock({ time }: { time: string }) {
  const m = toMin(time);
  const minuteDeg = (m % 60) * 6;
  const hourDeg = ((Math.floor(m / 60) % 12) + (m % 60) / 60) * 30;
  // Keep turning forward: 15:15 comes after 13:15, so add whole turns for the minute hand.
  const turns = Math.floor((m - START) / 60) * 360;
  return (
    <svg viewBox="0 0 64 64" className={styles.miniClock} aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="#fff" stroke="#0e1116" strokeWidth="3" />
      {[0, 90, 180, 270].map((a) => (
        <rect key={a} x="31" y="7" width="2" height="5" rx="1" fill="#9aa1ad" transform={`rotate(${a} 32 32)`} />
      ))}
      <g style={{ transform: `rotate(${hourDeg}deg)` }} className={styles.miniHand}>
        <rect x="30.2" y="18" width="3.6" height="16" rx="1.8" fill="#0e1116" />
      </g>
      <g style={{ transform: `rotate(${minuteDeg + turns}deg)` }} className={styles.miniHand}>
        <rect x="30.8" y="10" width="2.4" height="24" rx="1.2" fill="#0e1116" />
      </g>
      <circle cx="32" cy="32" r="3" fill="#f94141" />
    </svg>
  );
}

/**
 * "How a Friday runs": the five real beats of a session on a rail. The rail fills as you
 * scroll through it; hovering or focusing a beat sends the mini clock there.
 */
export function FridayTimeline() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: root, offset: ['start 80%', 'end 55%'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });
  const fill = useTransform(reduced ? scrollYProgress : smooth, [0, 1], [0, 1]);
  const [scrolled, setScrolled] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const idx = Math.min(FRIDAY_BEATS.length - 1, Math.floor(v * FRIDAY_BEATS.length * 0.999));
    setScrolled((s) => (s === idx ? s : Math.max(0, idx)));
  });

  const active = hover ?? scrolled;
  const beat = FRIDAY_BEATS[active]!;

  return (
    <section className={styles.section} aria-labelledby="friday-title">
      <div className="container-page">
        <SectionHeader
          id="friday-title"
          eyebrow="How a Friday runs"
          eyebrowShape="circle"
          title="Two hours, five beats."
          description="Same shape every week, whoever is speaking. All times are WIB (UTC+7)."
          action={
            <div className={styles.miniWrap}>
              <MiniClock time={beat.time} />
              <span className="mono text-[0.9375rem] text-ink">
                {beat.time} <span className="text-ink-3">WIB</span>
              </span>
            </div>
          }
        />
        <div ref={root} className={styles.rail}>
          <div className={styles.railTrack} aria-hidden="true">
            <motion.span className={styles.railFill} style={{ ['--fill' as string]: fill }} />
          </div>
          <ol className={styles.beats} onPointerLeave={() => setHover(null)}>
            {FRIDAY_BEATS.map((b, i) => {
              const d = DETAILS[b.time] ?? { shape: 'circle' as ShapeName, title: b.label, body: '' };
              return (
                <li key={b.time} className={cn(styles.beat, i <= active && styles.beatPast, i === active && styles.beatOn)}>
                  <button
                    type="button"
                    className={styles.beatBtn}
                    onPointerEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onClick={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-label={`${b.time} WIB, ${d.title}`}
                  >
                    <span className={styles.beatDot} aria-hidden="true">
                      <ShapeIcon shape={d.shape} size="100%" color={i <= active ? 'brand' : '#d8d8d2'} />
                    </span>
                  </button>
                  <div className={styles.beatText}>
                    <time className="mono text-[0.9375rem] font-bold text-ink" dateTime={b.time}>
                      {b.time}
                    </time>
                    <h3 className={styles.beatTitle}>{d.title}</h3>
                    <p className="text-[0.9375rem] leading-[1.55] text-ink-2">{d.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
