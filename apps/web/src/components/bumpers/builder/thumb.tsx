'use client';

import type { BumperData, BumperSlide, BumperTheme } from '@zemi/shared';
import { memo, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { SlideView } from '../engine/slide-view';
import { BumperStage } from '../engine/stage';

/** BumperStage sets `position: relative` inline, so filling the box goes through `style`. */
const FILL: CSSProperties = { position: 'absolute', inset: 0 };

/** True once the element has come near the viewport (or a scrolling strip). Stays true. */
export function useSeen<T extends HTMLElement>(enabled = true, rootMargin = '200px'): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [seen, setSeen] = useState(!enabled);
  useEffect(() => {
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen, rootMargin]);
  return [setEl, seen];
}

export interface BumperThumbProps {
  slide: BumperSlide;
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
  /** Play the entrance on top of the static frame (gallery hover). */
  live?: boolean;
  /** Change it to replay the entrance. */
  replayKey?: string | number;
  /** Mount the slide only once it scrolls near the viewport. */
  lazy?: boolean;
  /** Color around the canvas when the box is not 16:9. */
  letterbox?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * A bumper at thumbnail size: the static final frame (thumb mode, no GSAP, no idle loops). It
 * re-renders only when the slide, theme or data object changes, so a rail of 100 bumpers stays
 * quick while one of them is being edited. Children render on top (badges, overlays).
 */
export const BumperThumb = memo(function BumperThumb({ slide, theme, data, showEventId, live, replayKey, lazy, letterbox = '#0e1116', className, children }: BumperThumbProps) {
  const [ref, seen] = useSeen<HTMLDivElement>(lazy);
  return (
    <div ref={ref} className={cn('relative overflow-hidden', className)} style={{ background: letterbox }} aria-hidden="true">
      {seen ? (
        <BumperStage style={FILL} letterbox={letterbox}>
          <SlideView slide={slide} theme={theme} data={data} showEventId={showEventId} mode="thumb" />
        </BumperStage>
      ) : null}
      {seen && live ? <LiveLayer key={replayKey} slide={slide} theme={theme} data={data} showEventId={showEventId} /> : null}
      {children}
    </div>
  );
});

/** The entrance, played over the static frame so a replay never flashes an empty canvas. */
function LiveLayer({ slide, theme, data, showEventId }: Pick<BumperThumbProps, 'slide' | 'theme' | 'data' | 'showEventId'>) {
  // Freeze the slide while it plays: a data refresh must not restart the entrance mid-way.
  const [snap] = useState(() => ({ slide, theme, data }));
  return (
    <BumperStage style={FILL} letterbox="transparent">
      <SlideView slide={snap.slide} theme={snap.theme} data={snap.data} showEventId={showEventId} mode="live" autoplay />
    </BumperStage>
  );
}
