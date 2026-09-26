'use client';

import type { EventDetail } from '@zemi/shared';
import { ShapeIcon } from '@/components/brand/shape-icon';
import { CountUp } from '@/components/motion/count-up';
import { Reveal } from '@/components/motion/reveal';
import { stagger } from '@/components/motion/stagger';
import { cn } from '@/lib/utils';

interface Stat {
  value: number;
  label: string;
  shape: 'circle' | 'triangle' | 'square' | 'arch';
  suffix?: string;
  decimals?: number;
}

/** Numbers from the Friday. Only real ones: nothing is shown when the data isn't public. */
export function EventStats({ event, className }: { event: EventDetail; className?: string }) {
  const rec = event.recordings.reduce((s, r) => s + (r.video?.durationSec ?? 0), 0);
  const stats: Stat[] = [];
  if (event.registrationCount != null && event.registrationCount > 0)
    stats.push({
      value: event.registrationCount,
      label: event.registrationCount === 1 ? 'person saved a seat' : 'people saved a seat',
      shape: 'circle',
    });
  if (event.speakersFull.length)
    stats.push({
      value: event.speakersFull.length,
      label: event.speakersFull.length === 1 ? 'brave speaker' : 'brave speakers',
      shape: 'triangle',
    });
  if (rec > 0)
    stats.push({ value: Math.round(rec / 60), label: 'minutes on tape', shape: 'square' });
  if (event.media.length)
    stats.push({
      value: event.media.length,
      label: event.media.length === 1 ? 'photo from the room' : 'photos and clips from the room',
      shape: 'arch',
    });
  if (event.publications.length)
    stats.push({
      value: event.publications.length,
      label: 'papers to read after',
      shape: 'circle',
    });
  if (stats.length < 2) return null;

  return (
    <section className={cn('container-page', className)} aria-label="The Friday in numbers">
      <ul className="grid grid-cols-2 gap-[var(--gutter)] lg:grid-cols-4">
        {stats.slice(0, 4).map((s, i) => (
          <Reveal
            as="li"
            key={s.label}
            delay={stagger(i, 0.08)}
            className="group/stat flex flex-col gap-3 border-t-2 border-ink pt-5"
          >
            <ShapeIcon
              shape={s.shape}
              size={22}
              className="transition-transform duration-700 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] group-hover/stat:rotate-[360deg]"
            />
            <span className="display text-[clamp(2.75rem,6vw,5rem)] leading-none text-ink">
              <CountUp value={s.value} />
            </span>
            <span className="text-ink-2">{s.label}</span>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
