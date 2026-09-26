'use client';

import { lazy, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatJakarta, type SiteStats } from '@zemi/shared';
import { useSiteReady } from '@/components/brand/site-loader';
import { CaslHeading } from '@/components/motion/casl-heading';
import { CountUp } from '@/components/motion/count-up';
import { Eyebrow } from '@/components/public/ui/section-header';
import { SceneCanvas } from '@/components/three/scene-canvas';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './about.module.css';
import { clockLabel, createClockState, type ClockState } from './clock-state';

const WallClockScene = lazy(() => import('./wall-clock-scene'));

const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface AboutHeroProps {
  title: string;
  intro: string;
  stats: SiteStats;
}

const QUIPS = ['Nice try.', 'Nope.', 'Still 13:15.', 'It always springs back.', 'Time is a social construct.'];

/**
 * Opening: the big heading, the intro, and a clay wall clock frozen at 13:15. Drag its hands
 * (or focus it and use the arrow keys); they spring back, because here it is always 13:15.
 */
export function AboutHero({ title, intro, stats }: AboutHeroProps) {
  const ready = useSiteReady();
  const clock = useRef<ClockState>(createClockState());
  const layer = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const [startled, setStartled] = useState(false);
  const [quip, setQuip] = useState<string | null>(null);
  const [label, setLabel] = useState('13:15');
  const lastAngle = useRef(0);
  const quipN = useRef(0);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The scene reports the shown time; write it straight into the readout.
  useEffect(() => {
    const c = clock.current;
    c.onShown = (m) => {
      const text = clockLabel(m);
      if (readout.current && readout.current.textContent !== text) readout.current.textContent = text;
    };
    return () => {
      c.onShown = undefined;
      clearTimeout(keyTimer.current);
    };
  }, []);

  const angleAt = (x: number, y: number) => {
    const c = clock.current.center;
    const r = layer.current?.getBoundingClientRect();
    const cx = c?.x ?? (r ? r.left + r.width / 2 : 0);
    const cy = c?.y ?? (r ? r.top + r.height / 2 : 0);
    return {
      a: Math.atan2(x - cx, -(y - cy)),
      d: Math.hypot(x - cx, y - cy),
      R: c?.r ?? (r ? Math.min(r.width, r.height) * 0.3 : 200),
    };
  };

  const release = useCallback(() => {
    const c = clock.current;
    if (!c.dragging) return;
    c.dragging = null;
    // Cap the rewind so a wild spin doesn't take forever to unwind.
    if (Math.abs(c.shown) > 180) c.shown = Math.sign(c.shown) * (180 + (Math.abs(c.shown) % 60));
    c.target = 0;
    if (prefersReducedMotion()) c.shown = 0;
    c.invalidate?.();
    setStartled(false);
    setLabel('13:15');
    setQuip(QUIPS[quipN.current++ % QUIPS.length]!);
  }, []);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    const { a, d, R } = angleAt(e.clientX, e.clientY);
    if (d > R * 1.25) return; // outside the clock: let the page have it
    const c = clock.current;
    const hands = c.hands ?? { minute: Math.PI / 2, hour: ((1 + 15 / 60) / 12) * TAU };
    const toMinute = Math.abs(wrap(a - hands.minute));
    const toHour = Math.abs(wrap(a - hands.hour));
    // Grab whichever hand is closer to where you pressed (the hour hand is short, so near the middle only).
    c.dragging = toHour + 0.15 < toMinute && d < R * 0.75 ? 'hour' : 'minute';
    c.target = c.shown;
    lastAngle.current = a;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStartled(true);
    setQuip(null);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const c = clock.current;
    if (!c.dragging) return;
    const { a } = angleAt(e.clientX, e.clientY);
    const da = wrap(a - lastAngle.current);
    lastAngle.current = a;
    c.target += (da / TAU) * (c.dragging === 'minute' ? 60 : 720);
    c.invalidate?.();
    const text = clockLabel(c.target);
    setLabel((l) => (l === text ? l : text));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 60 : 5;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const c = clock.current;
    if (!c.dragging) {
      c.dragging = 'minute';
      c.target = c.shown;
      setStartled(true);
      setQuip(null);
    }
    c.target += dir * step;
    c.invalidate?.();
    setLabel(clockLabel(c.target));
    clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(release, 1100);
  };

  // "Sep 2024": short enough to sit on the same row as the numbers on a laptop.
  const since = stats.firstEventAt ? formatJakarta(stats.firstEventAt, 'month-year').replace(/^([A-Za-z]{3})[A-Za-z]+/, '$1') : null;
  const statItems = [
    { value: stats.sessions, label: 'Fridays so far' },
    { value: stats.talks, label: 'talks' },
    { value: stats.speakers, label: 'speakers' },
    { value: stats.hoursOfTalk, label: 'hours of talk' },
  ].filter((s) => s.value > 0);

  return (
    <section className={styles.hero} aria-labelledby="about-title">
      <div className={cn('container-page', styles.heroGrid)}>
        <div className={styles.heroText}>
          <Eyebrow shape="circle">About Zemi</Eyebrow>
          <CaslHeading
            as="h1"
            id="about-title"
            size={title.length > 36 ? 'l' : 'xl'}
            reveal={{ play: ready, stagger: 0.06 }}
            className={cn('text-ink', styles.heroTitle)}
          >
            {title}
          </CaslHeading>
        </div>
        <div className={styles.heroIntro}>
          <p className="text-body-l max-w-[40rem] text-ink-2">{intro}</p>
          {statItems.length ? (
            <dl className={styles.stats}>
              {statItems.map((s) => (
                <div key={s.label} className={styles.stat}>
                  <dt className="label text-ink-3">{s.label}</dt>
                  <dd className="display text-[clamp(1.75rem,3vw,2.75rem)] text-ink">
                    <CountUp value={s.value} />
                  </dd>
                </div>
              ))}
              {since ? (
                <div className={styles.stat}>
                  <dt className="label text-ink-3">first Friday</dt>
                  <dd className="display text-[clamp(1.25rem,2vw,1.75rem)] leading-[1.5] text-ink">{since}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>

        <div className={styles.clockCol}>
          <div className={styles.clockBox}>
            <SceneCanvas
              className="absolute inset-0"
              camera={{ position: [0, 0, 10], fov: 30 }}
              studio={{ shadows: false, intensity: 1.05 }}
              label="A clay wall clock stuck at 13:15, with Q peeking from behind it."
              fallback={
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/models/previews/wall-clock.webp"
                  alt=""
                  width={800}
                  height={800}
                  className="size-[82%] object-contain"
                />
              }
            >
              <WallClockScene clock={clock} startled={startled} />
            </SceneCanvas>
            <div
              ref={layer}
              className={styles.clockLayer}
              role="slider"
              tabIndex={0}
              aria-label="The Zemi clock. Drag the hands or use the arrow keys. They spring back."
              aria-valuemin={0}
              aria-valuemax={1439}
              aria-valuenow={labelToMinutes(label)}
              aria-valuetext={`${label} WIB`}
              data-cursor="drag"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={release}
              onPointerCancel={release}
              onLostPointerCapture={release}
              onKeyDown={onKey}
              onBlur={release}
            />
          </div>
          <p className={styles.readout} aria-hidden="true">
            <span className={styles.readoutDot} />
            <span ref={readout} className="mono text-ink">
              13:15
            </span>
            <span className="mono text-ink-3">WIB</span>
            <span className={cn(styles.quip, quip && styles.quipOn)} key={quip ?? 'none'}>
              {quip ?? 'Drag the hands'}
            </span>
          </p>
          <p className="sr-only">
            It is always <time dateTime="13:15">13:15</time> WIB here: doors open every Friday.
          </p>
        </div>
      </div>
    </section>
  );
}

function labelToMinutes(label: string): number {
  const [h, m] = label.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
