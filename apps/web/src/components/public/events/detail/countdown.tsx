'use client';

import { useId } from 'react';
import { countdownParts } from '@zemi/shared';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { useNow } from '@/lib/hooks/use-now';
import { cn } from '@/lib/utils';
import styles from '../events.module.css';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Rolling countdown to the start. The first render uses `renderedAt` from the server so the
 * markup hydrates cleanly, then a 1s clock takes over (digits roll to the live value).
 */
export function Countdown({
  startsAt,
  renderedAt,
  className,
  tone = 'light',
}: {
  startsAt: string;
  renderedAt: number;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  const now = useNow(1000);
  const labelId = useId();
  const p = countdownParts(startsAt, now ?? renderedAt);
  const units = [
    { v: p.days > 99 ? '99' : pad(p.days), label: p.days === 1 ? 'day' : 'days' },
    { v: pad(p.hours), label: 'hrs' },
    { v: pad(p.minutes), label: 'min' },
    { v: pad(p.seconds), label: 'sec' },
  ];
  const spoken =
    p.totalMs <= 0
      ? 'Starting now'
      : `${p.days} days, ${p.hours} hours and ${p.minutes} minutes to go`;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p
        className={cn('label', tone === 'dark' ? 'text-ink-inverse/70' : 'text-ink-3')}
        id={labelId}
      >
        Doors open in
      </p>
      <div
        role="timer"
        aria-labelledby={labelId}
        aria-live="off"
        className="grid grid-cols-4 gap-2 sm:gap-3"
      >
        <span className="sr-only">{spoken}</span>
        {units.map((u) => (
          <div key={u.label} className={styles.countBox} aria-hidden="true">
            <TickingDigits
              value={u.v}
              className="text-[clamp(1.75rem,4.2vw,3rem)] font-bold text-ink"
            />
            <span className="label text-ink-3">{u.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
