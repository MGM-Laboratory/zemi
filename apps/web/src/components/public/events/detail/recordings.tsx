'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { formatJakarta, type EventDetail } from '@zemi/shared';
import { formatClock } from '@/components/public/player/format';
import { ZemiPlayerLazy } from '@/components/public/player/lazy';
import { Eyebrow } from '@/components/public/ui/section-header';
import { cn } from '@/lib/utils';
import { eventLabel } from '../lib';

/** The recording player. Several recordings (the stream dropped, a second session) show as parts. */
export function Recordings({ event, className }: { event: EventDetail; className?: string }) {
  const recs = event.recordings.filter(
    (r) => r.video && (r.video.mp4 || r.video.webm || r.video.hls),
  );
  const [active, setActive] = useState(0);
  if (!recs.length) return null;
  const rec = recs[Math.min(active, recs.length - 1)]!;
  const v = rec.video!;
  const multi = recs.length > 1;

  return (
    <div className={cn('flex flex-col gap-5', className)} id="recording">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Eyebrow shape="circle" inverse>
          {multi ? `The recording, in ${recs.length} parts` : 'The full recording'}
        </Eyebrow>
        {multi ? (
          <div role="tablist" aria-label="Recording parts" className="flex flex-wrap gap-2">
            {recs.map((r, i) => (
              <button
                key={r.id}
                role="tab"
                type="button"
                aria-selected={i === active}
                aria-controls="recording-panel"
                onClick={() => setActive(i)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const n = (i + (e.key === 'ArrowRight' ? 1 : recs.length - 1)) % recs.length;
                    setActive(n);
                    (
                      e.currentTarget.parentElement?.children[n] as HTMLElement | undefined
                    )?.focus();
                  }
                }}
                tabIndex={i === active ? 0 : -1}
                className={cn(
                  'relative inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-bold transition-colors',
                  i === active ? 'text-ink' : 'text-ink-inverse/75 hover:text-white',
                )}
              >
                {i === active ? (
                  <motion.span
                    layoutId="rec-part"
                    className="absolute inset-0 -z-0 rounded-full bg-white"
                    transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                  />
                ) : null}
                <span className="relative">{r.title ?? `Part ${i + 1}`}</span>
                {r.video?.durationSec ? (
                  <span className="mono relative text-[0.8125rem] opacity-60">
                    {formatClock(r.video.durationSec)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        id="recording-panel"
        role={multi ? 'tabpanel' : undefined}
        className="mx-auto w-full max-w-[calc((100svh-24px)*16/9)] overflow-hidden rounded-[24px] ring-1 ring-white/10 shadow-[0_40px_120px_-40px_rgb(0_0_0/0.8)]"
      >
        <ZemiPlayerLazy
          key={rec.id}
          mode="vod"
          title={rec.title ?? event.title}
          subtitle={`${eventLabel(event)} · recorded ${formatJakarta(rec.startedAt, 'date')}`}
          sources={{ hls: v.hls, mp4: v.mp4, webm: v.webm }}
          poster={v.poster ?? event.cover?.src}
          posterColor={event.cover?.color}
          storyboard={v.storyboard}
          chapters={rec.chapters}
          durationSec={v.durationSec}
          accent={event.accent}
        />
      </div>
    </div>
  );
}
