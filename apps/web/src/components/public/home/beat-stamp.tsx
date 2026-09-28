import { cn } from '@/lib/utils';

export interface BeatStampProps {
  /** Story position, 1-based. Omit to show just the label (the hero's doors note). */
  n?: number;
  /** Short words ("the lonely part"). */
  label?: string;
  inverse?: boolean;
  className?: string;
}

/**
 * A story beat stamp: "1 - THE LONELY PART". The story runs from doors open to the closing,
 * so the beats count 1, 2, 3... instead of showing a time. Server-safe.
 */
export function BeatStamp({ n, label, inverse, className }: BeatStampProps) {
  return (
    <p
      className={cn(
        'label inline-flex items-center gap-2 rounded-full border py-1.5 pl-3.5 pr-3.5',
        inverse
          ? 'border-white/15 bg-white/[0.06] text-ink-inverse/80'
          : 'border-line-strong bg-white text-ink-2',
        className,
      )}
    >
      {n != null ? (
        <>
          <span className={cn('text-[0.8125rem] font-bold tracking-[0.04em]', inverse ? 'text-white' : 'text-ink')}>
            {n}
          </span>
          <span aria-hidden="true" className="opacity-40">
            -
          </span>
        </>
      ) : null}
      {label ? (
        <span className={cn('font-bold tracking-[0.08em]', inverse ? 'text-white/80' : 'text-ink-2')}>
          {label}
        </span>
      ) : null}
    </p>
  );
}
