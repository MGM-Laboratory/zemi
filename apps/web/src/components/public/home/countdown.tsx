'use client';

import { countdownParts } from '@zemi/shared';
import { TickingDigits } from '@/components/motion/ticking-digits';
import { useNow } from '@/lib/hooks/use-now';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');

export interface CountdownProps {
  /** ISO start time. */
  to: string;
  className?: string;
  /** Show seconds. Default true. */
  seconds?: boolean;
  /** Units style: "05d 11h" (compact) or stacked cells (cells). */
  variant?: 'compact' | 'cells';
  inverse?: boolean;
}

function spoken(p: ReturnType<typeof countdownParts>) {
  const parts = [
    p.days ? `${p.days} day${p.days === 1 ? '' : 's'}` : null,
    p.hours ? `${p.hours} hour${p.hours === 1 ? '' : 's'}` : null,
    `${p.minutes} minute${p.minutes === 1 ? '' : 's'}`,
  ].filter(Boolean);
  return `Starts in ${parts.join(', ')}`;
}

/**
 * Rolling mono countdown to an event. Renders dashes until the client clock ticks (SSR safe).
 * Digits roll with TickingDigits, so no layout jitter.
 */
export function Countdown({
  to,
  className,
  seconds = true,
  variant = 'compact',
  inverse,
}: CountdownProps) {
  const now = useNow(1000);
  const p = now ? countdownParts(to, now) : null;
  const label = p ? spoken(p) : 'Countdown to the next Friday';

  if (variant === 'cells') {
    const cells: Array<[string, string]> = [
      [p ? pad(Math.min(p.days, 99)) : '--', 'days'],
      [p ? pad(p.hours) : '--', 'hrs'],
      [p ? pad(p.minutes) : '--', 'min'],
      ...(seconds ? ([[p ? pad(p.seconds) : '--', 'sec']] as Array<[string, string]>) : []),
    ];
    return (
      <div
        className={cn('flex items-end gap-2 sm:gap-3', className)}
        role="timer"
        aria-label={label}
      >
        {cells.map(([v, u]) => (
          <div
            key={u}
            className={cn(
              'flex min-w-[3.6rem] flex-col items-center rounded-[16px] px-2.5 pb-2 pt-2.5 sm:min-w-[4.25rem]',
              inverse ? 'bg-white/10 text-white' : 'bg-surface-muted text-ink',
            )}
            aria-hidden="true"
          >
            <TickingDigits
              value={v}
              className="text-[1.75rem] font-bold sm:text-[2.1rem]"
              label={v}
            />
            <span
              className={cn(
                'label mt-1.5 text-[0.625rem]',
                inverse ? 'text-white/60' : 'text-ink-3',
              )}
            >
              {u}
            </span>
          </div>
        ))}
      </div>
    );
  }

  const text = p
    ? `${p.days > 0 ? `${pad(Math.min(p.days, 99))}d ` : ''}${pad(p.hours)}h ${pad(p.minutes)}m${seconds ? ` ${pad(p.seconds)}s` : ''}`
    : `--d --h --m${seconds ? ' --s' : ''}`;
  return (
    <span className={cn('inline-flex', className)} role="timer" aria-label={label}>
      <TickingDigits value={text} label={label} />
    </span>
  );
}
