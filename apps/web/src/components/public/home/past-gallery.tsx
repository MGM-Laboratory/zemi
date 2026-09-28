'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { formatJakarta, type EventCard } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { Button, IconButton } from '@/components/public/ui/button';
import { EmptyState } from '@/components/public/ui/empty-state';
import { SectionHeader } from '@/components/public/ui/section-header';
import { prefersReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from './past-gallery.module.css';

export interface PastGalleryProps {
  events: EventCard[];
  total: number;
  offline: boolean;
}

/**
 * "Past Fridays": a horizontal drag gallery. Native scrolling for touch, trackpads and keys;
 * mouse drag with inertia on top; cards skew with the speed and the cursor says "drag".
 */
export function PastGallery({ events, total, offline }: PastGalleryProps) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, x: 0, left: 0, moved: 0, v: 0, lastX: 0, lastT: 0 });
  const inertia = useRef(0);
  const [edges, setEdges] = useState({ start: true, end: false });
  const hidden = offline && !events.length;

  // Skew with velocity + edge state. One rAF loop while the gallery is on screen.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const reduced = prefersReducedMotion();
    let raf = 0;
    let visible = false;
    let prev = el.scrollLeft;
    let skew = 0;
    const loop = () => {
      raf = 0;
      if (!visible) return;
      const v = el.scrollLeft - prev;
      prev = el.scrollLeft;
      skew += ((reduced ? 0 : Math.max(-9, Math.min(9, -v * 0.35))) - skew) * 0.14;
      el.style.setProperty('--skew', `${skew.toFixed(2)}deg`);
      const start = el.scrollLeft < 8;
      const end = el.scrollLeft > el.scrollWidth - el.clientWidth - 8;
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      cancelAnimationFrame(inertia.current);
    };
  }, []);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = track.current;
    if (!el) return;
    cancelAnimationFrame(inertia.current);
    drag.current = {
      on: true,
      x: e.clientX,
      left: el.scrollLeft,
      moved: 0,
      v: 0,
      lastX: e.clientX,
      lastT: performance.now(),
    };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = track.current;
    if (!d.on || !el) return;
    const dx = e.clientX - d.x;
    d.moved = Math.max(d.moved, Math.abs(dx));
    if (d.moved <= 6) return;
    if (!el.hasPointerCapture(e.pointerId)) {
      el.setPointerCapture(e.pointerId);
      el.dataset.dragging = '';
    }
    el.scrollLeft = d.left - dx;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = d.v * 0.6 + (-(e.clientX - d.lastX) / dt) * 16 * 0.4; // px per frame
    d.lastX = e.clientX;
    d.lastT = now;
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = track.current;
    if (!d.on || !el) return;
    d.on = false;
    delete el.dataset.dragging;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (d.moved <= 6 || prefersReducedMotion() || performance.now() - d.lastT > 90) return;
    let v = Math.max(-80, Math.min(80, d.v));
    const glide = () => {
      el.scrollLeft += v;
      v *= 0.94;
      if (Math.abs(v) > 0.4) inertia.current = requestAnimationFrame(glide);
    };
    inertia.current = requestAnimationFrame(glide);
  };
  // A drag is not a click.
  const onClickCapture = (e: ReactMouseEvent) => {
    if (drag.current.moved > 6) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = 0;
    }
  };

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-past-card]');
    const step = (card?.offsetWidth ?? 320) + 24;
    el.scrollBy({
      left: dir * step * (el.clientWidth > 900 ? 2 : 1),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  // API down: "Up next" already says the schedule is napping; one nap is enough.
  if (hidden) return null;

  return (
    <section className={styles.past} aria-labelledby="past-title">
      <div className="container-page">
        <SectionHeader
          id="past-title"
          eyebrow="The archive"
          eyebrowShape="square"
          title="Past Fridays"
          description={
            total > 0
              ? `${total} sessions so far. Most of them recorded, all of them a little chaotic.`
              : undefined
          }
          action={
            events.length ? (
              <div className="flex items-center gap-2">
                <IconButton label="Scroll back" onClick={() => page(-1)} disabled={edges.start}>
                  <ArrowLeft />
                </IconButton>
                <IconButton label="Scroll forward" onClick={() => page(1)} disabled={edges.end}>
                  <ArrowRight />
                </IconButton>
              </div>
            ) : null
          }
        />
      </div>

      {events.length ? (
        <div
          ref={track}
          className={cn(styles.track, 'no-scrollbar')}
          role="region"
          aria-label="Past Fridays, scroll sideways"
          tabIndex={0}
          data-cursor="drag"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onClickCapture={onClickCapture}
          onDragStart={(e) => e.preventDefault()}
        >
          <ul className={styles.list}>
            {events.map((e, i) => (
              <li
                key={e.id}
                className={styles.item}
                data-past-card=""
                style={{ ['--i' as string]: i }}
              >
                <Link
                  href={`/events/${e.slug}`}
                  className={styles.card}
                  data-cursor="open"
                  draggable={false}
                  onFocus={(ev) =>
                    ev.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                  }
                >
                  <span className={styles.cover}>
                    <ZemiImage
                      image={e.cover}
                      aspect="4/5"
                      sizes="(min-width: 1024px) 22vw, 64vw"
                      className="size-full"
                      placeholderShape={(['circle', 'triangle', 'square', 'arch'] as const)[i % 4]}
                      alt=""
                    />
                    {e.number != null ? <span className={styles.num}>#{e.number}</span> : null}
                    {e.hasRecording ? (
                      <span className={styles.watch}>
                        <ShapeIcon
                          shape="triangle"
                          size={10}
                          color="current"
                          style={{ rotate: '90deg' }}
                        />
                        Watch
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.meta}>
                    <time dateTime={e.startsAt} className="label text-ink-3">
                      {formatJakarta(e.startsAt, 'date')}
                    </time>
                    <span className={styles.title}>{e.title}</span>
                    {e.speakers.length ? (
                      <span className="mt-1 block truncate text-[0.875rem] text-ink-3">
                        {e.speakers.map((s) => s.fullName).join(', ')}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
            <li className={styles.item}>
              <Link href="/events?when=past" className={styles.more} draggable={false}>
                <ShapeIcon shape="arch" size={56} />
                <span
                  className="display text-[clamp(1.75rem,2.6vw,2.5rem)] leading-[0.95]"
                  style={{ fontVariationSettings: "'CASL' 0.8, 'MONO' 0" }}
                >
                  {total > events.length ? `See all ${total} Fridays` : 'See every Friday'}
                </span>
                <span className={styles.moreArrow} aria-hidden="true">
                  <ArrowRight />
                </span>
              </Link>
            </li>
          </ul>
        </div>
      ) : (
        <div className="container-page">
          <EmptyState
            shape="arch"
            mood="thinking"
            title="The archive is still empty."
            body="The first Friday gets filed here the moment it wraps."
            action={
              <Button href="/events" variant="secondary" shape="circle">
                See what is coming up
              </Button>
            }
          />
        </div>
      )}
    </section>
  );
}
