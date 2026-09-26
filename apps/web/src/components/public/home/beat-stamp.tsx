import { cn } from '@/lib/utils';

/** Tiny analog face showing `time` (HH:mm). */
export function ClockGlyph({ time, className }: { time: string; className?: string }) {
  const [h = 13, m = 15] = time.split(':').map(Number);
  const minute = m * 6;
  const hour = ((h % 12) + m / 60) * 30;
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn('size-[1.35em] flex-none', className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="10"
        cy="10"
        r="8.6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.4"
      />
      <line
        x1="10"
        y1="10.6"
        x2="10"
        y2="5.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        transform={`rotate(${hour} 10 10)`}
      />
      <line
        x1="10"
        y1="10.8"
        x2="10"
        y2="3.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        transform={`rotate(${minute} 10 10)`}
      />
      <circle cx="10" cy="10" r="1.3" fill="#f94141" />
    </svg>
  );
}

export interface BeatStampProps {
  time: string;
  /** Short words after the time ("doors open"). */
  label?: string;
  inverse?: boolean;
  className?: string;
}

/**
 * The real time of a story beat (DESIGN.md section 2): "13:30 WIB · first talk".
 * Server-safe. The only place on the site where times are used as markers.
 */
export function BeatStamp({ time, label, inverse, className }: BeatStampProps) {
  return (
    <p
      className={cn(
        'label inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3',
        inverse
          ? 'border-white/15 bg-white/[0.06] text-ink-inverse/80'
          : 'border-line-strong bg-white text-ink-2',
        className,
      )}
    >
      <ClockGlyph time={time} className={inverse ? 'text-white' : 'text-ink'} />
      <time
        dateTime={time}
        className={cn(
          'text-[0.8125rem] font-bold tracking-[0.04em]',
          inverse ? 'text-white' : 'text-ink',
        )}
      >
        {time}
      </time>
      {/* A real color, not opacity: at 12px it must stay above 4.5:1 (ink-3 on white is 4.8:1). */}
      <span className={cn('-ml-1', inverse ? 'text-white/70' : 'text-ink-3')}>WIB</span>
      {label ? (
        <>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span>{label}</span>
        </>
      ) : null}
    </p>
  );
}
