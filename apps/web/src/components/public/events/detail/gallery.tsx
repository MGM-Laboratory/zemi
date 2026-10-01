'use client';

import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog as D } from 'radix-ui';
import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { EventMediaItem } from '@zemi/shared';
import { Reveal } from '@/components/motion/reveal';
import { useScrollLock } from '@/components/motion/smooth-scroll';
import { stagger } from '@/components/motion/stagger';
import { ZemiImage } from '@/components/public/media/zemi-image';
import { SectionHeader } from '@/components/public/ui/section-header';
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';
import styles from '../events.module.css';
import { seeded } from '../lib';

function mediaAlt(m: EventMediaItem, i: number) {
  return m.image?.alt ?? m.caption ?? `Photo ${i + 1} from the Friday`;
}

/** A video tile: poster, muted preview on hover (mouse only), plays for real in the lightbox. */
function VideoTile({ m }: { m: EventMediaItem }) {
  const ref = useRef<HTMLVideoElement>(null);
  const v = m.video!;
  const ratio = v.width && v.height ? `${v.width} / ${v.height}` : '16 / 9';
  const enter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    void el.play().catch(() => {});
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.pause();
  };
  return (
    <span
      className="relative block"
      style={{ aspectRatio: ratio }}
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <video
        ref={ref}
        className="absolute inset-0 size-full object-cover"
        poster={v.poster ?? undefined}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
      >
        {v.webm ? <source src={v.webm} type="video/webm" /> : null}
        {v.mp4 ? <source src={v.mp4} type="video/mp4" /> : null}
      </video>
      <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[0.8125rem] font-bold text-ink backdrop-blur">
        <Play className="size-3.5 fill-current" aria-hidden="true" />
        Clip
      </span>
    </span>
  );
}

function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  returnFocus,
}: {
  items: EventMediaItem[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Where focus goes back to when the lightbox closes. */
  returnFocus: () => void;
}) {
  const open = index != null;
  const reduced = useReducedMotion();
  const [dir, setDir] = useState(0);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  useScrollLock(open);

  const go = useCallback(
    (delta: number) => {
      if (index == null) return;
      setDir(delta);
      onIndex((index + delta + items.length) % items.length);
    },
    [index, items.length, onIndex],
  );

  const m = index != null ? items[index] : null;

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
  };

  return (
    <D.Root open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[140] bg-[#0e1116]/95 backdrop-blur-sm" />
        <D.Content
          className="fixed inset-0 z-[141] flex flex-col text-white outline-none"
          data-lenis-prevent=""
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              go(1);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              go(-1);
            }
          }}
        >
          <D.Title className="sr-only">Photos from the Friday</D.Title>
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <p className="mono text-[0.9375rem] text-white/70" aria-live="polite">
              {index != null ? `${index + 1} / ${items.length}` : ''}
            </p>
            <D.Close
              className="grid size-11 place-items-center rounded-full bg-white/10 transition-[background-color,transform] hover:bg-white/20 active:scale-95"
              aria-label="Close"
            >
              <X className="size-5" aria-hidden="true" />
            </D.Close>
          </div>
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-3 sm:px-20"
            onPointerDown={onDown}
            onPointerUp={onUp}
            style={{ touchAction: 'pan-y' }}
          >
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              {m ? (
                <motion.figure
                  key={m.id}
                  custom={dir}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, x: dir * 80, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: dir * -80, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                  className="flex max-h-full w-full flex-col items-center gap-3"
                >
                  {m.kind === 'video' && m.video ? (
                    <video
                      data-native-cursor=""
                      className="max-h-[calc(100dvh-170px)] w-auto max-w-full rounded-[16px] bg-black"
                      poster={m.video.poster ?? undefined}
                      controls
                      autoPlay
                      playsInline
                    >
                      {m.video.webm ? <source src={m.video.webm} type="video/webm" /> : null}
                      {m.video.mp4 ? <source src={m.video.mp4} type="video/mp4" /> : null}
                    </video>
                  ) : m.image ? (
                    <div className="relative h-[calc(100dvh-190px)] w-full">
                      <ZemiImage
                        image={m.image}
                        sizes="100vw"
                        fit="contain"
                        fill
                        alt={mediaAlt(m, index ?? 0)}
                        className="!bg-transparent"
                      />
                    </div>
                  ) : null}
                  {m.caption ? (
                    <figcaption className="max-w-[48rem] text-center text-white/80">
                      {m.caption}
                    </figcaption>
                  ) : null}
                </motion.figure>
              ) : null}
            </AnimatePresence>
            {items.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-2 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition-[background-color,transform] hover:bg-white/20 active:scale-95 sm:grid sm:left-5"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-2 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 transition-[background-color,transform] hover:bg-white/20 active:scale-95 sm:grid sm:right-5"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-6" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
          <p className="px-4 pb-4 pt-2 text-center text-[0.8125rem] text-white/50 sm:hidden">
            Swipe for more. Swipe down to close.
          </p>
          <p className="hidden pb-4 pt-2 text-center text-[0.8125rem] text-white/50 sm:block">
            Arrow keys to flip through. Esc to close.
          </p>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Documentation: a masonry wall of photos and clips with a keyboard + swipe lightbox. */
export function Gallery({ media, className }: { media: EventMediaItem[]; className?: string }) {
  // Featured first, then the admin's order. The wall and the lightbox share this order.
  const items = media
    .filter((m) => (m.kind === 'image' && m.image) || (m.kind === 'video' && m.video))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => Number(b.m.featured) - Number(a.m.featured) || a.i - b.i)
    .map(({ m }) => m);
  const [index, setIndex] = useState<number | null>(null);
  const reduced = useReducedMotion();

  const opener = useRef<number | null>(null);
  const open = (i: number) => {
    opener.current = i;
    setIndex(i);
  };
  const returnFocus = () => {
    const el = document.querySelector(
      `[data-gallery-index="${opener.current}"]`,
    ) as HTMLElement | null;
    el?.focus({ preventScroll: false });
  };

  if (!items.length) return null;

  return (
    <section className={cn('container-page', className)} id="photos" aria-labelledby="photos-title">
      <SectionHeader
        eyebrow="Documentation"
        eyebrowShape="arch"
        id="photos-title"
        title="Proof it happened"
        size="m"
        description={`${items.length} ${items.length === 1 ? 'moment' : 'moments'} from the room. Tap one to go big.`}
      />
      <ul className={cn(styles.masonry, 'mt-10')}>
        {items.map((m, i) => (
          <Reveal as="li" key={m.id} delay={stagger(i % 6, 0.06)} y={reduced ? 0 : 36}>
            <button
              type="button"
              className={styles.tile}
              style={{ '--tilt': `${(seeded(m.id) - 0.5) * 2}deg` } as CSSProperties}
              onClick={() => open(i)}
              data-gallery-index={i}
              data-cursor="open"
              aria-label={`${m.kind === 'video' ? 'Play clip' : 'Open photo'}: ${m.caption ?? mediaAlt(m, i)}`}
            >
              {m.kind === 'video' ? (
                <VideoTile m={m} />
              ) : (
                <ZemiImage
                  image={m.image}
                  sizes="(min-width: 1920px) 25vw, (min-width: 1024px) 33vw, (min-width: 560px) 50vw, 100vw"
                  alt={mediaAlt(m, i)}
                />
              )}
              {m.caption ? (
                <span
                  className={cn(styles.tileCaption, 'text-left text-[0.9375rem] font-semibold')}
                  aria-hidden="true"
                >
                  {m.caption}
                </span>
              ) : null}
            </button>
          </Reveal>
        ))}
      </ul>
      <Lightbox
        items={items}
        index={index}
        onIndex={open}
        onClose={() => setIndex(null)}
        returnFocus={returnFocus}
      />
    </section>
  );
}
