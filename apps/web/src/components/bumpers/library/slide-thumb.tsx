'use client';

import type { BumperData, BumperSlide, BumperTheme } from '@zemi/shared';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/admin/cn';
import { SlideView } from '../engine/slide-view';
import { BumperStage } from '../engine/stage';

/** BumperStage sets `position: relative` inline, so the fill goes through `style`. */
const FILL: CSSProperties = { position: 'absolute', inset: 0 };

export interface SlideThumbProps {
  slide: BumperSlide | null;
  theme: BumperTheme;
  data: BumperData;
  showEventId: string | null;
  /** Play the entrance on top of the static thumb (hover previews, the big preview stage). */
  live?: boolean;
  /** Change it to replay the entrance. */
  replayKey?: string | number;
  className?: string;
  /** Shown instead of a slide when the show has none. */
  empty?: ReactNode;
}

/**
 * A bumper at any size. The static thumb is always there; the live layer sits on top of it while
 * `live` is on, so a replay never flashes an empty frame (a live slide starts with its elements
 * hidden for the entrance).
 */
export function SlideThumb({ slide, theme, data, showEventId, live, replayKey, className, empty }: SlideThumbProps) {
  if (!slide) {
    return <div className={cn('relative overflow-hidden bg-surface-muted', className)}>{empty}</div>;
  }
  return (
    <div className={cn('relative overflow-hidden bg-[#0e1116]', className)}>
      <BumperStage style={FILL} letterbox="#0e1116">
        <SlideView slide={slide} theme={theme} data={data} showEventId={showEventId} mode="thumb" />
      </BumperStage>
      {live ? (
        <BumperStage key={replayKey} style={FILL} letterbox="transparent">
          <SlideView slide={slide} theme={theme} data={data} showEventId={showEventId} mode="live" autoplay />
        </BumperStage>
      ) : null}
    </div>
  );
}

/** Mounts its children once they come near the viewport (or a scrolling strip), then keeps them. */
export function LazyMount({ children, className, rootMargin = '240px' }: { children: ReactNode; className?: string; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, rootMargin]);
  return (
    <div ref={ref} className={className}>
      {shown ? children : null}
    </div>
  );
}
